import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { InvalidCodexHomeError, resolveCodexHome } from '../src/core/paths';

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
});
