import { timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolveCodexFile } from '../core/paths';
import type { AccountPanelState } from '../shared/protocol';
import { AccountError, type AccountStore } from './accountStore';
import { AccountSwitcher } from './accountSwitcher';

interface MatchOptions { readAuth?: (file: string) => Promise<Buffer>; }

/** Exact saved-file equality at refresh time, never a claim about remote account identity. */
export async function currentAccounts(home: string, store: AccountStore, options: MatchOptions = {}): Promise<AccountPanelState> {
  const accounts = store.list(home).map(({ id, name }) => ({ id, name, isCurrent: false }));
  try {
    await new AccountSwitcher({ codexHome: home, store }).credentialStore();
  } catch (error) {
    return { accounts, accountMatchAvailability: error instanceof AccountError && error.code === 'credential_store_unsupported' ? 'unsupported' : 'unavailable' };
  }
  let current: Buffer | undefined;
  try {
    const file = await resolveCodexFile(home, 'auth.json');
    current = await (options.readAuth ?? readFile)(file);
    const parsed: unknown = JSON.parse(current.toString('utf8'));
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return { accounts, accountMatchAvailability: 'unavailable' };
    const matched = [];
    for (const account of accounts) {
      const snapshot = Buffer.from(await store.snapshot(account.id), 'utf8');
      try {
        const isCurrent = current.length === snapshot.length && timingSafeEqual(current, snapshot);
        matched.push({ id: account.id, name: account.name, isCurrent });
      } finally { snapshot.fill(0); }
    }
    return { accounts: matched, accountMatchAvailability: 'available' };
  } catch {
    // Raw parse/I/O exceptions can contain credential bytes. Return only a fixed availability flag.
    return { accounts, accountMatchAvailability: 'unavailable' };
  } finally { current?.fill(0); }
}
