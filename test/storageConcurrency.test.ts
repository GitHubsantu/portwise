import { describe, expect, it } from 'vitest';
import { ProfileStore } from '../src/profiles/profileStore';
import { AccountStore } from '../src/accounts/accountStore';
import { OperationQueue } from '../src/core/operationQueue';

function memory() {
  const values = new Map<string, unknown>(); const secrets = new Map<string, string>(); let failDelete = false;
  return { values, secrets, setFailDelete: (fail: boolean) => { failDelete = fail; },
    state: { get: <T>(key: string) => values.get(key) as T | undefined, update: async (key: string, value: unknown) => { values.set(key, value); } },
    vault: { get: async (key: string) => secrets.get(key), store: async (key: string, value: string) => { secrets.set(key, value); }, delete: async (key: string) => { if (failDelete) throw new Error('test-opaque-0000'); secrets.delete(key); } },
  };
}
describe('store mutation serialization and retention', () => {
  it('keeps all concurrent providers and serializes edit/toggle/delete without orphaned secrets', async () => {
    const m = memory(); const store = new ProfileStore(m.state, m.vault);
    const providers = await Promise.all(['one', 'two'].map(name => store.create({ name, baseUrl: 'https://provider.invalid/v1', token: 'test-token-0000' })));
    expect(await store.list()).toHaveLength(2); expect(m.secrets.size).toBe(2);
    const first = providers[0]; if (!first) throw new Error('missing provider');
    await Promise.all([store.update(first.id, { name: 'edited', baseUrl: 'https://new.invalid/v1', token: 'test-new-0000' }), store.setEnabled(first.id, false)]);
    expect((await store.list()).find(item => item.id === first.id)).toMatchObject({ name: 'edited', baseUrl: 'https://new.invalid/v1', enabled: false });
    await Promise.all(providers.map(item => store.delete(item.id))); expect(await store.list()).toEqual([]); expect(m.secrets.size).toBe(0);
  });
  it('never pairs a new token with stale provider metadata during an edit', async () => {
    const m = memory(); let unblock: (() => void) | undefined; let announce: (() => void) | undefined;
    const ready = new Promise<void>(resolve => { announce = resolve; }); const gate = new Promise<void>(resolve => { unblock = resolve; });
    const store = new ProfileStore(m.state, { ...m.vault, store: async (key, value) => { await m.vault.store(key, value); if (value === 'test-new-0000') { announce?.(); await gate; } } });
    const original = await store.create({ name: 'one', baseUrl: 'https://old.invalid/v1', token: 'test-old-0000' });
    const editing = store.update(original.id, { name: 'one', baseUrl: 'https://new.invalid/v1', token: 'test-new-0000' }); await ready;
    const connection = store.connection(original.id); unblock?.(); await editing;
    expect(await connection).toEqual({ baseUrl: 'https://new.invalid/v1', token: 'test-new-0000', enabled: true });
  });
  it('retains the newest rollback under equal/backwards clocks and retries failed secret cleanup with its reference intact', async () => {
    const m = memory(); let id = 0; const store = new AccountStore(m.state, m.vault, () => `fake-${++id}`, () => id > 10 ? '2000-01-01T00:00:00Z' : '2026-11-21T00:00:00Z');
    for (let index = 0; index < 10; index++) await store.backup('fake-home', `test-backup-${index}`);
    m.setFailDelete(true);
    await expect(store.backup('fake-home', 'test-latest-0000')).rejects.toMatchObject({ code: 'account_backup_cleanup_failed' });
    const pending = m.values.get('portwise.accountBackups') as Array<{ key: string }>;
    expect(pending).toHaveLength(11); expect(pending.every(item => m.secrets.has(item.key))).toBe(true);
    m.setFailDelete(false); const newest = await store.backup('fake-home', 'test-newest-0000');
    expect(await store.backupContents(newest)).toBe('test-newest-0000'); expect(m.secrets.size).toBe(10);
    expect(m.values.get('portwise.accountBackups')).toHaveLength(10);
    const retained = m.values.get('portwise.accountBackups') as Array<{ key: string }>;
    expect(retained.every(item => m.secrets.has(item.key))).toBe(true);
  });
  it('serializes account captures across different homes and queue failures do not poison later mutations', async () => {
    const m = memory(); const store = new AccountStore(m.state, m.vault);
    await Promise.all(['fake-home-a', 'fake-home-b'].map(home => store.capture('fake', home, '{"token":"test-token-0000"}')));
    expect(store.list('fake-home-a')).toHaveLength(1); expect(store.list('fake-home-b')).toHaveLength(1); expect(m.secrets.size).toBe(2);
    const queue = new OperationQueue();
    await expect(queue.run(async () => { throw new Error('test failure'); })).rejects.toThrow();
    expect(await queue.run(async () => 1)).toBe(1); queue.dispose();
    await expect(queue.run(async () => 2)).rejects.toMatchObject({ code: 'operation_cancelled' });
  });
});
