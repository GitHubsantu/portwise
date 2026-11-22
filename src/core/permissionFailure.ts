import { PortwiseError } from './errors';

export type PermissionTarget = 'backup' | 'config staging' | '.env staging' | 'private file';
export type PermissionStep = 'path length' | 'icacls start' | 'icacls exit' | 'ACL read' | 'ACL parse' | 'verify' | 'cleanup';
export type PermissionCommand = 'whoami' | 'icacls' | 'powershell.exe' | 'none';
export type PermissionCategory = 'validation' | 'I/O failure' | 'timeout' | 'spawn failure' | 'nonzero exit' | 'output failure' | 'output limit';
export type PrincipalKind = 'not-reached' | 'current-user' | 'system' | 'administrators' | 'other' | 'unresolved';
export type PermissionReason = 'path too long' | 'command failed' | 'identity unavailable' | 'file unavailable' | 'mode mismatch' | 'ACL unavailable' | 'invalid ACL response' | 'unprotected DACL' | 'missing DACL' | 'unsupported ACE' | 'inherited ACE' | 'principal not allowed' | 'unresolved principal' | 'missing user FullControl' | 'cleanup failed';
export type PathLengthBucket = '0-259' | '260-511' | '512-1023' | '1024+';
export interface PermissionPathObservation {
  directoryExists: boolean | 'unavailable';
  fileExists: boolean | 'unavailable';
  pathLengthBucket: PathLengthBucket;
}

export interface PermissionDetail {
  step: PermissionStep;
  command: PermissionCommand;
  category: PermissionCategory;
  reason: PermissionReason;
  principal?: PrincipalKind;
  exitCode?: number;
  path?: PermissionPathObservation;
}

/** Messages contain only fixed enums and a bounded numeric exit code. */
export class PrivatePermissionError extends PortwiseError {
  private cleanupFailed = false;
  constructor(readonly target: PermissionTarget, readonly detail: PermissionDetail, readonly operation: 'apply' | 'verify' | 'cleanup' = 'apply') {
    super('', operation === 'verify' ? 'private_permissions_unverified' : 'private_permissions_failed');
    this.cleanupFailed = operation === 'cleanup';
    this.message = this.format();
  }
  noteCleanupFailure(): void { this.cleanupFailed = true; this.message = this.format(); }
  private format(): string {
    const { step, command, category, reason, principal = 'not-reached', exitCode } = this.detail;
    const exit = Number.isSafeInteger(exitCode) && exitCode !== undefined && exitCode >= -2_147_483_648 && exitCode <= 2_147_483_647 ? String(exitCode) : 'none';
    const observed = this.detail.path;
    const fields = `target=${this.target}; step=${step}; command=${command}; category=${category}; exit=${exit}; windowsError=${windowsErrorName(exitCode)}; reason=${reason}; principal=${principal}; directoryExists=${observed?.directoryExists ?? 'unavailable'}; fileExists=${observed?.fileExists ?? 'unavailable'}; pathLengthBucket=${observed?.pathLengthBucket ?? 'unavailable'}; cleanup=${this.cleanupFailed ? 'failed' : 'ok'}`;
    if (step === 'path length') return `Portwise refused a Windows private-file path that exceeds the supported length. [${fields}] No private bytes were written to this file. Shorten the isolated VS Code user-data or Codex-home location, then retry. Machine policy was not changed.`;
    if (this.operation === 'verify') return `Private file permissions could not be verified. [${fields}] Diagnostics did not change the file. Check its ACL or mode, then retry.`;
    if (this.operation === 'cleanup') return `Portwise could not finish private-file cleanup. [${fields}] Earlier operation steps may have completed. Check folder access before retrying.`;
    return `Portwise could not apply and verify private file permissions. [${fields}] This file was not committed; earlier operation steps may have completed. Check folder access and Windows permission tools, then retry.`;
  }
}

/** Static lookup of the process exit code; this does not capture native GetLastError. */
function windowsErrorName(code: number | undefined): string {
  switch (code) {
    case undefined: return 'none';
    case 0: return 'ERROR_SUCCESS';
    case 2: return 'ERROR_FILE_NOT_FOUND';
    case 3: return 'ERROR_PATH_NOT_FOUND';
    case 5: return 'ERROR_ACCESS_DENIED';
    case 32: return 'ERROR_SHARING_VIOLATION';
    case 123: return 'ERROR_INVALID_NAME';
    case 206: return 'ERROR_FILENAME_EXCED_RANGE';
    default: return 'unmapped';
  }
}

/** Cleanup must not replace the original failure, even for unknown exceptions. */
export function permissionCleanupFailure(primary: unknown, failed: boolean, target: PermissionTarget): unknown {
  if (failed) { if (primary instanceof PrivatePermissionError) primary.noteCleanupFailure(); return primary; }
  return new PrivatePermissionError(target, { step: 'cleanup', command: 'none', category: 'I/O failure', reason: 'cleanup failed' }, 'cleanup');
}
