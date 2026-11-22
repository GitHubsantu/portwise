import { spawn } from 'node:child_process';
import type { PermissionCategory, PermissionCommand } from './permissionFailure';

export const PERMISSION_COMMAND_DEADLINE_MS = 5_000;
export const ACL_INSPECTION_DEADLINE_MS = 20_000;
export const PERMISSION_CLOSE_WAIT_MS = 5_000;
export type PermissionRunner = (command: Exclude<PermissionCommand, 'none'>, args: string[], input?: string, purpose?: 'acl-read') => Promise<string>;

export class PermissionCommandError extends Error {
  constructor(readonly category: Exclude<PermissionCategory, 'validation' | 'I/O failure'>, readonly exitCode?: number, readonly processClosed = false) { super('Permission command failed.'); }
}

/** Never expose argv, stdout, stderr or OS exception text in a command error. */
export function runPermissionCommand(command: Exclude<PermissionCommand, 'none'>, args: string[], input = '', purpose?: 'acl-read'): Promise<string> {
  return new Promise((resolve, reject) => {
    let child: ReturnType<typeof spawn>;
    try { child = spawn(command, args, { shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] }); }
    catch { reject(new PermissionCommandError('spawn failure')); return; }
    let output = ''; let length = 0; let settled = false; let pending: PermissionCommandError | undefined;
    let closeTimer: ReturnType<typeof setTimeout> | undefined;
    const finish = (error?: PermissionCommandError) => {
      if (settled) return;
      settled = true; clearTimeout(timer); clearTimeout(closeTimer);
      if (error) reject(error); else resolve(output);
    };
    const stop = (error: PermissionCommandError) => {
      if (settled || pending) return;
      pending = error; clearTimeout(timer);
      // kill() alone does not prove exit. Only close permits a read-only retry.
      closeTimer = setTimeout(() => {
        // An unconfirmed child must not retain host pipes or permit a retry.
        child.stdin?.destroy(); child.stdout?.destroy(); child.unref(); finish(error);
      }, PERMISSION_CLOSE_WAIT_MS);
      try { child.kill(); } catch { /* The bounded close wait fails closed without permitting retry. */ }
    };
    const deadline = command === 'powershell.exe' && purpose === 'acl-read' ? ACL_INSPECTION_DEADLINE_MS : PERMISSION_COMMAND_DEADLINE_MS;
    const timer = setTimeout(() => stop(new PermissionCommandError('timeout')), deadline);
    child.stdout?.on('data', (chunk: Buffer) => {
      if (pending || settled) return;
      length += chunk.length;
      if (length > 16_384) stop(new PermissionCommandError('output limit'));
      else output += chunk.toString('utf8');
    });
    child.stdout?.once('error', () => stop(new PermissionCommandError('output failure')));
    child.stdin?.once('error', () => stop(new PermissionCommandError('output failure')));
    child.once('error', () => stop(new PermissionCommandError('spawn failure')));
    child.once('close', code => {
      if (pending) finish(new PermissionCommandError(pending.category, pending.exitCode, true));
      else finish(code === 0 ? undefined : new PermissionCommandError('nonzero exit', code ?? undefined, true));
    });
    child.stdin?.end(input);
  });
}
