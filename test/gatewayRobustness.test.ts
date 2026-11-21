import * as http from 'node:http';
import { connect } from 'node:net';
import { once } from 'node:events';
import { gzipSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import { startGateway, type GatewayInstance } from '../src/gateway/daemon/server';

const token = 'test-token-0000'; const headers = { authorization: `Bearer ${token}` };
async function fixture(handler: http.RequestListener, totalTimeoutMs = 500, maxBodyBytes = 1024, maxConnections = 100) {
  const upstream = http.createServer(handler); await new Promise<void>(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const address = upstream.address(); if (!address || typeof address === 'string') throw new Error('missing port');
  const gateway = await startGateway({ token, provider: { baseUrl: `http://127.0.0.1:${address.port}/v1`, token: 'test-upstream-0000', enabled: true }, totalTimeoutMs, maxBodyBytes, maxConnections, port: 0 });
  return { gateway, url: `http://127.0.0.1:${gateway.port}`, dispose: async () => { await gateway.close(); upstream.closeAllConnections(); await new Promise<void>(resolve => upstream.close(() => resolve())); } };
}
function raw(gateway: GatewayInstance, path: string, extraHeaders: Record<string, string> = {}): Promise<number> {
  return new Promise((resolve, reject) => { const request = http.request({ hostname: '127.0.0.1', port: gateway.port, path, headers: { ...headers, ...extraHeaders } }, response => { response.resume(); resolve(response.statusCode ?? 0); }); request.once('error', reject); request.end(); });
}

describe('gateway resource and header boundaries', () => {
  it('rejects oversized headers and survives reproducible malformed raw input', async () => {
    const f = await fixture((_request, response) => response.end('fake'));
    const send = (input: string) => new Promise<number>((resolve, reject) => {
      const socket = connect(f.gateway.port, '127.0.0.1'); socket.once('error', reject);
      socket.once('connect', () => socket.end(input));
      socket.once('data', chunk => { const status = Number(chunk.toString('utf8').split(' ')[1]); socket.destroy(); resolve(status); });
    });
    try {
      expect(await send(`GET /healthz HTTP/1.1\r\nHost: 127.0.0.1:${f.gateway.port}\r\nX-Large: ${'a'.repeat(20 * 1024)}\r\n\r\n`)).toBe(431);
      let seed = 0x12345678;
      for (let index = 0; index < 30; index++) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        const bad = String.fromCharCode([0, 1, 2, 3, 4, 5, 6, 7][seed % 8] ?? 0);
        expect(await send(`GET /healthz HTTP/1.1\r\nHost: 127.0.0.1:${f.gateway.port}\r\nX-Bad: ${bad}\r\n\r\n`)).toBe(400);
      }
      expect((await fetch(f.url + '/healthz')).status).toBe(200);
    } finally { await f.dispose(); }
  });
  it('validates Host on health, rejects even empty Origin and removes CORS and nominated hop headers', async () => {
    const received: http.IncomingHttpHeaders[] = [];
    const f = await fixture((request, response) => { received.push(request.headers); response.writeHead(200, { 'access-control-allow-origin': '*', 'access-control-allow-credentials': 'true', connection: 'x-private-hop', 'x-private-hop': 'discard', 'x-preserved': 'keep' }); response.end('unchanged'); });
    try {
      expect(await raw(f.gateway, '/healthz', { host: 'evil.invalid' })).toBe(421);
      expect(await raw(f.gateway, '/_portwise/status', { origin: '' })).toBe(403);
      expect(await raw(f.gateway, '/healthz', { origin: '' })).toBe(403);
      const response = await fetch(f.url + '/v1/models', { headers });
      expect(response.headers.get('access-control-allow-origin')).toBeNull(); expect(response.headers.get('access-control-allow-credentials')).toBeNull();
      expect(response.headers.get('x-private-hop')).toBeNull(); expect(response.headers.get('x-preserved')).toBe('keep'); expect(await response.text()).toBe('unchanged');
      expect(await raw(f.gateway, '/v1/models', { connection: 'accept', accept: 'discard-this-hop' })).toBe(200);
      expect(received.at(-1)?.accept).toBeUndefined();
    } finally { await f.dispose(); }
  });
  it('relays compressed response bytes without decompression or a stale content length', async () => {
    const compressed = gzipSync('fake compressed upstream response');
    const f = await fixture((_request, response) => { response.writeHead(401, { 'content-encoding': 'gzip', 'content-length': compressed.length }); response.end(compressed); });
    try {
      const result = await new Promise<{ status: number; headers: http.IncomingHttpHeaders; bytes: Buffer }>((resolve, reject) => {
        const request = http.get(f.url + '/v1/models', { headers }, response => {
          const chunks: Buffer[] = []; response.on('data', (chunk: Buffer) => chunks.push(chunk)); response.on('error', reject);
          response.on('end', () => resolve({ status: response.statusCode ?? 0, headers: response.headers, bytes: Buffer.concat(chunks) }));
        }); request.on('error', reject);
      });
      expect(result.status).toBe(401); expect(result.bytes).toEqual(compressed);
      expect(result.headers['content-length']).toBe(String(compressed.length));
      expect(result.headers['content-encoding']).toBe('gzip'); expect(result.headers['x-portwise-hop']).toBe('upstream');
    } finally { await f.dispose(); }
  });
  it('bounds control bodies, validates URLs and retains the prior provider after rejected input', async () => {
    let hits = 0; const f = await fixture((_request, response) => { hits++; response.end('safe'); });
    try {
      const control = (body: string) => fetch(f.url + '/_portwise/providers', { method: 'PUT', headers, body });
      expect((await control('x'.repeat(1025))).status).toBe(413);
      for (const baseUrl of ['http://not-loopback.invalid/v1', 'file:///tmp/fake', 'https://user:pass@provider.invalid/v1']) {
        expect((await control(JSON.stringify({ baseUrl, token, enabled: true }))).status).toBe(400);
      }
      expect(await (await fetch(f.url + '/v1/models', { headers })).text()).toBe('safe'); expect(hits).toBe(1);
    } finally { await f.dispose(); }
  });
  it.each(['/v1/responses', '/_portwise/providers'])('times out slow incoming body on %s and remains available', async target => {
    const f = await fixture((_request, response) => response.end('unexpected'), 60);
    try {
      const result = await new Promise<{ status: number; body: string }>((resolve, reject) => {
        const request = http.request({ hostname: '127.0.0.1', port: f.gateway.port, path: target, method: target.includes('_portwise') ? 'PUT' : 'POST', headers: { ...headers, 'content-length': '1000' } }, response => {
          let body = ''; response.on('data', chunk => { body += String(chunk); }); response.on('end', () => { resolve({ status: response.statusCode ?? 0, body }); request.destroy(); });
        }); request.on('error', reject); request.write('partial');
      });
      expect(result.status).toBe(504); expect(JSON.parse(result.body)).toMatchObject({ error: { code: 'upstream_timeout', hop: 'gateway' } });
      expect((await fetch(f.url + '/healthz')).status).toBe(200);
    } finally { await f.dispose(); }
  });
  it('closes a timed-out stream after headers instead of leaving its reader pending', async () => {
    const f = await fixture((_request, response) => { response.writeHead(200, { 'content-type': 'text/event-stream' }); response.write('data: first\n\n'); }, 100);
    try {
      const response = await fetch(f.url + '/v1/responses', { headers }); const reader = response.body?.getReader(); if (!reader) throw new Error('missing reader');
      await reader.read();
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        const completed = await Promise.race([reader.read().then(() => true, () => true), new Promise<boolean>(resolve => { timeout = setTimeout(() => resolve(false), 1000); })]);
        expect(completed).toBe(true);
      } finally { clearTimeout(timeout); }
      expect((await fetch(f.url + '/healthz')).status).toBe(200);
    } finally { await f.dispose(); }
  });
  it('honors slow-reader backpressure without an unbounded response queue and aborts upstream on disconnect', async () => {
    let closed = false;
    const f = await fixture((_request, response) => {
      response.on('close', () => { closed = true; }); let count = 0; const block = Buffer.alloc(64 * 1024);
      const pump = () => { while (!response.destroyed && count < 1024) { count++; if (!response.write(block)) { response.once('drain', pump); return; } } if (!response.destroyed) response.end(); }; pump();
    }, 2000);
    let outgoing: http.ServerResponse | undefined; f.gateway.server.on('request', (_request, response) => { outgoing = response; });
    const slow = connect(f.gateway.port, '127.0.0.1'); slow.on('error', () => undefined);
    try {
      await once(slow, 'connect'); slow.write(`GET /v1/responses HTTP/1.1\r\nHost: 127.0.0.1:${f.gateway.port}\r\nAuthorization: Bearer ${token}\r\n\r\n`);
      await vi.waitFor(() => expect(outgoing?.writableNeedDrain).toBe(true), { timeout: 1500 });
      expect(outgoing?.writableLength).toBeLessThanOrEqual(256 * 1024);
      expect((await fetch(f.url + '/healthz')).status).toBe(200);
      slow.destroy(); await vi.waitFor(() => expect(closed).toBe(true));
    } finally { slow.destroy(); await f.dispose(); }
  });
  it('caps concurrent connections without terminating the daemon', async () => {
    const gateway = await startGateway({ token, port: 0, maxConnections: 1 });
    const first = connect(gateway.port, '127.0.0.1'); first.on('error', () => undefined);
    const second = connect(gateway.port, '127.0.0.1'); second.on('error', () => undefined);
    try {
      // Both peers may complete TCP establishment; excess connections must be closed.
      await Promise.race([once(first, 'close').catch(() => undefined), once(second, 'close').catch(() => undefined)]);
      let count = 0; await new Promise<void>((resolve, reject) => gateway.server.getConnections((error, value) => { if (error) reject(error); else { count = value; resolve(); } }));
      expect(count).toBeLessThanOrEqual(1);
      expect(gateway.server.listening).toBe(true);
    } finally { first.destroy(); second.destroy(); await gateway.close(); }
  });
});
