import { validateProviderUrl } from '../core/urlValidate';

export type ConnectionResult =
  | { ok: true; message: string }
  | { ok: false; hop: 'extension' | 'upstream'; code: 'bad_url' | 'unreachable' | 'timeout' | 'auth_rejected' | 'unexpected_status'; message: string };

export async function testProviderConnection(baseUrl: string, token: string, timeoutMs = 5_000): Promise<ConnectionResult> {
  let url: URL;
  try { url = new URL('models', ensureTrailingSlash(validateProviderUrl(baseUrl))); } catch { return { ok: false, hop: 'extension', code: 'bad_url', message: 'The provider URL is invalid. Use an absolute HTTPS URL, or HTTP only for loopback.' }; }
  try {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });
    if (response.status === 401 || response.status === 403) return { ok: false, hop: 'upstream', code: 'auth_rejected', message: 'The provider rejected this token. Check the provider token and try again.' };
    if (!response.ok) return { ok: false, hop: 'upstream', code: 'unexpected_status', message: `The provider replied with HTTP ${response.status}. Check the provider endpoint.` };
    return { ok: true, message: 'The provider is reachable and accepted the connection check.' };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') return { ok: false, hop: 'upstream', code: 'timeout', message: 'The provider did not respond before the connection timeout.' };
    return { ok: false, hop: 'upstream', code: 'unreachable', message: 'The provider could not be reached. Check the URL and network connection.' };
  }
}

function ensureTrailingSlash(url: URL): string { return url.pathname.endsWith('/') ? url.toString() : `${url.toString()}/`; }
