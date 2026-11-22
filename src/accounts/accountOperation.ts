import * as path from 'node:path';
import { FileLock, type LockOptions } from '../core/fileLock';
import { permissionCleanupFailure } from '../core/permissionFailure';

/** All account mutations share the same lock path, recovery options and release boundary. */
export async function withAccountOperation<T>(home: string, options: LockOptions, operation: () => Promise<T>): Promise<T> {
  const lock = await FileLock.acquire(path.join(home, '.portwise-auth.lock'), options);
  let outcome: { value: T } | { error: unknown } = { error: undefined };
  try { outcome = { value: await operation() }; }
  catch (error) { outcome = { error }; }
  finally {
    try { await lock.dispose(); }
    catch (error) {
      // Never replace an earlier permission failure with the lock-release failure.
      if ('error' in outcome) permissionCleanupFailure(outcome.error, true, 'private file');
      else outcome = { error };
    }
  }
  if ('error' in outcome) throw outcome.error;
  return outcome.value;
}
