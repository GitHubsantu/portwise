import { lstat } from 'node:fs/promises';
import * as path from 'node:path';
import { PrivatePermissionError, type PermissionPathObservation, type PermissionTarget } from './permissionFailure';

/** Last observed existence only; not a guarantee that another process/tool can resolve it. */
export async function observePermissionPath(file: string): Promise<PermissionPathObservation> {
  return {
    directoryExists: await exists(path.dirname(file), true),
    fileExists: await exists(file, false),
    pathLengthBucket: file.length < 260 ? '0-259' : file.length < 512 ? '260-511' : file.length < 1024 ? '512-1023' : '1024+',
  };
}

/** Refuse the actual staging/backup path before any content write, independent of OS policy. */
export async function checkPrivatePath(file: string, platform: NodeJS.Platform, target: PermissionTarget): Promise<void> {
  if (platform !== 'win32' || file.length < 260) return;
  throw new PrivatePermissionError(target, {
    step: 'path length', command: 'none', category: 'validation', reason: 'path too long',
    path: await observePermissionPath(file),
  });
}

/** UUIDs have fixed length: preflight the replacement before even writing its backup. */
export async function checkAtomicWritePath(file: string, platform: NodeJS.Platform = process.platform): Promise<void> {
  const role = path.basename(file) === 'config.toml' ? 'config staging' : path.basename(file) === '.env' ? '.env staging' : 'private file';
  const staging = path.join(path.dirname(file), `.${path.basename(file)}.${'0'.repeat(36)}.tmp`);
  await checkPrivatePath(staging, platform, role);
}

async function exists(file: string, directory: boolean): Promise<boolean | 'unavailable'> {
  try { const metadata = await lstat(file); return directory ? metadata.isDirectory() : true; }
  catch (error) { return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT' ? false : 'unavailable'; }
}
