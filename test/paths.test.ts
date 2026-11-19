import * as path from 'node:path';
import { mkdir, symlink } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { PathValidationError } from '../src/core/errors';
import { InvalidCodexHomeError, resolveCodexFile, resolveCodexHome } from '../src/core/paths';
import { temporaryDirectory } from './helpers/temporaryDirectory';

const home = path.resolve('/home/tester');

describe('resolveCodexHome', () => {
  it('defaults to ~/.codex', () => {
    expect(resolveCodexHome({ configured: undefined, envCodexHome: undefined, homedir: home })).toBe(
      path.join(home, '.codex'),
    );
  });

  it('prefers the setting over CODEX_HOME', () => {
    const configured = path.resolve('/custom/codex');
    const env = path.resolve('/env/codex');
    expect(resolveCodexHome({ configured, envCodexHome: env, homedir: home })).toBe(configured);
  });

  it('falls back to CODEX_HOME when the setting is blank', () => {
    const env = path.resolve('/env/codex');
    expect(resolveCodexHome({ configured: '  ', envCodexHome: env, homedir: home })).toBe(env);
  });

  it('expands a leading ~', () => {
    expect(resolveCodexHome({ configured: '~/work/codex', envCodexHome: undefined, homedir: home })).toBe(
      path.join(home, 'work', 'codex'),
    );
  });

  it('rejects relative paths', () => {
    expect(() =>
      resolveCodexHome({ configured: 'relative/dir', envCodexHome: undefined, homedir: home }),
    ).toThrow(InvalidCodexHomeError);
  });

  it('rejects null bytes', () => {
    expect(() =>
      resolveCodexHome({ configured: '/tmp/a\0b', envCodexHome: undefined, homedir: home }),
    ).toThrow(InvalidCodexHomeError);
  });

  it('rejects traversal outside a real Codex home', async () => {
    const directory = await temporaryDirectory('portwise-paths');
    try {
      const codexHome = path.join(directory.path, '.codex');
      await mkdir(codexHome);
      await expect(resolveCodexFile(codexHome, '../auth.json')).rejects.toBeInstanceOf(PathValidationError);
    } finally {
      await directory.dispose();
    }
  });

  it('rejects a symbolic-link credential file', async () => {
    const directory = await temporaryDirectory('portwise-symlink');
    try {
      const codexHome = path.join(directory.path, '.codex');
      await mkdir(codexHome);
      await symlink(path.join(directory.path, 'outside-auth.json'), path.join(codexHome, 'auth.json'));
      await expect(resolveCodexFile(codexHome, 'auth.json')).rejects.toBeInstanceOf(PathValidationError);
    } finally {
      await directory.dispose();
    }
  });
});
