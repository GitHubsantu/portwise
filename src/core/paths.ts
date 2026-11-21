import * as path from 'node:path';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { PathValidationError } from './errors';

export class InvalidCodexHomeError extends PathValidationError {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidCodexHomeError';
  }
}

/** Resolves a child path and refuses traversal or symbolic-link credential targets (T6). */
export async function resolveCodexFile(codexHome: string, filename: string): Promise<string> {
  if (filename.includes('\0') || path.isAbsolute(filename)) {
    throw new PathValidationError('Codex file name must be a relative path without null bytes.');
  }
  const home = await canonicalCodexHome(codexHome);
  const candidate = path.resolve(home, filename);
  if (candidate !== home && !candidate.startsWith(`${home}${path.sep}`)) {
    throw new PathValidationError('Codex file path must stay inside Codex home.');
  }
  try {
    const metadata = await lstat(candidate);
    if (metadata.isSymbolicLink() || !metadata.isFile()) {
      throw new PathValidationError('Codex credential files must not be symbolic links.');
    }
  } catch (error) {
    if (error instanceof PathValidationError) throw error;
    if (!isMissing(error)) throw error;
  }
  return candidate;
}

/** Canonical paths are shown in consent dialogs; linked home roots are refused. */
export async function canonicalCodexHome(home: string): Promise<string> {
  if (!path.isAbsolute(home) || home.includes('\0')) throw new PathValidationError('Codex home must be an absolute path without null bytes.');
  const metadata = await lstat(home);
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) throw new PathValidationError('Codex home must be a real directory, not a symbolic link or junction.');
  return realpath(home);
}

/** Capture identity before reading and recheck immediately before atomic replacement. */
export async function checkedCodexTarget(home: string, filename: string): Promise<{ file: string; recheck(): Promise<void> }> {
  const canonical = await canonicalCodexHome(home);
  const file = await resolveCodexFile(canonical, filename);
  const identity = async () => {
    try { const stat = await lstat(file); return `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`; }
    catch (error) { if (isMissing(error)) return undefined; throw error; }
  };
  const before = await identity();
  const contents = async () => {
    try { return await readFile(file); } catch (error) { if (isMissing(error)) return undefined; throw error; }
  };
  const beforeBytes = await contents();
  return { file, async recheck() {
    if (await canonicalCodexHome(home) !== canonical || await resolveCodexFile(canonical, filename) !== file || await identity() !== before) {
      throw new PathValidationError('The Codex target changed during this operation. Retry after checking the exact home path.');
    }
    const current = await contents();
    if (beforeBytes === undefined ? current !== undefined : current === undefined || !beforeBytes.equals(current)) {
      throw new PathValidationError('The Codex file was edited during this operation. Portwise left the external edit untouched; retry.');
    }
  } };
}

function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
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
