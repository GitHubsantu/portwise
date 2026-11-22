import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter, once } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { createServer } from 'node:http';
import * as path from 'node:path';
import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';
import { GatewayController } from '../src/gateway/controller';
import { isGatewayOptions } from '../src/gateway/daemon/options';
import { temporaryDirectory } from './helpers/temporaryDirectory';
import { startupMessage } from '../src/gateway/probeFailure';

describe('gateway bootstrap failure handling', () => {
  it.each(['spawn', 'stdin', 'stderr', 'exit', 'throw'])('handles %s failure without an uncaught event or raw process output', async failure => {
    const directory = await temporaryDirectory('portwise-start-failure');
    try {
      // Use a valid configured port; native occupancy checks treat invalid/unknown errors as occupied.
      const reservation = createServer(); await new Promise<void>(resolve => reservation.listen(0, '127.0.0.1', resolve));
      const address = reservation.address(); if (!address || typeof address === 'string') throw new Error('missing fixture port');
      await new Promise<void>(resolve => reservation.close(() => resolve()));
      const stderr = new PassThrough();
      const child = Object.assign(new EventEmitter(), { pid: 123, unref: () => undefined, stderr,
        stdin: new Writable({ write: (_chunk, _encoding, callback) => callback(failure === 'stdin' ? new Error('test-opaque-0000') : undefined) }),
      }) as unknown as ChildProcess;
      const run = (() => { if (failure === 'throw') throw new Error('test-opaque-0000'); queueMicrotask(() => {
        if (failure === 'spawn') child.emit('error', new Error('test-opaque-0000'));
        if (failure === 'stderr') stderr.write('{"error":{"code":"gateway_bootstrap_invalid","message":"test-opaque-0000"}}\n');
        if (failure === 'exit') child.emit('exit', 1);
      }); return child; }) as unknown as typeof spawn;
      const controller = new GatewayController({ storageDirectory: directory.path, gatewayScript: 'unused', port: address.port, token: 'test-token-0000', version: 'test', spawnProcess: run,
        delay: async () => { await new Promise<void>(resolve => setImmediate(resolve)); },
      });
      const reason = failure === 'spawn' || failure === 'throw' ? 'spawn_failed' : failure === 'exit' ? 'process_exited' : 'bootstrap_failed';
      await expect(controller.start()).rejects.toMatchObject({ code: 'gateway_start_failed', message: startupMessage({ step: 'spawn', reason }) });
      stderr.destroy();
    } finally { await directory.dispose(); }
  });
  it('rejects empty auth tokens, invalid option bounds and unsafe provider bootstrap without starting a listener', () => {
    for (const value of [{ token: '' }, { token: 'test-token-0000', port: -1 }, { token: 'test-token-0000', totalTimeoutMs: 0 }, { token: 'test-token-0000', maxConnections: 0 }, { token: 'test-token-0000', onShutdown: 'invalid' }, { token: 'test-token-0000', provider: { baseUrl: 'http://not-loopback.invalid', token: 'test-token-0000', enabled: true } }]) {
      expect(isGatewayOptions(value)).toBe(false);
    }
  });
  it('exits cleanly with fixed redacted JSON for malformed/oversized stdin and bind failure in a real child process', async () => {
    const directory = await temporaryDirectory('portwise-real-bootstrap'); const script = path.join(directory.path, 'gateway.cjs');
    const occupied = createServer(); await new Promise<void>(resolve => occupied.listen(0, '127.0.0.1', resolve));
    const address = occupied.address(); if (!address || typeof address === 'string') throw new Error('missing port');
    try {
      await build({ entryPoints: ['src/gateway/daemon/main.ts'], outfile: script, bundle: true, platform: 'node', format: 'cjs' });
      for (const input of ['{"token":"test-opaque-0000",', 'x'.repeat(70 * 1024), JSON.stringify({ token: 'test-token-0000', port: address.port })]) {
        const child = spawn(process.execPath, [script], { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] });
        let output = ''; child.stderr.on('data', (chunk: Buffer) => { output += chunk.toString('utf8'); }); child.stdin.on('error', () => undefined);
        const closed = once(child, 'close', { signal: AbortSignal.timeout(5000) }); child.stdin.end(input);
        expect((await closed)[0]).toBe(1); expect(output).not.toContain('test-opaque-0000'); expect(output).not.toContain('test-token-0000');
        expect(JSON.parse(output)).toMatchObject({ error: { hop: 'gateway', code: expect.stringMatching(/^gateway_(bootstrap_invalid|bind_failed)$/) } });
      }
    } finally { await new Promise<void>(resolve => occupied.close(() => resolve())); await directory.dispose(); }
  });
});
