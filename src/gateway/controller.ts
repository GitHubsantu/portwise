import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm } from 'node:fs/promises';
import * as path from 'node:path';
import { atomicWrite } from '../core/atomicWrite';
import { PortwiseError } from '../core/errors';
import type { GatewayProvider } from './daemon/server';

export interface GatewayState { pid: number; port: number; instanceId: string; startedAt: string; version: string; }
export interface GatewayControllerOptions {
  storageDirectory: string;
  gatewayScript: string;
  port: number;
  token: string;
  version: string;
  spawnProcess?: typeof spawn;
  request?: typeof fetch;
  delay?: (milliseconds: number) => Promise<void>;
}

export class GatewayController {
  private readonly stateFile: string;
  private readonly run: typeof spawn;
  private readonly request: typeof fetch;
  private readonly delay: (milliseconds: number) => Promise<void>;

  constructor(private readonly options: GatewayControllerOptions) {
    this.stateFile = path.join(options.storageDirectory, 'gateway.json');
    this.run = options.spawnProcess ?? spawn;
    this.request = options.request ?? fetch;
    this.delay = options.delay ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  }

  async start(provider?: GatewayProvider): Promise<GatewayState> {
    const existing = await this.readState();
    if (existing && await this.adopt(existing)) return existing;
    if (existing) await this.clearState();
    if (await this.portOccupied()) throw new GatewayLifecycleError(`Port ${this.options.port} is already in use by another process. Change portwise.gatewayPort, or stop the other process, then start Portwise again.`, 'gateway_port_conflict');

    const instanceId = randomUUID();
    const child = this.run(process.execPath, [this.options.gatewayScript], {
      detached: true, windowsHide: true, shell: false, stdio: ['pipe', 'ignore', 'ignore'],
    });
    bootstrap(child, { token: this.options.token, provider, port: this.options.port, instanceId });
    child.unref();
    const state: GatewayState = { pid: child.pid ?? 0, port: this.options.port, instanceId, startedAt: new Date().toISOString(), version: this.options.version };
    if (!await this.waitForAdoption(state)) {
      throw new GatewayLifecycleError(`Gateway did not become healthy on port ${state.port}. Check the Portwise output log.`, 'gateway_start_failed');
    }
    await this.writeState(state);
    return state;
  }

  async stop(): Promise<void> {
    const state = await this.readState();
    if (!state) return;
    if (await this.adopt(state)) {
      try {
        await this.request(this.url(state.port, '/_portwise/shutdown'), { method: 'POST', headers: { authorization: `Bearer ${this.options.token}` }, redirect: 'error', signal: AbortSignal.timeout(1_000) });
      } catch { throw new GatewayLifecycleError('Gateway shutdown request failed. The daemon may still be running.', 'gateway_stop_failed'); }
      for (let attempt = 0; attempt < 20; attempt += 1) { if (!await this.portOccupied()) break; await this.delay(25); }
      if (await this.portOccupied()) throw new GatewayLifecycleError('Gateway did not release its port after shutdown.', 'gateway_stop_failed');
    }
    await this.clearState();
  }

  async restart(provider?: GatewayProvider): Promise<GatewayState> { await this.stop(); return this.start(provider); }
  async status(): Promise<GatewayState | undefined> { const state = await this.readState(); return state && await this.adopt(state) ? state : undefined; }

  private async waitForAdoption(state: GatewayState): Promise<boolean> {
    for (let attempt = 0; attempt < 40; attempt += 1) { if (await this.adopt(state)) return true; await this.delay(25); }
    return false;
  }

  private async adopt(state: GatewayState): Promise<boolean> {
    try {
      const health = await this.request(this.url(state.port, '/healthz'), { redirect: 'error', signal: AbortSignal.timeout(500) });
      if (!health.ok || !hasInstanceId(await health.json(), state.instanceId)) return false;
      const status = await this.request(this.url(state.port, '/_portwise/status'), { headers: { authorization: `Bearer ${this.options.token}` }, redirect: 'error', signal: AbortSignal.timeout(500) });
      return status.ok && hasInstanceId(await status.json(), state.instanceId);
    } catch { return false; }
  }

  private async portOccupied(): Promise<boolean> {
    try { await this.request(this.url(this.options.port, '/healthz'), { redirect: 'error', signal: AbortSignal.timeout(300) }); return true; } catch { return false; }
  }
  private url(port: number, target: string): string { return `http://127.0.0.1:${port}${target}`; }
  private async readState(): Promise<GatewayState | undefined> {
    try { const value: unknown = JSON.parse(await readFile(this.stateFile, 'utf8')); return isGatewayState(value) ? value : undefined; } catch { return undefined; }
  }
  private async writeState(state: GatewayState): Promise<void> { await mkdir(this.options.storageDirectory, { recursive: true }); await atomicWrite(this.stateFile, JSON.stringify(state), { mode: 0o600 }); }
  private async clearState(): Promise<void> { await rm(this.stateFile, { force: true }); }
}

export class GatewayLifecycleError extends PortwiseError {
  constructor(message: string, code: string) { super(message, code); this.name = 'GatewayLifecycleError'; }
}

function bootstrap(child: ChildProcess, configuration: object): void {
  if (!child.stdin) throw new GatewayLifecycleError('Gateway process did not expose a secure stdin channel.', 'gateway_start_failed');
  child.stdin.end(JSON.stringify(configuration));
}
function hasInstanceId(value: unknown, expected: string): boolean { return typeof value === 'object' && value !== null && 'instanceId' in value && value.instanceId === expected; }
function isGatewayState(value: unknown): value is GatewayState {
  return typeof value === 'object' && value !== null && typeof (value as GatewayState).pid === 'number' && typeof (value as GatewayState).port === 'number' && typeof (value as GatewayState).instanceId === 'string' && typeof (value as GatewayState).startedAt === 'string' && typeof (value as GatewayState).version === 'string';
}
