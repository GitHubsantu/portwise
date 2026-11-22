import { chmod, lstat } from 'node:fs/promises';
import { runPermissionCommand, PermissionCommandError, type PermissionRunner } from './permissionCommand';
import { PrivatePermissionError, type PermissionDetail, type PermissionTarget } from './permissionFailure';
import { readWindowsAcl, verifyWindowsAcl } from './windowsAcl';
import { checkPrivatePath, observePermissionPath } from './permissionPath';

export interface PermissionOptions {
  platform?: NodeJS.Platform;
  run?: PermissionRunner;
  target?: PermissionTarget;
}

/** Called on an exclusively created EMPTY file before writing secret bytes. */
export async function restrictPrivateFile(file: string, options: PermissionOptions = {}): Promise<void> {
  return privatePermissions(file, options, true);
}

/** Read-only ACL/mode verification; diagnostics must never repair permissions implicitly. */
export async function verifyPrivateFile(file: string, options: PermissionOptions = {}): Promise<void> {
  return privatePermissions(file, options, false);
}

async function privatePermissions(file: string, options: PermissionOptions, apply: boolean): Promise<void> {
  const target = options.target ?? 'private file';
  let detail: PermissionDetail = { step: 'verify', command: 'none', category: 'I/O failure', reason: 'file unavailable' };
  try {
    const stat = await lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('not a regular file');
    if ((options.platform ?? process.platform) !== 'win32') {
      if (apply) await chmod(file, 0o600);
      detail = { step: 'verify', command: 'none', category: 'validation', reason: 'mode mismatch' };
      if (((await lstat(file)).mode & 0o777) !== 0o600) throw new Error('mode verification failed');
      return;
    }
    await checkPrivatePath(file, 'win32', target);
    const observed = await observePermissionPath(file);
    const run = options.run ?? runPermissionCommand;
    detail = { step: 'verify', command: 'whoami', category: 'validation', reason: 'identity unavailable', path: observed };
    const identity = await run('whoami', ['/user', '/fo', 'csv', '/nh']);
    const sid = identity.match(/^\s*"(?:[^"\r\n]|"")*"\s*,\s*"(S-1-\d+(?:-\d+)+)"\s*$/)?.[1];
    if (!sid) throw new Error('user identity unavailable');
    if (apply) {
      detail = { step: 'icacls start', command: 'icacls', category: 'validation', reason: 'command failed', path: await observePermissionPath(file) };
      await run('icacls', [file, '/inheritance:r', '/grant:r', `*${sid}:F`]);
    }
    detail = { step: 'ACL read', command: 'powershell.exe', category: 'validation', reason: 'ACL unavailable', path: detail.path ?? observed };
    verifyWindowsAcl(await readWindowsAcl(file, run), sid, target);
  } catch (error) {
    if (error instanceof PrivatePermissionError) {
      const observation = error.detail.path ?? detail.path;
      throw new PrivatePermissionError(target, { ...error.detail, ...(observation ? { path: observation } : {}) }, apply ? 'apply' : 'verify');
    }
    if (error instanceof PermissionCommandError) {
      detail = { ...detail, category: error.category, reason: 'command failed', ...(error.exitCode !== undefined ? { exitCode: error.exitCode } : {}) };
      if (detail.command === 'icacls' && error.category !== 'spawn failure') detail.step = 'icacls exit';
    }
    throw new PrivatePermissionError(target, detail, apply ? 'apply' : 'verify');
  }
}
