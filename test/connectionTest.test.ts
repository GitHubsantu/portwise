import * as http from 'node:http';
import { describe, expect, it } from 'vitest';
import { testProviderConnection } from '../src/profiles/connectionTest';

const fakeToken = 'test-token-0000';

async function withServer(handler: http.RequestListener, test: (baseUrl: string) => Promise<void>): Promise<void> {
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No loopback port assigned');
  try { await test(`http://127.0.0.1:${address.port}/v1`); } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}

describe('testProviderConnection', () => {
  it('uses GET /v1/models with bearer auth and sends no body', async () => {
    await withServer((request, response) => {
      expect(request.method).toBe('GET'); expect(request.url).toBe('/v1/models'); expect(request.headers.authorization).toBe(`Bearer ${fakeToken}`);
      response.end('{}');
    }, async (baseUrl) => expect(await testProviderConnection(baseUrl, fakeToken)).toMatchObject({ ok: true }));
  });
  it('identifies rejected authentication', async () => withServer((_request, response) => { response.statusCode = 401; response.end(); }, async (baseUrl) => expect(await testProviderConnection(baseUrl, fakeToken)).toMatchObject({ code: 'auth_rejected', hop: 'upstream' })));
  it('does not follow redirects', async () => withServer((_request, response) => { response.statusCode = 302; response.setHeader('location', 'http://example.invalid'); response.end(); }, async (baseUrl) => expect(await testProviderConnection(baseUrl, fakeToken)).toMatchObject({ code: 'unreachable' })));
  it('rejects a non-loopback HTTP URL before making a request', async () => expect(await testProviderConnection('http://provider.example/v1', fakeToken)).toMatchObject({ code: 'bad_url', hop: 'extension' }));
});
