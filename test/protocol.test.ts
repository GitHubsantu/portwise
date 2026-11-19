import { describe, expect, it } from 'vitest';
import { isHostToWebview, isWebviewToHost } from '../src/shared/protocol';

describe('protocol guards', () => {
  it('accepts known webview messages', () => {
    expect(isWebviewToHost({ type: 'ready' })).toBe(true);
    expect(isWebviewToHost({ type: 'refresh' })).toBe(true);
  });

  it('rejects unknown or malformed webview messages', () => {
    expect(isWebviewToHost(null)).toBe(false);
    expect(isWebviewToHost('ready')).toBe(false);
    expect(isWebviewToHost({ type: 'deleteEverything' })).toBe(false);
    expect(isWebviewToHost({})).toBe(false);
  });

  it('validates host messages', () => {
    expect(isHostToWebview({ type: 'state', state: { version: '1', status: 'ok' } })).toBe(true);
    expect(isHostToWebview({ type: 'state', state: { version: 1, status: 'ok' } })).toBe(false);
    expect(isHostToWebview({ type: 'other' })).toBe(false);
  });
});
