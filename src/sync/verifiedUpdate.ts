import { lstat, readFile, rename, unlink, utimes } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import * as path from 'node:path';
import { atomicWrite, writePrivateExclusive } from '../core/atomicWrite';
import { checkedCodexTarget, resolveCodexFile } from '../core/paths';
import { verifyPrivateFile } from '../core/privateFile';
import { PortwiseError } from '../core/errors';
import type { BackupEntry } from './backups';

interface Identity { dev: number; ino: number; }
interface Snapshot extends Identity { size: number; mtimeMs: number; ctimeMs: number; atime: Date; mtime: Date; }
interface Recovery { file: string; identity: Snapshot; bytes: Buffer; }
export interface VerifiedUpdateOptions {
  home: string;
  target: { file: string; recheck(): Promise<void> };
  contents: Buffer;
  backup: BackupEntry;
  validate?: (bytes: Buffer) => void;
}
type RecoveryOutcome = 'original-preserved' | 'restored' | 'external-preserved' | 'manual-recovery';

export class FileUpdateVerificationError extends PortwiseError {
  constructor(readonly recovery: RecoveryOutcome) {
    super('The Codex file update did not finish safely. Check folder permissions and retained backups, then retry Portwise: Configure Codex for Gateway or Portwise: Restore Config Backup. External edits were left untouched.', 'file_update_verification_failed');
    this.name = 'FileUpdateVerificationError';
  }
}

/** Caller holds the per-home lock. Prepare a private rollback before publishing any new bytes. */
export async function verifiedUpdate(options: VerifiedUpdateOptions): Promise<void> {
  const { home, target, contents } = options;
  const filename = path.basename(target.file);
  let recovery: Recovery | undefined; let candidate: Snapshot | undefined;
  let installed = false; let retainRecovery = false; let failure: unknown;
  try {
    if (!['.env', 'config.toml'].includes(filename) || await resolveCodexFile(home, filename) !== target.file) throw new FileUpdateVerificationError('original-preserved');
    const original = await inspect(target.file);
    const before = original ? await readFile(target.file) : Buffer.alloc(0);
    const backup = await resolveCodexFile(path.dirname(options.backup.file), path.basename(options.backup.file));
    const backupBytes = await readFile(backup);
    if (!backupBytes.equals(before)) throw new FileUpdateVerificationError('original-preserved');
    if (original) {
      // Existing .env.* ignore rules protect private recovery bytes in a repository too.
      // This is shorter than either target's preflighted atomic staging filename.
      const file = path.join(path.dirname(target.file), `.env.${randomUUID()}.bak`);
      await writePrivateExclusive(file, backupBytes, { target: 'backup' });
      const identity = await inspect(file); if (!identity) throw new FileUpdateVerificationError('original-preserved');
      recovery = { file, identity, bytes: backupBytes };
      await utimes(file, original.atime, original.mtime);
      await verify(file, backupBytes, identity);
      const prepared = await inspect(file); if (!prepared) throw new FileUpdateVerificationError('original-preserved');
      recovery.identity = prepared;
    }
    await atomicWrite(target.file, contents, { mode: 0o600, beforeRename: async temporary => {
      if (!temporary) throw new FileUpdateVerificationError('original-preserved');
      const identity = await inspect(temporary); if (!identity) throw new FileUpdateVerificationError('original-preserved');
      await verify(temporary, contents, identity, options.validate);
      candidate = identity;
      await target.recheck();
    } });
    installed = true;
    if (!candidate) throw new FileUpdateVerificationError('manual-recovery');
    await assertTarget(home, filename, target.file);
    await verify(target.file, contents, candidate, options.validate);
  } catch (error) {
    // The rename may have succeeded even if the atomic helper subsequently rejected.
    const ownership = candidate ? await owns(home, filename, target.file, candidate, contents) : 'external';
    if (ownership === 'owned' && candidate) {
      let outcome: RecoveryOutcome = 'manual-recovery';
      try { await recover(options, candidate, recovery); outcome = 'restored'; }
      catch { retainRecovery = true; /* Keep prepared bytes and the retained backup if recovery cannot complete. */ }
      failure = new FileUpdateVerificationError(outcome);
    } else if (ownership === 'unavailable') {
      retainRecovery = true; failure = new FileUpdateVerificationError('manual-recovery');
    } else if (installed) failure = new FileUpdateVerificationError('external-preserved');
    else failure = error instanceof FileUpdateVerificationError ? new FileUpdateVerificationError('original-preserved') : error instanceof PortwiseError ? error : new FileUpdateVerificationError('original-preserved');
  }
  if (recovery && !retainRecovery) {
    try {
      const current = await inspect(recovery.file);
      if (current && same(current, recovery.identity)) await unlink(recovery.file);
    } catch {
      // Cleanup must not replace the earlier failure or turn it into a success.
      failure ??= new FileUpdateVerificationError('manual-recovery');
    }
  }
  if (failure !== undefined) throw failure;
}

