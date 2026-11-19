import { access } from 'node:fs/promises';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FileLock } from '../src/core/fileLock';
import { PortwiseError } from '../src/core/errors';
import { temporaryDirectory } from './helpers/temporaryDirectory';

describe('FileLock', () => {
  it('rejects a concurrent lock and removes the lock on dispose', async () => {
    const directory = await temporaryDirectory('portwise-lock');
    const lockPath = path.join(directory.path, 'switch.lock');
    try {
      const lock = await FileLock.acquire(lockPath);
      await expect(FileLock.acquire(lockPath)).rejects.toBeInstanceOf(PortwiseError);
      await lock.dispose();
      await expect(access(lockPath)).rejects.toThrow();
    } finally {
      await directory.dispose();
    }
  });
});
