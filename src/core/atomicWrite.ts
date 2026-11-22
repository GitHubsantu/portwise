import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import * as path from 'node:path';
import { AtomicWriteError, PortwiseError } from './errors';
import { restrictPrivateFile, type PermissionOptions } from './privateFile';
import { permissionCleanupFailure } from './permissionFailure';

export interface AtomicWriteOptions {
  backupPath?: string;
  mode?: number;
  beforeRename?: () => Promise<void> | void;
  permissions?: PermissionOptions;
}

/** Secure the exclusively created empty file before writing private bytes. */
export async function writePrivateExclusive(file: string, contents: string | Uint8Array, permissions?: PermissionOptions): Promise<void> {
  const handle = await open(file, 'wx', 0o600);
  let failed = false; let failure: unknown;
  try {
    await restrictPrivateFile(file, permissions);
    await handle.writeFile(contents, typeof contents === 'string' ? 'utf8' : undefined);
    await handle.sync();
  } catch (error) { failed = true; failure = error; }
  const target = permissions?.target ?? 'private file';
  try { await handle.close(); }
  catch { failure = permissionCleanupFailure(failure, failed, target); failed = true; }
  if (failed) {
    try { await rm(file, { force: true }); }
    catch { failure = permissionCleanupFailure(failure, true, target); }
    throw failure;
  }
}

/** Writes a complete replacement in the target directory, preserving a requested backup. */
export async function atomicWrite(target: string, contents: string | Uint8Array, options: AtomicWriteOptions = {}): Promise<void> {
  const directory = path.dirname(target);
  const temporary = path.join(directory, `.${path.basename(target)}.${randomUUID()}.tmp`);
  const role = options.permissions?.target ?? (path.basename(target) === 'config.toml' ? 'config staging' : path.basename(target) === '.env' ? '.env staging' : 'private file');
  let failed = false; let failure: unknown;
  try {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    if (options.backupPath !== undefined) {
      if (path.resolve(options.backupPath) === path.resolve(target)) throw new Error('backup overlaps target');
      await atomicWrite(options.backupPath, await readFile(target), options.permissions ? { permissions: options.permissions } : {});
    }
    await writePrivateExclusive(temporary, contents, { ...options.permissions, target: role });
    await options.beforeRename?.();
    await rename(temporary, target);
  } catch (error) {
    failed = true;
    failure = error instanceof PortwiseError ? error : new AtomicWriteError(`Portwise could not safely replace ${path.basename(target)}. Check folder access and retry; the original file was preserved.`);
  } finally {
    try { await rm(temporary, { force: true }); }
    catch { failure = permissionCleanupFailure(failure, failed, role); failed = true; }
  }
  if (failed) throw failure;
}
