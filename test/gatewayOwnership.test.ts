import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import * as path from 'node:path';
import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { build } from 'esbuild';
import { describe, expect, it, vi } from 'vitest';
import { GatewayController } from '../src/gateway/controller';
import { startGateway } from '../src/gateway/daemon/server';
import { OwnedGatewayConnection } from '../src/gateway/ownedConnection';
import { OWNERSHIP_CHALLENGE_HEADER, ownershipProof, verifyOwnershipProof } from '../src/gateway/ownershipProof';
import { gatewayChecks } from '../src/diagnostics/gatewayChecks';
import { temporaryDirectory } from './helpers/temporaryDirectory';

const token = 'test-local-token-0000';
const provider = { baseUrl: 'https://provider.example/v1', token: 'test-upstream-token-0000', enabled: true };
const instanceId = 'test-public-instance-id';

async function listen(server: Server): Promise<number> {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('missing fixture port');
  return address.port;
}
async function close(server: Server): Promise<void> { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
function json(response: ServerResponse, value: unknown): void { response.setHeader('content-type', 'application/json'); response.end(JSON.stringify(value)); }
async function fake(handler?: (request: IncomingMessage, response: ServerResponse) => void) {
  const directory = await temporaryDirectory('portwise-ownership');
  const received: Array<{ route: string | undefined; auth: string | undefined; body: string }> = [];
  const server = createServer((request, response) => {
    const record = { route: request.url, auth: request.headers.authorization, body: '' }; received.push(record);
    request.on('data', (chunk: Buffer) => { record.body += chunk.toString('utf8'); });
    if (handler) handler(request, response); else json(response, { instanceId });
  });
  const port = await listen(server);
  const state = { pid: 123, port, instanceId, startedAt: 'test', version: 'test' };
  const file = path.join(directory.path, 'gateway.json'); await writeFile(file, JSON.stringify(state));
  const spawnProcess = vi.fn(() => { throw new Error('Unverified listener must never cause a launch'); });
  const controller = new GatewayController({ storageDirectory: directory.path, gatewayScript: 'unused', port, token, version: 'test', spawnProcess: spawnProcess as typeof spawn });
  return { directory, received, server, port, file, state, controller, spawnProcess, dispose: async () => { await close(server); await directory.dispose(); } };
}

describe('shared-secret gateway ownership', () => {
  it('binds the proof to a fresh nonce, instance, port and secret without exposing the secret', () => {
    const challenge = randomBytes(32).toString('base64url');
    const proof = ownershipProof(token, instanceId, 12345, challenge);
    const response = { instanceId, proof };
    expect(verifyOwnershipProof(response, token, instanceId, 12345, challenge)).toBe(true);
    for (const [key, id, port, nonce] of [[token, instanceId, 12345, randomBytes(32).toString('base64url')], [token, 'other', 12345, challenge], [token, instanceId, 12346, challenge], ['test-wrong-token-0000', instanceId, 12345, challenge]] as const) {
      expect(verifyOwnershipProof(response, key, id, port, nonce)).toBe(false);
    }
    for (const malformed of [null, {}, { instanceId, proof: token }, { instanceId, proof: 'x'.repeat(44) }, { instanceId, proof: 'x'.repeat(43) }]) expect(verifyOwnershipProof(malformed, token, instanceId, 12345, challenge)).toBe(false);
    expect(JSON.stringify(response)).not.toContain(token);
  });

  it.each(['start', 'stop', 'restart', 'sync', 'status', 'diagnostics'])('public-id impostor receives no credential or control request through %s', async action => {
    const f = await fake();
    try {
      const before = await readFile(f.file); const timestamp = (await stat(f.file)).mtimeMs;
      if (action === 'start') await expect(f.controller.start(provider)).rejects.toMatchObject({ code: 'gateway_ownership_unverified' });
      if (action === 'stop') await expect(f.controller.stop()).rejects.toMatchObject({ code: 'gateway_ownership_unverified' });
      if (action === 'restart') await expect(f.controller.restart(provider)).rejects.toMatchObject({ code: 'gateway_ownership_unverified' });
      if (action === 'sync') await expect(f.controller.syncProvider(provider)).rejects.toMatchObject({ code: 'gateway_provider_sync_failed' });
      if (action === 'status') await expect(f.controller.status()).resolves.toBeUndefined();
      if (action === 'diagnostics') {
        const checks = await gatewayChecks({ storageDirectory: f.directory.path, port: f.port, token });
        expect(checks.find(check => check.name === 'health')?.status).toBe('PASS');
        expect(checks.find(check => check.name === 'daemon')?.status).toBe('FAIL');
        expect(checks.find(check => check.name === 'local-token')?.status).toBe('FAIL');
        expect(JSON.stringify(checks)).not.toContain(token);
      }
      expect(f.received.length).toBeGreaterThan(0);
      expect(f.received.every(request => request.route === '/healthz' && request.auth === undefined && request.body === '')).toBe(true);
      expect(JSON.stringify(f.received)).not.toContain(provider.token);
      expect(await readFile(f.file)).toEqual(before); expect((await stat(f.file)).mtimeMs).toBe(timestamp);
      expect(f.spawnProcess).not.toHaveBeenCalled(); expect(f.server.listening).toBe(true);
    } finally { await f.dispose(); }
  });

  it('leaves an orphan without saved state untouched and reports the port conflict', async () => {
    const f = await fake();
    try {
      await (await import('node:fs/promises')).rm(f.file);
      await expect(f.controller.start(provider)).rejects.toMatchObject({ code: 'gateway_port_conflict' });
      await expect(f.controller.stop()).rejects.toMatchObject({ code: 'gateway_ownership_unverified' });
      expect(f.received).toEqual([]); expect(f.spawnProcess).not.toHaveBeenCalled(); expect(f.server.listening).toBe(true);
    } finally { await f.dispose(); }
  });

  it('does not adopt or configure saved state on a different port from the current setting', async () => {
    const f = await fake(); const reservation = createServer(); const port = await listen(reservation); await close(reservation);
    try {
      const controller = new GatewayController({ storageDirectory: f.directory.path, gatewayScript: 'unused', port, token, version: 'test' });
      await expect(controller.status()).resolves.toBeUndefined();
      await expect(controller.syncProvider(provider)).rejects.toMatchObject({ code: 'gateway_provider_sync_failed' });
      expect(f.received).toEqual([]); expect(f.server.listening).toBe(true);
    } finally { await f.dispose(); }
  });

  it.each(['replay', 'wrong-instance', 'wrong-port', 'wrong-key'])('rejects %s proof without sending any bearer or provider data', async mode => {
    let firstProof: string | undefined;
    const f = await fake((request, response) => {
      const nonce = request.headers[OWNERSHIP_CHALLENGE_HEADER]; if (typeof nonce !== 'string') throw new Error('missing challenge');
      const proof = ownershipProof(mode === 'wrong-key' ? 'test-wrong-token-0000' : token, mode === 'wrong-instance' ? 'other-instance' : instanceId, (request.socket.localPort ?? 0) + (mode === 'wrong-port' ? 1 : 0), nonce);
      firstProof ??= proof;
      json(response, { instanceId, proof: mode === 'replay' ? firstProof : proof });
    });
    try {
      if (mode === 'replay') { const initial = await OwnedGatewayConnection.open({ port: f.port, instanceId, token }); initial.close(); }
      await expect(f.controller.start(provider)).rejects.toMatchObject({ code: 'gateway_ownership_unverified' });
      expect(f.received.every(request => request.auth === undefined && request.body === '' && request.route === '/healthz')).toBe(true);
    } finally { await f.dispose(); }
  });

  it('never sends credentials on a replacement connection after a valid proof closes its socket', async () => {
    const f = await fake((request, response) => {
      const nonce = request.headers[OWNERSHIP_CHALLENGE_HEADER]; if (typeof nonce !== 'string') throw new Error('missing challenge');
      response.setHeader('connection', 'close');
      json(response, { instanceId, proof: ownershipProof(token, instanceId, request.socket.localPort ?? 0, nonce) });
    });
    try {
      const owned = await OwnedGatewayConnection.open({ port: f.port, instanceId, token });
      try { await expect(owned.request('/_portwise/providers', provider)).rejects.toMatchObject({ code: 'gateway_ownership_unverified' }); }
      finally { owned.close(); }
      expect(f.received).toHaveLength(1); expect(f.received[0]?.auth).toBeUndefined(); expect(f.received[0]?.body).toBe('');
    } finally { await f.dispose(); }
  });

  it('refuses a proof relayed from a genuine daemon on a different loopback port', async () => {
    const daemon = await startGateway({ port: 0, token, instanceId });
    let authenticated = 0; daemon.server.on('request', request => { if (request.headers.authorization) authenticated++; });
    const f = await fake((request, response) => {
      const nonce = request.headers[OWNERSHIP_CHALLENGE_HEADER]; if (typeof nonce !== 'string') throw new Error('missing challenge');
      void fetch(`http://127.0.0.1:${daemon.port}/healthz`, { headers: { [OWNERSHIP_CHALLENGE_HEADER]: nonce } }).then(async result => json(response, await result.json())).catch(() => response.destroy());
    });
    try {
      await expect(f.controller.start(provider)).rejects.toMatchObject({ code: 'gateway_ownership_unverified' });
      expect(authenticated).toBe(0); expect(f.received.every(request => !request.auth && request.body === '')).toBe(true);
    } finally { await f.dispose(); await daemon.close(); }
  });

  it('starts, restarts and stops a real detached fixture daemon without changing the stdin secret boundary', async () => {
    const directory = await temporaryDirectory('portwise-owned-lifecycle');
    const reservation = createServer(); const port = await listen(reservation); await close(reservation);
    const script = path.join(directory.path, 'gateway.cjs');
    await build({ entryPoints: ['src/gateway/daemon/main.ts'], outfile: script, bundle: true, platform: 'node', format: 'cjs' });
    const children: ChildProcess[] = [];
    const launch = ((command: string, args: string[], options: SpawnOptions) => { const child = spawn(command, args, options); children.push(child); return child; }) as typeof spawn;
    const controller = new GatewayController({ storageDirectory: directory.path, gatewayScript: script, port, token, version: 'test', spawnProcess: launch });
    try {
      const first = await controller.start(); expect(first.port).toBe(port);
      await expect(controller.status()).resolves.toEqual(first);
      const next = await controller.restart(); expect(next.port).toBe(port); expect(next.instanceId).not.toBe(first.instanceId);
      await controller.stop(); expect(await controller.status()).toBeUndefined();
      await expect(readFile(path.join(directory.path, 'gateway.json'))).rejects.toMatchObject({ code: 'ENOENT' });
      expect(children).toHaveLength(2);
      for (const child of children) expect(JSON.stringify(child.spawnargs)).not.toContain(token);
    } finally {
      // These are only the disposable children created by this test, never a foreign PID.
      for (const child of children) if (child.exitCode === null) child.kill();
      await directory.dispose();
    }
  }, 20_000); // Two real Windows private-state writes plus detached process startup.

  it('adopts and stops a genuine daemon using the same proven connection for each control operation', async () => {
    const directory = await temporaryDirectory('portwise-genuine-ownership');
    const daemon = await startGateway({ port: 0, token, instanceId });
    const routes = new Map<number, string[]>();
    daemon.server.on('request', request => { const port = request.socket.remotePort ?? 0; const sequence = routes.get(port) ?? []; sequence.push(request.url ?? ''); routes.set(port, sequence); });
    try {
      const state = { pid: 123, port: daemon.port, instanceId, startedAt: 'test', version: 'test' };
      await writeFile(path.join(directory.path, 'gateway.json'), JSON.stringify(state));
      const controller = new GatewayController({ storageDirectory: directory.path, gatewayScript: 'unused', port: daemon.port, token, version: 'test' });
      await expect(controller.start(provider)).resolves.toEqual(state);
      await expect(controller.status()).resolves.toEqual(state);
      const checks = await gatewayChecks({ storageDirectory: directory.path, port: daemon.port, token });
      expect(checks.find(check => check.name === 'daemon')?.status).toBe('PASS'); expect(checks.find(check => check.name === 'local-token')?.status).toBe('PASS');
      await controller.stop(); expect(daemon.server.listening).toBe(false);
      for (const sequence of routes.values()) if (sequence.some(route => route.startsWith('/_portwise/'))) expect(sequence[0]).toBe('/healthz');
      expect([...routes.values()]).toContainEqual(['/healthz', '/_portwise/status', '/_portwise/providers']);
    } finally { await daemon.close(); await directory.dispose(); }
  });

  it('rejects malformed challenges at health and invalid ownership targets without a control call', async () => {
    const daemon = await startGateway({ port: 0, token });
    try {
      for (const challenge of ['short', 'x'.repeat(44), 'x'.repeat(42) + '+']) {
        const response = await fetch(`http://127.0.0.1:${daemon.port}/healthz`, { headers: { [OWNERSHIP_CHALLENGE_HEADER]: challenge } });
        expect(response.status).toBe(400); expect(await response.text()).not.toContain(token);
      }
      for (const port of [0, -1, 65536, 1.5]) await expect(OwnedGatewayConnection.open({ port, instanceId, token })).rejects.toMatchObject({ code: 'gateway_ownership_unverified' });
    } finally { await daemon.close(); }
  });

  it.each(['upgrade', 'slow-body', 'malformed', 'oversized'])('rejects %s ownership replies without hanging or sending credentials', async mode => {
    const f = await fake((_request, response) => {
      if (mode === 'upgrade') { response.writeHead(101, { connection: 'upgrade', upgrade: 'test' }); response.end(); }
      else if (mode === 'slow-body') { response.writeHead(200); response.write('{"instanceId":'); }
      else response.end(mode === 'oversized' ? 'x'.repeat(5000) : '{invalid');
    });
    try {
      await expect(OwnedGatewayConnection.open({ port: f.port, instanceId, token, timeoutMs: 50 })).rejects.toMatchObject({ code: mode === 'upgrade' ? 'gateway_ownership_unverified' : 'gateway_response_unavailable' });
      expect(f.received).toHaveLength(1); expect(f.received[0]?.route).toBe('/healthz');
      expect(f.received[0]?.auth).toBeUndefined(); expect(f.received[0]?.body).toBe('');
    } finally { await f.dispose(); }
  });
});
