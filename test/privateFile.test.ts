import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { atomicWrite } from '../src/core/atomicWrite';
import { restrictPrivateFile, verifyPrivateDacl, type PermissionOptions } from '../src/core/privateFile';
import { createBackup } from '../src/sync/backups';
import { temporaryDirectory } from './helpers/temporaryDirectory';

const sid = 'S-1-5-21-111-222-333-1000';
describe('private file permissions', () => {
  it('resolves the LA alias through Windows and requires it to equal the actual current user SID', async () => {
    const adminSid = 'S-1-5-21-111-222-333-500';
    const saved = 'fake\r\nD:PAI(A;;FA;;;LA)\r\n';
    expect(() => verifyPrivateDacl(saved, adminSid, adminSid)).not.toThrow();
    expect(() => verifyPrivateDacl(saved, adminSid)).toThrow();
    expect(() => verifyPrivateDacl(saved, sid, adminSid)).toThrow();
    const directory = await temporaryDirectory('portwise-admin-alias');
    try {
      const file = path.join(directory.path, 'empty'); await writeFile(file, '');
      let resolved = false;
      await restrictPrivateFile(file, { platform: 'win32', run: async (command, args) => {
        if (command === 'whoami') return `"fake","${adminSid}"`;
        if (command === 'powershell.exe') { resolved = true; expect(args).toContain('-EncodedCommand'); return adminSid; }
        if (args.includes('/save')) { const capture = args[2]; if (!capture) throw new Error('missing capture'); await writeFile(capture, Buffer.from(saved, 'utf16le')); }
        return '';
      } });
      expect(resolved).toBe(true); expect(await readFile(file, 'utf8')).toBe('');
    } finally { await directory.dispose(); }
  });
  it.each(['whoami', 'apply', 'save', 'verify'])('fails closed at %s without writing private bytes or replacing the original', async stage => {
    const directory = await temporaryDirectory('portwise-private-failure');
    try {
      const target = path.join(directory.path, 'auth.json'); await writeFile(target, 'test-original-0000');
      const permissions: PermissionOptions = { platform: 'win32', run: async (command, args) => {
        if (command === 'whoami') { if (stage === 'whoami') throw new Error('test-opaque-0000'); return `"fake","${sid}"`; }
        const file = args[0]; if (!file) throw new Error('missing file');
        expect((await readFile(file)).length).toBe(0);
        expect(args.join(' ')).not.toContain('Users');
        if (args.includes('/save')) {
          if (stage === 'save') throw new Error('test-opaque-0000');
          const capture = args[2]; if (!capture) throw new Error('missing capture');
          await writeFile(capture, Buffer.from(`fake\r\nD:PAI(A;;FA;;;${stage === 'verify' ? 'WD' : sid})\r\n`, 'utf16le')); return '';
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
    `D:AI(A;;FA;;;${sid})`, `D:P(A;ID;FA;;;${sid})`, `D:P(A;;FA;;;WD)(A;;FA;;;${sid})`,
    `D:P(D;;FA;;;${sid})(A;;FA;;;${sid})`, `D:P(A;;FR;;;${sid})`, `D:P(A;;FA;;;SY)`,
  ])('rejects insecure or unverifiable ACL %s', acl => expect(() => verifyPrivateDacl(acl, sid)).toThrow());
  it('accepts only protected explicit user control and verifies real OS writes', async () => {
    expect(() => verifyPrivateDacl(`fake\r\nD:PAI(A;;FA;;;${sid})(A;;FA;;;SY)(A;;FA;;;BA)\r\n`, sid)).not.toThrow();
    const directory = await temporaryDirectory('portwise-real-private');
    try {
      const file = path.join(directory.path, 'auth.json'); await atomicWrite(file, 'test-private-0000');
      expect(await readFile(file, 'utf8')).toBe('test-private-0000');
      if (process.platform !== 'win32') expect((await stat(file)).mode & 0o777).toBe(0o600);
    } finally { await directory.dispose(); }
  });
});
