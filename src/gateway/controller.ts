import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm } from 'node:fs/promises';
import * as path from 'node:path';
import { connect } from 'node:net';
import { atomicWrite } from '../core/atomicWrite';
import { PortwiseError } from '../core/errors';
import type { GatewayProvider } from './daemon/server';
import { OwnedGatewayConnection } from './ownedConnection';
import { GatewayResponseUnavailableError, readGatewayResponse } from './readResponse';
import { OwnershipVerificationError, startupMessage, type ProbeDetail } from './probeFailure';

export interface GatewayState { pid: number; port: number; instanceId: string; startedAt: string; version: string; }
export interface GatewayControllerOptions {
  storageDirectory: string;
  gatewayScript: string;
  port: number;
  token: string;
  version: string;
  spawnProcess?: typeof spawn;
  delay?: (milliseconds: number) => Promise<void>;
}

export class GatewayController {
  private readonly stateFile: string;
  private readonly run: typeof spawn;
  private readonly delay: (milliseconds: number) => Promise<void>;

  constructor(private readonly options: GatewayControllerOptions) {
    this.stateFile = path.join(options.storageDirectory, 'gateway.json');
    this.run = options.spawnProcess ?? spawn;
    this.delay = options.delay ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  }

  async start(provider?: GatewayProvider): Promise<GatewayState> {
    const existing = await this.readState();
    if (existing) {
      const owned = await this.adopt(existing);
      if (owned) { try { await this.replaceProvider(owned, provider); return existing; } finally { owned.close(); } }
      if (await this.portOccupied()) throw this.unverified();
    }
    if (existing) await this.clearState();
    if (await this.portOccupied()) throw new GatewayLifecycleError(`Port ${this.options.port} is already in use by another process. Change portwise.gatewayPort, or stop the other process, then start Portwise again.`, 'gateway_port_conflict');

    const instanceId = randomUUID();
    let child: ChildProcess;
    try { child = this.run(process.execPath, [this.options.gatewayScript], {
      detached: true, windowsHide: true, shell: false, stdio: ['pipe', 'ignore', 'pipe'],
    }); } catch { throw startupError({ step: 'spawn', reason: 'spawn_failed' }); }
    let startupFailure: GatewayLifecycleError | undefined;
    const fail = () => { startupFailure ??= startupError({ step: 'spawn', reason: 'bootstrap_failed' }); };
    child.once('error', () => { startupFailure ??= startupError({ step: 'spawn', reason: 'spawn_failed' }); });
    child.once('exit', () => { startupFailure ??= startupError({ step: 'spawn', reason: 'process_exited' }); });
    let stderr = '';
    child.stderr?.on('error', fail);
    child.stderr?.on('data', (chunk: Buffer) => {
      if (stderr.length >= 4096) return;
      stderr += chunk.subarray(0, 4096 - stderr.length).toString('utf8');
      for (const line of stderr.split('\n')) {
        try {
          const value: unknown = JSON.parse(line);
          if (isStartupFailure(value)) fail();
        } catch { /* Never forward raw stderr, parser errors or unknown process output. */ }
      }
    });
    try { bootstrap(child, { token: this.options.token, provider, port: this.options.port, instanceId }, fail); }
    catch { child.stderr?.destroy(); throw startupError({ step: 'spawn', reason: 'bootstrap_failed' }); }
    child.unref();
    const state: GatewayState = { pid: child.pid ?? 0, port: this.options.port, instanceId, startedAt: new Date().toISOString(), version: this.options.version };
    try { await this.waitForAdoption(state, () => startupFailure); }
    finally { child.stderr?.destroy(); }
    await this.writeState(state);
    child.stderr?.destroy();
    return state;
  }

  async stop(): Promise<void> {
    const state = await this.readState();
    if (!state) { if (await this.portOccupied()) throw this.unverified(); return; }
    const owned = await this.adopt(state);
    if (owned) {
      try {
        const response = await owned.request('/_portwise/shutdown');
        if (!response.ok) throw new Error('Shutdown rejected');
        await response.body?.cancel();
      } catch { throw new GatewayLifecycleError('Gateway shutdown request failed. The daemon may still be running.', 'gateway_stop_failed'); }
      finally { owned.close(); }
      for (let attempt = 0; attempt < 20; attempt += 1) { if (!await this.portOccupied()) break; await this.delay(25); }
      if (await this.portOccupied()) throw new GatewayLifecycleError('Gateway did not release its port after shutdown.', 'gateway_stop_failed');
    } else if (await this.portOccupied()) throw this.unverified();
    await this.clearState();
  }

  async restart(provider?: GatewayProvider): Promise<GatewayState> { await this.stop(); return this.start(provider); }
  async status(): Promise<GatewayState | undefined> {
    const state = await this.readState(); if (!state) return;
    try {
      const owned = await this.adopt(state); if (!owned) return;
      owned.close(); return state;
    } catch (error) { if (!(error instanceof GatewayResponseUnavailableError)) throw error; return; }
  }

