import { readFile, readdir, symlink, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as atomic from '../src/core/atomicWrite';
import { ConfigSync } from '../src/sync/configSync';
import { temporaryDirectory } from './helpers/temporaryDirectory';
import { AccountStore } from '../src/accounts/accountStore';
import { AccountSwitcher } from '../src/accounts/accountSwitcher';

afterEach(() => vi.restoreAllMocks());
describe('private writes and config transaction isolation', () => {
  it('does not echo credential-like bytes from invalid TOML parser input', async () => {
    const directory = await temporaryDirectory('portwise-parser-output');
    try {
      const source = 'credential = "test-opaque-0000"\ninvalid = [secret-value\n';
      const file = path.join(directory.path, 'config.toml'); await writeFile(file, source);
      const sync = new ConfigSync({ codexHome: directory.path, backupDirectory: path.join(directory.path, 'backups'), gatewayBaseUrl: 'http://127.0.0.1:1/v1' });
      await expect(sync.sync()).rejects.toMatchObject({ code: 'config_sync_failed', message: expect.not.stringMatching(/test-opaque|secret-value/) });
      expect(await readFile(file, 'utf8')).toBe(source); expect(await sync.backups()).toEqual([]);
    } finally { await directory.dispose(); }
  });
  it('uses independent exclusive temporary files even with equal clock ticks', async () => {
    const directory = await temporaryDirectory('portwise-random-temp');
    try {
      vi.spyOn(Date, 'now').mockReturnValue(123456);
      let entered: (() => void) | undefined; let release: (() => void) | undefined;
      const ready = new Promise<void>(resolve => { entered = resolve; }); const gate = new Promise<void>(resolve => { release = resolve; });
      const file = path.join(directory.path, 'auth.json');
      const first = atomic.atomicWrite(file, 'test-first-0000', { beforeRename: async () => { entered?.(); await gate; } }); await ready;
      await atomic.atomicWrite(file, 'test-second-0000'); release?.(); await first;
      expect(await readFile(file, 'utf8')).toBe('test-first-0000'); expect(await readdir(directory.path)).toEqual(['auth.json']);
      await expect(atomic.writePrivateExclusive(file, 'test-forbidden-0000')).rejects.toMatchObject({ code: 'EEXIST' });
      const outside = path.join(directory.path, 'outside'); await writeFile(outside, 'untouched');
      const link = path.join(directory.path, 'linked.tmp'); await symlink(outside, link);
      await expect(atomic.writePrivateExclusive(link, 'test-forbidden-0000')).rejects.toMatchObject({ code: 'EEXIST' });
      expect(await readFile(outside, 'utf8')).toBe('untouched');
    } finally { await directory.dispose(); }
  });

  it('serializes separate ConfigSync instances so sync and provider switch preserve each other', async () => {
    const directory = await temporaryDirectory('portwise-config-transactions');
    try {
      const file = path.join(directory.path, 'config.toml'); const source = '# keep\nmodel_provider = "other"\nunknown = "preserved"\n';
      await writeFile(file, source);
      const options = { codexHome: directory.path, backupDirectory: path.join(directory.path, 'backups'), gatewayBaseUrl: 'http://127.0.0.1:1/v1' };
      await Promise.all([new ConfigSync(options).sync(), new ConfigSync(options).switchToPortwise()]);
      const result = await readFile(file, 'utf8');
      expect(result).toContain('model_provider = "portwise"'); expect(result).toContain('unknown = "preserved"');
      expect(result.match(/\[model_providers\.portwise\]/g)).toHaveLength(1);
      expect(await new ConfigSync(options).backups()).toHaveLength(2);
      expect((await readdir(directory.path)).filter(name => name.endsWith('.lock') || name.endsWith('.guard'))).toEqual([]);
    } finally { await directory.dispose(); }
  });

  it('preserves an in-place external edit before rename instead of committing or rolling back over it', async () => {
    const directory = await temporaryDirectory('portwise-config-external');
    const realWrite = atomic.atomicWrite;
    try {
      const file = path.join(directory.path, 'config.toml'); await writeFile(file, 'model = "original"\n');
      const external = 'model = "external"\n';
      vi.spyOn(atomic, 'atomicWrite').mockImplementationOnce((target, contents, options) => realWrite(target, contents, { ...options, beforeRename: async () => { await writeFile(file, external); await options?.beforeRename?.(); } }));
      const sync = new ConfigSync({ codexHome: directory.path, backupDirectory: path.join(directory.path, 'backups'), gatewayBaseUrl: 'http://127.0.0.1:1/v1' });
      await expect(sync.sync()).rejects.toMatchObject({ code: 'path_invalid' });
      expect(await readFile(file, 'utf8')).toBe(external);
      const backup = (await sync.backups())[0]; if (!backup) throw new Error('missing backup');
      expect(await readFile(backup.file, 'utf8')).toBe('model = "original"\n');
    } finally { await directory.dispose(); }
  });

  it('does not overwrite credentials refreshed externally after a switch', async () => {
    const directory = await temporaryDirectory('portwise-auth-external');
    try {
      const file = path.join(directory.path, 'auth.json'); await writeFile(file, '{"token":"test-original-0000"}');
      await writeFile(path.join(directory.path, 'config.toml'), 'cli_auth_credentials_store="file"\n');
      const state = new Map<string, unknown>(); const secrets = new Map<string, string>();
      const store = new AccountStore({ get: <T>(key: string) => state.get(key) as T | undefined, update: async (key, value) => { state.set(key, value); } }, { get: async key => secrets.get(key), store: async (key, value) => { secrets.set(key, value); }, delete: async key => { secrets.delete(key); } });
      const account = await store.capture('fake', directory.path, '{"token":"test-new-0000"}');
      const refreshed = '{"token":"test-refreshed-0000"}';
      const switcher = new AccountSwitcher({ codexHome: directory.path, store, failAt: async step => { if (step === 'beforeVerify') await writeFile(file, refreshed); } });
      await expect(switcher.switchTo(account.id, async () => undefined)).rejects.toMatchObject({ code: 'account_external_edit' });
      expect(await readFile(file, 'utf8')).toBe(refreshed);
    } finally { await directory.dispose(); }
  });
});