async function recover(options: VerifiedUpdateOptions, candidate: Identity, recovery: Recovery | undefined): Promise<void> {
  const filename = path.basename(options.target.file);
  if (await owns(options.home, filename, options.target.file, candidate, options.contents) !== 'owned') throw new FileUpdateVerificationError('external-preserved');
  const target = await checkedCodexTarget(options.home, filename);
  if (recovery) {
    const current = await inspect(recovery.file);
    if (!current || !same(current, recovery.identity) || current.size !== recovery.identity.size || current.mtimeMs !== recovery.identity.mtimeMs || current.ctimeMs !== recovery.identity.ctimeMs || !(await readFile(recovery.file)).equals(recovery.bytes)) throw new FileUpdateVerificationError('manual-recovery');
    await target.recheck();
    await rename(recovery.file, target.file);
    await verify(target.file, recovery.bytes, recovery.identity);
  } else {
    await target.recheck(); await unlink(target.file);
    if (await inspect(target.file)) throw new FileUpdateVerificationError('external-preserved');
  }
}

async function verify(file: string, expected: Buffer, identity?: Identity, validate?: (bytes: Buffer) => void): Promise<void> {
  const before = await inspect(file);
  if (!before || identity && !same(before, identity)) throw new FileUpdateVerificationError('manual-recovery');
  const bytes = await readFile(file);
  if (!bytes.equals(expected)) throw new FileUpdateVerificationError('manual-recovery');
  validate?.(bytes);
  await verifyPrivateFile(file);
  const after = await inspect(file);
  if (!after || !same(before, after) || after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs || !(await readFile(file)).equals(expected)) throw new FileUpdateVerificationError('manual-recovery');
}
async function owns(home: string, filename: string, file: string, identity: Identity, bytes: Buffer): Promise<'owned' | 'external' | 'unavailable'> {
  try {
    await assertTarget(home, filename, file);
    const current = await inspect(file);
    return current !== undefined && same(current, identity) && (await readFile(file)).equals(bytes) ? 'owned' : 'external';
  } catch (error) {
    if (error instanceof PortwiseError && (error.code === 'path_invalid' || error instanceof FileUpdateVerificationError && error.recovery === 'external-preserved')) return 'external';
    return 'unavailable'; // An unverifiable or externally edited target must never be overwritten.
  }
}
async function assertTarget(home: string, filename: string, file: string): Promise<void> {
  if (await resolveCodexFile(home, filename) !== file) throw new FileUpdateVerificationError('external-preserved');
}
async function inspect(file: string): Promise<Snapshot | undefined> {
  try {
    const stat = await lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new FileUpdateVerificationError('external-preserved');
    return { dev: stat.dev, ino: stat.ino, size: stat.size, mtimeMs: stat.mtimeMs, ctimeMs: stat.ctimeMs, atime: stat.atime, mtime: stat.mtime };
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') return;
    throw error;
  }
}
function same(left: Identity, right: Identity): boolean { return left.dev === right.dev && left.ino === right.ino; }