  async syncProvider(provider?: GatewayProvider): Promise<void> {
    const state = await this.readState();
    if (!state) return; // No owned daemon has been started; the next Start uses current profiles.
    let owned: OwnedGatewayConnection | undefined;
    try { owned = await this.adopt(state); }
    catch (error) {
      if (!(error instanceof GatewayResponseUnavailableError)) throw error;
      throw new GatewayLifecycleError('Provider profiles changed, but gateway health/status is unavailable. No provider configuration was sent. Run Diagnostics; stop the gateway from its owning profile, then Start Gateway.', 'gateway_provider_sync_failed');
    }
    if (!owned) throw new GatewayLifecycleError('Provider profiles changed, but gateway ownership could not be verified for synchronization. No provider configuration was sent. Change portwise.gatewayPort, or manually stop the identified process, then Start Gateway.', 'gateway_provider_sync_failed');
    try { await this.replaceProvider(owned, provider); } finally { owned.close(); }
  }

  private async replaceProvider(owned: OwnedGatewayConnection, provider?: GatewayProvider): Promise<void> {
    try {
      const response = await owned.request('/_portwise/providers', provider ?? null);
      if (!response.ok) throw new Error('Provider sync rejected');
      await response.body?.cancel();
    } catch { throw new GatewayLifecycleError('Provider profiles changed, but gateway synchronization failed. The gateway may still use its previous provider. Stop the gateway, then start it again before sending requests.', 'gateway_provider_sync_failed'); }
  }

  private async waitForAdoption(state: GatewayState, failure: () => GatewayLifecycleError | undefined): Promise<void> {
    let detail: ProbeDetail = { step: 'health', reason: 'connection_refused' };
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const error = failure(); if (error) throw error;
      try {
        const owned = await this.adopt(state, observed => { detail = observed; });
        if (owned) { owned.close(); return; }
      } catch (error) {
        if (error instanceof GatewayResponseUnavailableError) throw startupError(error.detail);
        throw startupError(detail);
      }
      await this.delay(25);
    }
    throw failure() ?? startupError(detail);
  }

  private async adopt(state: GatewayState, failed?: (detail: ProbeDetail) => void): Promise<OwnedGatewayConnection | undefined> {
    if (state.port !== this.options.port) return;
    let owned: OwnedGatewayConnection | undefined;
    try {
      owned = await OwnedGatewayConnection.open({ port: state.port, instanceId: state.instanceId, token: this.options.token });
      const status = await readGatewayResponse(await owned.request('/_portwise/status'), 'status');
      if (!hasInstanceId(status.body, state.instanceId)) { failed?.({ step: 'status', reason: 'proof_mismatch' }); owned.close(); return; }
      return owned;
    } catch (error) {
      owned?.close();
      failed?.(error instanceof OwnershipVerificationError || error instanceof GatewayResponseUnavailableError ? error.detail : { step: 'health', reason: 'connection_failed' });
      if (error instanceof GatewayResponseUnavailableError) throw error;
      return;
    }
  }

  private async portOccupied(): Promise<boolean> {
    return new Promise(resolve => {
      const socket = connect({ host: '127.0.0.1', port: this.options.port });
      const finish = (occupied: boolean) => { clearTimeout(timer); socket.destroy(); resolve(occupied); };
      const timer = setTimeout(() => finish(true), 300); // Unknown is occupied: fail closed.
      socket.once('connect', () => finish(true));
      socket.once('error', error => finish(!('code' in error && error.code === 'ECONNREFUSED')));
    });
  }
  private unverified(): GatewayLifecycleError {
    return new GatewayLifecycleError(`Port ${this.options.port} has an unverified gateway listener. Portwise did not adopt or stop it, or send credentials/configuration. Change portwise.gatewayPort, or manually stop the identified process, then retry.`, 'gateway_ownership_unverified');
  }
  private async readState(): Promise<GatewayState | undefined> {
    try { const value: unknown = JSON.parse(await readFile(this.stateFile, 'utf8')); return isGatewayState(value) ? value : undefined; } catch { return undefined; }
  }
  private async writeState(state: GatewayState): Promise<void> { await mkdir(this.options.storageDirectory, { recursive: true }); await atomicWrite(this.stateFile, JSON.stringify(state), { mode: 0o600 }); }
  private async clearState(): Promise<void> { await rm(this.stateFile, { force: true }); }
}

export class GatewayLifecycleError extends PortwiseError {
  constructor(message: string, code: string) { super(message, code); this.name = 'GatewayLifecycleError'; }
}

function startupError(detail: ProbeDetail): GatewayLifecycleError { return new GatewayLifecycleError(startupMessage(detail), 'gateway_start_failed'); }

function bootstrap(child: ChildProcess, configuration: object, failed: () => void): void {
  if (!child.stdin) throw new GatewayLifecycleError('Gateway process did not expose a secure stdin channel.', 'gateway_start_failed');
  child.stdin.once('error', failed);
  try { child.stdin.end(JSON.stringify(configuration)); } catch { failed(); }
}
function isStartupFailure(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || !('error' in value) || typeof value.error !== 'object' || value.error === null || !('code' in value.error)) return false;
  return ['gateway_bootstrap_invalid', 'gateway_bind_failed', 'gateway_start_failed'].includes(String(value.error.code));
}
function hasInstanceId(value: unknown, expected: string): boolean { return typeof value === 'object' && value !== null && 'instanceId' in value && value.instanceId === expected; }
function isGatewayState(value: unknown): value is GatewayState {
  return typeof value === 'object' && value !== null && typeof (value as GatewayState).pid === 'number' && typeof (value as GatewayState).port === 'number' && typeof (value as GatewayState).instanceId === 'string' && typeof (value as GatewayState).startedAt === 'string' && typeof (value as GatewayState).version === 'string';
}
