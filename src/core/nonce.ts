import { randomBytes } from 'node:crypto';

/** Cryptographically random nonce for the webview Content-Security-Policy. */
export function createNonce(): string {
  return randomBytes(16).toString('base64');
}
