import { describe, expect, it } from 'vitest';
import { UrlValidationError } from '../src/core/errors';
import { validateProviderUrl } from '../src/core/urlValidate';

describe('validateProviderUrl', () => {
  it('accepts HTTPS providers and loopback HTTP providers', () => {
    expect(validateProviderUrl('https://provider.example/v1').origin).toBe('https://provider.example');
    expect(validateProviderUrl('http://127.0.0.1:8080/v1').origin).toBe('http://127.0.0.1:8080');
  });

  it.each(['http://provider.example/v1', 'https://user:pass@provider.example/v1', 'https://provider.example/v1#secret'])(
    'rejects an unsafe provider URL: %s',
    (value) => {
      expect(() => validateProviderUrl(value)).toThrow(UrlValidationError);
    },
  );
});
