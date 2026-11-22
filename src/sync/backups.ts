import { mkdir, readFile, readdir, unlink } from 'node:fs/promises';
import * as path from 'node:path';
import { writePrivateExclusive } from '../core/atomicWrite';
import type { PermissionOptions } from '../core/privateFile';

const RETENTION = 10;

export interface BackupEntry { file: string; createdAt: string; }

/** Stores exact pre-write bytes in extension storage and retains the newest ten per target. */
export async function createBackup(target: string, directory: string, permissions?: PermissionOptions): Promise<BackupEntry> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const source = await readOptional(target);
  const createdAt = new Date().toISOString();
  const base = path.basename(target);
  let sequence = 0;
  for (;;) {
    const file = path.join(directory, `${base}.${createdAt.replaceAll(':', '-')}.${sequence.toString().padStart(4, '0')}.backup`);
    try {
      await writePrivateExclusive(file, source, { ...permissions, target: 'backup' });
      await trimBackups(target, directory);
      return { file, createdAt };
    } catch (error) {
      if (isAlreadyExists(error)) { sequence += 1; continue; }
      throw error;
    }
  }
}

export async function listBackups(target: string, directory: string): Promise<BackupEntry[]> {
  try {
    const prefix = `${path.basename(target)}.`;
    const files = (await readdir(directory)).filter((name) => name.startsWith(prefix) && name.endsWith('.backup')).sort().reverse();
    return files.map((name) => ({ file: path.join(directory, name), createdAt: timestampFrom(name, prefix) }));
  } catch (error) {
    if (isMissing(error)) return [];
    throw error;
  }
}

async function trimBackups(target: string, directory: string): Promise<void> {
  const backups = await listBackups(target, directory);
  await Promise.all(backups.slice(RETENTION).map((backup) => unlink(backup.file)));
}

function timestampFrom(name: string, prefix: string): string {
  const value = name.slice(prefix.length, -'.backup'.length);
  const separator = value.lastIndexOf('.');
  return separator === -1 ? value : value.slice(0, separator).replace(/-(\d\d)-(\d\d)T(\d\d)-(\d\d)-(\d\d)\.(\d{3})Z$/, '-$1-$2T$3:$4:$5.$6Z');
}
async function readOptional(file: string): Promise<Buffer> {
  try { return await readFile(file); } catch (error) { if (isMissing(error)) return Buffer.alloc(0); throw error; }
}
function isMissing(error: unknown): boolean { return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'; }
function isAlreadyExists(error: unknown): boolean { return typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST'; }
