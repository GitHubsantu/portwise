import { describe, expect, it } from 'vitest';
import { buildWebviewCsp } from '../src/core/webviewCsp';

describe('buildWebviewCsp', () => {
  it('matches the mandatory restrictive CSP (T5)', () => {
    expect(buildWebviewCsp('vscode-webview://test', 'test-nonce')).toBe(
      "default-src 'none'; style-src vscode-webview://test; script-src 'nonce-test-nonce'; img-src vscode-webview://test data:; font-src vscode-webview://test",
    );
  });

  it('never permits inline scripts or remote network sources', () => {
    const csp = buildWebviewCsp('vscode-webview://test', 'test-nonce');
    expect(csp).not.toContain('unsafe-inline');
    expect(csp).not.toContain('http:');
    expect(csp).not.toContain('https:');
  });
});
