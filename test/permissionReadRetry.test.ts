import { spawn } from 'node:child_process';
import type * as childProcess from 'node:child_process';
import { PassThrough } from 'node:stream';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { atomicWrite } from '../src/core/atomicWrite';
import { restrictPrivateFile, verifyPrivateFile } from '../src/core/privateFile';
import { ACL_INSPECTION_DEADLINE_MS, PERMISSION_CLOSE_WAIT_MS, PERMISSION_COMMAND_DEADLINE_MS, PermissionCommandError, runPermissionCommand, type PermissionRunner } from '../src/core/permissionCommand';
import { PrivatePermissionError } from '../src/core/permissionFailure';
import { temporaryDirectory } from './helpers/temporaryDirectory';

vi.mock('node:child_process', () => ({ spawn: vi.fn() }));
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.resetAllMocks(); });

const sid = 'S-1-5-21-111-222-333-1000';
const valid = JSON.stringify({ protected: true, present: true, aces: [{ sid, kind: 0, flags: 0, mask: 0x1f01ff }] });
const closedTimeout = () => new PermissionCommandError('timeout', undefined, true);

describe('read-only ACL timeout retry', () => {
  it('reuses the SID and successful apply when a slow first inspection succeeds on retry', async () => {
    const directory = await temporaryDirectory('portwise-read-retry');
    try {
      const file = path.join(directory.path, 'config.toml'); await writeFile(file, 'original');
      let identities = 0; let applies = 0; let reads = 0;
      const run: PermissionRunner = async (command, args, input, purpose) => {
        if (command === 'whoami') { identities++; return `"fake","${sid}"`; }
        if (command === 'icacls') { applies++; return ''; }
        reads++; expect(purpose).toBe('acl-read'); expect(args).toContain('-NoProfile'); expect(args).toContain('-NonInteractive');
        const request = JSON.parse(input ?? '{}') as { file: string }; expect(await readFile(request.file, 'utf8')).toBe('');
        if (reads === 1) throw closedTimeout(); return valid;
      };
      await atomicWrite(file, 'test-private-new-0000', { permissions: { platform: 'win32', run } });
      expect([identities, applies, reads]).toEqual([1, 1, 2]); expect(await readFile(file, 'utf8')).toBe('test-private-new-0000');
    } finally { await directory.dispose(); }
  });

  it('fails closed after two timeouts, keeps the original and reports verify/retry used', async () => {
    const directory = await temporaryDirectory('portwise-read-exhausted');
    try {
      const file = path.join(directory.path, 'auth.json'); await writeFile(file, 'original'); let reads = 0; let applies = 0;
      const error: unknown = await atomicWrite(file, 'test-private-new-0000', { permissions: { platform: 'win32', run: async command => {
        if (command === 'whoami') return `"fake","${sid}"`;
        if (command === 'icacls') { applies++; return ''; }
        reads++; throw closedTimeout();
      } } }).catch((error: unknown) => error);
      expect(error).toBeInstanceOf(PrivatePermissionError); if (!(error instanceof PrivatePermissionError)) throw new Error('missing failure');
      expect(error.message).toContain('step=ACL read; phase=verify'); expect(error.message).toContain('retry=used');
      expect(error.detail).toMatchObject({ category: 'timeout', retry: 'used' }); expect([applies, reads]).toEqual([1, 2]);
      expect(await readFile(file, 'utf8')).toBe('original'); expect(await readdir(directory.path)).toEqual(['auth.json']);
      expect(JSON.stringify(error)).not.toMatch(/test-private-new|S-1-5-21/); expect(error.message).not.toContain(directory.path);
    } finally { await directory.dispose(); }
  });

  it.each(['whoami', 'icacls'] as const)('never retries %s even after a confirmed timeout/close', async failed => {
    const directory = await temporaryDirectory('portwise-no-write-retry');
    try {
      const file = path.join(directory.path, 'empty'); await writeFile(file, ''); const calls: string[] = [];
      await expect(restrictPrivateFile(file, { platform: 'win32', run: async command => {
        calls.push(command); if (command === failed) throw closedTimeout(); return `"fake","${sid}"`;
      } })).rejects.toMatchObject({ message: expect.stringContaining('retry=none') });
      expect(calls.filter(command => command === failed)).toHaveLength(1); expect(calls).not.toContain('powershell.exe');
      expect(await readFile(file, 'utf8')).toBe('');
    } finally { await directory.dispose(); }
  });

  it.each(['spawn failure', 'nonzero exit', 'output failure', 'output limit'] as const)('does not retry ACL read %s', async category => {
    const directory = await temporaryDirectory('portwise-no-read-retry');
    try {
      const file = path.join(directory.path, 'empty'); await writeFile(file, ''); let reads = 0;
      await expect(restrictPrivateFile(file, { platform: 'win32', run: async command => {
        if (command === 'whoami') return `"fake","${sid}"`;
        if (command === 'icacls') return '';
        reads++; throw new PermissionCommandError(category, category === 'nonzero exit' ? 5 : undefined, true);
      } })).rejects.toMatchObject({ detail: expect.objectContaining({ category }), message: expect.stringContaining('retry=none') });
      expect(reads).toBe(1);
    } finally { await directory.dispose(); }
  });

  it.each(['not-json', valid.replace('"flags":0', '"flags":16')])('does not retry malformed or unsafe ACLs', async response => {
    const directory = await temporaryDirectory('portwise-invalid-read');
    try {
      const file = path.join(directory.path, 'empty'); await writeFile(file, ''); let reads = 0;
      await expect(restrictPrivateFile(file, { platform: 'win32', run: async command => {
        if (command === 'whoami') return `"fake","${sid}"`; if (command === 'icacls') return ''; reads++; return response;
      } })).rejects.toMatchObject({ message: expect.stringContaining('retry=none') });
      expect(reads).toBe(1); expect(await readFile(file, 'utf8')).toBe('');
    } finally { await directory.dispose(); }
  });

  it('retries diagnostics inspection without applying ACLs or changing bytes/timestamps', async () => {
    const directory = await temporaryDirectory('portwise-readonly-retry');
    try {
      const file = path.join(directory.path, '.env'); await writeFile(file, 'test-private-current-0000'); const before = await stat(file); let reads = 0;
      await verifyPrivateFile(file, { platform: 'win32', run: async command => {
        if (command === 'whoami') return `"fake","${sid}"`;
        expect(command).toBe('powershell.exe'); if (++reads === 1) throw closedTimeout(); return valid;
      } });
      expect(reads).toBe(2); expect((await stat(file)).mtimeMs).toBe(before.mtimeMs); expect(await readFile(file, 'utf8')).toBe('test-private-current-0000');
    } finally { await directory.dispose(); }
  });

  it.each(['not-json', valid.replace('"flags":0', '"flags":16')])('validates the fresh retry result and preserves originals if it is unsafe', async response => {
    const directory = await temporaryDirectory('portwise-retry-unsafe');
    try {
      const file = path.join(directory.path, 'auth.json'); await writeFile(file, 'original'); let reads = 0;
      await expect(atomicWrite(file, 'test-private-new-0000', { permissions: { platform: 'win32', run: async command => {
        if (command === 'whoami') return `"fake","${sid}"`; if (command === 'icacls') return '';
        if (++reads === 1) throw closedTimeout(); return response;
      } } })).rejects.toMatchObject({ message: expect.stringContaining('retry=used') });
      expect(reads).toBe(2); expect(await readFile(file, 'utf8')).toBe('original'); expect(await readdir(directory.path)).toEqual(['auth.json']);
    } finally { await directory.dispose(); }
  });

  it('refuses to retry inspection when the file changed during the first attempt', async () => {
    const directory = await temporaryDirectory('portwise-retry-identity');
    try {
      const file = path.join(directory.path, 'empty'); await writeFile(file, ''); let reads = 0;
      await expect(restrictPrivateFile(file, { platform: 'win32', run: async command => {
        if (command === 'whoami') return `"fake","${sid}"`; if (command === 'icacls') return '';
        reads++; await writeFile(file, 'external'); throw closedTimeout();
      } })).rejects.toMatchObject({ detail: expect.objectContaining({ reason: 'file unavailable' }), message: expect.stringContaining('retry=none') });
      expect(reads).toBe(1); expect(await readFile(file, 'utf8')).toBe('external');
    } finally { await directory.dispose(); }
  });
});

