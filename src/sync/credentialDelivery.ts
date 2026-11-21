import { chmod, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { atomicWrite } from '../core/atomicWrite';
import { PortwiseError } from '../core/errors';
import { createBackup } from './backups';
import { checkedCodexTarget } from '../core/paths';

const TOKEN_KEY = 'PORTWISE_GATEWAY_TOKEN';

export interface CredentialDeliveryResult {
  permissionsEnforced: boolean;
  restartRequired: true;
}

/** Writes only Portwise's local token delivery variable; it never handles upstream tokens. */
export async function deliverGatewayToken(codexHome: string, gatewayToken: string, backupDirectory: string, platform = process.platform): Promise<CredentialDeliveryResult> {
  const target = await checkedCodexTarget(codexHome, '.env');
  const envPath = target.file;
  const before = await readOptionalText(envPath);
  const after = replaceEnvironmentValue(before, TOKEN_KEY, gatewayToken);
  await createBackup(envPath, backupDirectory);
  await atomicWrite(envPath, after, { mode: 0o600, beforeRename: target.recheck });
  const permissionsEnforced = await restrictPermissions(envPath, platform);
  return { permissionsEnforced, restartRequired: true };
}

export function replaceEnvironmentValue(source: string, key: string, value: string): string {
  if (!/^[A-Z][A-Z0-9_]*$/.test(key) || value.includes('\r') || value.includes('\n')) {
    throw new CredentialDeliveryError('Gateway credential delivery input is invalid.');
  }
  const lines = source === '' ? [] : source.split(/\r?\n/);
  let replaced = false;
  const result = lines.map((line) => {
    if (new RegExp(`^\\s*${key}=`).test(line)) {
      if (replaced) throw new CredentialDeliveryError(`.env contains duplicate ${key} entries.`);
      replaced = true;
      return `${key}=${value}`;
    }
    return line;
  });
  if (!replaced) result.push(`${key}=${value}`);
  return `${result.join('\n').replace(/\n+$/, '')}\n`;
}

async function restrictPermissions(file: string, platform: NodeJS.Platform): Promise<boolean> {
  if (platform !== 'win32') {
    await chmod(file, 0o600);
    return true;
  }
  return new Promise((resolve) => {
    const child = spawn('icacls', [file, '/inheritance:r', '/grant:r', `${process.env['USERNAME'] ?? 'Users'}:F`], { windowsHide: true, shell: false, stdio: 'ignore' });
    child.once('error', () => resolve(false));
    child.once('exit', (code) => resolve(code === 0));
  });
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
