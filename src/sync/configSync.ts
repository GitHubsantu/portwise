import { isDeepStrictEqual } from 'node:util';
import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { parse } from 'toml';
import { atomicWrite } from '../core/atomicWrite';
import { PortwiseError } from '../core/errors';
import { createBackup, listBackups, type BackupEntry, type BackupLocation } from './backups';
import { checkedCodexTarget, resolveCodexFile } from '../core/paths';
import { withConfigOperation } from './configOperation';
import { checkAtomicWritePath } from '../core/permissionPath';

const START = '# >>> portwise managed >>>';
const END = '# <<< portwise managed <<<';
const TABLE = '[model_providers.portwise]';

export interface ConfigSyncOptions {
  codexHome: string;
  backupDirectory: BackupLocation;
  gatewayBaseUrl: string;
}

interface TomlTable { [key: string]: TomlValue; }
type TomlValue = string | number | boolean | bigint | Date | TomlTable | TomlValue[];

/** Preserves user TOML bytes while owning only an explicitly delimited provider table. */
export class ConfigSync {
  private readonly configPath: string;

  constructor(private readonly options: ConfigSyncOptions) {
    this.configPath = path.join(options.codexHome, 'config.toml');
  }

  async sync(): Promise<void> {
    return withConfigOperation(this.options.codexHome, () => this.syncLocked());
  }

  private async syncLocked(): Promise<void> {
    const target = await checkedCodexTarget(this.options.codexHome, 'config.toml');
    const original = await readOptional(this.configPath);
    const source = original.toString('utf8');
    const originalParsed = parseToml(source, 'before editing');
    const unmanaged = removeManagedBlock(source);
    const unmanagedParsed = parseToml(unmanaged, 'outside the managed block');
    if (hasPortwiseProvider(unmanagedParsed)) {
      throw new ConfigSyncError('config.toml already defines model_providers.portwise outside Portwise management. Rename it before syncing.');
    }

    const candidate = upsertManagedBlock(source, managedBlock(this.options.gatewayBaseUrl));
    const candidateParsed = parseToml(candidate, 'after editing');
    if (!isDeepStrictEqual(removeProvider(candidateParsed), removeProvider(originalParsed))) {
      throw new ConfigSyncError('Portwise refused to write config.toml because unrelated TOML values would change.');
    }

    if (original.equals(Buffer.from(candidate, 'utf8'))) return;
    await checkAtomicWritePath(target.file);
    const backup = await createBackup(this.configPath, this.options.backupDirectory);
    let writtenByUs = false;
    try {
      await atomicWrite(target.file, candidate, { mode: 0o600, beforeRename: target.recheck });
      writtenByUs = true;
      const written = await readFile(this.configPath, 'utf8');
      const writtenParsed = parseToml(written, 'after writing');
      if (written !== candidate || !isDeepStrictEqual(removeProvider(writtenParsed), removeProvider(originalParsed))) {
        throw new ConfigSyncError('Portwise could not verify the config.toml update.');
      }
    } catch (error) {
      if (!writtenByUs) throw error;
      const rollback = await checkedCodexTarget(this.options.codexHome, 'config.toml');
      if ((await readFile(rollback.file, 'utf8')) !== candidate) throw new ConfigSyncError('config.toml changed after the write. Portwise preserved the external edit; inspect the retained backup before restoring.');
      await atomicWrite(rollback.file, await readFile(backup.file), { mode: 0o600, beforeRename: rollback.recheck });
      throw error;
    }
  }

  async backups(): Promise<BackupEntry[]> { return listBackups(this.configPath, this.options.backupDirectory); }

  async restore(backup?: BackupEntry): Promise<void> {
    return withConfigOperation(this.options.codexHome, () => this.restoreLocked(backup));
  }

  private async restoreLocked(backup?: BackupEntry): Promise<void> {
    const target = await checkedCodexTarget(this.options.codexHome, 'config.toml');
    const selected = backup ?? (await this.backups()).at(0);
    if (!selected) throw new ConfigSyncError('No Portwise config backup is available to restore.');
    const available = await this.backups();
    if (!available.some((entry) => entry.file === selected.file)) throw new ConfigSyncError('The selected backup is not available for this Codex home.');
    const selectedFile = await resolveCodexFile(path.dirname(selected.file), path.basename(selected.file));
    const bytes = await readFile(selectedFile);
    parseToml(bytes.toString('utf8'), 'in the selected backup');
    await checkAtomicWritePath(target.file);
    await createBackup(this.configPath, this.options.backupDirectory);
    await atomicWrite(target.file, bytes, { mode: 0o600, beforeRename: target.recheck });
    if (!(await readFile(target.file)).equals(bytes)) throw new ConfigSyncError('Portwise could not verify the restored config.toml.');
  }

  async switchToPortwise(): Promise<void> {
    return withConfigOperation(this.options.codexHome, () => this.switchLocked());
  }

