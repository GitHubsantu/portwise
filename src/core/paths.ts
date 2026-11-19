import * as path from 'node:path';

export class InvalidCodexHomeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidCodexHomeError';
  }
}

export interface PathEnv {
  /** Value of the portwise.codexHome setting (machine scope). */
  configured: string | undefined;
  /** process.env.CODEX_HOME */
  envCodexHome: string | undefined;
  /** os.homedir() */
  homedir: string;
}

/**
 * Resolve the Codex home directory.
 * Order: setting > CODEX_HOME > ~/.codex.
 * Pure: no filesystem access, so it is trivially testable on any OS.
 */
export function resolveCodexHome(env: PathEnv): string {
  const raw = firstNonEmpty(env.configured, env.envCodexHome);
  if (raw === undefined) return path.join(env.homedir, '.codex');

  if (raw.includes('\0')) throw new InvalidCodexHomeError('Codex home contains a null byte.');

  const expanded = expandHome(raw, env.homedir);
  if (!path.isAbsolute(expanded)) {
    throw new InvalidCodexHomeError(`Codex home must be an absolute path, got "${raw}".`);
  }
  return path.normalize(expanded);
}

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

function expandHome(value: string, homedir: string): string {
  if (value === '~') return homedir;
  if (value.startsWith('~/') || value.startsWith('~\\')) return path.join(homedir, value.slice(2));
  return value;
}
