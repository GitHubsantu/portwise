import { randomUUID } from 'node:crypto';
import { lstat, open, readFile, rm, type FileHandle } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { LockRecoveryCancelledError, PortwiseError } from './errors';

interface Owner { version: 1; pid: number; id: string; createdAt: string; }
interface Identity { bytes: string; ino: number; dev: number; birthtimeMs: number; }
export interface LockOptions {
  confirmLegacyRecovery?: (lockPath: string) => Promise<boolean>;
  /** Test seams; production checks OS process liveness and uses ordinary file I/O. */
  ownerAlive?: (pid: number) => boolean;
  close?: (handle: FileHandle) => Promise<void>;
  remove?: (file: string) => Promise<void>;
}

/** Exclusive file lock. Recovery and release share a short-lived exclusive guard. */
export class FileLock {
  private released = false;
  private constructor(private readonly lockPath: string, private handle: FileHandle | undefined, private readonly identity: Identity, private readonly options: LockOptions) {}

  static async acquire(lockPath: string, options: LockOptions = {}): Promise<FileLock> {
    let approvedLegacy: Identity | undefined;
    for (;;) {
      const result = await guarded(lockPath, async () => {
        const existing = await inspect(lockPath);
        if (existing) {
          const owner = parseOwner(existing.bytes);
          if (owner) {
            if ((options.ownerAlive ?? ownerAlive)(owner.pid)) throw unavailable();
          } else if (existing.bytes.trim() !== '' || !same(existing, approvedLegacy)) {
            if (existing.bytes.trim() === '' && options.confirmLegacyRecovery) return existing;
            throw unavailable();
          }
          // Every cooperating acquire/release holds this guard. Recheck both bytes and inode.
          if (!same(existing, await inspect(lockPath))) throw unavailable();
          await rm(lockPath);
        }
        const handle = await open(lockPath, 'wx', 0o600);
        try {
          const owner: Owner = { version: 1, pid: process.pid, id: randomUUID(), createdAt: new Date().toISOString() };
          await handle.writeFile(JSON.stringify(owner));
          await handle.sync();
          const identity = await inspect(lockPath);
          if (!identity) throw unavailable();
          return new FileLock(lockPath, handle, identity, options);
        } catch (error) {
          try { await handle.close(); } finally { await rm(lockPath, { force: true }); }
          throw error;
        }
      }, options);
      if (result instanceof FileLock) return result;
      // Never hold any lock or guard across a user dialog.
      if (!await options.confirmLegacyRecovery?.(lockPath)) throw new LockRecoveryCancelledError();
      approvedLegacy = result;
    }
  }

  async dispose(): Promise<void> {
    if (this.released) return;
    const errors: unknown[] = [];
    try { if (this.handle) {
      await (this.options.close ?? ((handle) => handle.close()))(this.handle);
      this.handle = undefined;
    } } catch (error) { errors.push(error); }
    try {
      await guarded(this.lockPath, async () => {
        const current = await inspect(this.lockPath);
        if (!current) return;
        if (!same(current, this.identity)) throw new PortwiseError('The account lock changed ownership. Portwise left it untouched.', 'lock_owner_changed');
        await (this.options.remove ?? ((file) => rm(file)))(this.lockPath);
      }, this.options);
    } catch (error) { errors.push(error); }
    if (errors.length) {
      throw new PortwiseError(`Could not fully release the Portwise account lock at ${this.lockPath}. Close other Portwise windows and retry; inspect the lock before recovery.`, 'lock_cleanup_failed');
    }
    this.released = true;
  }
}

