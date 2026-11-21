import { describe, expect, it } from 'vitest';
import { isHostToWebview, isWebviewToHost } from '../src/shared/protocol';

describe('protocol guards', () => {
  it('validates every provider field and rejects raw credentials or malformed provider entries', () => {
    const provider = { id: 'random-provider', name: '<img onerror=alert(1)>', baseUrl: 'https://provider.invalid/v1', enabled: true, tokenMask: '••••••••0000' };
    const state = { version: '1', status: 'Ready.', providers: [provider], accounts: [], accountMatchAvailability: 'available', gateway: { running: false, label: 'Stopped' } };
    expect(isHostToWebview({ type: 'state', state })).toBe(true);
    for (const entry of [null, 'provider', {}, { ...provider, id: 3 }, { ...provider, name: null }, { ...provider, baseUrl: false }, { ...provider, enabled: 'yes' }, { ...provider, tokenMask: 'test-raw-0000' }, { ...provider, token: 'test-forbidden-0000' }, { ...provider, snapshot: 'test-forbidden-0000' }]) {
      expect(isHostToWebview({ type: 'state', state: { ...state, providers: [entry] } })).toBe(false);
    }
  });
  it('accepts known webview messages', () => {
    expect(isWebviewToHost({ type: 'ready' })).toBe(true);
    expect(isWebviewToHost({ type: 'refresh' })).toBe(true);
    expect(isWebviewToHost({ type: 'runPanelCommand', command: 'portwise.startGateway' })).toBe(true);
    expect(isWebviewToHost({ type: 'runPanelCommand', command: 'portwise.startGateway', id: 'not-forwarded' })).toBe(false);
  });

  it('rejects unknown or malformed webview messages', () => {
    expect(isWebviewToHost(null)).toBe(false);
    expect(isWebviewToHost('ready')).toBe(false);
    expect(isWebviewToHost({ type: 'deleteEverything' })).toBe(false);
    expect(isWebviewToHost({})).toBe(false);
  });

  it('validates host messages', () => {
    expect(isHostToWebview({ type: 'state', state: { version: '1', status: 'ok', providers: [], accounts: [{ id: 'random-id', name: 'Example', isCurrent: false }], accountMatchAvailability: 'available', gateway: { running: false, label: 'Stopped' } } })).toBe(true);
    expect(isHostToWebview({ type: 'state', state: { version: 1, status: 'ok', providers: [] } })).toBe(false);
    expect(isHostToWebview({ type: 'other' })).toBe(false);
  });

  it('rejects credential fields, non-boolean matches and unknown matching availability', () => {
    const state = { version: '1', status: 'Ready.', providers: [], accounts: [{ id: 'random-id', name: 'Example', isCurrent: true }], accountMatchAvailability: 'available', gateway: { running: false, label: 'Stopped' } };
    expect(isHostToWebview({ type: 'state', state: { ...state, accountMatchAvailability: 'ambiguous' } })).toBe(true);
    expect(isHostToWebview({ type: 'state', state: { ...state, accounts: [{ ...state.accounts[0], token: 'test-forbidden-token-0000' }] } })).toBe(false);
    expect(isHostToWebview({ type: 'state', state: { ...state, accounts: [{ ...state.accounts[0], isCurrent: 'yes' }] } })).toBe(false);
    expect(isHostToWebview({ type: 'state', state: { ...state, accountMatchAvailability: 'guessed' } })).toBe(false);
  });
});
