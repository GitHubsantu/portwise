import { createServer, type ServerResponse } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { GatewayController } from '../src/gateway/controller';
import { OWNERSHIP_CHALLENGE_HEADER, ownershipProof } from '../src/gateway/ownershipProof';
import { GatewayResponseUnavailableError, GATEWAY_RESPONSE_MAX_BYTES, readGatewayResponse, type GatewayResponseKind } from '../src/gateway/readResponse';
import { gatewayChecks } from '../src/diagnostics/gatewayChecks';
import { temporaryDirectory } from './helpers/temporaryDirectory';

const token = 'test-local-token-0000'; const credential = 'test-upstream-token-0000';
const instanceId = 'test-response-instance';
const unavailable = { code: 'gateway_response_unavailable', message: new GatewayResponseUnavailableError().message, hop: 'gateway' };
function padded(value: Record<string, unknown>, size: number): string {
  const empty = JSON.stringify({ ...value, padding: '' });
  return JSON.stringify({ ...value, padding: 'x'.repeat(size - Buffer.byteLength(empty)) });
}

type Mode = 'normal' | 'boundary' | 'large' | 'malformed' | 'schema' | 'slow' | 'slow-body' | 'endless';
async function fixture(phase: GatewayResponseKind, mode: Mode) {
  const directory = await temporaryDirectory('portwise-response-bound');
  const requests: Array<{ route: string | undefined; auth: string | undefined; body: string }> = [];
  let closed = 0;
  const server = createServer((request, response) => {
    const record = { route: request.url, auth: request.headers.authorization, body: '' }; requests.push(record);
    request.on('data', (chunk: Buffer) => { record.body += chunk.toString('utf8'); });
    response.on('error', () => undefined); response.once('close', () => { closed++; });
    const nonce = request.headers[OWNERSHIP_CHALLENGE_HEADER];
    const health = request.url === '/healthz';
    const value = health ? { instanceId, ...(typeof nonce === 'string' ? { proof: ownershipProof(token, instanceId, request.socket.localPort ?? 0, nonce) } : {}) } : { instanceId, running: true };
    if ((phase === 'health') === health) reply(response, value, mode);
    else reply(response, value, 'normal');
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('missing fixture port');
  const state = { pid: 123, port: address.port, instanceId, startedAt: 'test', version: 'test' };
  const file = path.join(directory.path, 'gateway.json'); await writeFile(file, JSON.stringify(state));
  const controller = new GatewayController({ storageDirectory: directory.path, gatewayScript: 'unused', port: address.port, token, version: 'test' });
  return { directory, controller, file, state, requests, closed: () => closed, dispose: async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await directory.dispose(); } };
}
function reply(response: ServerResponse, value: Record<string, unknown>, mode: Mode): void {
  if (mode === 'slow') return;
  if (mode === 'slow-body') { response.writeHead(200); response.write('{"instanceId":'); return; }
  if (mode === 'endless') {
    response.writeHead(200); response.write('{');
    const timer = setInterval(() => response.write('x'.repeat(2048)), 5);
    response.once('close', () => clearInterval(timer)); return;
  }
  response.setHeader('content-type', 'application/json');
  if (mode === 'large' || mode === 'boundary') response.end(padded(value, GATEWAY_RESPONSE_MAX_BYTES + (mode === 'large' ? 1 : 0)));
  else if (mode === 'malformed') response.end(`{"credential":"${credential}",`);
  else if (mode === 'schema') response.end(JSON.stringify({ instanceId, running: false }));
  else response.end(JSON.stringify(value));
}

describe('bounded gateway response reader', () => {
  it.each(['health', 'status'] as const)('accepts exactly 4096 bytes for a valid %s reply and rejects byte 4097', async kind => {
    const value = { instanceId, running: true };
    await expect(readGatewayResponse(new Response(padded(value, GATEWAY_RESPONSE_MAX_BYTES)), kind)).resolves.toMatchObject({ body: value });
    await expect(readGatewayResponse(new Response(padded(value, GATEWAY_RESPONSE_MAX_BYTES + 1)), kind)).rejects.toMatchObject(unavailable);
    const unicode = JSON.stringify({ ...value, padding: '界'.repeat(1400) });
    expect(unicode.length).toBeLessThan(GATEWAY_RESPONSE_MAX_BYTES); expect(Buffer.byteLength(unicode)).toBeGreaterThan(GATEWAY_RESPONSE_MAX_BYTES);
    await expect(readGatewayResponse(new Response(unicode), kind)).rejects.toMatchObject(unavailable);
  });

  it.each(['syntax', 'utf8', 'array', 'null', 'id-type', 'empty-id', 'long-id', 'running', 'missing-running', 'empty', 'http-status'])('rejects malformed %s data with only a fixed actionable message', async mode => {
    const data = mode === 'syntax' ? `{"credential":"${credential}",` : mode === 'utf8' ? new Uint8Array([255]) : mode === 'array' ? '[]' : mode === 'null' ? 'null' : mode === 'empty' ? '' : JSON.stringify({ instanceId: mode === 'id-type' ? 123 : mode === 'empty-id' ? '' : mode === 'long-id' ? 'x'.repeat(201) : instanceId, ...(mode === 'missing-running' ? {} : { running: mode !== 'running' }) });
    const response = new Response(data, { status: mode === 'http-status' ? 500 : 200 });
    await expect(readGatewayResponse(response, 'status')).rejects.toMatchObject(unavailable);
    expect(unavailable.message).toContain('Start Gateway'); expect(unavailable.message).not.toContain(credential);
  });

  it('cancels an endless byte stream after the cap without retaining its remaining chunks', async () => {
    let produced = 0; let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({ pull(controller) { produced++; controller.enqueue(new Uint8Array(1024)); }, cancel() { cancelled = true; } });
    await expect(readGatewayResponse(new Response(stream), 'health')).rejects.toMatchObject(unavailable);
    expect(cancelled).toBe(true); expect(produced).toBeLessThanOrEqual(6);
  });

  it('replaces a credential-bearing stream error with the same safe error', async () => {
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.error(new Error(credential)); } });
    await expect(readGatewayResponse(new Response(stream), 'health')).rejects.toMatchObject(unavailable);
  });
});

