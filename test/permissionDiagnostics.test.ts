import { readFile, readdir, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { atomicWrite } from '../src/core/atomicWrite';
import { restrictPrivateFile, verifyPrivateFile, type PermissionOptions } from '../src/core/privateFile';
import { PermissionCommandError, runPermissionCommand } from '../src/core/permissionCommand';
import { PrivatePermissionError } from '../src/core/permissionFailure';
import { readWindowsAcl, verifyWindowsAcl } from '../src/core/windowsAcl';
import { createBackup } from '../src/sync/backups';
import { temporaryDirectory } from './helpers/temporaryDirectory';
import { PERMISSION_IO_TEST_MS } from './helpers/permissionBudget';

const sid = 'S-1-5-21-111-222-333-1000';
const entry = (principal = sid, flags = 0, kind = 0, mask = 0x1f01ff) => ({ sid: principal, flags, kind, mask });
const acl = (aces = [entry()]) => JSON.stringify({ protected: true, present: true, aces });
const opaque = 'test-private-credential-0000';

describe('bounded permission diagnostics and SID handling', () => {
  it('secures a real child despite inherited current-user/System/Administrators parent rules', async () => {
    const directory = await temporaryDirectory('portwise-parent-acl');
    try {
      if (process.platform === 'win32') {
        const identity = await runPermissionCommand('whoami', ['/user', '/fo', 'csv', '/nh']);
        const current = identity.match(/\bS-1-\d+(?:-\d+)+\b/)?.[0]; if (!current) throw new Error('test identity unavailable');
        await runPermissionCommand('icacls', [directory.path, '/inheritance:r', '/grant:r', `*${current}:(OI)(CI)F`, '*S-1-5-18:(OI)(CI)F', '*S-1-5-32-544:(OI)(CI)F']);
        const before = path.join(directory.path, 'inherited'); await writeFile(before, '');
        expect(() => verifyWindowsAcl('', current)).toThrow();
        const inherited = await readWindowsAcl(before, runPermissionCommand);
        expect(() => verifyWindowsAcl(inherited, current)).toThrow('unprotected DACL');
        const target = path.join(directory.path, 'name [literal] with spaces.env');
        await atomicWrite(target, opaque);
        const secured = await readWindowsAcl(target, runPermissionCommand);
        expect(() => verifyWindowsAcl(secured, current)).not.toThrow(); expect(await readFile(target, 'utf8')).toBe(opaque);
      } else {
        const target = path.join(directory.path, 'private'); await atomicWrite(target, opaque); await verifyPrivateFile(target); expect(await readFile(target, 'utf8')).toBe(opaque);
      }
    } finally { await directory.dispose(); }
  }, PERMISSION_IO_TEST_MS);
  it.each(['desktop-fake\\admin', 'DESKTOP-FAKE\\Admin', 'EXAMPLE\\Domain Admin', 'desktop-fake\\First Last'])('ignores display-name spelling and grants only the numeric SID for %s', async name => {
    const directory = await temporaryDirectory('portwise-name-acl');
    try {
      const file = path.join(directory.path, 'empty file [literal].tmp'); await writeFile(file, '');
      const commands: string[] = [];
      await restrictPrivateFile(file, { platform: 'win32', run: async (command, args, input) => {
        commands.push(command);
        if (command === 'whoami') return `"${name}","${sid}"`;
        expect(args.join(' ')).not.toContain(name);
        if (command === 'icacls') { expect(args).toEqual([file, '/inheritance:r', '/grant:r', `*${sid}:F`]); return ''; }
        expect(JSON.parse(input ?? '{}')).toEqual({ file });
        expect(Buffer.from(args[3] ?? '', 'base64').toString('utf16le')).not.toContain(file);
        return acl();
      } });
      expect(commands).toEqual(['whoami', 'icacls', 'powershell.exe']);
      expect(await readFile(file, 'utf8')).toBe('');
      expect(() => verifyWindowsAcl(acl(), 'S-1-5-21-111-222-333-1001')).toThrow('principal not allowed');
    } finally { await directory.dispose(); }
  });

  it('awaits inheritance removal/grant and verification before writing or replacing a target', async () => {
    const directory = await temporaryDirectory('portwise-delayed-acl');
    try {
      const file = path.join(directory.path, 'config.toml'); await writeFile(file, 'original');
      let release: (() => void) | undefined; let entered: (() => void) | undefined; let verified = false; let staging = '';
      const gate = new Promise<void>(resolve => { release = resolve; }); const ready = new Promise<void>(resolve => { entered = resolve; });
      const write = atomicWrite(file, opaque, { permissions: { platform: 'win32', run: async (command, args, input) => {
        if (command === 'whoami') return `"fake-admin","${sid}"`;
        if (command === 'icacls') { staging = args[0] ?? ''; entered?.(); await gate; return ''; }
        expect(JSON.parse(input ?? '{}')).toEqual({ file: staging });
        expect(await readFile(staging, 'utf8')).toBe(''); verified = true;
        // Parent inheritance is irrelevant after the protected child DACL is applied.
        return acl([entry(), entry('S-1-5-18'), entry('S-1-5-32-544')]);
      } } });
      await ready;
      try { expect(verified).toBe(false); expect(await readFile(staging, 'utf8')).toBe(''); expect(await readFile(file, 'utf8')).toBe('original'); }
      finally { release?.(); }
      await write; expect(verified).toBe(true); expect(await readFile(file, 'utf8')).toBe(opaque);
    } finally { await directory.dispose(); }
  });

  it.each([
    ['whoami', 'spawn failure', 'verify'], ['whoami', 'timeout', 'verify'],
    ['icacls', 'spawn failure', 'icacls start'], ['icacls', 'nonzero exit', 'icacls exit'], ['icacls', 'timeout', 'icacls exit'],
    ['powershell.exe', 'spawn failure', 'ACL read'], ['powershell.exe', 'timeout', 'ACL read'], ['powershell.exe', 'nonzero exit', 'ACL read'],
  ] as const)('reports %s %s safely at %s without a write retry', async (failedCommand, category, step) => {
    const directory = await temporaryDirectory('portwise-command-acl');
    try {
      const target = path.join(directory.path, '.env'); await writeFile(target, 'original');
      let writes = 0;
      const permissions: PermissionOptions = { platform: 'win32', run: async command => {
        if (command === 'icacls') writes++;
        if (command === failedCommand) throw new PermissionCommandError(category, category === 'nonzero exit' ? 5 : undefined);
        return command === 'whoami' ? `"${opaque}","${sid}"` : acl();
      } };
      const error: unknown = await atomicWrite(target, opaque, { permissions }).catch((error: unknown) => error);
      expect(error).toBeInstanceOf(PrivatePermissionError);
      if (!(error instanceof PrivatePermissionError)) throw new Error('expected permission failure');
      expect(error.detail).toMatchObject({ command: failedCommand, category, step });
      expect(error.message).toContain('target=.env staging'); expect(error.message).toContain(category === 'nonzero exit' ? 'exit=5' : 'exit=none');
      expect(JSON.stringify(error)).not.toContain(opaque); expect(error.message).not.toContain(directory.path); expect(error.message).not.toContain(sid);
      expect(writes).toBe(failedCommand === 'whoami' ? 0 : 1);
      expect(await readFile(target, 'utf8')).toBe('original'); expect(await readdir(directory.path)).toEqual(['.env']);
      await expect(createBackup(target, path.join(directory.path, 'backups'), permissions)).rejects.toMatchObject({ target: 'backup' });
    } finally { await directory.dispose(); }
  });

  it.each([
    [acl([entry('S-1-1-0'), entry()]), 'principal not allowed', 'other'],
    [acl([entry('S-1-5-32-545'), entry()]), 'principal not allowed', 'other'],
    [acl([entry('LA')]), 'unresolved principal', 'unresolved'],
    [acl([entry(sid, 16)]), 'inherited ACE', 'current-user'],
    [acl([entry('S-1-5-18', 16), entry()]), 'inherited ACE', 'system'],
    [acl([entry('S-1-5-32-544', 16), entry()]), 'inherited ACE', 'administrators'],
    [acl([entry(sid, 0, 1), entry()]), 'unsupported ACE', 'current-user'],
    [acl([entry(sid, 0, 9)]), 'unsupported ACE', 'current-user'],
    [acl([entry(sid, 0, 0, 0x120089)]), 'missing user FullControl', 'current-user'],
    [acl([entry(sid, 0, 0, 0x1001f01ff)]), 'unsupported ACE', 'current-user'],
    [JSON.stringify({ protected: true, present: false, aces: [] }), 'missing DACL', 'unresolved'],
  ])('rejects unsafe ACL with bounded reason %s', (response, reason, principal) => {
    expect(() => verifyWindowsAcl(response ?? '', sid)).toThrow(expect.objectContaining({ detail: expect.objectContaining({ step: 'verify', reason, principal }) }));
  });

  it.each(['not-json-test-private-credential-0000', '{"error":"ACL parse"}', '{"extra":"test-private-credential-0000"}', acl(Array.from({ length: 65 }, () => entry()))])('rejects malformed or oversized normalized data without echoing it', async response => {
    const directory = await temporaryDirectory('portwise-invalid-acl');
    try {
      const file = path.join(directory.path, 'empty'); await writeFile(file, '');
      await expect(restrictPrivateFile(file, { platform: 'win32', run: async command => command === 'whoami' ? `"fake","${sid}"` : command === 'icacls' ? '' : response })).rejects.toMatchObject({
        detail: expect.objectContaining({ step: 'ACL parse', reason: 'invalid ACL response' }), message: expect.not.stringContaining(opaque),
      });
      expect(await readFile(file, 'utf8')).toBe('');
    } finally { await directory.dispose(); }
  });

  it('reports ACL read failure separately and diagnoses without applying a grant', async () => {
    const directory = await temporaryDirectory('portwise-read-failure');
    try {
      const file = path.join(directory.path, 'empty'); await writeFile(file, '');
      await expect(verifyPrivateFile(file, { platform: 'win32', run: async command => {
        if (command === 'whoami') return `"fake","${sid}"`;
        expect(command).toBe('powershell.exe'); return '{"error":"ACL read"}';
      } })).rejects.toMatchObject({ code: 'private_permissions_unverified', detail: expect.objectContaining({ step: 'ACL read' }) });
    } finally { await directory.dispose(); }
  });
});
