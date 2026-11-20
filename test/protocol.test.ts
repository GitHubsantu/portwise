import { describe, expect, it } from 'vitest';
import { isHostToWebview, isWebviewToHost } from '../src/shared/protocol';

describe('protocol guards', () => {
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
    expect(isHostToWebview({ type: 'state', state: { ...state, accounts: [{ ...state.accounts[0], token: 'test-forbidden-token-0000' }] } })).toBe(false);
    expect(isHostToWebview({ type: 'state', state: { ...state, accounts: [{ ...state.accounts[0], isCurrent: 'yes' }] } })).toBe(false);
    expect(isHostToWebview({ type: 'state', state: { ...state, accountMatchAvailability: 'guessed' } })).toBe(false);
  });
});
