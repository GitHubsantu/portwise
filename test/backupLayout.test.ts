import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, realpath, symlink, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { backupDirectories, createBackup, listBackups } from '../src/sync/backups';
import { ConfigSync } from '../src/sync/configSync';
import { PermissionCommandError } from '../src/core/permissionCommand';
import type { PermissionOptions } from '../src/core/privateFile';
import { temporaryDirectory } from './helpers/temporaryDirectory';
import { PERMISSION_IO_TEST_MS } from './helpers/permissionBudget';

const sid = 'S-1-5-21-111-222-333-1000';
function limitedPermissions(observed: string[] = []): PermissionOptions {
  return { platform: 'win32', run: async (command, args, input) => {
    if (command === 'whoami') return `"fake","${sid}"`;
    if (command === 'icacls') {
      const file = args[0]; if (!file) throw new Error('missing fixture');
      observed.push(file); if (file.length >= 260) throw new PermissionCommandError('nonzero exit', 3);
      expect((await readFile(file)).length).toBe(0); return '';
    }
    const request: unknown = JSON.parse(input ?? '{}');
    if (typeof request !== 'object' || request === null || !('file' in request) || typeof request.file !== 'string') throw new Error('missing fixture');
    expect((await readFile(request.file)).length).toBe(0);
    return JSON.stringify({ protected: true, present: true, aces: [{ sid, mask: 0x1f01ff, flags: 0, kind: 0 }] });
  } };
}

