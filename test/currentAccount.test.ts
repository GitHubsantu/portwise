import { readFile, rm, symlink, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { AccountStore } from '../src/accounts/accountStore';
import { currentAccounts } from '../src/accounts/currentAccount';
import { temporaryDirectory } from './helpers/temporaryDirectory';

const FAKE = '{"token":"test-current-credential-0000"}\n';
async function setup() {
  const directory = await temporaryDirectory('portwise-current-account');
  await writeFile(path.join(directory.path, 'config.toml'), 'cli_auth_credentials_store = "file"\n');
  await writeFile(path.join(directory.path, 'auth.json'), FAKE);
  const values = new Map<string, unknown>(); const secretValues = new Map<string, string>();
  const state = { get: <T>(key: string) => values.get(key) as T | undefined, update: async (key: string, value: unknown) => { values.set(key, value); } };
  const secrets = { get: vi.fn(async (key: string) => secretValues.get(key)), store: async (key: string, value: string) => { secretValues.set(key, value); }, delete: async (key: string) => { secretValues.delete(key); } };
  const store = new AccountStore(state, secrets);
  await store.capture('Fake account', directory.path, FAKE);
  return { directory, values, secrets, secretValues, store };
}

describe('current account matching', () => {
  it.each([2, 3])('marks no account Current when %s snapshots match exactly', async (count) => {
    const fixture = await setup();
    try {
      for (let index = 1; index < count; index++) await fixture.store.capture(`Duplicate ${index}`, fixture.directory.path, FAKE);
      const current = await currentAccounts(fixture.directory.path, fixture.store);
      expect(current.accountMatchAvailability).toBe('ambiguous');
      expect(current.accounts.filter((account) => account.isCurrent)).toHaveLength(0);
      expect(current.accounts).toHaveLength(count);
    } finally { await fixture.directory.dispose(); }
  });
  it('returns exactly display fields, compares only in memory, and never persists credentials or hashes', async () => {
    const fixture = await setup();
    try {
      const before = JSON.stringify([...fixture.values]); const secretBefore = [...fixture.secretValues];
      const current = await currentAccounts(fixture.directory.path, fixture.store);
      expect(current.accountMatchAvailability).toBe('available'); expect(current.accounts[0]?.isCurrent).toBe(true);
      expect(Object.keys(current.accounts[0] ?? {}).sort()).toEqual(['id', 'isCurrent', 'name']);
      expect(JSON.stringify(current)).not.toContain('test-current-credential-0000');
      expect(JSON.stringify([...fixture.values])).toBe(before); expect([...fixture.secretValues]).toEqual(secretBefore);
      expect(await readFile(path.join(fixture.directory.path, 'auth.json'), 'utf8')).toBe(FAKE);
    } finally { await fixture.directory.dispose(); }
  });

  it.each(['{"token":"test-current-credential-1111"}\n', '{"token":"short"}', FAKE.trim()])('does not guess identity after credential or byte changes: %s', async (auth) => {
    const fixture = await setup();
    try {
      await writeFile(path.join(fixture.directory.path, 'auth.json'), auth);
      const current = await currentAccounts(fixture.directory.path, fixture.store);
      expect(current.accountMatchAvailability).toBe('available'); expect(current.accounts.every((account) => !account.isCurrent)).toBe(true);
    } finally { await fixture.directory.dispose(); }
  });

  it.each(['keyring', 'auto', 'ephemeral', 'missing'])('silently skips %s with no auth or SecretStorage read', async (mode) => {
    const fixture = await setup();
    try {
      await writeFile(path.join(fixture.directory.path, 'config.toml'), mode === 'missing' ? '' : `cli_auth_credentials_store = "${mode}"\n`);
      const readAuth = vi.fn(async () => { throw new Error('must not read credentials'); });
      const current = await currentAccounts(fixture.directory.path, fixture.store, { readAuth });
      expect(current.accountMatchAvailability).toBe('unsupported'); expect(readAuth).not.toHaveBeenCalled(); expect(fixture.secrets.get).not.toHaveBeenCalled();
      expect(current.accounts.every((account) => !account.isCurrent)).toBe(true);
    } finally { await fixture.directory.dispose(); }
  });

  it.each(['missing', 'invalid', 'symlink'])('fails closed on %s auth with no credential details in its result', async (mode) => {
    const fixture = await setup(); const auth = path.join(fixture.directory.path, 'auth.json');
    try {
      await rm(auth);
      if (mode === 'invalid') await writeFile(auth, '{"token":"test-invalid-credential-0000"');
      if (mode === 'symlink') await symlink(path.join(fixture.directory.path, 'outside-auth.json'), auth);
      const readAuth = vi.fn(async (file: string) => readFile(file));
      const current = await currentAccounts(fixture.directory.path, fixture.store, { readAuth });
      expect(current.accountMatchAvailability).toBe('unavailable'); expect(current.accounts.every((account) => !account.isCurrent)).toBe(true);
      expect(JSON.stringify(current)).not.toMatch(/credential-0000|token|snapshot|hash/);
      if (mode === 'symlink') expect(readAuth).not.toHaveBeenCalled();
    } finally { await fixture.directory.dispose(); }
  });
});
