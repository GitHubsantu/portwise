import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { PortwiseError } from '../core/errors';
import type { KeyValueStore, SecretStore } from '../profiles/models';

const ACCOUNTS_KEY = 'portwise.accounts';
const BACKUPS_KEY = 'portwise.accountBackups';
const MAX_NAME_LENGTH = 80;
const MAX_BACKUPS = 10;

export interface AccountMetadata { id: string; name: string; home: string; createdAt: string; }
export interface AccountBackup { key: string; createdAt: string; home: string; }

/** Stores credential snapshots and switch backups only in SecretStorage. */
export class AccountStore {
  constructor(private readonly state: KeyValueStore, private readonly secrets: SecretStore, private readonly createId: () => string = randomUUID, private readonly now: () => string = () => new Date().toISOString()) {}

  list(home: string): AccountMetadata[] { return this.accounts().filter((account) => account.home === home); }

  async capture(nameInput: string, home: string, auth: string): Promise<AccountMetadata> {
    const name = accountName(nameInput);
    const accounts = this.accounts();
    if (accounts.some((account) => account.home === home && account.name.localeCompare(name, undefined, { sensitivity: 'accent' }) === 0)) throw new AccountError('An account with that name already exists for this Codex home.', 'account_name_duplicate');
    const account: AccountMetadata = { id: this.createId(), name, home, createdAt: this.now() };
    await this.secrets.store(accountKey(account.id), auth);
    try { await this.state.update(ACCOUNTS_KEY, [...accounts, account]); }
    catch (error) { await this.secrets.delete(accountKey(account.id)); throw error; }
    return account;
  }

  async snapshot(id: string): Promise<string> {
    this.find(id);
    const value = await this.secrets.get(accountKey(id));
    if (!value) throw new AccountError('The saved account credential snapshot is missing. Add this account again through Codex login.', 'account_snapshot_missing');
    return value;
  }

  async backup(home: string, auth: string): Promise<AccountBackup> {
    const backup: AccountBackup = { home, createdAt: this.now(), key: `portwise.account-backup.${homeId(home)}.${this.createId()}` };
    await this.secrets.store(backup.key, auth);
    const current = this.backups();
    const retained = [...current, backup].filter((item) => item.home === home).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    const discarded = retained.slice(MAX_BACKUPS);
    const keep = new Set(retained.slice(0, MAX_BACKUPS).map((item) => item.key));
    try {
      await this.state.update(BACKUPS_KEY, [...current.filter((item) => item.home !== home), ...retained.filter((item) => keep.has(item.key))]);
    } catch (error) { await this.secrets.delete(backup.key); throw error; }
    await Promise.all(discarded.map(async (item) => this.secrets.delete(item.key)));
    return backup;
  }

  async backupContents(backup: AccountBackup): Promise<string> {
    const value = await this.secrets.get(backup.key);
    if (!value) throw new AccountError('The rollback credential backup is missing.', 'account_backup_missing');
    return value;
  }

  async remove(id: string): Promise<void> {
    this.find(id);
    const snapshot = await this.snapshot(id);
    await this.secrets.delete(accountKey(id));
    try { await this.state.update(ACCOUNTS_KEY, this.accounts().filter((item) => item.id !== id)); }
    catch (error) { await this.secrets.store(accountKey(id), snapshot); throw error; }
  }

  private accounts(): AccountMetadata[] { return validated(this.state.get<unknown>(ACCOUNTS_KEY), isAccount); }
  private backups(): AccountBackup[] { return validated(this.state.get<unknown>(BACKUPS_KEY), isBackup); }
  private find(id: string): AccountMetadata { const account = this.accounts().find((item) => item.id === id); if (!account) throw new AccountError('Account profile was not found.', 'account_not_found'); return account; }
}

export class AccountError extends PortwiseError { constructor(message: string, code: string) { super(message, code); this.name = 'AccountError'; } }
function accountKey(id: string): string { return `portwise.account.${id}`; }
function homeId(home: string): string { return createHash('sha256').update(home).digest('hex').slice(0, 24); }
function accountName(input: string): string { const name = input.trim(); if (!name) throw new AccountError('Account name is required.', 'account_name_required'); if (name.length > MAX_NAME_LENGTH) throw new AccountError(`Account name must be ${MAX_NAME_LENGTH} characters or fewer.`, 'account_name_too_long'); return name; }
function validated<T>(value: unknown, guard: (item: unknown) => item is T): T[] { if (value === undefined) return []; if (!Array.isArray(value) || !value.every(guard)) throw new AccountError('Saved account metadata is invalid.', 'account_metadata_invalid'); return value; }
function isAccount(value: unknown): value is AccountMetadata { return typeof value === 'object' && value !== null && typeof (value as AccountMetadata).id === 'string' && typeof (value as AccountMetadata).name === 'string' && typeof (value as AccountMetadata).home === 'string' && typeof (value as AccountMetadata).createdAt === 'string'; }
function isBackup(value: unknown): value is AccountBackup { return typeof value === 'object' && value !== null && typeof (value as AccountBackup).key === 'string' && typeof (value as AccountBackup).home === 'string' && typeof (value as AccountBackup).createdAt === 'string'; }