describe('compact backups with legacy compatibility', () => {
  it.each(['home', 'home with spaces [literal]', 'home-测试-é'])('uses a 43-character canonical-home SHA256 key in fresh storage for %s', async name => {
    const directory = await temporaryDirectory('portwise-backup-layout');
    try {
      const home = path.join(directory.path, name); await mkdir(home);
      const storage = path.join(directory.path, 'fresh-storage'); const locations = await backupDirectories(storage, home);
      const canonical = await realpath(home);
      const key = path.basename(locations.current);
      expect(key).toMatch(/^[A-Za-z0-9_-]{43}$/); expect(key).toBe(createHash('sha256').update(canonical, 'utf8').digest('base64url'));
      expect(locations.legacy).toBe(path.join(storage, 'backups', Buffer.from(canonical).toString('base64url')));
      const file = path.join(home, 'config.toml'); const bytes = Buffer.from('# fake\r\nmodel="original"\r\n'); await writeFile(file, bytes);
      const writes: string[] = []; const backup = await createBackup(file, locations, limitedPermissions(writes));
      expect(path.dirname(backup.file)).toBe(locations.current); expect(await readFile(backup.file)).toEqual(bytes);
      expect(path.basename(backup.file)).toMatch(/^config\.toml\.\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d\.\d{3}Z\.0000\.backup$/);
      expect(writes).toEqual([backup.file]); expect(await listBackups(file, locations)).toEqual([backup]);
      await expect(readdir(locations.legacy)).rejects.toMatchObject({ code: 'ENOENT' });
    } finally { await directory.dispose(); }
  });

  it('shortens the isolated-profile layout enough for a simulated MAX_PATH-limited icacls', async () => {
    const directory = await temporaryDirectory('portwise-layout-length');
    try {
      // Match the 137-character storage prefix from the second PC without using its paths.
      const storage = path.join(directory.path, 's'.repeat(137 - directory.path.length - 1)); await mkdir(storage);
      const home = path.join(directory.path, 'h'.repeat(98 - directory.path.length - 1)); await mkdir(home);
      const locations = await backupDirectories(storage, home); const file = path.join(home, 'config.toml'); await writeFile(file, 'model="fake"\n');
      const calls: string[] = []; const backup = await createBackup(file, locations, limitedPermissions(calls));
      expect(backup.file.length).toBe(238);
      const oldFile = path.join(locations.legacy, path.basename(backup.file)); expect(oldFile.length).toBe(326);
      const limited = limitedPermissions().run; if (!limited) throw new Error('missing simulated tool');
      await expect(limited('icacls', [oldFile])).rejects.toMatchObject({ exitCode: 3 });
      expect(calls).toEqual([backup.file]); expect(await readFile(backup.file, 'utf8')).toBe('model="fake"\n');
    } finally { await directory.dispose(); }
  });

  it('lists legacy files without moving them and restores one with a new-layout safety backup', async () => {
    const directory = await temporaryDirectory('portwise-legacy-restore');
    try {
      const home = path.join(directory.path, 'home'); await mkdir(home);
      const locations = await backupDirectories(path.join(directory.path, 'storage'), home); await mkdir(locations.legacy, { recursive: true });
      const legacy = path.join(locations.legacy, 'config.toml.2020-01-01T00-00-00.000Z.0000.backup'); const bytes = '# legacy\r\nmodel="old"\r\n'; await writeFile(legacy, bytes);
      const current = path.join(home, 'config.toml'); const before = 'model="external edit"\n'; await writeFile(current, before);
      const sync = new ConfigSync({ codexHome: home, backupDirectory: locations, gatewayBaseUrl: 'http://127.0.0.1:1/v1' });
      const entries = await sync.backups(); expect(entries).toHaveLength(1); expect(entries[0]?.file).toBe(legacy);
      await expect(readdir(locations.current)).rejects.toMatchObject({ code: 'ENOENT' });
      await sync.restore(entries[0]); expect(await readFile(current, 'utf8')).toBe(bytes); expect(await readFile(legacy, 'utf8')).toBe(bytes);
      const after = await sync.backups(); expect(after).toHaveLength(2); expect(path.dirname(after[0]?.file ?? '')).toBe(locations.current);
      expect(await readFile(after[0]?.file ?? '', 'utf8')).toBe(before);
      await sync.restore(after[0]); expect(await readFile(current, 'utf8')).toBe(before);
    } finally { await directory.dispose(); }
  }, PERMISSION_IO_TEST_MS);

  it('retains ten across layouts only after a verified new backup, including restoration of the pruned selection', async () => {
    const directory = await temporaryDirectory('portwise-legacy-retention');
    try {
      const home = path.join(directory.path, 'home'); await mkdir(home); const current = path.join(home, 'config.toml'); await writeFile(current, 'model="before"\n');
      const locations = await backupDirectories(path.join(directory.path, 'storage'), home); await mkdir(locations.legacy, { recursive: true });
      for (let day = 1; day <= 10; day++) await writeFile(path.join(locations.legacy, `config.toml.2020-01-${String(day).padStart(2, '0')}T00-00-00.000Z.0000.backup`), `model="day-${day}"\n`);
      const sync = new ConfigSync({ codexHome: home, backupDirectory: locations, gatewayBaseUrl: '' }); const all = await sync.backups(); expect(all).toHaveLength(10);
      const selected = all.at(-1); if (!selected) throw new Error('missing fixture');
      await sync.restore(selected);
      expect(await readFile(current, 'utf8')).toBe('model="day-1"\n');
      await expect(readFile(selected.file)).rejects.toMatchObject({ code: 'ENOENT' });
      expect(await sync.backups()).toHaveLength(10); expect(await readdir(locations.legacy)).toHaveLength(9); expect(await readdir(locations.current)).toHaveLength(1);
    } finally { await directory.dispose(); }
  }, PERMISSION_IO_TEST_MS);

  it('does not prune legacy backups or replace originals after permission failure', async () => {
    const directory = await temporaryDirectory('portwise-layout-failure');
    try {
      const home = path.join(directory.path, 'home'); await mkdir(home); const file = path.join(home, 'config.toml'); await writeFile(file, 'model="before"\n');
      const locations = await backupDirectories(path.join(directory.path, 'storage'), home); await mkdir(locations.legacy, { recursive: true });
      const legacy = path.join(locations.legacy, 'config.toml.2020-01-01T00-00-00.000Z.0000.backup'); await writeFile(legacy, 'model="legacy"\n');
      await expect(createBackup(file, locations, { platform: 'win32', run: async () => { throw new PermissionCommandError('nonzero exit', 3); } })).rejects.toMatchObject({ code: 'private_permissions_failed' });
      expect(await readFile(legacy, 'utf8')).toBe('model="legacy"\n'); expect(await readFile(file, 'utf8')).toBe('model="before"\n'); expect(await readdir(locations.current)).toEqual([]);
    } finally { await directory.dispose(); }
  });

  it('does not overwrite a same-timestamp legacy filename', async () => {
    const directory = await temporaryDirectory('portwise-layout-collision');
    try {
      const home = path.join(directory.path, 'home'); await mkdir(home); const file = path.join(home, 'config.toml'); await writeFile(file, 'model="new"\n');
      const locations = await backupDirectories(path.join(directory.path, 'storage'), home); await mkdir(locations.legacy, { recursive: true });
      const now = new Date('2020-01-01T00:00:00.000Z'); vi.spyOn(Date.prototype, 'toISOString').mockReturnValue(now.toISOString());
      const legacy = path.join(locations.legacy, 'config.toml.2020-01-01T00-00-00.000Z.0000.backup'); await writeFile(legacy, 'model="old"\n');
      const created = await createBackup(file, locations, limitedPermissions()); expect(path.basename(created.file)).toContain('.0001.backup');
      expect(await readFile(legacy, 'utf8')).toBe('model="old"\n'); expect(await listBackups(file, locations)).toHaveLength(2);
    } finally { vi.restoreAllMocks(); await directory.dispose(); }
  });

  it.each(['config.toml', '.env'])('retains the newest ten %s snapshots across both existing layouts', async name => {
    const directory = await temporaryDirectory('portwise-mixed-retention');
    try {
      const home = path.join(directory.path, 'home'); await mkdir(home); const target = path.join(home, name); await writeFile(target, 'test-original-0000');
      const locations = await backupDirectories(path.join(directory.path, 'storage'), home);
      for (const folder of [locations.current, locations.legacy]) await mkdir(folder, { recursive: true });
      for (let day = 1; day <= 6; day++) await writeFile(path.join(locations.legacy, `${name}.2019-01-${String(day).padStart(2, '0')}T00-00-00.000Z.0000.backup`), `test-legacy-${day}`);
      for (let day = 1; day <= 5; day++) await writeFile(path.join(locations.current, `${name}.2020-01-${String(day).padStart(2, '0')}T00-00-00.000Z.0000.backup`), `test-current-${day}`);
      expect(await listBackups(target, locations)).toHaveLength(11);
      await createBackup(target, locations, limitedPermissions());
      expect(await listBackups(target, locations)).toHaveLength(10); expect(await readdir(locations.legacy)).toHaveLength(4); expect(await readdir(locations.current)).toHaveLength(6);
      expect(await readFile(target, 'utf8')).toBe('test-original-0000');
    } finally { await directory.dispose(); }
  });

  it.each(['current', 'legacy'] as const)('refuses a linked %s directory without pruning outside files', async layout => {
    const directory = await temporaryDirectory('portwise-linked-layout');
    try {
      const home = path.join(directory.path, 'home'); await mkdir(home); const target = path.join(home, 'config.toml'); await writeFile(target, 'original');
      const locations = await backupDirectories(path.join(directory.path, 'storage'), home);
      const outside = path.join(directory.path, 'outside'); await mkdir(outside); const original = path.join(outside, 'config.toml.2020-01-01T00-00-00.000Z.0000.backup'); await writeFile(original, 'unchanged');
      await mkdir(path.dirname(locations[layout]), { recursive: true }); await symlink(outside, locations[layout], process.platform === 'win32' ? 'junction' : 'dir');
      await expect(createBackup(target, locations, limitedPermissions())).rejects.toThrow('backup directories');
      expect(await readFile(original, 'utf8')).toBe('unchanged'); expect(await readdir(outside)).toHaveLength(1); expect(await readFile(target, 'utf8')).toBe('original');
    } finally { await directory.dispose(); }
  });

  it('refuses a foreign selection and a linked legacy file', async () => {
    const directory = await temporaryDirectory('portwise-layout-boundary');
    try {
      const home = path.join(directory.path, 'home'); await mkdir(home); const locations = await backupDirectories(path.join(directory.path, 'storage'), home);
      const sync = new ConfigSync({ codexHome: home, backupDirectory: locations, gatewayBaseUrl: '' });
      await expect(sync.restore({ file: path.join(directory.path, 'foreign.backup'), createdAt: 'fake' })).rejects.toThrow('not available');
      const file = path.join(home, 'config.toml'); await writeFile(file, 'model="safe"\n');
      const outside = path.join(directory.path, 'outside'); await writeFile(outside, 'model="outside"\n');
      await mkdir(locations.legacy, { recursive: true });
      const linked = path.join(locations.legacy, 'config.toml.2020-01-01T00-00-00.000Z.0000.backup'); await symlink(outside, linked);
      await expect(sync.restore((await sync.backups())[0])).rejects.toThrow('symbolic links');
      expect(await readFile(file, 'utf8')).toBe('model="safe"\n'); expect(await readFile(outside, 'utf8')).toBe('model="outside"\n');
      await expect(readdir(locations.current)).rejects.toMatchObject({ code: 'ENOENT' });
    } finally { await directory.dispose(); }
  }, PERMISSION_IO_TEST_MS);
});
