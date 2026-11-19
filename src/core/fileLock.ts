import { open, rm, type FileHandle } from 'node:fs/promises';
import { PortwiseError } from './errors';

/** Exclusive lock backed by a new file. Call dispose in a finally block. */
export class FileLock {
  private constructor(private readonly lockPath: string, private handle: FileHandle | undefined) {}

  static async acquire(lockPath: string): Promise<FileLock> {
    try {
      const handle = await open(lockPath, 'wx', 0o600);
      return new FileLock(lockPath, handle);
    } catch (error) {
      if (isAlreadyExists(error)) {
        throw new PortwiseError('Another Portwise operation is already in progress.', 'lock_unavailable');
      }
      throw new PortwiseError(`Could not acquire file lock: ${error instanceof Error ? error.message : 'unknown error'}`, 'lock_failed');
    }
  }

  async dispose(): Promise<void> {
    const handle = this.handle;
    if (handle === undefined) return;
    this.handle = undefined;
    await handle.close();
    await rm(this.lockPath, { force: true });
  }
}

function isAlreadyExists(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST';
}
