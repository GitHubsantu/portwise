import * as fs from 'node:fs/promises';
import { readFile, writeFile, readdir, lstat, unlink, symlink } from 'node:fs/promises';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as atomic from '../src/core/atomicWrite';
import * as permissions from '../src/core/privateFile';
import { PrivatePermissionError } from '../src/core/permissionFailure';
import { createBackup, listBackups, type BackupEntry } from '../src/sync/backups';
import { deliverGatewayToken } from '../src/sync/credentialDelivery';
import { ConfigSync } from '../src/sync/configSync';
import { FileUpdateVerificationError } from '../src/sync/verifiedUpdate';
import { temporaryDirectory } from './helpers/temporaryDirectory';
import { PERMISSION_IO_TEST_MS } from './helpers/permissionBudget';
import { runPermissionCommand } from '../src/core/permissionCommand';

vi.mock('node:fs/promises', async importOriginal => ({ ...await importOriginal<typeof fs>() }));
afterEach(() => vi.restoreAllMocks());
type Kind = 'env' | 'restore';
const secret = 'test-failure-credential-0000';
const message = new FileUpdateVerificationError('restored').message;

/** Fault matrix uses simulated ACL commands; native positive cases below verify actual OS rules. */
function simulatedPermissions() {
  const restrict = permissions.restrictPrivateFile; const verify = permissions.verifyPrivateFile;
  const sid = 'S-1-5-21-111-222-333-1000';
  const run: NonNullable<permissions.PermissionOptions['run']> = async command => command === 'whoami' ? `"fake","${sid}"` : command === 'icacls' ? '' : JSON.stringify({ protected: true, present: true, aces: [{ sid, mask: 0x1f01ff, kind: 0, flags: 0 }] });
  vi.spyOn(permissions, 'restrictPrivateFile').mockImplementation((file, options) => restrict(file, { ...options, platform: 'win32', run }));
  const check = (file: string) => verify(file, { platform: 'win32', run });
  const verifySpy = vi.spyOn(permissions, 'verifyPrivateFile').mockImplementation(check);
  return { check, verifySpy };
}
async function fixture(kind: Kind, native = false, missing = false) {
  const acl = native ? undefined : simulatedPermissions();
  const directory = await temporaryDirectory('portwise-r2');
  const file = path.join(directory.path, kind === 'env' ? '.env' : 'config.toml');
  const backups = path.join(directory.path, 'backups');
  const before = kind === 'env' ? 'OTHER=keep\r\nPORTWISE_GATEWAY_TOKEN=test-old-0000\r\n' : '# external edit before Restore\nmodel="before"\n';
  const expected = kind === 'env' ? before.replace('test-old-0000', 'test-token-0000') : '# saved\nmodel="saved"\n';
  let selected: BackupEntry | undefined;
  if (kind === 'restore') { await writeFile(file, expected); selected = await createBackup(file, backups); }
  if (!missing) await writeFile(file, before);
  for (const name of ['auth.json', 'history.jsonl', kind === 'env' ? 'config.toml' : '.env']) await writeFile(path.join(directory.path, name), `test-untouched-${name}`);
  const others = await Promise.all(['auth.json', 'history.jsonl', kind === 'env' ? 'config.toml' : '.env'].map(async name => ({ name, bytes: await readFile(path.join(directory.path, name)) })));
  const sync = new ConfigSync({ codexHome: directory.path, backupDirectory: backups, gatewayBaseUrl: '' });
  const run = () => kind === 'env' ? deliverGatewayToken(directory.path, 'test-token-0000', backups) : sync.restore(selected);
  const untouched = async () => { for (const other of others) expect(await readFile(path.join(directory.path, other.name))).toEqual(other.bytes); };
  return { directory, file, backups, before, expected, run, acl, untouched };
}