  private async switchLocked(): Promise<void> {
    const target = await checkedCodexTarget(this.options.codexHome, 'config.toml');
    const original = await readOptional(this.configPath);
    const source = original.toString('utf8');
    const parsed = parseToml(source, 'before changing model_provider');
    const firstHeader = source.search(/^\s*\[/m);
    const root = firstHeader === -1 ? source : source.slice(0, firstHeader);
    const remainder = firstHeader === -1 ? '' : source.slice(firstHeader);
    const replacementRoot = root.match(/^model_provider\s*=.*$/m)
      ? root.replace(/^model_provider\s*=.*$/m, 'model_provider = "portwise"')
      : `model_provider = "portwise"\n${root}`;
    const replacement = `${replacementRoot}${remainder}`;
    const next = parseToml(replacement, 'after changing model_provider');
    const beforeWithout = structuredClone(parsed); delete beforeWithout['model_provider'];
    const afterWithout = structuredClone(next); delete afterWithout['model_provider'];
    if (!isDeepStrictEqual(beforeWithout, afterWithout)) throw new ConfigSyncError('Portwise refused to change model_provider because other TOML values changed.');
    await checkAtomicWritePath(target.file);
    const backup = await createBackup(this.configPath, this.options.backupDirectory);
    let writtenByUs = false;
    try {
      await atomicWrite(target.file, replacement, { mode: 0o600, beforeRename: target.recheck });
      writtenByUs = true;
      const written = await readFile(this.configPath, 'utf8');
      const verified = parseToml(written, 'after changing model_provider');
      const verifiedWithout = structuredClone(verified); delete verifiedWithout['model_provider'];
      if (written !== replacement || !isDeepStrictEqual(beforeWithout, verifiedWithout)) {
        throw new ConfigSyncError('Portwise could not verify the model_provider update.');
      }
    } catch (error) {
      if (!writtenByUs) throw error;
      const rollback = await checkedCodexTarget(this.options.codexHome, 'config.toml');
      if ((await readFile(rollback.file, 'utf8')) !== replacement) throw new ConfigSyncError('config.toml changed after the write. Portwise preserved the external edit; inspect the retained backup before restoring.');
      await atomicWrite(rollback.file, await readFile(backup.file), { mode: 0o600, beforeRename: rollback.recheck });
      throw error;
    }
  }

}

export class ConfigSyncError extends PortwiseError {
  constructor(message: string) { super(message, 'config_sync_failed'); this.name = 'ConfigSyncError'; }
}

function parseToml(source: string, stage: string): TomlTable {
  try {
    const parsed: unknown = parse(source);
    if (!isTomlTable(parsed)) throw new ConfigSyncError(`config.toml is not a TOML table ${stage}.`);
    return parsed;
  } catch (error) {
    if (error instanceof ConfigSyncError) throw error;
    throw new ConfigSyncError(`config.toml could not be parsed ${stage}. Repair its TOML syntax or restore a known-good backup, then retry.`);
  }
}

function removeManagedBlock(source: string): string {
  const start = source.indexOf(START);
  const end = source.indexOf(END);
  if (start === -1 && end === -1) return source;
  if (start === -1 || end === -1 || end < start || source.indexOf(START, start + START.length) !== -1 || source.indexOf(END, end + END.length) !== -1) {
    throw new ConfigSyncError('Portwise managed markers in config.toml are malformed. Restore a backup before syncing.');
  }
  const afterEnd = end + END.length;
  const trailingNewline = source.slice(afterEnd).startsWith('\r\n') ? 2 : source.slice(afterEnd).startsWith('\n') ? 1 : 0;
  return source.slice(0, start) + source.slice(afterEnd + trailingNewline);
}

function appendManagedBlock(source: string, block: string): string {
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  const prefix = source.length === 0 || source.endsWith('\n') ? source : `${source}${eol}`;
  return `${prefix}${prefix.length === 0 || prefix.endsWith(eol + eol) ? '' : eol}${block.replaceAll('\n', eol)}`;
}

/** Replace the validated owned span in place, preserving every surrounding byte. */
function upsertManagedBlock(source: string, block: string): string {
  const start = source.indexOf(START);
  if (start === -1) return appendManagedBlock(source, block);
  const end = source.indexOf(END) + END.length;
  const eol = source.slice(start, end).includes('\r\n') ? '\r\n' : '\n';
  // The old terminal newline belongs to the untouched suffix; avoid adding another.
  const replacement = block.slice(0, -1).replaceAll('\n', eol);
  return source.slice(0, start) + replacement + source.slice(end);
}

function managedBlock(baseUrl: string): string {
  return `${START}\n${TABLE}\nname = "Portwise gateway"\nbase_url = ${JSON.stringify(baseUrl)}\nenv_key = "PORTWISE_GATEWAY_TOKEN"\nwire_api = "responses"\nrequires_openai_auth = false\nsupports_websockets = false\n${END}\n`;
}

function removeProvider(value: TomlTable): TomlTable {
  const clone = structuredClone(value);
  const providers = clone['model_providers'];
  if (isTomlTable(providers)) {
    delete providers['portwise'];
    if (Object.keys(providers).length === 0) delete clone['model_providers'];
  }
  return clone;
}

function hasPortwiseProvider(value: TomlTable): boolean {
  const providers = value['model_providers'];
  return isTomlTable(providers) && Object.hasOwn(providers, 'portwise');
}

function isTomlTable(value: unknown): value is TomlTable {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date);
}

async function readOptional(file: string): Promise<Buffer> {
  try { return await readFile(file); } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') return Buffer.alloc(0);
    throw error;
  }
}
