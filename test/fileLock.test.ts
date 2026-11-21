import { access, readFile, rm, writeFile } from 'node:fs/promises';
import * as fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import * as path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { FileLock } from '../src/core/fileLock';
import { PortwiseError } from '../src/core/errors';
import { temporaryDirectory } from './helpers/temporaryDirectory';

// Keep real filesystem calls, with configurable exports to observe close/unlink ordering.
vi.mock('node:fs/promises', async importOriginal => ({ ...await importOriginal<typeof fs>() }));

describe('FileLock', () => {
  it.each([false, true])('bounds delete-pending guard retries without unlinking on EPERM (permanent=%s)', async permanent => {
    const directory = await temporaryDirectory('portwise-guard-delete-pending'); const file = path.join(directory.path, 'auth.lock');
    const realOpen = fs.open; const realRemove = fs.rm; let attempts = 0; let removals = 0;
    const openSpy = vi.spyOn(fs, 'open').mockImplementation(async (...args) => {
      if (String(args[0]) === `${file}.guard` && (permanent || attempts++ === 0)) throw Object.assign(new Error('injected delete-pending'), { code: 'EPERM' });
      return realOpen(...args);
    });
    const removeSpy = vi.spyOn(fs, 'rm').mockImplementation(async (...args) => { removals++; return realRemove(...args); });
    try {
      if (permanent) { await expect(FileLock.acquire(file)).rejects.toMatchObject({ code: 'lock_guard_unavailable' }); expect(removals).toBe(0); }
      else { const lock = await FileLock.acquire(file); expect(attempts).toBe(2); await lock.dispose(); }
    } finally { openSpy.mockRestore(); removeSpy.mockRestore(); await directory.dispose(); }
  });
  it('closes each guard handle before unlinking it so Windows readers never encounter delete-pending guards', async () => {
    const directory = await temporaryDirectory('portwise-guard-close-order'); const file = path.join(directory.path, 'auth.lock');
    const realOpen = fs.open; const realRemove = fs.rm; const closed = new Map<string, boolean>();
    const openSpy = vi.spyOn(fs, 'open').mockImplementation(async (...args) => {
      const handle = await realOpen(...args); const target = String(args[0]);
      if (target.endsWith('.guard')) {
        closed.set(target, false); const realClose = handle.close.bind(handle);
        vi.spyOn(handle, 'close').mockImplementation(async () => { await realClose(); closed.set(target, true); });
      }
      return handle;
    });
    const removeSpy = vi.spyOn(fs, 'rm').mockImplementation(async (...args) => {
      const target = String(args[0]); if (target.endsWith('.guard')) expect(closed.get(target)).toBe(true);
      return realRemove(...args);
    });
    try {
      const lock = await FileLock.acquire(file); await lock.dispose();
      expect(closed.get(`${file}.guard`)).toBe(true); await expect(access(`${file}.guard`)).rejects.toThrow();
    } finally { openSpy.mockRestore(); removeSpy.mockRestore(); await directory.dispose(); }
  });
  it('recovers an interrupted recovery claim, rejects a live claim, and serializes competing guard recoveries', async () => {
    const directory = await temporaryDirectory('portwise-guard-race'); const file = path.join(directory.path, 'auth.lock');
    const dead = JSON.stringify({ version: 1, pid: 2147483647, id: '11111111-1111-4111-8111-111111111111', createdAt: '2000-01-01T00:00:00Z' });
    try {
      await writeFile(`${file}.guard`, dead); await writeFile(`${file}.guard.recovery`, dead);
      const lock = await FileLock.acquire(file, { ownerAlive: pid => pid === process.pid }); await lock.dispose();
      await writeFile(`${file}.guard`, dead);
      const live = JSON.stringify({ version: 1, pid: process.pid, id: '22222222-2222-4222-8222-222222222222', createdAt: '2000-01-01T00:00:00Z' });
      await writeFile(`${file}.guard.recovery`, live);
      await expect(FileLock.acquire(file, { ownerAlive: pid => pid === process.pid })).rejects.toMatchObject({ code: 'lock_unavailable' });
      expect(await readFile(`${file}.guard.recovery`, 'utf8')).toBe(live);
      await rm(`${file}.guard.recovery`);
      const results = await Promise.allSettled([FileLock.acquire(file, { ownerAlive: pid => pid === process.pid }), FileLock.acquire(file, { ownerAlive: pid => pid === process.pid })]);
      expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
      for (const result of results) if (result.status === 'fulfilled') await result.value.dispose();
    } finally { await directory.dispose(); }
  });
  it('recovers a demonstrably abandoned guard but refuses a live guard', async () => {
    const directory = await temporaryDirectory('portwise-guard-owner'); const file = path.join(directory.path, 'auth.lock');
    try {
      const child = spawn(process.execPath, ['-e', "require('node:fs').writeFileSync(process.argv[1], JSON.stringify({version:1,pid:process.pid,id:'11111111-1111-4111-8111-111111111111',createdAt:'2000-01-01T00:00:00Z'}))", `${file}.guard`], { windowsHide: true, stdio: 'ignore' });
      await once(child, 'exit');
      const lock = await FileLock.acquire(file); await lock.dispose();
      await writeFile(`${file}.guard`, JSON.stringify({ version: 1, pid: process.pid, id: '11111111-1111-4111-8111-111111111111', createdAt: '2000-01-01T00:00:00Z' }));
      await expect(FileLock.acquire(file, { confirmLegacyRecovery: async () => { throw new Error('must not prompt for live owner'); } })).rejects.toMatchObject({ code: 'lock_guard_unavailable' });
    } finally { await directory.dispose(); }
  });

  it('requires exact guard confirmation, preserves cancellation and rejects an identity change during the dialog', async () => {
    const directory = await temporaryDirectory('portwise-guard-confirm'); const file = path.join(directory.path, 'auth.lock'); const guard = `${file}.guard`;
    try {
      await writeFile(guard, '');
      await expect(FileLock.acquire(file, { confirmLegacyRecovery: async target => { expect(target).toBe(guard); return false; } })).rejects.toMatchObject({ code: 'lock_recovery_cancelled' });
      expect(await readFile(guard, 'utf8')).toBe('');
      await expect(FileLock.acquire(file, { confirmLegacyRecovery: async () => { await writeFile(guard, 'changed'); return true; } })).rejects.toMatchObject({ code: 'lock_unavailable' });
      expect(await readFile(guard, 'utf8')).toBe('changed');
      const lock = await FileLock.acquire(file, { confirmLegacyRecovery: async target => { expect(target).toBe(guard); return true; } });
      await lock.dispose();
    } finally { await directory.dispose(); }
  });
  it.each(['\r\n', '\ufeff\r\n'])('recognizes a hand-created blank legacy file containing %j', async (blank) => {
    const directory = await temporaryDirectory('portwise-blank-lock'); const file = path.join(directory.path, '.portwise-auth.lock');
    try {
      await writeFile(file, blank); let prompts = 0;
      const lock = await FileLock.acquire(file, { confirmLegacyRecovery: async (target) => { expect(target).toBe(file); prompts++; return true; } });
      expect(prompts).toBe(1); await lock.dispose();
    } finally { await directory.dispose(); }
  });
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
      await expect(FileLock.acquire(file, { confirmLegacyRecovery: async (target) => { expect(target).toBe(file); return false; } })).rejects.toMatchObject({ code: 'lock_recovery_cancelled' });
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
