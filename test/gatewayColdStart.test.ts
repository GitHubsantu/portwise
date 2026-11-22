import { createServer } from 'node:net';
import { spawn, type ChildProcess } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';
import { GatewayController } from '../src/gateway/controller';
import { OwnedGatewayConnection } from '../src/gateway/ownedConnection';
import { temporaryDirectory } from './helpers/temporaryDirectory';
import { readGatewaySettings, assertGatewaySettings } from '../src/gateway/settings';

async function fixture() {
  const directory = await temporaryDirectory('portwise-cold-start');
  const reservation = createServer(); await new Promise<void>(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const address = reservation.address(); if (!address || typeof address === 'string') throw new Error('missing fixture port');
  await new Promise<void>(resolve => reservation.close(() => resolve()));
  const main = path.join(directory.path, 'main.cjs'); const script = path.join(directory.path, 'delayed.cjs');
  await build({ entryPoints: ['src/gateway/daemon/main.ts'], outfile: main, bundle: true, platform: 'node', format: 'cjs' });
  await build({ stdin: { contents: `setTimeout(()=>require(${JSON.stringify(main)}),1500);` }, outfile: script, platform: 'node', format: 'cjs' });
  const children: ChildProcess[] = [];
  const launch: typeof spawn = ((command: string, args: string[], options: Parameters<typeof spawn>[2]) => { const child = spawn(command, args, { ...options, env: { ...process.env, CODEX_HOME: directory.path } }); children.push(child); return child; }) as typeof spawn;
  const controller = new GatewayController({ storageDirectory: directory.path, gatewayScript: script, port: address.port, token: 'test-cold-token-0000', version: 'test', spawnProcess: launch });
  return { directory, controller, children, port: address.port, script, launch, async dispose() { for (const child of children) if (child.exitCode === null) child.kill(); await directory.dispose(); } };
}

describe('cold startup and settings', () => {
  it('waits for the same real delayed daemon and serializes overlapping starts, restart and stop', async () => {
    const f = await fixture();
    try {
      const [first, second] = await Promise.all([f.controller.start(), f.controller.start()]);
      expect(second).toEqual(first); expect(f.children).toHaveLength(1);
      const restart = f.controller.restart(); const stop = f.controller.stop();
      expect((await restart).instanceId).not.toBe(first.instanceId); await stop;
      expect(f.children).toHaveLength(2); expect(await f.controller.status()).toBeUndefined();
    } finally { await f.dispose(); }
  }, 20_000);

  it('demonstrates why a lease is needed: a pipe failure can precede the real child binding', async () => {
    const f = await fixture(); let instanceId = '';
    const launch = ((command: string, args: string[], options: Parameters<typeof spawn>[2]) => {
      const child = f.launch(command, args, options);
      child.stdin?.once('finish', () => { child.stderr?.emit('error', new Error('test-opaque-0000')); });
      // Record only the fake fixture identity, never emit bootstrap contents.
      const end = child.stdin?.end.bind(child.stdin);
      if (child.stdin && end) child.stdin.end = ((value: string) => { instanceId = (JSON.parse(value) as { instanceId: string }).instanceId; return end(value); }) as typeof child.stdin.end;
      return child;
    }) as typeof spawn;
    const controller = new GatewayController({ storageDirectory: f.directory.path, gatewayScript: f.script, port: f.port, token: 'test-cold-token-0000', version: 'test', spawnProcess: launch });
    try {
      await expect(controller.start()).rejects.toMatchObject({ code: 'gateway_start_failed', message: expect.stringContaining('reason=stderr_failed') });
      await new Promise(resolve => setTimeout(resolve, 1800));
      const owned = await OwnedGatewayConnection.open({ port: f.port, token: 'test-cold-token-0000', instanceId });
      try { expect((await owned.request('/_portwise/status')).status).toBe(200); } finally { owned.close(); }
      await expect(readFile(path.join(f.directory.path, 'gateway.json'))).rejects.toMatchObject({ code: 'ENOENT' });
    } finally { await f.dispose(); }
  }, 10_000);

  it('reads effective non-default values and rejects changed or invalid settings', () => {
    const config = { get: <T>(key: string, fallback: T): T => (key === 'gatewayPort' ? 49001 : key === 'autoStartGateway' ? false : fallback) as T, inspect: <T>() => ({ globalValue: false as T }) };
    const settings = readGatewaySettings(config);
    expect(settings).toEqual({ port: 49001, autoStart: false, portSource: 'global', autoStartSource: 'global' });
    expect(() => assertGatewaySettings(settings, { ...settings, port: 49002 })).toThrow('Gateway settings changed');
    expect(() => assertGatewaySettings(settings, { ...settings, autoStart: true })).toThrow('Gateway settings changed');
    expect(() => readGatewaySettings({ get: <T>() => -1 as T })).toThrow('Gateway settings are invalid');
  });
  it('detects an effective setting change while a real child is still starting', async () => {
    const f = await fixture();
    const expected = { port: f.port, autoStart: false, portSource: 'global' as const, autoStartSource: 'global' as const };
    let current = expected;
    const controller = new GatewayController({ storageDirectory: f.directory.path, gatewayScript: f.script, port: f.port, token: 'test-cold-token-0000', version: 'test', spawnProcess: f.launch, assertSettings: () => assertGatewaySettings(expected, current) });
    const timer = setTimeout(() => { current = { ...expected, autoStart: true }; }, 100);
    try { await expect(controller.start()).rejects.toMatchObject({ code: 'gateway_settings_changed' }); }
    finally { clearTimeout(timer); await f.dispose(); }
  });
});
