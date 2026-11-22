import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { atomicWrite } from '../src/core/atomicWrite';
import { restrictPrivateFile, verifyPrivateFile, type PermissionOptions } from '../src/core/privateFile';
import { verifyWindowsAcl } from '../src/core/windowsAcl';
import { createBackup } from '../src/sync/backups';
import { temporaryDirectory } from './helpers/temporaryDirectory';

const sid = 'S-1-5-21-111-222-333-1000';
const ace = (principal = sid, mask = 0x1f01ff, flags = 0, kind = 0) => ({ sid: principal, mask, flags, kind });
const snapshot = (aces = [ace()], protectedAcl = true) => JSON.stringify({ protected: protectedAcl, present: true, aces });
describe('private file permissions', () => {
  it.each([false, true])('checks existing Windows ACLs without mutation (insecure=%s)', async insecure => {
    const directory = await temporaryDirectory('portwise-readonly-acl');
    try {
      const file = path.join(directory.path, '.env'); await writeFile(file, 'test-private-0000'); const before = await stat(file);
      const verification = verifyPrivateFile(file, { platform: 'win32', run: async (command, args) => {
        if (command === 'whoami') return `"fake","${sid}"`;
        expect(command).toBe('powershell.exe'); expect(args).not.toContain('/grant:r'); expect(args).not.toContain('/inheritance:r');
        return snapshot([ace(insecure ? 'S-1-1-0' : sid)]);
      } });
      if (insecure) await expect(verification).rejects.toMatchObject({ code: 'private_permissions_unverified' }); else await verification;
      const after = await stat(file); expect(after.mode).toBe(before.mode); expect(after.mtimeMs).toBe(before.mtimeMs); expect(await readFile(file, 'utf8')).toBe('test-private-0000');
    } finally { await directory.dispose(); }
  });
  it('uses Windows numeric SID normalization for built-in Administrator and requires the actual current user SID', async () => {
    const adminSid = 'S-1-5-21-111-222-333-500';
    const saved = snapshot([ace(adminSid)]);
    expect(() => verifyWindowsAcl(saved, adminSid)).not.toThrow();
    expect(() => verifyWindowsAcl(snapshot([ace('LA')]), adminSid)).toThrow();
    expect(() => verifyWindowsAcl(saved, sid)).toThrow();
    const directory = await temporaryDirectory('portwise-admin-alias');
    try {
      const file = path.join(directory.path, 'empty'); await writeFile(file, '');
      let resolved = false;
      await restrictPrivateFile(file, { platform: 'win32', run: async (command, args) => {
        if (command === 'whoami') return `"fake","${adminSid}"`;
        if (command === 'powershell.exe') {
          resolved = true; expect(args).toContain('-EncodedCommand');
          const script = Buffer.from(args[3] ?? '', 'base64').toString('utf16le');
          expect(script).toContain('GetSecurityDescriptorBinaryForm'); expect(script).toContain('SecurityIdentifier.Value'); return saved;
        }
        return '';
      } });
      expect(resolved).toBe(true); expect(await readFile(file, 'utf8')).toBe('');
    } finally { await directory.dispose(); }
  });
  it.each(['whoami', 'apply', 'read', 'verify'])('fails closed at %s without writing private bytes or replacing the original', async stage => {
    const directory = await temporaryDirectory('portwise-private-failure');
    try {
      const target = path.join(directory.path, 'auth.json'); await writeFile(target, 'test-original-0000');
      const permissions: PermissionOptions = { platform: 'win32', run: async (command, args, input) => {
        if (command === 'whoami') { if (stage === 'whoami') throw new Error('test-opaque-0000'); return `"fake","${sid}"`; }
        const file: unknown = command === 'powershell.exe' ? (JSON.parse(input ?? '{}') as Record<string, unknown>)['file'] : args[0]; if (typeof file !== 'string') throw new Error('missing file');
        expect((await readFile(file)).length).toBe(0);
        expect(args.join(' ')).not.toContain('Users');
        if (command === 'powershell.exe') {
          if (stage === 'read') throw new Error('test-opaque-0000');
          return snapshot([ace(stage === 'verify' ? 'S-1-1-0' : sid)]);
        }
        if (stage === 'apply') throw new Error('test-opaque-0000'); return '';
      } };
      await expect(atomicWrite(target, 'test-private-0000', { permissions })).rejects.toMatchObject({ code: 'private_permissions_failed' });
      expect(await readFile(target, 'utf8')).toBe('test-original-0000');
      expect(await readdir(directory.path)).toEqual(['auth.json']);
      await expect(createBackup(target, path.join(directory.path, 'backups'), permissions)).rejects.toMatchObject({ code: 'private_permissions_failed' });
      expect(await readdir(path.join(directory.path, 'backups'))).toEqual([]);
    } finally { await directory.dispose(); }
  });

  it.each([
    snapshot([ace()], false), snapshot([ace(sid, 0x1f01ff, 16)]), snapshot([ace('S-1-1-0'), ace()]),
    snapshot([ace(sid, 0x1f01ff, 0, 1), ace()]), snapshot([ace(sid, 0x120089)]), snapshot([ace('S-1-5-18')]),
  ])('rejects insecure or unverifiable ACL %s', acl => expect(() => verifyWindowsAcl(acl, sid)).toThrow());
  it('accepts only protected explicit user control and verifies real OS writes', async () => {
    expect(() => verifyWindowsAcl(snapshot([ace(), ace('S-1-5-18'), ace('S-1-5-32-544')]), sid)).not.toThrow();
    const directory = await temporaryDirectory('portwise-real-private');
    try {
      const file = path.join(directory.path, 'auth.json'); await atomicWrite(file, 'test-private-0000');
      expect(await readFile(file, 'utf8')).toBe('test-private-0000');
      if (process.platform !== 'win32') expect((await stat(file)).mode & 0o777).toBe(0o600);
    } finally { await directory.dispose(); }
  });
});
