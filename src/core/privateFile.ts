import { spawn } from 'node:child_process';
import { chmod, lstat, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { PortwiseError } from './errors';

export interface PermissionOptions {
  platform?: NodeJS.Platform;
  run?: (command: string, args: string[]) => Promise<string>;
}

/** Called on an exclusively created EMPTY file before writing secret bytes. */
export async function restrictPrivateFile(file: string, options: PermissionOptions = {}): Promise<void> {
  try {
    const stat = await lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('not a regular file');
    if ((options.platform ?? process.platform) !== 'win32') {
      await chmod(file, 0o600);
      if (((await lstat(file)).mode & 0o777) !== 0o600) throw new Error('mode verification failed');
      return;
    }
    const run = options.run ?? runPermissionCommand;
    const identity = await run('whoami', ['/user', '/fo', 'csv', '/nh']);
    const sid = identity.match(/\bS-1-\d+(?:-\d+)+\b/g);
    if (sid?.length !== 1 || !sid[0]) throw new Error('user identity unavailable');
    await run('icacls', [file, '/inheritance:r', '/grant:r', `*${sid[0]}:F`]);
    const temporary = await mkdtemp(path.join(tmpdir(), 'portwise-acl-'));
    try {
      const capture = path.join(temporary, 'acl.txt');
      await run('icacls', [file, '/save', capture, '/q']);
      const bytes = await readFile(capture);
      // icacls /save emits UTF-16LE, including versions that omit a BOM.
      const text = bytes.toString('utf16le').replace(/^\ufeff/, '');
      verifyPrivateDacl(text, sid[0]);
    } finally { await rm(temporary, { recursive: true, force: true }); }
  } catch {
    throw new PortwiseError('Portwise could not apply and verify private file permissions. This file was not committed; earlier operation steps may have completed. Check target-folder access and Windows icacls, then retry.', 'private_permissions_failed');
  }
}

/** Parse only the small DACL subset we create; unfamiliar ACEs fail closed. */
export function verifyPrivateDacl(saved: string, userSid: string): void {
  const lines = saved.split(/\r?\n/).filter(line => line.startsWith('D:'));
  const dacl = lines[0];
  if (lines.length !== 1 || !dacl || !/^D:P(?:AI|AR)*(?:\(|$)/.test(dacl)) throw new Error('unprotected DACL');
  const aces = dacl.match(/\([^()]*\)/g) ?? [];
  if (dacl.replace(/^D:P(?:AI|AR)*/, '').replace(/\([^()]*\)/g, '') !== '') throw new Error('unknown DACL');
  let userFullControl = false;
  for (const ace of aces) {
    const fields = ace.slice(1, -1).split(';');
    const [type, flags, rights, object, inherited, principal] = fields;
    if (fields.length !== 6 || type !== 'A' || flags !== '' || object !== '' || inherited !== '' || !principal || ![userSid, 'SY', 'BA', 'S-1-5-18', 'S-1-5-32-544'].includes(principal)) throw new Error('unexpected access rule');
    if (principal === userSid && (rights === 'FA' || rights?.toLowerCase() === '0x1f01ff')) userFullControl = true;
  }
  if (!userFullControl) throw new Error('user lacks full control');
}

function runPermissionCommand(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    let output = ''; const timer = setTimeout(() => { child.kill(); reject(new Error('permission command timeout')); }, 5_000);
    child.stdout.on('data', (chunk: Buffer) => { if (output.length < 16_384) output += chunk.subarray(0, 16_384 - output.length).toString('utf8'); });
    child.stdout.once('error', () => { clearTimeout(timer); child.kill(); reject(new Error('permission command output failed')); });
    child.once('error', () => { clearTimeout(timer); reject(new Error('permission command unavailable')); });
    child.once('close', code => { clearTimeout(timer); if (code === 0) resolve(output); else reject(new Error('permission command failed')); });
  });
}
