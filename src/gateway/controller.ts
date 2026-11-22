import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm } from 'node:fs/promises';
import * as path from 'node:path';
import { connect } from 'node:net';
import { atomicWrite } from '../core/atomicWrite';
import { PortwiseError } from '../core/errors';
import { OperationQueue } from '../core/operationQueue';
import { ParentStartupLease } from './startupLease';
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
  assertSettings?: () => void;
}

export class GatewayController {
  private readonly operations = new OperationQueue();
  private readonly stateFile: string;
  private readonly run: typeof spawn;
  private readonly delay: (milliseconds: number) => Promise<void>;

  constructor(private readonly options: GatewayControllerOptions) {
    this.stateFile = path.join(options.storageDirectory, 'gateway.json');
    this.run = options.spawnProcess ?? spawn;
    this.delay = options.delay ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  }

  start(provider?: GatewayProvider): Promise<GatewayState> { return this.operations.run(() => this.startLocked(provider)); }
  private async startLocked(provider?: GatewayProvider, retryAllowed = true): Promise<GatewayState> {
    this.options.assertSettings?.();
    const existing = await this.readState();
    if (existing) {
      const owned = await this.adopt(existing);
      if (owned) { try { this.options.assertSettings?.(); await this.replaceProvider(owned, provider); this.options.assertSettings?.(); return existing; } finally { owned.close(); } }
      if (await this.portOccupied()) throw this.unverified();
    }
    if (existing) await this.clearState();
    if (await this.portOccupied()) throw new GatewayLifecycleError(`Port ${this.options.port} is already in use by another process. Change portwise.gatewayPort, or stop the other process, then start Portwise again.`, 'gateway_port_conflict');

    const instanceId = randomUUID();
    let child: ChildProcess;
    try { child = this.run(process.execPath, [this.options.gatewayScript], {
      detached: true, windowsHide: true, shell: false, stdio: ['pipe', 'ignore', 'pipe', 'ipc'],
    }); } catch { throw startupError({ step: 'spawn', reason: 'spawn_failed' }); }
    let startupFailure: GatewayLifecycleError | undefined;
    const lease = new ParentStartupLease(child, instanceId);
    const failed = (detail: ProbeDetail): void => { startupFailure ??= startupError(detail); lease.cancel(); };
    const fail = () => { failed({ step: 'spawn', reason: 'stdin_failed' }); };
    child.once('error', () => { failed({ step: 'spawn', reason: 'spawn_failed' }); });
    child.once('exit', () => { failed({ step: 'spawn', reason: 'process_exited' }); });
    let stderr = '';
    child.stderr?.on('error', () => { failed({ step: 'spawn', reason: 'stderr_failed' }); });
    child.stderr?.on('data', (chunk: Buffer) => {
      if (stderr.length >= 4096) return;
      stderr += chunk.subarray(0, 4096 - stderr.length).toString('utf8');
      for (const line of stderr.split('\n')) {
        try {
          const value: unknown = JSON.parse(line);
          const reason = startupFailureReason(value);
          if (reason) failed({ step: 'spawn', reason });
        } catch { /* Never forward raw stderr, parser errors or unknown process output. */ }
      }
    });
    const state: GatewayState = { pid: child.pid ?? 0, port: this.options.port, instanceId, startedAt: new Date().toISOString(), version: this.options.version };
    try {
      try { bootstrap(child, { token: this.options.token, provider, port: this.options.port, instanceId }, fail); }
      catch { throw startupError({ step: 'spawn', reason: 'stdin_failed' }); }
      child.unref();
      await this.waitForAdoption(state, () => startupFailure);
      this.options.assertSettings?.();
      await this.writeState(state);
      this.options.assertSettings?.();
      await lease.confirm();
      return state;
    } catch (error) {
      const cleanup = await lease.abort();
      if ((await this.readState())?.instanceId === instanceId) await this.clearState();
      const transient = error instanceof GatewayLifecycleError && error.detail?.step === 'spawn' && ['stdin_failed', 'stderr_failed', 'spawn_failed', 'process_exited'].includes(error.detail.reason);
      if (retryAllowed && transient && cleanup.closed && cleanup.neverListened && !await this.portOccupied()) return this.startLocked(provider, false);
      throw error;
    }
    finally { child.stderr?.destroy(); }
  }

  stop(): Promise<void> { return this.operations.run(() => this.stopLocked()); }
  private async stopLocked(): Promise<void> {
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

  restart(provider?: GatewayProvider): Promise<GatewayState> { return this.operations.run(async () => { await this.stopLocked(); return this.startLocked(provider); }); }
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
    // A cold Electron/Node launch on low-memory hardware can exceed one second.
    // Bound the same-child readiness window to 20 seconds without changing HTTP deadlines.
    const deadline = performance.now() + 20_000;
    for (let attempt = 0; attempt < 800 && performance.now() < deadline; attempt += 1) {
      this.options.assertSettings?.();
      const error = failure(); if (error) throw error;
      try {
        const owned = await this.adopt(state, observed => { detail = observed; });
        if (owned) { owned.close(); const error = failure(); if (error) throw error; return; }
      } catch (error) {
        if (error instanceof GatewayLifecycleError) throw error;
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
  constructor(message: string, code: string, readonly detail?: ProbeDetail) { super(message, code); this.name = 'GatewayLifecycleError'; }
}

function startupError(detail: ProbeDetail): GatewayLifecycleError { return new GatewayLifecycleError(startupMessage(detail), 'gateway_start_failed', detail); }

function bootstrap(child: ChildProcess, configuration: object, failed: () => void): void {
  if (!child.stdin) throw new GatewayLifecycleError('Gateway process did not expose a secure stdin channel.', 'gateway_start_failed');
  child.stdin.once('error', failed);
  try { child.stdin.end(JSON.stringify(configuration)); } catch { failed(); }
}
function startupFailureReason(value: unknown): 'bootstrap_invalid' | 'bind_failed' | 'child_start_failed' | undefined {
  if (typeof value !== 'object' || value === null || !('error' in value) || typeof value.error !== 'object' || value.error === null || !('code' in value.error)) return;
  switch (value.error.code) { case 'gateway_bootstrap_invalid': return 'bootstrap_invalid'; case 'gateway_bind_failed': return 'bind_failed'; case 'gateway_start_failed': return 'child_start_failed'; }
}
function hasInstanceId(value: unknown, expected: string): boolean { return typeof value === 'object' && value !== null && 'instanceId' in value && value.instanceId === expected; }
function isGatewayState(value: unknown): value is GatewayState {
  return typeof value === 'object' && value !== null && typeof (value as GatewayState).pid === 'number' && typeof (value as GatewayState).port === 'number' && typeof (value as GatewayState).instanceId === 'string' && typeof (value as GatewayState).startedAt === 'string' && typeof (value as GatewayState).version === 'string';
}
