import { createServer } from 'node:net';
import { spawn, type ChildProcess } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { build } from 'esbuild';
import { describe, expect, it, vi } from 'vitest';
import * as atomic from '../src/core/atomicWrite';
import { PortwiseError } from '../src/core/errors';
import { isLeaseMessage } from '../src/gateway/startupLease';
import { GatewayController } from '../src/gateway/controller';
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
  it('respawns once after confirmed never-listened closure, then confirms the second child', async () => {
    const f = await fixture(); let first = true;
    const launch = ((command: string, args: string[], options: Parameters<typeof spawn>[2]) => {
      const child = f.launch(command, args, options);
      if (first) { first = false; queueMicrotask(() => child.stderr?.emit('error', new Error('test-pipe-0000'))); }
      return child;
    }) as typeof spawn;
    const controller = new GatewayController({ storageDirectory: f.directory.path, gatewayScript: f.script, port: f.port, token: 'test-cold-token-0000', version: 'test', spawnProcess: launch });
    try {
      const state = await controller.start(); expect(state.port).toBe(f.port); expect(f.children).toHaveLength(2);
      expect(f.children[0]?.exitCode).not.toBeNull(); expect(await controller.status()).toEqual(state); await controller.stop();
    } finally { await f.dispose(); }
  }, 15_000);

  it('closes the real listener on parent IPC loss before confirmation', async () => {
    const f = await fixture();
    try {
      const child = f.launch(process.execPath, [f.script], { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe', 'ipc'] });
      const trace: string[] = [];
      const closed = new Promise<void>(resolve => { child.once('exit', () => resolve()); child.once('close', () => resolve()); });
      const listening = new Promise<void>(resolve => child.on('message', (value: unknown) => {
        if (!isLeaseMessage(value)) return;
        trace.push(value.type);
        if (value.type === 'startup-ready') child.send({ type: 'startup-proceed', instanceId: value.instanceId });
        if (value.type === 'startup-listening') resolve();
      }));
      child.stdin?.end(JSON.stringify({ token: 'test-cold-token-0000', port: f.port, instanceId: 'test-parent-loss' }));
      let timer: ReturnType<typeof setTimeout> | undefined;
      try { await Promise.race([listening, new Promise<void>((_resolve, reject) => { timer = setTimeout(() => reject(new Error(`Fixture IPC phases: ${trace.join(',')}; connected=${child.connected}; exited=${child.exitCode !== null}`)), 4000); })]); }
      finally { clearTimeout(timer); }
      child.disconnect();
      try { await Promise.race([closed, new Promise<void>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('Unconfirmed child did not terminate after IPC loss.')), 4000); })]); } finally { clearTimeout(timer); }
      expect(child.exitCode).not.toBeNull();
      await expect(readFile(path.join(f.directory.path, 'gateway.json'))).rejects.toMatchObject({ code: 'ENOENT' });
    } finally { await f.dispose(); }
  }, 10_000);

  it('does not respawn a child that already listened when saving state fails', async () => {
    const f = await fixture(); const write = vi.spyOn(atomic, 'atomicWrite').mockRejectedValue(new PortwiseError('Test state failure.', 'test_state_failure'));
    try {
      await expect(f.controller.start()).rejects.toMatchObject({ code: 'test_state_failure' });
      expect(f.children).toHaveLength(1); expect(f.children[0]?.exitCode).not.toBeNull();
    } finally { write.mockRestore(); await f.dispose(); }
  }, 10_000);
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

  it('closes late real children after pipe failure, with at most one proven-safe respawn and no orphan', async () => {
    const f = await fixture();
    const trace: string[] = [];
    const launch = ((command: string, args: string[], options: Parameters<typeof spawn>[2]) => {
      const child = f.launch(command, args, options);
      child.on('message', (value: unknown) => { if (isLeaseMessage(value)) trace.push(`${value.type}:${value.listened}`); });
      queueMicrotask(() => { child.stderr?.emit('error', new Error('test-opaque-0000')); });
      return child;
    }) as typeof spawn;
    const controller = new GatewayController({ storageDirectory: f.directory.path, gatewayScript: f.script, port: f.port, token: 'test-cold-token-0000', version: 'test', spawnProcess: launch });
    try {
      await expect(controller.start()).rejects.toMatchObject({ code: 'gateway_start_failed', message: expect.stringContaining('reason=stderr_failed') });
      await new Promise(resolve => setTimeout(resolve, 1800));
      expect(f.children, trace.join(',')).toHaveLength(2);
      expect(f.children.every(child => child.exitCode !== null || child.signalCode !== null)).toBe(true);
      const socket = await import('node:net');
      await new Promise<void>((resolve, reject) => { const connection = socket.connect({ host: '127.0.0.1', port: f.port }); connection.once('connect', () => { connection.destroy(); reject(new Error('Orphan listener remained.')); }); connection.once('error', error => { connection.destroy(); if ('code' in error && error.code === 'ECONNREFUSED') resolve(); else reject(error); }); });
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
