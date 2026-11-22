import { lstat, mkdir, readFile, readdir, unlink } from 'node:fs/promises';
import * as path from 'node:path';
import { writePrivateExclusive } from '../core/atomicWrite';
import type { PermissionOptions } from '../core/privateFile';
import { createHash } from 'node:crypto';
import { canonicalCodexHome } from '../core/paths';
import { PathValidationError } from '../core/errors';

const RETENTION = 10;

export interface BackupEntry { file: string; createdAt: string; }
export interface BackupDirectories { current: string; legacy: string; }
export type BackupLocation = string | BackupDirectories;

/** New writes use a compact key; legacy files stay in place and remain readable. */
export async function backupDirectories(storage: string, home: string): Promise<BackupDirectories> {
  const canonical = await canonicalCodexHome(home);
  return {
    current: path.join(storage, 'backups', createHash('sha256').update(canonical, 'utf8').digest('base64url')),
    legacy: path.join(storage, 'backups', Buffer.from(canonical, 'utf8').toString('base64url')),
  };
}

function locations(location: BackupLocation): string[] {
  return typeof location === 'string' ? [location] : [...new Set([location.current, location.legacy])];
}

/** Stores exact pre-write bytes in extension storage and retains the newest ten per target. */
export async function createBackup(target: string, location: BackupLocation, permissions?: PermissionOptions): Promise<BackupEntry> {
  const directory = locations(location)[0]; if (!directory) throw new Error('backup location unavailable');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const source = await readOptional(target);
  const createdAt = new Date().toISOString();
  const base = path.basename(target);
  let sequence = 0;
  const existingNames = new Set((await listBackups(target, location)).map(entry => path.basename(entry.file)));
  for (;;) {
    const file = path.join(directory, `${base}.${createdAt.replaceAll(':', '-')}.${sequence.toString().padStart(4, '0')}.backup`);
    if (existingNames.has(path.basename(file))) { sequence++; continue; }
    try {
      await writePrivateExclusive(file, source, { ...permissions, target: 'backup' });
      await trimBackups(target, location);
      return { file, createdAt };
    } catch (error) {
      if (isAlreadyExists(error)) { sequence += 1; continue; }
      throw error;
    }
  }
}

export async function listBackups(target: string, location: BackupLocation): Promise<BackupEntry[]> {
  const directories = locations(location);
  const lists = await Promise.all(directories.map((directory, index) => listDirectory(target, directory, index > 0)));
  // Stable sort retains current-layout precedence for a legacy timestamp/name collision.
  return lists.flat().sort((a, b) => path.basename(b.file).localeCompare(path.basename(a.file), 'en'));
}

async function listDirectory(target: string, directory: string, legacy: boolean): Promise<BackupEntry[]> {
  try {
    const metadata = await lstat(directory);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) throw new PathValidationError('Portwise backup directories must be real directories, not symbolic links or junctions.');
    const prefix = `${path.basename(target)}.`;
    const files = (await readdir(directory)).filter((name) => name.startsWith(prefix) && name.endsWith('.backup')).sort().reverse();
    return files.map((name) => ({ file: path.join(directory, name), createdAt: timestampFrom(name, prefix) }));
  } catch (error) {
    // An overlong legacy component could never have existed on this filesystem.
    if (isMissing(error) || (legacy && hasCode(error, 'ENAMETOOLONG'))) return [];
    throw error;
  }
}

async function trimBackups(target: string, directory: BackupLocation): Promise<void> {
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
function hasCode(error: unknown, code: string): boolean { return typeof error === 'object' && error !== null && 'code' in error && error.code === code; }