async function guarded<T>(lockPath: string, operation: () => Promise<T>, options: LockOptions): Promise<T> {
  const guardPath = `${lockPath}.guard`;
  let guard: FileHandle | undefined;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { guard = await open(guardPath, 'wx', 0o600); break; }
    catch (error) {
      if (!hasCode(error, 'EEXIST')) throw error;
      const existing = await inspect(guardPath);
      if (!existing) continue;
      const owner = parseOwner(existing.bytes);
      if (owner && !(options.ownerAlive ?? ownerAlive)(owner.pid)) {
        await recoverGuard(guardPath, existing, options);
      } else if (!owner && attempt >= 10 && options.confirmLegacyRecovery) {
        if (!await options.confirmLegacyRecovery(guardPath)) throw new LockRecoveryCancelledError();
        await recoverGuard(guardPath, existing, options);
      }
    }
    await delay(10);
  }
  if (!guard) throw new PortwiseError(`Portwise cannot serialize account-lock recovery. Close other Portwise windows and inspect ${guardPath}; it is never removed by age alone.`, 'lock_guard_unavailable');
  try {
    await guard.writeFile(JSON.stringify({ version: 1, pid: process.pid, id: randomUUID(), createdAt: new Date().toISOString() }));
    await guard.sync();
    const identity = await inspect(guardPath);
    if (!identity) throw unavailable();
    try { return await operation(); }
    finally { await releaseGuard(guardPath, identity); }
  } finally {
    await guard.close();
  }
}

async function releaseGuard(guardPath: string, identity: Identity): Promise<void> {
  if (!same(identity, await inspect(guardPath))) throw unavailable();
  await rm(guardPath);
}

/** Only one recovery may unlink a captured guard; normal acquisitions remain exclusive. */
async function recoverGuard(guardPath: string, expected: Identity, options: LockOptions, depth = 0): Promise<void> {
  if (depth >= 8) throw new PortwiseError(`Recovery nesting is excessive. Close other Portwise windows and inspect ${guardPath}.`, 'lock_guard_recovery_busy');
  const recoveryPath = `${guardPath}.recovery`;
  let claim: FileHandle;
  try { claim = await open(recoveryPath, 'wx', 0o600); }
  catch (error) {
    if (!hasCode(error, 'EEXIST')) throw error;
    const previous = await inspect(recoveryPath);
    if (!previous) throw unavailable();
    const owner = parseOwner(previous.bytes);
    if (owner && (options.ownerAlive ?? ownerAlive)(owner.pid)) throw unavailable();
    if (!owner) {
      if (!options.confirmLegacyRecovery) throw unavailable();
      if (!await options.confirmLegacyRecovery(recoveryPath)) throw new LockRecoveryCancelledError();
    }
    await recoverGuard(recoveryPath, previous, options, depth + 1);
    claim = await open(recoveryPath, 'wx', 0o600);
  }
  try {
    await claim.writeFile(JSON.stringify({ version: 1, pid: process.pid, id: randomUUID(), createdAt: new Date().toISOString() }));
    if (!same(expected, await inspect(guardPath))) throw unavailable();
    const owner = parseOwner(expected.bytes);
    if (owner && (options.ownerAlive ?? ownerAlive)(owner.pid)) throw unavailable();
    await rm(guardPath);
  } finally { try { await claim.close(); } finally { await rm(recoveryPath); } }
}

async function inspect(file: string): Promise<Identity | undefined> {
  try {
    const metadata = await lstat(file);
    if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > 4096) throw unavailable();
    return { bytes: await readFile(file, 'utf8'), ino: metadata.ino, dev: metadata.dev, birthtimeMs: metadata.birthtimeMs };
  } catch (error) { if (hasCode(error, 'ENOENT')) return undefined; throw error; }
}
function same(left: Identity, right: Identity | undefined): boolean { return right !== undefined && left.bytes === right.bytes && left.ino === right.ino && left.dev === right.dev && left.birthtimeMs === right.birthtimeMs; }
function parseOwner(bytes: string): Owner | undefined {
  try {
    const value: unknown = JSON.parse(bytes);
    if (typeof value !== 'object' || value === null) return;
    const item = value as Record<string, unknown>;
    if (item['version'] === 1 && typeof item['pid'] === 'number' && Number.isSafeInteger(item['pid']) && item['pid'] > 0 && typeof item['id'] === 'string' && /^[a-f0-9-]{36}$/.test(item['id']) && typeof item['createdAt'] === 'string') return item as unknown as Owner;
  } catch { /* Empty/unknown legacy locks require explicit confirmation, never inferred ownership. */ }
  return undefined;
}
function ownerAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; }
  catch (error) { return !hasCode(error, 'ESRCH'); }
}
function unavailable(): PortwiseError { return new PortwiseError('Another Portwise operation is already in progress.', 'lock_unavailable'); }
function hasCode(error: unknown, code: string): boolean { return typeof error === 'object' && error !== null && 'code' in error && error.code === code; }
