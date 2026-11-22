import * as http from 'node:http';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { type ChildProcess, type spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startGateway } from '../src/gateway/daemon/server';
import { GatewayController } from '../src/gateway/controller';
import { OwnedGatewayConnection } from '../src/gateway/ownedConnection';
import { OwnershipVerificationError, startupMessage, type ProbeDetail } from '../src/gateway/probeFailure';
import { GatewayResponseUnavailableError, readGatewayResponse } from '../src/gateway/readResponse';
import { temporaryDirectory } from './helpers/temporaryDirectory';

vi.mock('node:http', async original => ({ ...await original<typeof http>() }));
afterEach(() => vi.restoreAllMocks());
const token = 'test-transport-token-0000';

describe('native loopback ownership transport', () => {
  it('keeps its own agent when the request factory would substitute a non-keep-alive agent', async () => {
    const daemon = await startGateway({ port: 0, token });
    const native = http.request; const substitute = new http.Agent({ keepAlive: false });
    const factory = vi.spyOn(http, 'request').mockImplementation(((options: http.RequestOptions, callback: (response: http.IncomingMessage) => void) => native({ ...options, agent: substitute }, callback)) as typeof http.request);
    const routes = new Map<number, string[]>();
    daemon.server.on('request', request => { const port = request.socket.remotePort ?? 0; const sequence = routes.get(port) ?? []; sequence.push(request.url ?? ''); routes.set(port, sequence); });
    try {
      const owned = await OwnedGatewayConnection.open({ port: daemon.port, token, instanceId: daemon.instanceId });
      try {
        const status = await owned.request('/_portwise/status'); expect(status.status).toBe(200); await status.text();
        const changed = await owned.request('/_portwise/providers', null); expect(changed.status).toBe(200); await changed.text();
      } finally { owned.close(); }
      expect(factory).not.toHaveBeenCalled();
      expect([...routes.values()]).toEqual([['/healthz', '/_portwise/status', '/_portwise/providers']]);
    } finally { substitute.destroy(); await daemon.close(); }
  });

  it('rejects a replacement socket with a fixed reason before any credential is delivered', async () => {
    const daemon = await startGateway({ port: 0, token });
    const requests: Array<{ auth: string | undefined; route: string | undefined }> = [];
    daemon.server.prependListener('request', (request, response) => { requests.push({ auth: request.headers.authorization, route: request.url }); response.setHeader('connection', 'close'); });
    try {
      const owned = await OwnedGatewayConnection.open({ port: daemon.port, token, instanceId: daemon.instanceId });
      try { await expect(owned.request('/_portwise/providers', { token: 'test-provider-token-0000' })).rejects.toMatchObject({ code: 'gateway_ownership_unverified', detail: { step: 'status', reason: 'verified_socket_changed' } }); }
      finally { owned.close(); }
      expect(requests).toEqual([{ auth: undefined, route: '/healthz' }]);
    } finally { await daemon.close(); }
  });
});

describe('bounded startup failure diagnostics', () => {
  it.each(['health', 'status'] as const)('classifies invalid and oversized %s bodies without echoing content', async step => {
    await expect(readGatewayResponse(new Response('test-opaque-credential-0000'), step)).rejects.toMatchObject({ code: 'gateway_response_unavailable', detail: { step, reason: 'response_invalid' } });
    await expect(readGatewayResponse(new Response('test-opaque-credential-0000'.repeat(200)), step)).rejects.toMatchObject({ code: 'gateway_response_unavailable', detail: { step, reason: 'response_too_large' } });
  });
  const cases: ProbeDetail[] = [
    { step: 'health', reason: 'connection_refused' }, { step: 'health', reason: 'connection_failed' },
    { step: 'health', reason: 'timeout' }, { step: 'health', reason: 'response_invalid' },
    { step: 'health', reason: 'response_too_large' }, { step: 'health', reason: 'response_incomplete' },
    { step: 'proof', reason: 'proof_mismatch' }, { step: 'status', reason: 'verified_socket_changed' },
    { step: 'status', reason: 'response_invalid' }, { step: 'status', reason: 'response_too_large' },
  ];
  it.each(cases)('reports $step/$reason once without raw failure content or state publication', async detail => {
    const directory = await temporaryDirectory('portwise-probe-diagnostics');
    const reservation = http.createServer(); await new Promise<void>(resolve => reservation.listen(0, '127.0.0.1', resolve));
    const address = reservation.address(); if (!address || typeof address === 'string') throw new Error('fixture port missing');
    await new Promise<void>(resolve => reservation.close(() => resolve()));
    const child = Object.assign(new EventEmitter(), { pid: 123, unref: () => undefined, stdin: new PassThrough(), stderr: new PassThrough() }) as unknown as ChildProcess;
    const failure = detail.reason.startsWith('response_') ? new GatewayResponseUnavailableError(detail) : new OwnershipVerificationError(detail);
    failure.stack = 'test-opaque-credential-0000';
    vi.spyOn(OwnedGatewayConnection, 'open').mockRejectedValue(failure);
    const controller = new GatewayController({ storageDirectory: directory.path, port: address.port, token, version: 'test', gatewayScript: 'unused', spawnProcess: (() => child) as typeof spawn, delay: async () => undefined });
    try {
      await expect(controller.start()).rejects.toMatchObject({ code: 'gateway_start_failed', message: startupMessage(detail) });
      await expect(readFile(path.join(directory.path, 'gateway.json'))).rejects.toMatchObject({ code: 'ENOENT' });
    } finally { child.stdin?.destroy(); child.stderr?.destroy(); await directory.dispose(); }
  });
});
