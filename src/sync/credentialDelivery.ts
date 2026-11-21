import { readFile } from 'node:fs/promises';
import { atomicWrite } from '../core/atomicWrite';
import { PortwiseError } from '../core/errors';
import { createBackup } from './backups';
import { checkedCodexTarget } from '../core/paths';
import { withConfigOperation } from './configOperation';

const TOKEN_KEY = 'PORTWISE_GATEWAY_TOKEN';

export interface CredentialDeliveryResult {
  permissionsEnforced?: boolean;
  restartRequired: true;
}

/** Writes only Portwise's local token delivery variable; it never handles upstream tokens. */
export async function deliverGatewayToken(codexHome: string, gatewayToken: string, backupDirectory: string): Promise<CredentialDeliveryResult> {
  return withConfigOperation(codexHome, () => deliverLocked(codexHome, gatewayToken, backupDirectory));
}

async function deliverLocked(codexHome: string, gatewayToken: string, backupDirectory: string): Promise<CredentialDeliveryResult> {
  const target = await checkedCodexTarget(codexHome, '.env');
  const envPath = target.file;
  const before = await readOptionalText(envPath);
  const after = replaceEnvironmentValue(before, TOKEN_KEY, gatewayToken);
  // A no-op performs no filesystem/ACL mutation and makes no new permission claim.
  if (before === after) return { restartRequired: true };
  await createBackup(envPath, backupDirectory);
  await atomicWrite(envPath, after, { mode: 0o600, beforeRename: target.recheck });
  // Both backup and atomic helper secured and verified their empty files BEFORE bytes.
  return { permissionsEnforced: true, restartRequired: true };
}

export function replaceEnvironmentValue(source: string, key: string, value: string): string {
  if (!/^[A-Z][A-Z0-9_]*$/.test(key) || value.includes('\r') || value.includes('\n')) {
    throw new CredentialDeliveryError('Gateway credential delivery input is invalid.');
  }
  const lines = source.split(/(\r?\n)/);
  let replaced = false;
  const result = lines.map((line, index) => {
    if (index % 2 === 0 && new RegExp(`^\\s*${key}=`).test(line)) {
      if (replaced) throw new CredentialDeliveryError(`.env contains duplicate ${key} entries.`);
      replaced = true;
      const prefix = line.slice(0, line.indexOf('=') + 1);
      return `${prefix}${value}`;
    }
    return line;
  });
  if (replaced) return result.join('');
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  return `${source}${source === '' || source.endsWith('\n') ? '' : eol}${key}=${value}${eol}`;
}

async function readOptionalText(file: string): Promise<string> {
  try { return await readFile(file, 'utf8'); } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') return '';
    throw error;
  }
}

export class CredentialDeliveryError extends PortwiseError {
  constructor(message: string) { super(message, 'credential_delivery_failed'); this.name = 'CredentialDeliveryError'; }
}
