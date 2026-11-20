import { access, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FileLock } from '../src/core/fileLock';
import { PortwiseError } from '../src/core/errors';
import { temporaryDirectory } from './helpers/temporaryDirectory';

describe('FileLock', () => {
  it('rejects a concurrent lock and removes the lock on dispose', async () => {
    const directory = await temporaryDirectory('portwise-lock');
    const lockPath = path.join(directory.path, 'switch.lock');
    try {
      const lock = await FileLock.acquire(lockPath);
      await expect(FileLock.acquire(lockPath)).rejects.toBeInstanceOf(PortwiseError);
      await lock.dispose();
      await expect(access(lockPath)).rejects.toThrow();
    } finally {
      await directory.dispose();
    }
  });

  it('requires explicit approval for legacy locks and rechecks identity after the dialog', async () => {
    const directory = await temporaryDirectory('portwise-legacy-lock'); const file = path.join(directory.path, '.portwise-auth.lock');
    try {
      await writeFile(file, '');
      await expect(FileLock.acquire(file, { confirmLegacyRecovery: async (target) => { expect(target).toBe(file); return false; } })).rejects.toMatchObject({ code: 'lock_unavailable' });
      expect(await readFile(file, 'utf8')).toBe('');
      await expect(FileLock.acquire(file, { confirmLegacyRecovery: async () => { await writeFile(file, 'unknown owner'); return true; } })).rejects.toMatchObject({ code: 'lock_unavailable' });
      expect(await readFile(file, 'utf8')).toBe('unknown owner');
      await writeFile(file, '');
      const recovered = await FileLock.acquire(file, { confirmLegacyRecovery: async () => true });
      const owner = JSON.parse(await readFile(file, 'utf8')) as { pid: number; id: string; createdAt: string };
      expect(owner.pid).toBe(process.pid); expect(owner.id).toMatch(/^[a-f0-9-]{36}$/); expect(owner.createdAt).toBeTruthy();
      await recovered.dispose();
    } finally { await directory.dispose(); }
  });

  it('recovers an exited process lock, but refuses a live or reused PID regardless of age', async () => {
    const directory = await temporaryDirectory('portwise-dead-lock'); const file = path.join(directory.path, 'auth.lock');
    try {
      const child = spawn(process.execPath, ['-e', "require('node:fs').writeFileSync(process.argv[1], JSON.stringify({version:1,pid:process.pid,id:'11111111-1111-4111-8111-111111111111',createdAt:'2000-01-01T00:00:00Z'}))", file], { windowsHide: true, stdio: 'ignore' });
      await once(child, 'exit');
      const recovered = await FileLock.acquire(file); await recovered.dispose();
      const lock = await FileLock.acquire(file);
      const bytes = await readFile(file, 'utf8');
      await expect(FileLock.acquire(file, { confirmLegacyRecovery: async () => true })).rejects.toMatchObject({ code: 'lock_unavailable' });
      expect(await readFile(file, 'utf8')).toBe(bytes);
      await lock.dispose();
    } finally { await directory.dispose(); }
  });

  it('serializes competing recoveries so only one caller acquires an abandoned lock', async () => {
    const directory = await temporaryDirectory('portwise-racing-lock'); const file = path.join(directory.path, 'auth.lock');
    try {
      await writeFile(file, '');
      const results = await Promise.allSettled([FileLock.acquire(file, { confirmLegacyRecovery: async () => true }), FileLock.acquire(file, { confirmLegacyRecovery: async () => true })]);
      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      for (const result of results) if (result.status === 'fulfilled') await result.value.dispose();
    } finally { await directory.dispose(); }
  });

  it('attempts removal after close failure, permits cleanup retries and never deletes a new owner', async () => {
    const directory = await temporaryDirectory('portwise-release-lock'); const file = path.join(directory.path, 'auth.lock');
    try {
      let failClose = true; let failRemove = true; let removals = 0;
      const lock = await FileLock.acquire(file, {
        close: async (handle) => { if (failClose) { failClose = false; throw new Error('injected close'); } await handle.close(); },
        remove: async (target) => { removals++; if (failRemove) { failRemove = false; throw new Error('injected removal'); } await rm(target); },
      });
      await expect(lock.dispose()).rejects.toMatchObject({ code: 'lock_cleanup_failed' }); expect(removals).toBe(1);
      await lock.dispose(); await expect(access(file)).rejects.toThrow();
      const old = await FileLock.acquire(file); await rm(file); await writeFile(file, 'replacement');
      await expect(old.dispose()).rejects.toMatchObject({ code: 'lock_cleanup_failed' });
      expect(await readFile(file, 'utf8')).toBe('replacement');
    } finally { await directory.dispose(); }
  });
});
