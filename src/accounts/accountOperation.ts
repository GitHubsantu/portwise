import * as path from 'node:path';
import { FileLock, type LockOptions } from '../core/fileLock';

/** All account mutations share the same lock path, recovery options and release boundary. */
export async function withAccountOperation<T>(home: string, options: LockOptions, operation: () => Promise<T>): Promise<T> {
  const lock = await FileLock.acquire(path.join(home, '.portwise-auth.lock'), options);
  try { return await operation(); } finally { await lock.dispose(); }
}
