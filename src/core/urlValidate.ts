import { UrlValidationError } from './errors';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/** Validates the provider origin accepted by Portwise (PRV-2, T11). */
export function validateProviderUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UrlValidationError('Provider URL must be absolute.');
  }

  if (url.username || url.password) {
    throw new UrlValidationError('Provider URL must not contain credentials.');
  }
  if (url.hash) throw new UrlValidationError('Provider URL must not contain a fragment.');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopback(url.hostname))) {
    throw new UrlValidationError('Provider URL must use HTTPS unless its host is loopback.');
  }
  return url;
}

function isLoopback(hostname: string): boolean {
  return LOOPBACK_HOSTS.has(hostname.toLowerCase());
}
