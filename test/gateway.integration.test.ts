import * as http from 'node:http';
import { describe, expect, it } from 'vitest';
import { startGateway } from '../src/gateway/daemon/server';

const localToken = 'test-local-token-0000';
const upstreamToken = 'test-upstream-token-0000';

async function withServers(upstreamHandler: http.RequestListener, run: (gatewayUrl: string) => Promise<void>, maxBodyBytes?: number, totalTimeoutMs = 500): Promise<void> {
  const upstream = http.createServer(upstreamHandler);
  await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const address = upstream.address(); if (!address || typeof address === 'string') throw new Error('No upstream port');
  const gateway = await startGateway({ token: localToken, provider: { baseUrl: `http://127.0.0.1:${address.port}/v1/`, token: upstreamToken, enabled: true }, port: 0, totalTimeoutMs, ...(maxBodyBytes === undefined ? {} : { maxBodyBytes }) });
  try { await run(`http://127.0.0.1:${gateway.port}`); } finally { await gateway.close(); await new Promise<void>((resolve, reject) => upstream.close((error) => error ? reject(error) : resolve())); }
}
function auth(): Headers { return new Headers({ authorization: `Bearer ${localToken}` }); }

describe('gateway daemon integration', () => {
  it('relays a sparse SSE stream without an idle cut-off', async () => {
    await withServers((_request, response) => { response.writeHead(200, { 'content-type': 'text/event-stream' }); response.write('data: first\n\n'); setTimeout(() => response.end('data: last\n\n'), 75); }, async (gateway) => {
      const response = await fetch(`${gateway}/v1/responses`, { headers: auth() });
      expect(response.status).toBe(200); expect(await response.text()).toBe('data: first\n\ndata: last\n\n');
    }, 1024);
  });
  it('returns gateway 413 for an oversized body', async () => {
    await withServers((_request, response) => response.end('unexpected'), async (gateway) => {
      const body = 'a'.repeat(1025); const response = await fetch(`${gateway}/v1/responses`, { method: 'POST', headers: auth(), body });
      expect(response.status).toBe(413); expect((await response.json() as { error: { code: string; hop: string } }).error).toMatchObject({ code: 'payload_too_large', hop: 'gateway' });
    }, 1024);
  });
  it('relays upstream 401 unchanged and marks its hop', async () => {
    await withServers((_request, response) => { response.writeHead(401, { 'content-type': 'application/json' }); response.end('{"detail":"upstream denied"}'); }, async (gateway) => {
      const response = await fetch(`${gateway}/v1/models`, { headers: auth() });
      expect(response.status).toBe(401); expect(response.headers.get('x-portwise-hop')).toBe('upstream'); expect(await response.text()).toBe('{"detail":"upstream denied"}');
    }, undefined, 30_000);
  });
  it('replaces client authorization and strips forwarded headers', async () => {
    await withServers((request, response) => { expect(request.headers.authorization).toBe(`Bearer ${upstreamToken}`); expect(request.headers['x-forwarded-for']).toBeUndefined(); expect(request.headers.connection).toBe('keep-alive'); response.end('ok'); }, async (gateway) => {
      const response = await fetch(`${gateway}/v1/models`, { headers: { ...Object.fromEntries(auth()), 'x-forwarded-for': 'evil', connection: 'close' } }); expect(await response.text()).toBe('ok');
    });
  });
  it('serves authenticated control status without proxying', async () => {
    await withServers((_request, response) => response.end('unexpected'), async (gateway) => { const response = await fetch(`${gateway}/_portwise/status`, { headers: auth() }); expect(response.status).toBe(200); expect((await response.json() as { running: boolean }).running).toBe(true); });
  });
  it('replaces the provider through authenticated control API and rejects a wrong token', async () => {
    await withServers((_request, response) => response.end('first'), async (gateway) => {
      const denied = await fetch(`${gateway}/_portwise/providers`, { method: 'PUT', headers: { 'content-type': 'application/json', authorization: 'Bearer wrong-token-0000' }, body: JSON.stringify({ baseUrl: 'http://127.0.0.1:1/', token: upstreamToken, enabled: true }) });
      expect(denied.status).toBe(401);
      const disabled = await fetch(`${gateway}/_portwise/providers`, { method: 'PUT', headers: { ...Object.fromEntries(auth()), 'content-type': 'application/json' }, body: JSON.stringify({ baseUrl: 'http://127.0.0.1:1/', token: upstreamToken, enabled: false }) });
      expect(disabled.status).toBe(200);
      const response = await fetch(`${gateway}/v1/models`, { headers: auth() });
      expect(response.status).toBe(503);
    });
  });
  it('shutdown closes the listener and frees its port', async () => {
    await withServers((_request, response) => response.end('unused'), async (gateway) => {
      const port = Number(new URL(gateway).port);
      expect((await fetch(`${gateway}/_portwise/shutdown`, { method: 'POST', headers: auth() })).status).toBe(200);
      await new Promise((resolve) => setTimeout(resolve, 25));
      await expect(fetch(`${gateway}/healthz`)).rejects.toThrow();
      await new Promise<void>((resolve, reject) => { const listener = http.createServer(); listener.once('error', reject); listener.listen(port, '127.0.0.1', () => listener.close((error) => error ? reject(error) : resolve())); });
    });
  });
  it('returns upstream_timeout when an upstream total timeout expires', async () => {
    await withServers(() => undefined, async (gateway) => { const response = await fetch(`${gateway}/v1/models`, { headers: auth() }); expect(response.status).toBe(504); expect((await response.json() as { error: { code: string } }).error.code).toBe('upstream_timeout'); }, undefined, 30);
  });
  it('ignores an absolute-URI request target and keeps the configured provider origin', async () => {
    let upstreamHit = false;
    await withServers((_request, response) => { upstreamHit = true; response.end('configured'); }, async (gateway) => {
      const port = Number(new URL(gateway).port);
      const status = await new Promise<number>((resolve, reject) => { const socket = http.request({ hostname: '127.0.0.1', port, method: 'GET', path: 'http://evil.example/v1/models', headers: { host: `127.0.0.1:${port}`, authorization: `Bearer ${localToken}` } }, (response) => resolve(response.statusCode ?? 0)); socket.on('error', reject); socket.end(); });
      expect(status).toBe(404); expect(upstreamHit).toBe(false);
    });
  });
  it('proxies a 40 MiB body and rejects a 100 MiB body', async () => {
    let received = 0;
    await withServers((request, response) => { request.on('data', (chunk: Buffer) => { received += chunk.length; }); request.on('end', () => response.end('ok')); }, async (gateway) => {
      const forty = 'a'.repeat(40 * 1024 * 1024);
      expect((await fetch(`${gateway}/v1/responses`, { method: 'POST', headers: auth(), body: forty })).status).toBe(200); expect(received).toBe(forty.length);
      const hundred = 'b'.repeat(100 * 1024 * 1024);
      expect((await fetch(`${gateway}/v1/responses`, { method: 'POST', headers: auth(), body: hundred })).status).toBe(413);
    }, undefined, 30_000);
  }, 30_000);
  it('aborts the upstream stream when the client disconnects', async () => {
    let upstreamClosed = false;
    await withServers((_request, response) => { response.writeHead(200, { 'content-type': 'text/event-stream' }); response.write('data: first\n\n'); response.on('close', () => { upstreamClosed = true; }); }, async (gateway) => {
      const port = Number(new URL(gateway).port);
      await new Promise<void>((resolve, reject) => { const request = http.request({ hostname: '127.0.0.1', port, path: '/v1/responses', headers: { authorization: `Bearer ${localToken}` } }, (response) => { response.once('data', () => { request.destroy(); resolve(); }); }); request.on('error', reject); request.end(); });
      await new Promise((resolve) => setTimeout(resolve, 25));
      expect(upstreamClosed).toBe(true);
    });
  });
  it('keeps health checks responsive while a client sends a slow partial body', async () => {
    await withServers((_request, response) => response.end('ok'), async (gateway) => {
      const port = Number(new URL(gateway).port);
      const slow = http.request({ hostname: '127.0.0.1', port, method: 'POST', path: '/v1/responses', headers: { authorization: `Bearer ${localToken}`, 'content-length': '1000' } });
      slow.on('error', () => undefined);
      slow.write('partial');
      const health = await fetch(`${gateway}/healthz`);
      expect(health.status).toBe(200);
      slow.destroy();
    });
  });
  it('rejects a wrong local token at the gateway', async () => {
    await withServers((_request, response) => response.end('unexpected'), async (gateway) => {
      const response = await fetch(`${gateway}/v1/models`, { headers: { authorization: 'Bearer wrong-token-0000' } });
      expect(response.status).toBe(401); expect((await response.json() as { error: { code: string; hop: string } }).error).toMatchObject({ code: 'local_token_invalid', hop: 'gateway' });
    });
  });
  it('does not follow upstream redirects', async () => {
    await withServers((_request, response) => { response.writeHead(302, { location: 'http://example.invalid/' }); response.end(); }, async (gateway) => expect((await fetch(`${gateway}/v1/models`, { headers: auth() })).status).toBe(502));
  });
  it('rejects hostile Host and Origin headers', async () => {
    await withServers((_request, response) => response.end('unexpected'), async (gateway) => {
      const port = Number(new URL(gateway).port);
      const hostile = await new Promise<number>((resolve, reject) => { const request = http.request({ hostname: '127.0.0.1', port, path: '/v1/models', headers: { host: 'evil.example', authorization: `Bearer ${localToken}` } }, (response) => resolve(response.statusCode ?? 0)); request.on('error', reject); request.end(); });
      expect(hostile).toBe(421);
      expect((await fetch(`${gateway}/v1/models`, { headers: { ...Object.fromEntries(auth()), origin: 'https://evil.example' } })).status).toBe(403);
    });
  });
  it('keeps serving seeded malformed requests', async () => {
    await withServers((_request, response) => response.end('ok'), async (gateway) => {
      let seed = 0x12345678; for (let index = 0; index < 100; index += 1) { seed = (seed * 1664525 + 1013904223) >>> 0; const path = `/v1/${seed.toString(16)}`; await fetch(`${gateway}${path}`, { headers: auth() }); }
      expect((await fetch(`${gateway}/healthz`)).status).toBe(200);
    });
  });
});
