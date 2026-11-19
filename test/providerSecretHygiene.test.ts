import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { redactSecrets } from '../src/core/redact';
import type { HostToWebview } from '../src/shared/protocol';
import { ProfileStore, PROVIDER_METADATA_KEY } from '../src/profiles/profileStore';
import type { KeyValueStore, SecretStore } from '../src/profiles/models';

const fakeToken = 'test-token-0000';

class State implements KeyValueStore {
  values = new Map<string, unknown>();
  get<T>(key: string): T | undefined { return this.values.get(key) as T | undefined; }
  async update(key: string, value: unknown): Promise<void> { this.values.set(key, value); }
}
class Secrets implements SecretStore {
  values = new Map<string, string>();
  async get(key: string): Promise<string | undefined> { return this.values.get(key); }
  async store(key: string, value: string): Promise<void> { this.values.set(key, value); }
  async delete(key: string): Promise<void> { this.values.delete(key); }
}

describe('provider secret hygiene', () => {
  it('keeps the test token out of globalState, logs, and webview messages', async () => {
    const state = new State(); const secrets = new Secrets();
    const profiles = new ProfileStore(state, secrets, () => 'b3f8e7f3-6e36-4f1c-8f2a-2530f3d4c1c9');
    await profiles.create({ name: '<img onerror=alert(1)>', baseUrl: 'https://provider.example/v1', token: fakeToken });
    const message: HostToWebview = { type: 'state', state: { version: 'test', status: redactSecrets(`Connection token=${fakeToken}`), providers: await profiles.list() } };
    expect(JSON.stringify(state.values.get(PROVIDER_METADATA_KEY))).not.toContain(fakeToken);
    expect(JSON.stringify(message)).not.toContain(fakeToken);
    expect(message.state.status).not.toContain(fakeToken);
  });

  it('renders provider names with textContent rather than HTML insertion', () => {
    const webview = readFileSync('src/webview-ui/main.ts', 'utf8');
    expect(webview).toContain('node.textContent = text');
    expect(webview).not.toContain('innerHTML');
    expect(webview).not.toContain('insertAdjacentHTML');
  });
});
