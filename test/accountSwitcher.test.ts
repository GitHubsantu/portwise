import { access, readFile, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';
import { AccountStore } from '../src/accounts/accountStore';
import { AccountSwitcher, type SwitchStep } from '../src/accounts/accountSwitcher';
import { temporaryDirectory } from './helpers/temporaryDirectory';

const FIRST = '{"token":"test-account-one-0000"}\n';
const SECOND = '{"token":"test-account-two-0000"}\n';
const STEPS: SwitchStep[] = ['beforeLock', 'beforeBackup', 'beforeWrite', 'beforeVerify', 'beforeRestart'];

interface MemoryStores { state: { get<T>(key: string): T | undefined; update(key: string, value: unknown): Promise<void> }; secrets: { get(key: string): Promise<string | undefined>; store(key: string, value: string): Promise<void>; delete(key: string): Promise<void> }; values: Map<string, unknown>; secretValues: Map<string, string>; }
function memoryStores(): MemoryStores {
  const values = new Map<string, unknown>(); const secretValues = new Map<string, string>();
  return { values, secretValues, state: { get: <T>(key: string) => values.get(key) as T | undefined, update: async (key, value) => { values.set(key, value); } }, secrets: { get: async (key) => secretValues.get(key), store: async (key, value) => { secretValues.set(key, value); }, delete: async (key) => { secretValues.delete(key); } } };
}
async function setup() {
  const directory = await temporaryDirectory('portwise-account-switch');
  await writeFile(path.join(directory.path, 'config.toml'), 'cli_auth_credentials_store = "file"\n');
  await writeFile(path.join(directory.path, 'auth.json'), FIRST);
  await writeFile(path.join(directory.path, 'history.jsonl'), 'history untouched\n');
  await writeFile(path.join(directory.path, 'sessions.json'), '{"sessions":true}\n');
  await writeFile(path.join(directory.path, '.env'), 'OTHER=value\n');
  const stores = memoryStores();
  const store = new AccountStore(stores.state, stores.secrets, (() => { let id = 0; return () => `account-${++id}`; })());
  const switcher = new AccountSwitcher({ codexHome: directory.path, store });
  await switcher.captureCurrent('First account');
  await writeFile(path.join(directory.path, 'auth.json'), SECOND);
  await switcher.captureCurrent('Second account');
  await writeFile(path.join(directory.path, 'auth.json'), FIRST);
  return { directory, stores, store, switcher };
}

describe('AccountSwitcher', () => {
  it('switches successfully in a real child host, survives termination during its notification, and switches again', async () => {
    const fixture = await setup();
    try {
      const script = path.join(fixture.directory.path, 'account-host.cjs');
      await build({ entryPoints: ['test/helpers/accountHost.ts'], outfile: script, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent' });
      const child = spawn(process.execPath, [script, fixture.directory.path], { windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
      const exited = once(child, 'exit');
      try {
        await expect(once(child, 'message', { signal: AbortSignal.timeout(4000) })).resolves.toEqual(['restart-notification', undefined]);
        await expect(access(path.join(fixture.directory.path, '.portwise-auth.lock'))).rejects.toThrow();
      } finally { child.kill(); await exited; }
      const account = fixture.store.list(fixture.directory.path)[0]; if (!account) throw new Error('missing fixture');
      const nextHost = new AccountSwitcher({ codexHome: fixture.directory.path, store: fixture.store });
      await nextHost.switchTo(account.id, async () => undefined);
      await expect(access(path.join(fixture.directory.path, '.portwise-auth.lock'))).rejects.toThrow();
    } finally { await fixture.directory.dispose(); }
  });
  it('does not retain a lock or roll back the committed file when notification delivery fails', async () => {
    const fixture = await setup();
    try {
      const account = fixture.store.list(fixture.directory.path).find((item) => item.name === 'Second account'); if (!account) throw new Error('missing fixture');
      await expect(fixture.switcher.switchTo(account.id, async () => { throw new Error('notification dismissed during host shutdown'); })).rejects.toThrow('notification dismissed');
      expect(await readFile(path.join(fixture.directory.path, 'auth.json'), 'utf8')).toBe(SECOND);
      await expect(access(path.join(fixture.directory.path, '.portwise-auth.lock'))).rejects.toThrow();
      await fixture.switcher.switchTo(account.id, async () => undefined);
    } finally { await fixture.directory.dispose(); }
  });
  it('releases before the restart notification and a subsequent extension-host instance can switch', async () => {
    const fixture = await setup();
    try {
      const account = fixture.store.list(fixture.directory.path)[0]; if (!account) throw new Error('missing fixture');
      await fixture.switcher.switchTo(account.id, async () => {
        await expect(access(path.join(fixture.directory.path, '.portwise-auth.lock'))).rejects.toThrow();
        // A reloaded host can immediately acquire, even before this notification resolves.
        const reloaded = new AccountSwitcher({ codexHome: fixture.directory.path, store: fixture.store });
        await reloaded.switchTo(account.id, async () => undefined);
      });
      await expect(access(path.join(fixture.directory.path, '.portwise-auth.lock'))).rejects.toThrow();
    } finally { await fixture.directory.dispose(); }
  });
  it('switches atomically, retains SecretStorage backups, and leaves unrelated Codex files byte-identical', async () => {
    const fixture = await setup();
    try {
      const before = await Promise.all(['config.toml', 'history.jsonl', 'sessions.json', '.env'].map((name) => readFile(path.join(fixture.directory.path, name))));
      const account = fixture.store.list(fixture.directory.path).find((item) => item.name === 'Second account');
      if (!account) throw new Error('missing account test fixture');
      let restarted = false;
      await fixture.switcher.switchTo(account.id, async () => { restarted = true; });
      await expect(readFile(path.join(fixture.directory.path, 'auth.json'), 'utf8')).resolves.toBe(SECOND);
      expect(restarted).toBe(true);
      const after = await Promise.all(['config.toml', 'history.jsonl', 'sessions.json', '.env'].map((name) => readFile(path.join(fixture.directory.path, name))));
      expect(after).toEqual(before);
      expect(JSON.stringify([...fixture.stores.values.values()])).not.toContain('test-account-one-0000');
      expect(JSON.stringify([...fixture.stores.values.values()])).not.toContain('test-account-two-0000');
      expect(fixture.stores.secretValues.size).toBeGreaterThan(2);
    } finally { await fixture.directory.dispose(); }
  });

  it.each(STEPS)('rolls back auth.json when %s fails', async (failure) => {
    const fixture = await setup();
    try {
      const account = fixture.store.list(fixture.directory.path).find((item) => item.name === 'Second account');
      if (!account) throw new Error('missing account test fixture');
      const switcher = new AccountSwitcher({ codexHome: fixture.directory.path, store: fixture.store, failAt: async (step) => { if (step === failure) throw new Error(`injected ${step}`); } });
      await expect(switcher.switchTo(account.id, async () => undefined)).rejects.toThrow(`injected ${failure}`);
      await expect(readFile(path.join(fixture.directory.path, 'auth.json'), 'utf8')).resolves.toBe(FIRST);
    } finally { await fixture.directory.dispose(); }
  });

  it('rejects keyring, automatic, ephemeral, and missing credential-store configuration without reading auth.json', async () => {
    for (const mode of ['keyring', 'auto', 'ephemeral', undefined]) {
      const directory = await temporaryDirectory('portwise-account-store');
      try {
        await writeFile(path.join(directory.path, 'config.toml'), mode ? `cli_auth_credentials_store = "${mode}"\n` : '');
        await writeFile(path.join(directory.path, 'auth.json'), 'not valid json');
        const stores = memoryStores(); const store = new AccountStore(stores.state, stores.secrets);
        const switcher = new AccountSwitcher({ codexHome: directory.path, store });
        await expect(switcher.captureCurrent('Unsupported')).rejects.toMatchObject({ code: 'credential_store_unsupported' });
      } finally { await directory.dispose(); }
    }
  });

  it('keeps only ten SecretStorage rollback backups', async () => {
    const fixture = await setup();
    try {
      const account = fixture.store.list(fixture.directory.path).find((item) => item.name === 'Second account');
      if (!account) throw new Error('missing account test fixture');
      for (let index = 0; index < 12; index += 1) { await fixture.switcher.switchTo(account.id, async () => undefined); await writeFile(path.join(fixture.directory.path, 'auth.json'), FIRST); }
      const backups = fixture.stores.values.get('portwise.accountBackups') as unknown[];
      expect(backups).toHaveLength(10);
    } finally { await fixture.directory.dispose(); }
  }, 30_000); // Twelve switches now apply and verify real Windows ACLs before each replacement.

  it('rejects malformed saved snapshots before touching auth.json', async () => {
    const fixture = await setup();
    try {
      const bad = await fixture.store.capture('Malformed', fixture.directory.path, 'not-json');
      await expect(fixture.switcher.switchTo(bad.id, async () => undefined)).rejects.toMatchObject({ code: 'auth_json_invalid' });
      await expect(readFile(path.join(fixture.directory.path, 'auth.json'), 'utf8')).resolves.toBe(FIRST);
    } finally { await fixture.directory.dispose(); }
  });
});
