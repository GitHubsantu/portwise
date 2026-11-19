import { describe, expect, it } from 'vitest';
import { PortwiseError } from '../src/core/errors';
import type { KeyValueStore, SecretStore } from '../src/profiles/models';
import { ProfileStore, PROVIDER_METADATA_KEY, providerSecretKey } from '../src/profiles/profileStore';

const fakeToken = 'test-token-0000';

class MemoryState implements KeyValueStore {
  values = new Map<string, unknown>();
  failUpdate = false;
  get<T>(key: string): T | undefined { return this.values.get(key) as T | undefined; }
  async update(key: string, value: unknown): Promise<void> { if (this.failUpdate) throw new Error('state write failed'); this.values.set(key, value); }
}

class MemorySecrets implements SecretStore {
  values = new Map<string, string>();
  failStore = false;
  failDelete = false;
  async get(key: string): Promise<string | undefined> { return this.values.get(key); }
  async store(key: string, value: string): Promise<void> { if (this.failStore) throw new Error('secret store failed'); this.values.set(key, value); }
  async delete(key: string): Promise<void> { if (this.failDelete) throw new Error('secret delete failed'); this.values.delete(key); }
}

function setup(): { state: MemoryState; secrets: MemorySecrets; store: ProfileStore } {
  const state = new MemoryState();
  const secrets = new MemorySecrets();
  return { state, secrets, store: new ProfileStore(state, secrets, () => 'b3f8e7f3-6e36-4f1c-8f2a-2530f3d4c1c9') };
}

describe('ProfileStore', () => {
  it('stores metadata without token and creates a UUID-backed secret', async () => {
    const { state, secrets, store } = setup();
    const provider = await store.create({ name: '  Local provider ', baseUrl: 'http://localhost:8080/v1', token: fakeToken });
    expect(provider).toMatchObject({ id: 'b3f8e7f3-6e36-4f1c-8f2a-2530f3d4c1c9', name: 'Local provider', tokenMask: '••••••••0000' });
    expect(JSON.stringify(state.values.get(PROVIDER_METADATA_KEY))).not.toContain(fakeToken);
    expect(secrets.values.get(providerSecretKey(provider.id))).toBe(fakeToken);
  });

  it('rejects duplicate and overlong names', async () => {
    const { store } = setup();
    await store.create({ name: 'One', baseUrl: 'https://one.example/v1', token: fakeToken });
    await expect(store.create({ name: ' one ', baseUrl: 'https://two.example/v1', token: fakeToken })).rejects.toMatchObject({ code: 'provider_name_duplicate' });
    await expect(store.create({ name: 'a'.repeat(81), baseUrl: 'https://two.example/v1', token: fakeToken })).rejects.toMatchObject({ code: 'provider_name_too_long' });
  });

  it('keeps the existing token when an edit supplies blank token text', async () => {
    const { secrets, store } = setup();
    const provider = await store.create({ name: 'One', baseUrl: 'https://one.example/v1', token: fakeToken });
    await store.update(provider.id, { name: 'Changed', baseUrl: 'https://changed.example/v1', token: '  ' });
    expect(secrets.values.get(providerSecretKey(provider.id))).toBe(fakeToken);
  });

  it('rolls back the stored secret when metadata creation fails', async () => {
    const { state, secrets, store } = setup();
    state.failUpdate = true;
    await expect(store.create({ name: 'One', baseUrl: 'https://one.example/v1', token: fakeToken })).rejects.toBeInstanceOf(PortwiseError);
    expect(secrets.values.size).toBe(0);
  });

  it('does not remove either record when secret deletion fails', async () => {
    const { state, secrets, store } = setup();
    const provider = await store.create({ name: 'One', baseUrl: 'https://one.example/v1', token: fakeToken });
    secrets.failDelete = true;
    await expect(store.delete(provider.id)).rejects.toMatchObject({ code: 'provider_delete_failed' });
    expect(secrets.values.get(providerSecretKey(provider.id))).toBe(fakeToken);
    expect(JSON.stringify(state.values.get(PROVIDER_METADATA_KEY))).toContain(provider.id);
  });

  it('restores the secret when metadata deletion fails', async () => {
    const { state, secrets, store } = setup();
    const provider = await store.create({ name: 'One', baseUrl: 'https://one.example/v1', token: fakeToken });
    state.failUpdate = true;
    await expect(store.delete(provider.id)).rejects.toBeInstanceOf(PortwiseError);
    expect(secrets.values.get(providerSecretKey(provider.id))).toBe(fakeToken);
    expect(JSON.stringify(state.values.get(PROVIDER_METADATA_KEY))).toContain(provider.id);
  });
});