describe('lifecycle and diagnostics response bounds', () => {
  it.each(['health', 'status'] as const)('retains genuine R1 ownership and same-socket status at the %s size boundary', async phase => {
    const f = await fixture(phase, 'boundary');
    try {
      await expect(f.controller.status()).resolves.toEqual(f.state);
      const checks = await gatewayChecks({ storageDirectory: f.directory.path, port: f.state.port, token });
      for (const name of ['health', 'daemon', 'local-token']) expect(checks.find(check => check.name === name)?.status).toBe('PASS');
    } finally { await f.dispose(); }
  });

  it.each(['health', 'status'] as const)('rejects oversized and malformed %s without adoption, control, provider delivery or state changes', async phase => {
    for (const mode of ['large', 'malformed'] as const) {
      const f = await fixture(phase, mode);
      try {
        const before = await readFile(f.file); const timestamp = (await stat(f.file)).mtimeMs;
        await expect(f.controller.status()).resolves.toBeUndefined();
        await expect(f.controller.start({ baseUrl: 'https://provider.example/v1', token: credential, enabled: true })).rejects.toMatchObject(unavailable);
        await expect(f.controller.stop()).rejects.toMatchObject(unavailable);
        await expect(f.controller.syncProvider({ baseUrl: 'https://provider.example/v1', token: credential, enabled: true })).rejects.toMatchObject({ code: 'gateway_provider_sync_failed', message: expect.stringContaining('unavailable') });
        const checks = await gatewayChecks({ storageDirectory: f.directory.path, port: f.state.port, token });
        expect(checks.find(check => check.name === 'daemon')?.status).toBe('FAIL');
        expect(JSON.stringify(checks)).not.toContain(credential); expect(JSON.stringify(checks)).not.toContain(token);
        expect(f.requests.every(request => request.route === '/healthz' || phase === 'status' && request.route === '/_portwise/status')).toBe(true);
        expect(f.requests.every(request => request.body === '' && (request.route !== '/healthz' || request.auth === undefined))).toBe(true);
        expect(await readFile(f.file)).toEqual(before); expect((await stat(f.file)).mtimeMs).toBe(timestamp);
        await vi.waitFor(() => expect(f.closed()).toBeGreaterThan(0));
      } finally { await f.dispose(); }
    }
  });

  it.each(['health', 'status'] as const)('keeps existing deadlines and cancels slow/endless %s replies', async phase => {
    for (const mode of ['slow', 'slow-body', 'endless'] as const) {
      const f = await fixture(phase, mode);
      try {
        await expect(f.controller.status()).resolves.toBeUndefined();
        const checks = await gatewayChecks({ storageDirectory: f.directory.path, port: f.state.port, token, timeoutMs: 50 });
        expect(checks.find(check => check.name === 'daemon')?.status).toBe('FAIL');
        expect(f.requests.every(request => request.route === '/healthz' || phase === 'status' && request.route === '/_portwise/status')).toBe(true);
        expect(f.requests.every(request => request.body === '' && (request.route !== '/healthz' || request.auth === undefined))).toBe(true);
        await vi.waitFor(() => expect(f.closed()).toBeGreaterThan(0));
      } finally { await f.dispose(); }
    }
  });

  it('refuses a proved status with invalid schema without sending control requests', async () => {
    const f = await fixture('status', 'schema');
    try {
      await expect(f.controller.start()).rejects.toMatchObject(unavailable);
      expect(f.requests.map(request => request.route)).toEqual(['/healthz', '/_portwise/status']);
    } finally { await f.dispose(); }
  });
});
