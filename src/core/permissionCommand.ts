import { spawn } from 'node:child_process';
import type { PermissionCategory, PermissionCommand } from './permissionFailure';

export const PERMISSION_COMMAND_DEADLINE_MS = 5_000;
export type PermissionRunner = (command: Exclude<PermissionCommand, 'none'>, args: string[], input?: string) => Promise<string>;

export class PermissionCommandError extends Error {
  constructor(readonly category: Exclude<PermissionCategory, 'validation' | 'I/O failure'>, readonly exitCode?: number) { super('Permission command failed.'); }
}

/** Never expose argv, stdout, stderr or OS exception text in a command error. */
export function runPermissionCommand(command: Exclude<PermissionCommand, 'none'>, args: string[], input = ''): Promise<string> {
  return new Promise((resolve, reject) => {
    let child: ReturnType<typeof spawn>;
    try { child = spawn(command, args, { shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] }); }
    catch { reject(new PermissionCommandError('spawn failure')); return; }
    let output = ''; let length = 0; let settled = false;
    const finish = (error?: PermissionCommandError) => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      if (error) { child.kill(); reject(error); } else resolve(output);
    };
    const timer = setTimeout(() => finish(new PermissionCommandError('timeout')), PERMISSION_COMMAND_DEADLINE_MS);
    child.stdout?.on('data', (chunk: Buffer) => {
      length += chunk.length;
      if (length > 16_384) finish(new PermissionCommandError('output limit'));
      else output += chunk.toString('utf8');
    });
    child.stdout?.once('error', () => finish(new PermissionCommandError('output failure')));
    child.stdin?.once('error', () => finish(new PermissionCommandError('output failure')));
    child.once('error', () => finish(new PermissionCommandError('spawn failure')));
    child.once('close', code => finish(code === 0 ? undefined : new PermissionCommandError('nonzero exit', code ?? undefined)));
    child.stdin?.end(input);
  });
}
