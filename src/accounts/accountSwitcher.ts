import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { parse } from 'toml';
import { atomicWrite } from '../core/atomicWrite';
import { AccountError, type AccountStore } from './accountStore';
import { FileLock } from '../core/fileLock';

export type SwitchStep = 'beforeLock' | 'beforeBackup' | 'beforeWrite' | 'beforeVerify' | 'beforeRestart';
export interface AccountSwitcherOptions { codexHome: string; store: AccountStore; failAt?: (step: SwitchStep) => Promise<void>; }

/** Restricts account switching to the documented file credential store. */
export class AccountSwitcher {
  private readonly authPath: string;
  private readonly configPath: string;
  constructor(private readonly options: AccountSwitcherOptions) { this.authPath = path.join(options.codexHome, 'auth.json'); this.configPath = path.join(options.codexHome, 'config.toml'); }

  async captureCurrent(name: string): Promise<void> {
    await this.requireFileStore();
    const auth = await this.readVerifiedAuth();
    await this.options.store.capture(name, this.options.codexHome, auth);
  }

  async switchTo(id: string, restart: () => Promise<void>): Promise<void> {
    await this.requireFileStore();
    const next = await this.options.store.snapshot(id);
    parseAuth(next);
    await this.step('beforeLock');
    const lock = await FileLock.acquire(path.join(this.options.codexHome, '.portwise-auth.lock'));
    try {
      const current = await this.readVerifiedAuth();
      await this.step('beforeBackup');
      const backup = await this.options.store.backup(this.options.codexHome, current);
      try {
        await this.step('beforeWrite');
        await atomicWrite(this.authPath, next, { mode: 0o600 });
        await this.step('beforeVerify');
        const written = await this.readVerifiedAuth();
        if (written !== next) throw new AccountError('auth.json verification failed after switching accounts.', 'account_write_verification_failed');
        await this.step('beforeRestart');
        await restart();
      } catch (error) {
        await atomicWrite(this.authPath, await this.options.store.backupContents(backup), { mode: 0o600 });
        throw error;
      }
    } finally { await lock.dispose(); }
  }

  async credentialStore(): Promise<'file'> {
    const config = await optionalText(this.configPath);
    let parsed: unknown;
    try { parsed = parse(config); } catch { throw new AccountError('config.toml cannot be parsed to determine the Codex credential store.', 'credential_store_invalid'); }
    if (!isFileStore(parsed)) throw new AccountError('Account switching supports only Codex credentials stored in auth.json. This Codex home uses an OS keyring, automatic, ephemeral, or unknown credential store; use the official Codex login flow instead.', 'credential_store_unsupported');
    return 'file';
  }

  private async requireFileStore(): Promise<void> { await this.credentialStore(); }
  private async readVerifiedAuth(): Promise<string> { const auth = await readFile(this.authPath, 'utf8'); parseAuth(auth); return auth; }
  private async step(step: SwitchStep): Promise<void> { await this.options.failAt?.(step); }
}

function isFileStore(value: unknown): boolean { return typeof value === 'object' && value !== null && (value as Record<string, unknown>)['cli_auth_credentials_store'] === 'file'; }
function parseAuth(value: string): void { try { const parsed: unknown = JSON.parse(value); if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('not object'); } catch { throw new AccountError('auth.json is invalid. Use the official Codex login flow to repair it.', 'auth_json_invalid'); } }
async function optionalText(file: string): Promise<string> { try { return await readFile(file, 'utf8'); } catch (error) { if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') return ''; throw error; } }
