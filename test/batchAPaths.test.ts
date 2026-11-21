import { mkdir, readFile, rename, symlink, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { AccountStore } from '../src/accounts/accountStore';
import { AccountSwitcher } from '../src/accounts/accountSwitcher';
import { canonicalCodexHome, checkedCodexTarget } from '../src/core/paths';
import { ConfigSync } from '../src/sync/configSync';
import { deliverGatewayToken } from '../src/sync/credentialDelivery';
import { temporaryDirectory } from './helpers/temporaryDirectory';

describe('Batch A real-path boundaries', () => {
  it('refuses a link introduced immediately before account replacement and does not roll back over it', async () => {
    const directory = await temporaryDirectory('portwise-account-recheck');
    try {
      const home = directory.path; const file = path.join(home, 'auth.json'); const outside = path.join(home, 'outside.json');
      await writeFile(path.join(home, 'config.toml'), 'cli_auth_credentials_store = "file"\n');
      await writeFile(file, '{"token":"test-current-0000"}'); await writeFile(outside, '{"token":"test-outside-0000"}');
      const state = new Map<string, unknown>(); const secrets = new Map<string, string>();
      const store = new AccountStore({ get: <T>(key: string) => state.get(key) as T | undefined, update: async (key, value) => { state.set(key, value); } }, { get: async key => secrets.get(key), store: async (key, value) => { secrets.set(key, value); }, delete: async key => { secrets.delete(key); } });
      const saved = await store.capture('fake', home, '{"token":"test-new-0000"}');
      const switcher = new AccountSwitcher({ codexHome: home, store, failAt: async step => { if (step === 'beforeWrite') { await rename(file, path.join(home, 'old.json')); await symlink(outside, file); } } });
      await expect(switcher.switchTo(saved.id, async () => undefined)).rejects.toThrow();
      expect(await readFile(outside, 'utf8')).toBe('{"token":"test-outside-0000"}');
      expect(await readFile(path.join(home, 'old.json'), 'utf8')).toBe('{"token":"test-current-0000"}');
    } finally { await directory.dispose(); }
  });
  it.each(['auth.json', 'config.toml', '.env'])('rejects a linked %s in the actual operation without changing outside bytes', async (name) => {
    const directory = await temporaryDirectory('portwise-linked-operation');
    try {
      const home = path.join(directory.path, 'home'); await mkdir(home);
      const outside = path.join(directory.path, 'outside');
      const original = name === 'auth.json' ? '{"token":"test-token-0000"}' : 'cli_auth_credentials_store = "file"\n';
      await writeFile(outside, original);
      await writeFile(path.join(home, 'config.toml'), 'cli_auth_credentials_store = "file"\n');
      if (name === 'config.toml') await rename(path.join(home, 'config.toml'), path.join(home, 'original.toml'));
      await symlink(outside, path.join(home, name));
      const values = new Map<string, unknown>(); const secrets = new Map<string, string>();
      const store = new AccountStore({ get: <T>(key: string) => values.get(key) as T | undefined, update: async (key, value) => { values.set(key, value); } }, { get: async key => secrets.get(key), store: async (key, value) => { secrets.set(key, value); }, delete: async key => { secrets.delete(key); } });
      const sync = new ConfigSync({ codexHome: home, backupDirectory: path.join(directory.path, 'backups'), gatewayBaseUrl: 'http://127.0.0.1:1/v1' });
      if (name === 'auth.json') {
        const account = await store.capture('fake', home, original);
        const switcher = new AccountSwitcher({ codexHome: home, store });
        await expect(switcher.captureCurrent('linked')).rejects.toThrow('symbolic');
        await expect(switcher.switchTo(account.id, async () => undefined)).rejects.toThrow('symbolic');
      } else if (name === 'config.toml') {
        await expect(sync.sync()).rejects.toThrow('symbolic');
        await expect(sync.switchToPortwise()).rejects.toThrow('symbolic');
        await expect(sync.restore()).rejects.toThrow('symbolic');
      } else await expect(deliverGatewayToken(home, 'test-token-0000', path.join(directory.path, 'backups'))).rejects.toThrow('symbolic');
      expect(await readFile(outside, 'utf8')).toBe(original);
    } finally { await directory.dispose(); }
  });

  it('rejects junction home roots and rechecks replaced files and home roots', async () => {
    const directory = await temporaryDirectory('portwise-target-identity');
    try {
      const home = path.join(directory.path, 'home'); const other = path.join(directory.path, 'other');
      await mkdir(home); await mkdir(other);
      const link = path.join(directory.path, 'linked-home'); await symlink(home, link, process.platform === 'win32' ? 'junction' : 'dir');
      await expect(canonicalCodexHome(link)).rejects.toThrow('junction');
      const file = path.join(home, 'auth.json'); await writeFile(file, '{}');
      const captured = await checkedCodexTarget(home, 'auth.json');
      await rename(file, path.join(home, 'old-auth.json')); await writeFile(file, '{}');
      await expect(captured.recheck()).rejects.toThrow('changed');
      const homeCaptured = await checkedCodexTarget(home, 'config.toml');
      await rename(home, path.join(directory.path, 'old-home')); await symlink(other, home, process.platform === 'win32' ? 'junction' : 'dir');
      await expect(homeCaptured.recheck()).rejects.toThrow('junction');
    } finally { await directory.dispose(); }
  });
});