describe('verified delivery and Restore recovery', () => {
  it.each(['env', 'restore'] as const)('verifies actual private permissions and bytes for a successful %s update', async kind => {
    const f = await fixture(kind, true);
    const verify = vi.spyOn(permissions, 'verifyPrivateFile');
    try {
      await f.run(); expect(await readFile(f.file, 'utf8')).toBe(f.expected);
      expect(verify).toHaveBeenCalledWith(f.file); await permissions.verifyPrivateFile(f.file);
      expect((await readdir(f.directory.path)).filter(name => name.endsWith('.tmp') || name.endsWith('.bak'))).toEqual([]);
      const snapshots = await listBackups(f.file, f.backups);
      expect(await Promise.all(snapshots.map(snapshot => readFile(snapshot.file, 'utf8')))).toContain(f.before);
      await f.untouched();
    } finally { await f.directory.dispose(); }
  }, PERMISSION_IO_TEST_MS);

  const faults = ['after-rename', 'readback', 'content', 'permissions', 'stage-content'] as const;
  const cases = (['env', 'restore'] as const).flatMap(kind => faults.map(fault => [kind, fault] as const));
  it.each(cases)('%s recovers safely when %s fails, with one fixed non-sensitive error', async (kind, fault) => {
    const f = await fixture(kind); const realRename = fs.rename; const realRead = fs.readFile; const realWrite = atomic.atomicWrite;
    let installed = false; let injected = false;
    try {
      vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
        await realRename(from, to);
        if (String(to) === f.file && String(from).endsWith('.tmp')) {
          installed = true;
          if (fault === 'after-rename' && !injected) { injected = true; throw new Error(secret); }
        }
      });
      vi.spyOn(fs, 'readFile').mockImplementation(((...args: Parameters<typeof fs.readFile>) => {
        if (installed && String(args[0]) === f.file && !injected && (fault === 'readback' || fault === 'content')) {
          injected = true;
          if (fault === 'readback') return Promise.reject(new Error(secret));
          return Promise.resolve(Buffer.from(secret));
        }
        return realRead(...args);
      }) as typeof fs.readFile);
      const acl = f.acl; if (!acl) throw new Error('missing ACL fixture');
      acl.verifySpy.mockImplementation(async file => {
        if (file === f.file && installed && !injected && fault === 'permissions') {
          injected = true; throw new PrivatePermissionError('private file', { step: 'verify', command: 'powershell.exe', category: 'validation', reason: 'unprotected DACL' });
        }
        await acl.check(file);
      });
      if (fault === 'stage-content') vi.spyOn(atomic, 'atomicWrite').mockImplementation((file, contents, options) => realWrite(file, contents, { ...options, beforeRename: async temporary => {
        if (!temporary) throw new Error('missing stage'); injected = true; await writeFile(temporary, secret);
        await options?.beforeRename?.(temporary);
      } }));
      await expect(f.run()).rejects.toMatchObject({ code: 'file_update_verification_failed', message });
      expect(injected).toBe(true); expect(await readFile(f.file, 'utf8')).toBe(f.before); await acl.check(f.file);
      expect(message).not.toContain(secret); expect(message).toContain('retained backups');
      expect((await readdir(f.directory.path)).filter(name => name.endsWith('.tmp') || name.endsWith('.bak'))).toEqual([]);
      expect(await Promise.all((await listBackups(f.file, f.backups)).map(backup => readFile(backup.file, 'utf8')))).toContain(f.before);
      await f.untouched();
    } finally { await f.directory.dispose(); }
  });

  it.each((['env', 'restore'] as const).flatMap(kind => (['in-place', 'replace', 'symlink'] as const).map(mode => [kind, mode] as const)))('%s preserves an external %s change after rename', async (kind, mode) => {
    const f = await fixture(kind); const realRename = fs.rename; let edited = false;
    const outside = path.join(f.directory.path, 'outside'); const external = 'test-external-credential-0000';
    try {
      await writeFile(outside, external);
      vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
        await realRename(from, to);
        if (String(to) === f.file && String(from).endsWith('.tmp') && !edited) {
          edited = true;
          if (mode === 'in-place') await writeFile(f.file, external);
          if (mode === 'replace') { const other = path.join(f.directory.path, 'external-file'); await writeFile(other, external); await realRename(other, f.file); }
          if (mode === 'symlink') { await unlink(f.file); await symlink(outside, f.file); }
        }
      });
      await expect(f.run()).rejects.toMatchObject({ code: 'file_update_verification_failed', message });
      expect(await readFile(f.file, 'utf8')).toBe(external); expect(await readFile(outside, 'utf8')).toBe(external);
      if (mode === 'symlink') expect((await lstat(f.file)).isSymbolicLink()).toBe(true);
      expect(await Promise.all((await listBackups(f.file, f.backups)).map(backup => readFile(backup.file, 'utf8')))).toContain(f.before);
      await f.untouched();
    } finally { await f.directory.dispose(); }
  });

  it('restores absence when the first .env delivery fails verification', async () => {
    const f = await fixture('env', false, true); let failed = false;
    try {
      const acl = f.acl; if (!acl) throw new Error('missing ACL fixture');
      acl.verifySpy.mockImplementation(async file => { if (file === f.file && !failed) { failed = true; throw new Error(secret); } await acl.check(file); });
      await expect(f.run()).rejects.toMatchObject({ code: 'file_update_verification_failed', message });
      await expect(lstat(f.file)).rejects.toMatchObject({ code: 'ENOENT' });
      expect((await readdir(f.directory.path)).filter(name => name.endsWith('.tmp') || name.endsWith('.bak'))).toEqual([]);
      await f.untouched();
    } finally { await f.directory.dispose(); }
  });

  it.each(['env', 'restore'] as const)('%s rechecks ownership when an external edit arrives during rollback preparation', async kind => {
    const f = await fixture(kind); const realRead = fs.readFile;
    let failed = false; let edited = false; const external = 'test-late-external-edit-0000';
    try {
      const acl = f.acl; if (!acl) throw new Error('missing ACL fixture');
      acl.verifySpy.mockImplementation(async file => { if (file === f.file && !failed) { failed = true; throw new Error(secret); } await acl.check(file); });
      vi.spyOn(fs, 'readFile').mockImplementation((async (...args: Parameters<typeof fs.readFile>) => {
        if (failed && String(args[0]).endsWith('.bak') && !edited) { edited = true; await writeFile(f.file, external); }
        return realRead(...args);
      }) as typeof fs.readFile);
      await expect(f.run()).rejects.toMatchObject({ code: 'file_update_verification_failed', message });
      expect(edited).toBe(true); expect(await readFile(f.file, 'utf8')).toBe(external);
      expect(await Promise.all((await listBackups(f.file, f.backups)).map(backup => readFile(backup.file, 'utf8')))).toContain(f.before);
      await f.untouched();
    } finally { await f.directory.dispose(); }
  });

  it.each(['env', 'restore'] as const)('%s rolls back with prepared private bytes even if target ACL inspection keeps failing', async kind => {
    const f = await fixture(kind);
    try {
      const acl = f.acl; if (!acl) throw new Error('missing ACL fixture');
      acl.verifySpy.mockImplementation(async file => { if (file === f.file) throw new Error(secret); await acl.check(file); });
      await expect(f.run()).rejects.toMatchObject({ code: 'file_update_verification_failed', message });
      expect(await readFile(f.file, 'utf8')).toBe(f.before); await acl.check(f.file);
      await f.untouched();
    } finally { await f.directory.dispose(); }
  });

  it.each(['env', 'restore'] as const)('%s detects actual permission drift after rename and restores private original bytes', async kind => {
    const f = await fixture(kind, true); const verify = permissions.verifyPrivateFile; let changed = false;
    try {
      vi.spyOn(permissions, 'verifyPrivateFile').mockImplementation(async (file, options) => {
        if (file === f.file && !changed) {
          changed = true;
          if (process.platform === 'win32') await runPermissionCommand('icacls', [file, '/inheritance:e']);
          else await fs.chmod(file, 0o644);
        }
        await verify(file, options);
      });
      await expect(f.run()).rejects.toMatchObject({ code: 'file_update_verification_failed', message });
      expect(changed).toBe(true); expect(await readFile(f.file, 'utf8')).toBe(f.before); await verify(f.file);
      await f.untouched();
    } finally { await f.directory.dispose(); }
  }, PERMISSION_IO_TEST_MS);

  it('keeps the verification error primary when recovery-file cleanup also fails', async () => {
    const f = await fixture('env'); const realWrite = atomic.atomicWrite; const realUnlink = fs.unlink;
    try {
      vi.spyOn(atomic, 'atomicWrite').mockImplementation((file, contents, options) => realWrite(file, contents, { ...options, beforeRename: async temporary => {
        if (!temporary) throw new Error('missing stage'); await writeFile(temporary, secret); await options?.beforeRename?.(temporary);
      } }));
      vi.spyOn(fs, 'unlink').mockImplementation(async file => { if (String(file).endsWith('.bak')) throw new Error(secret); await realUnlink(file); });
      await expect(f.run()).rejects.toMatchObject({ code: 'file_update_verification_failed', message, recovery: 'original-preserved' });
      expect(await readFile(f.file, 'utf8')).toBe(f.before); expect((await readdir(f.directory.path)).filter(name => name.endsWith('.bak'))).toHaveLength(1);
    } finally { vi.restoreAllMocks(); await f.directory.dispose(); }
  });

  it('fails honestly if the OS blocks rollback, keeping private recovery bytes and the retained backup', async () => {
    const f = await fixture('env'); const realRename = fs.rename;
    try {
      const acl = f.acl; if (!acl) throw new Error('missing ACL fixture');
      acl.verifySpy.mockImplementation(async file => { if (file === f.file) throw new Error(secret); await acl.check(file); });
      vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => { if (String(from).endsWith('.bak')) throw new Error(secret); await realRename(from, to); });
      await expect(f.run()).rejects.toMatchObject({ code: 'file_update_verification_failed', message, recovery: 'manual-recovery' });
      // Published bytes were fully verified in staging; never claim successful post-write verification.
      expect(await readFile(f.file, 'utf8')).toBe(f.expected); await acl.check(f.file);
      const recoveries = (await readdir(f.directory.path)).filter(name => name.endsWith('.bak')); expect(recoveries).toHaveLength(1);
      const recovery = recoveries[0]; if (!recovery) throw new Error('missing recovery');
      expect(await readFile(path.join(f.directory.path, recovery), 'utf8')).toBe(f.before);
      expect(await Promise.all((await listBackups(f.file, f.backups)).map(backup => readFile(backup.file, 'utf8')))).toContain(f.before);
    } finally { await f.directory.dispose(); }
  });
});
