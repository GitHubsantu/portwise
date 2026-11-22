import * as path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { FileLock } from '../core/fileLock';
import { canonicalCodexHome } from '../core/paths';
import { PortwiseError } from '../core/errors';
import { permissionCleanupFailure } from '../core/permissionFailure';

/** OS-visible transaction lock shared by Configure, Switch, Restore and delivery. */
export async function withConfigOperation<T>(home: string, operation: () => Promise<T>): Promise<T> {
  const canonical = await canonicalCodexHome(home);
  let lock: FileLock | undefined;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { lock = await FileLock.acquire(path.join(canonical, '.portwise-config.lock')); break; }
    catch (error) {
      if (!(error instanceof PortwiseError) || !['lock_unavailable', 'lock_guard_unavailable'].includes(error.code)) throw error;
      if (attempt === 99) throw new PortwiseError('Another Portwise config operation is in progress. Wait for it to finish, then retry; inspect .portwise-config.lock if it persists.', 'config_operation_busy');
      await delay(25);
    }
  }
  if (!lock) throw new PortwiseError('Portwise could not acquire the config operation lock. Retry after checking the target home.', 'config_operation_busy');
  let outcome: { value: T } | { error: unknown } = { error: undefined };
  try { outcome = { value: await operation() }; }
  catch (error) { outcome = { error }; }
  finally {
    try { await lock.dispose(); }
    catch (error) {
      // Keep the operation primary; a permission error records the secondary cleanup failure.
      if ('error' in outcome) permissionCleanupFailure(outcome.error, true, 'private file');
      else outcome = { error };
    }
  }
  if ('error' in outcome) throw outcome.error;
  return outcome.value;
}
