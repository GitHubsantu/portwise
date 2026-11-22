import * as fs from 'node:fs/promises';
import { readFile, writeFile, type FileHandle } from 'node:fs/promises';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { atomicWrite } from '../src/core/atomicWrite';
import { PermissionCommandError } from '../src/core/permissionCommand';
import { PrivatePermissionError } from '../src/core/permissionFailure';
import { temporaryDirectory } from './helpers/temporaryDirectory';
import { FileLock } from '../src/core/fileLock';
import { withConfigOperation } from '../src/sync/configOperation';
import { withAccountOperation } from '../src/accounts/accountOperation';

vi.mock('node:fs/promises', async importOriginal => ({ ...await importOriginal<typeof fs>() }));
afterEach(() => vi.restoreAllMocks());

describe('permission failure survives cleanup failures', () => {
  it.each(['config', 'account'])('retains the original error when the %s transaction lock also fails to release', async kind => {
    const directory = await temporaryDirectory('portwise-acl-lock-cleanup');
    try {
      const realDispose = FileLock.prototype.dispose;
      vi.spyOn(FileLock.prototype, 'dispose').mockImplementationOnce(async function (this: FileLock) {
        await realDispose.call(this); throw new Error('test-private-lock-cleanup-0000');
      });
      const primary = new PrivatePermissionError('backup', { step: 'icacls exit', command: 'icacls', category: 'nonzero exit', exitCode: 5, reason: 'command failed' });
      const operation = async () => { throw primary; };
      const result = kind === 'config' ? withConfigOperation(directory.path, operation) : withAccountOperation(directory.path, {}, operation);
      await expect(result).rejects.toBe(primary);
      expect(primary.message).toContain('step=icacls exit'); expect(primary.message).toContain('exit=5'); expect(primary.message).toContain('cleanup=failed');
      expect(primary.message).not.toContain('test-private-lock-cleanup');
    } finally { await directory.dispose(); }
  });
  it.each(['close', 'remove', 'both'])('preserves the earlier permission failure when %s cleanup fails', async mode => {
    const directory = await temporaryDirectory('portwise-acl-cleanup');
    let handle: FileHandle | undefined;
    try {
      const file = path.join(directory.path, 'config.toml'); await writeFile(file, 'original');
      const realOpen = fs.open; const realRemove = fs.rm;
      vi.spyOn(fs, 'open').mockImplementation(async (...args) => {
        const opened = await realOpen(...args);
        if (String(args[0]).endsWith('.tmp')) {
          handle = opened;
          if (mode !== 'remove') vi.spyOn(opened, 'close').mockRejectedValue(new Error('test-private-close-0000'));
        }
        return opened;
      });
      vi.spyOn(fs, 'rm').mockImplementation(async (...args) => {
        if (String(args[0]).endsWith('.tmp') && mode !== 'close') throw new Error('test-private-remove-0000');
        return realRemove(...args);
      });
      const failure: unknown = await atomicWrite(file, 'test-private-new-0000', { permissions: { platform: 'win32', run: async command => {
        if (command === 'whoami') return '"fake","S-1-5-21-111-222-333-1000"';
        throw new PermissionCommandError('nonzero exit', 5);
      } } }).catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(PrivatePermissionError);
      if (!(failure instanceof PrivatePermissionError)) throw new Error('expected permission failure');
      expect(failure.message).toContain('step=icacls exit'); expect(failure.message).toContain('exit=5'); expect(failure.message).toContain('cleanup=failed');
      expect(failure.message).not.toMatch(/test-private|\.tmp|portwise-acl-cleanup/);
      expect(await readFile(file, 'utf8')).toBe('original');
    } finally { vi.restoreAllMocks(); await handle?.close(); await directory.dispose(); }
  });

  it('reports a cleanup-only failure and does not rename the staged bytes', async () => {
    const directory = await temporaryDirectory('portwise-acl-close'); let handle: FileHandle | undefined;
    try {
      const file = path.join(directory.path, '.env'); await writeFile(file, 'original');
      const realOpen = fs.open;
      vi.spyOn(fs, 'open').mockImplementation(async (...args) => {
        const opened = await realOpen(...args);
        if (String(args[0]).endsWith('.tmp')) { handle = opened; vi.spyOn(opened, 'close').mockRejectedValue(new Error('test-private-close-0000')); }
        return opened;
      });
      await expect(atomicWrite(file, 'test-private-new-0000', { permissions: { platform: 'win32', run: async command => command === 'whoami' ? '"fake","S-1-5-21-111-222-333-1000"' : command === 'icacls' ? '' : JSON.stringify({ protected: true, present: true, aces: [{ sid: 'S-1-5-21-111-222-333-1000', mask: 0x1f01ff, flags: 0, kind: 0 }] }) } })).rejects.toMatchObject({
        detail: expect.objectContaining({ step: 'cleanup', reason: 'cleanup failed' }), message: expect.stringContaining('target=.env staging'),
      });
      expect(await readFile(file, 'utf8')).toBe('original');
    } finally { vi.restoreAllMocks(); await handle?.close(); await directory.dispose(); }
  });
});