async function controlledChild() {
  const original = await vi.importActual<typeof childProcess>('node:child_process');
  const child = new original.ChildProcess(); const stdout = new PassThrough(); const stdin = new PassThrough();
  Object.defineProperties(child, { stdout: { value: stdout }, stdin: { value: stdin } });
  const kill = vi.spyOn(child, 'kill').mockReturnValue(true);
  return { child, stdout, stdin, kill };
}

describe('inspection deadline and closed-process barrier', () => {
  it('allows 20 seconds and starts the retry only after the first child closes', async () => {
    const directory = await temporaryDirectory('portwise-close-barrier');
    const first = await controlledChild(); const second = await controlledChild();
    try {
      const file = path.join(directory.path, 'empty'); await writeFile(file, '');
      vi.mocked(spawn).mockReturnValueOnce(first.child).mockReturnValueOnce(second.child);
      vi.useFakeTimers();
      const result = restrictPrivateFile(file, { platform: 'win32', run: async (command, args, input, purpose) => {
        if (command === 'whoami') return `"fake","${sid}"`; if (command === 'icacls') return ''; return runPermissionCommand(command, args, input, purpose);
      } });
      await vi.waitFor(() => expect(spawn).toHaveBeenCalledTimes(1));
      await vi.advanceTimersByTimeAsync(PERMISSION_COMMAND_DEADLINE_MS); expect(first.kill).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(ACL_INSPECTION_DEADLINE_MS - PERMISSION_COMMAND_DEADLINE_MS);
      expect(first.kill).toHaveBeenCalledOnce(); expect(spawn).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(500); expect(spawn).toHaveBeenCalledTimes(1);
      first.child.emit('close', null);
      await vi.waitFor(() => expect(spawn).toHaveBeenCalledTimes(2));
      second.stdout.emit('data', Buffer.from(valid)); second.child.emit('close', 0); await result;
      expect(second.kill).not.toHaveBeenCalled(); expect(await readFile(file, 'utf8')).toBe('');
    } finally { vi.useRealTimers(); first.stdout.destroy(); first.stdin.destroy(); second.stdout.destroy(); second.stdin.destroy(); await directory.dispose(); }
  });

  it('fails closed without retry when the timed-out child never confirms close', async () => {
    const directory = await temporaryDirectory('portwise-unclosed-read'); const process = await controlledChild();
    try {
      const file = path.join(directory.path, 'empty'); await writeFile(file, ''); vi.mocked(spawn).mockReturnValue(process.child); vi.useFakeTimers();
      const result = expect(restrictPrivateFile(file, { platform: 'win32', run: async (command, args, input, purpose) => {
        if (command === 'whoami') return `"fake","${sid}"`; if (command === 'icacls') return ''; return runPermissionCommand(command, args, input, purpose);
      } })).rejects.toMatchObject({ detail: expect.objectContaining({ category: 'timeout', reason: 'command did not close' }), message: expect.stringContaining('retry=none') });
      await vi.waitFor(() => expect(spawn).toHaveBeenCalledOnce());
      await vi.advanceTimersByTimeAsync(ACL_INSPECTION_DEADLINE_MS + PERMISSION_CLOSE_WAIT_MS); await result;
      expect(process.kill).toHaveBeenCalledOnce(); expect(spawn).toHaveBeenCalledOnce(); expect(await readFile(file, 'utf8')).toBe('');
      process.child.emit('close', null);
    } finally { vi.useRealTimers(); process.stdout.destroy(); process.stdin.destroy(); await directory.dispose(); }
  });

  it.each(['whoami', 'icacls', 'powershell.exe'] as const)('keeps the existing default deadline for %s', async command => {
    const process = await controlledChild(); vi.mocked(spawn).mockReturnValue(process.child); vi.useFakeTimers();
    const result = expect(runPermissionCommand(command, [], '', command === 'icacls' ? 'acl-read' : undefined)).rejects.toMatchObject({ category: 'timeout', processClosed: true });
    await vi.advanceTimersByTimeAsync(PERMISSION_COMMAND_DEADLINE_MS - 1); expect(process.kill).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); expect(process.kill).toHaveBeenCalledOnce(); process.child.emit('close', null); await result;
    process.stdout.destroy(); process.stdin.destroy();
  });
});
