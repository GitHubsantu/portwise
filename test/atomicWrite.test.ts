import { readFile, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { atomicWrite } from '../src/core/atomicWrite';
import { AtomicWriteError } from '../src/core/errors';
import { temporaryDirectory } from './helpers/temporaryDirectory';

describe('atomicWrite', () => {
  it('replaces the target and keeps an exact backup', async () => {
    const directory = await temporaryDirectory('portwise-atomic-write');
    try {
      const target = path.join(directory.path, 'config.toml');
      const backup = path.join(directory.path, 'config.toml.bak');
      await writeFile(target, 'before', 'utf8');

      await atomicWrite(target, 'after', { backupPath: backup });

      await expect(readFile(target, 'utf8')).resolves.toBe('after');
      await expect(readFile(backup, 'utf8')).resolves.toBe('before');
    } finally {
      await directory.dispose();
    }
  });

  it('leaves the original target untouched when a pre-rename failure is injected', async () => {
    const directory = await temporaryDirectory('portwise-atomic-failure');
    try {
      const target = path.join(directory.path, 'auth.json');
      await writeFile(target, 'before', 'utf8');

      await expect(
        atomicWrite(target, 'after', {
          beforeRename: () => {
            throw new Error('injected failure');
          },
        }),
      ).rejects.toBeInstanceOf(AtomicWriteError);

      await expect(readFile(target, 'utf8')).resolves.toBe('before');
    } finally {
      await directory.dispose();
    }
  });
});
