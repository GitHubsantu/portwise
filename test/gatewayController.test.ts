import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { GatewayController } from '../src/gateway/controller';
import { startGateway } from '../src/gateway/daemon/server';
import { temporaryDirectory } from './helpers/temporaryDirectory';

const token = 'test-token-0000';

describe('GatewayController', () => {
  it('authenticates provider replacement, clears removed providers and reports sync failure without exposing credentials', async () => {
    const directory = await temporaryDirectory('portwise-provider-sync');
    const received: string[] = [];
    const upstream = createServer((request, response) => { received.push(request.headers.authorization ?? ''); response.end('fake upstream'); });
    await new Promise<void>(resolve => upstream.listen(0, '127.0.0.1', resolve));
    const address = upstream.address(); if (!address || typeof address === 'string') throw new Error('missing upstream');
    const baseUrl = `http://127.0.0.1:${address.port}/v1`;
    const daemon = await startGateway({ token, provider: { baseUrl, token: 'test-old-token-0000', enabled: true }, port: 0, instanceId: 'sync-instance' });
    try {
      await (await import('node:fs/promises')).writeFile(path.join(directory.path, 'gateway.json'), JSON.stringify({ pid: 123, port: daemon.port, instanceId: daemon.instanceId, startedAt: 'now', version: 'test' }));
      const controller = new GatewayController({ storageDirectory: directory.path, gatewayScript: 'unused', port: daemon.port, token, version: 'test' });
      const request = () => fetch(`http://127.0.0.1:${daemon.port}/v1/models`, { headers: { authorization: `Bearer ${token}` } });
      await controller.syncProvider({ baseUrl, token: 'test-new-token-0000', enabled: true });
      expect(await (await request()).text()).toBe('fake upstream'); expect(received).toEqual(['Bearer test-new-token-0000']);
      await controller.syncProvider(); expect((await request()).status).toBe(503); expect(received).toHaveLength(1);
      await controller.start({ baseUrl, token: 'test-adopt-0000', enabled: true });
      await (await request()).text(); expect(received.at(-1)).toBe('Bearer test-adopt-0000');
      const failed = new GatewayController({ storageDirectory: directory.path, gatewayScript: 'unused', port: daemon.port, token, version: 'test', request: async (input, init) => init?.method === 'PUT' ? new Response('', { status: 500 }) : fetch(input, init) });
      await expect(failed.syncProvider({ baseUrl, token: 'test-private-token-0000', enabled: true })).rejects.toMatchObject({ code: 'gateway_provider_sync_failed', message: expect.stringContaining('previous provider') });
      const impostor = new GatewayController({ storageDirectory: directory.path, gatewayScript: 'unused', port: daemon.port, token: 'wrong-token-0000', version: 'test' });
      await expect(impostor.syncProvider()).rejects.toMatchObject({ code: 'gateway_provider_sync_failed' });
    } finally { await daemon.close(); await new Promise<void>(resolve => upstream.close(() => resolve())); await directory.dispose(); }
  });
  it('adopts only after matching health and authenticated status, without putting secrets in state', async () => {
    const directory = await temporaryDirectory('portwise-gateway-controller');
    const daemon = await startGateway({ token, port: 0, instanceId: 'instance-a' });
    try {
      const state = { pid: 123, port: daemon.port, instanceId: daemon.instanceId, startedAt: 'now', version: 'test' };
      const stateFile = path.join(directory.path, 'gateway.json');
      await (await import('node:fs/promises')).writeFile(stateFile, JSON.stringify(state));
      const controller = new GatewayController({ storageDirectory: directory.path, gatewayScript: 'unused', port: daemon.port, token, version: 'test' });
      await expect(controller.status()).resolves.toEqual(state);
      expect(await readFile(stateFile, 'utf8')).not.toContain(token);
    } finally { await daemon.close(); await directory.dispose(); }
  });

  it('does not adopt a daemon when status authentication fails', async () => {
    const directory = await temporaryDirectory('portwise-gateway-token');
    const daemon = await startGateway({ token, port: 0, instanceId: 'instance-a' });
    try {
      await (await import('node:fs/promises')).writeFile(path.join(directory.path, 'gateway.json'), JSON.stringify({ pid: 123, port: daemon.port, instanceId: daemon.instanceId, startedAt: 'now', version: 'test' }));
      const controller = new GatewayController({ storageDirectory: directory.path, gatewayScript: 'unused', port: daemon.port, token: 'wrong-token-0000', version: 'test' });
      await expect(controller.status()).resolves.toBeUndefined();
    } finally { await daemon.close(); await directory.dispose(); }
  });

  it('reports a foreign occupied configured port rather than silently selecting another', async () => {
    const directory = await temporaryDirectory('portwise-gateway-conflict');
    const foreign = createServer((_request, response) => response.end('foreign'));
    await new Promise<void>((resolve) => foreign.listen(0, '127.0.0.1', resolve));
    const address = foreign.address(); if (!address || typeof address === 'string') throw new Error('missing port');
    try {
      const controller = new GatewayController({ storageDirectory: directory.path, gatewayScript: 'unused', port: address.port, token, version: 'test', delay: async () => undefined });
      await expect(controller.start()).rejects.toMatchObject({ code: 'gateway_port_conflict' });
    } finally { await new Promise<void>((resolve, reject) => foreign.close((error) => error ? reject(error) : resolve())); await directory.dispose(); }
  });
});
