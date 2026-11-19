import { copyFile, mkdir, open, rename, rm } from 'node:fs/promises';
import * as path from 'node:path';
import { AtomicWriteError } from './errors';

export interface AtomicWriteOptions {
  backupPath?: string;
  mode?: number;
  beforeRename?: () => Promise<void> | void;
}

/** Writes a complete replacement in the target directory, preserving a requested backup. */
export async function atomicWrite(target: string, contents: string | Uint8Array, options: AtomicWriteOptions = {}): Promise<void> {
  const directory = path.dirname(target);
  const temporary = path.join(directory, `.${path.basename(target)}.${process.pid}.${Date.now()}.tmp`);
  let renamed = false;
  try {
    await mkdir(directory, { recursive: true });
    if (options.backupPath !== undefined) {
      await copyFile(target, options.backupPath);
    }
    const temporaryFile = await open(temporary, 'w', options.mode ?? 0o600);
    try {
      await temporaryFile.writeFile(contents, typeof contents === 'string' ? 'utf8' : undefined);
      await temporaryFile.sync();
    } finally {
      await temporaryFile.close();
    }
    await options.beforeRename?.();
    await rename(temporary, target);
    renamed = true;
  } catch (error) {
    if (renamed && options.backupPath !== undefined) {
      await copyFile(options.backupPath, target);
    }
    throw new AtomicWriteError(`Could not safely write ${path.basename(target)}: ${error instanceof Error ? error.message : 'unknown error'}`);
  } finally {
    await rm(temporary, { force: true });
  }
}
