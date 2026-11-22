import { PortwiseError } from './errors';

export type PermissionTarget = 'backup' | 'config staging' | '.env staging' | 'private file';
export type PermissionStep = 'icacls start' | 'icacls exit' | 'ACL read' | 'ACL parse' | 'verify' | 'cleanup';
export type PermissionCommand = 'whoami' | 'icacls' | 'powershell.exe' | 'none';
export type PermissionCategory = 'validation' | 'I/O failure' | 'timeout' | 'spawn failure' | 'nonzero exit' | 'output failure' | 'output limit';
export type PrincipalKind = 'current-user' | 'system' | 'administrators' | 'other' | 'unresolved';
export type PermissionReason = 'command failed' | 'identity unavailable' | 'file unavailable' | 'mode mismatch' | 'ACL unavailable' | 'invalid ACL response' | 'unprotected DACL' | 'missing DACL' | 'unsupported ACE' | 'inherited ACE' | 'principal not allowed' | 'unresolved principal' | 'missing user FullControl' | 'cleanup failed';

export interface PermissionDetail {
  step: PermissionStep;
  command: PermissionCommand;
  category: PermissionCategory;
  reason: PermissionReason;
  principal?: PrincipalKind;
  exitCode?: number;
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
    const { step, command, category, reason, principal = 'unresolved', exitCode } = this.detail;
    const exit = Number.isSafeInteger(exitCode) && exitCode !== undefined && exitCode >= -2_147_483_648 && exitCode <= 2_147_483_647 ? String(exitCode) : 'none';
    const fields = `target=${this.target}; step=${step}; command=${command}; category=${category}; exit=${exit}; reason=${reason}; principal=${principal}; cleanup=${this.cleanupFailed ? 'failed' : 'ok'}`;
    if (this.operation === 'verify') return `Private file permissions could not be verified. [${fields}] Diagnostics did not change the file. Check its ACL or mode, then retry.`;
    if (this.operation === 'cleanup') return `Portwise could not finish private-file cleanup. [${fields}] Earlier operation steps may have completed. Check folder access before retrying.`;
    return `Portwise could not apply and verify private file permissions. [${fields}] This file was not committed; earlier operation steps may have completed. Check folder access and Windows permission tools, then retry.`;
  }
}

/** Cleanup must not replace the original failure, even for unknown exceptions. */
export function permissionCleanupFailure(primary: unknown, failed: boolean, target: PermissionTarget): unknown {
  if (failed) { if (primary instanceof PrivatePermissionError) primary.noteCleanupFailure(); return primary; }
  return new PrivatePermissionError(target, { step: 'cleanup', command: 'none', category: 'I/O failure', reason: 'cleanup failed' }, 'cleanup');
}
