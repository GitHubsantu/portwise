import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { GatewayController } from '../src/gateway/controller';
import { startGateway } from '../src/gateway/daemon/server';
import { temporaryDirectory } from './helpers/temporaryDirectory';

const token = 'test-token-0000';

describe('GatewayController', () => {
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
