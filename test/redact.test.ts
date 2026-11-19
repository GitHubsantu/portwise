import { describe, expect, it } from 'vitest';
import { maskSecret, redactSecrets } from '../src/core/redact';

describe('redactSecrets', () => {
  it('redacts bearer tokens but keeps the scheme', () => {
    const out = redactSecrets('Authorization: Bearer abcdef1234567890XYZ');
    expect(out).not.toContain('abcdef1234567890XYZ');
    expect(out).toContain('Bearer [REDACTED]');
  });

  it('redacts key=value and JSON style secrets', () => {
    expect(redactSecrets('token=supersecretvalue')).toBe('token=[REDACTED]');
    expect(redactSecrets('{"api_key": "supersecretvalue"}')).not.toContain('supersecretvalue');
    expect(redactSecrets('GATEWAY_ACCESS_TOKEN=test-token-0000')).not.toContain('test-token-0000');
  });

  it('redacts OpenAI-style keys and JWTs', () => {
    // Built at runtime so the source never contains a secret-shaped literal (keeps `git grep` scans clean).
    const fakeKey = ['sk', 'abcdefghijklmnopqrstuvwx'].join('-');
    expect(redactSecrets(`key ${fakeKey} used`)).not.toContain(fakeKey);
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnop';
    expect(redactSecrets(`jwt ${jwt}`)).not.toContain(jwt);
  });

  it('leaves ordinary text untouched', () => {
    const text = 'Gateway listening on 127.0.0.1:47831';
    expect(redactSecrets(text)).toBe(text);
  });
});

describe('maskSecret', () => {
  it('shows only the last four characters', () => {
    expect(maskSecret('abcdefghijklmnop')).toBe('••••••••mnop');
  });

  it('fully masks short secrets', () => {
    expect(maskSecret('abc')).toBe('••••');
  });
});

describe('redactSecrets idempotence', () => {
  it('does not double-redact an already redacted header', () => {
    const once = redactSecrets('Authorization: Bearer abcdef1234567890XYZ');
    expect(once).toBe('Authorization: Bearer [REDACTED]');
    expect(redactSecrets(once)).toBe(once);
  });
});
