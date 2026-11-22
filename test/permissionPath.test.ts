import * as fs from 'node:fs/promises';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { atomicWrite, writePrivateExclusive } from '../src/core/atomicWrite';
import { checkPrivatePath, observePermissionPath } from '../src/core/permissionPath';
import { restrictPrivateFile } from '../src/core/privateFile';
import { PermissionCommandError } from '../src/core/permissionCommand';
import { PrivatePermissionError } from '../src/core/permissionFailure';
import { temporaryDirectory } from './helpers/temporaryDirectory';

vi.mock('node:fs/promises', async importOriginal => ({ ...await importOriginal<typeof fs>() }));
afterEach(() => vi.restoreAllMocks());

describe('private-file path preflight and bounded observations', () => {
  it('reports existence and exit-code mapping without leaking the path or identity when icacls returns 3', async () => {
    const directory = await temporaryDirectory('portwise-safe-path-details');
    try {
      const target = path.join(directory.path, 'config.toml'); await writeFile(target, 'original');
      const error: unknown = await atomicWrite(target, 'test-private-new-0000', { permissions: { platform: 'win32', run: async command => {
        if (command === 'whoami') return '"test-private-name-0000","S-1-5-21-111-222-333-1000"';
        expect(command).toBe('icacls'); throw new PermissionCommandError('nonzero exit', 3);
      } } }).catch((error: unknown) => error);
      expect(error).toBeInstanceOf(PrivatePermissionError); if (!(error instanceof PrivatePermissionError)) throw new Error('missing fixture error');
      expect(error.message).toContain('principal=not-reached'); expect(error.message).toContain('windowsError=ERROR_PATH_NOT_FOUND');
      expect(error.message).toContain('directoryExists=true; fileExists=true; pathLengthBucket=0-259');
      expect(error.message).not.toContain(directory.path); expect(JSON.stringify(error)).not.toMatch(/test-private|S-1-5-21/);
      expect(await readFile(target, 'utf8')).toBe('original'); expect(await readdir(directory.path)).toEqual(['config.toml']);
    } finally { await directory.dispose(); }
  });

  it('fails before creating an overlong backup or invoking any permission command', async () => {
    const directory = await temporaryDirectory('portwise-long-file');
    try {
      const deep = path.join(directory.path, 'a'.repeat(80), 'b'.repeat(80), 'c'.repeat(60)); await mkdir(deep, { recursive: true });
      const file = path.join(deep, 'config.toml.2026-11-22T00-00-00.000Z.0000.backup'); const run = vi.fn();
      expect(file.length).toBeGreaterThan(260);
      await expect(writePrivateExclusive(file, 'test-private-not-written-0000', { platform: 'win32', target: 'backup', run })).rejects.toMatchObject({
        detail: expect.objectContaining({ step: 'path length', path: expect.objectContaining({ directoryExists: true, fileExists: false, pathLengthBucket: '260-511' }) }),
        message: expect.stringContaining('Shorten the isolated VS Code user-data or Codex-home location'),
      });
      expect(run).not.toHaveBeenCalled(); expect(await readdir(deep)).toEqual([]);
    } finally { await directory.dispose(); }
  });

  it('checks staging length before writing a requested backup and preserves the original', async () => {
    const directory = await temporaryDirectory('portwise-long-staging');
    try {
      let deep = directory.path;
      while (deep.length < 220) deep = path.join(deep, 'd'.repeat(Math.min(80, 220 - deep.length - 1)));
      await mkdir(deep, { recursive: true });
      const target = path.join(deep, 'config.toml'); await writeFile(target, 'original'); const backup = path.join(directory.path, 'must-not-exist.backup'); const run = vi.fn();
      await expect(atomicWrite(target, 'test-private-new-0000', { backupPath: backup, permissions: { platform: 'win32', run } })).rejects.toMatchObject({ detail: expect.objectContaining({ step: 'path length' }) });
      expect(run).not.toHaveBeenCalled(); expect(await readFile(target, 'utf8')).toBe('original');
      await expect(readFile(backup)).rejects.toMatchObject({ code: 'ENOENT' }); expect(await readdir(deep)).toEqual(['config.toml']);
    } finally { await directory.dispose(); }
  });

  it.each([[259, '0-259'], [260, '260-511'], [511, '260-511'], [512, '512-1023'], [1024, '1024+']] as const)('uses the bounded path bucket for %s characters', async (length, bucket) => {
    const candidate = path.join(path.parse(process.cwd()).root, 'p'.repeat(length - path.parse(process.cwd()).root.length));
    expect(candidate.length).toBe(length); expect((await observePermissionPath(candidate)).pathLengthBucket).toBe(bucket);
    if (length < 260) await expect(checkPrivatePath(candidate, 'win32', 'backup')).resolves.toBeUndefined();
    else await expect(checkPrivatePath(candidate, 'win32', 'backup')).rejects.toMatchObject({ detail: expect.objectContaining({ step: 'path length' }) });
    await expect(checkPrivatePath(candidate, 'linux', 'backup')).resolves.toBeUndefined();
  });

  it('distinguishes missing observations from inaccessible observations', async () => {
    const directory = await temporaryDirectory('portwise-unavailable-path');
    try {
      const file = path.join(directory.path, 'missing'); expect(await observePermissionPath(file)).toMatchObject({ directoryExists: true, fileExists: false });
      vi.spyOn(fs, 'lstat').mockRejectedValue(Object.assign(new Error('test-private-detail-0000'), { code: 'EACCES' }));
      expect(await observePermissionPath(file)).toMatchObject({ directoryExists: 'unavailable', fileExists: 'unavailable' });
    } finally { vi.restoreAllMocks(); await directory.dispose(); }
  });

  it('reserves unresolved for a real SID normalization failure after the ACL reader runs', async () => {
    const directory = await temporaryDirectory('portwise-unresolved-path');
    try {
      const file = path.join(directory.path, 'empty'); await writeFile(file, '');
      await expect(restrictPrivateFile(file, { platform: 'win32', run: async command => command === 'whoami' ? '"fake","S-1-5-21-111-222-333-1000"' : command === 'icacls' ? '' : JSON.stringify({ protected: true, present: true, aces: [{ sid: 'LA', mask: 0x1f01ff, kind: 0, flags: 0 }] }) })).rejects.toMatchObject({ message: expect.stringContaining('principal=unresolved') });
      expect(await readFile(file, 'utf8')).toBe('');
    } finally { await directory.dispose(); }
  });
});
