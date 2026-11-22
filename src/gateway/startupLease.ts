import type { ChildProcess } from 'node:child_process';
import { PortwiseError } from '../core/errors';
import { startupMessage } from './probeFailure';

export interface LeaseMessage { type: 'startup-ready' | 'startup-proceed' | 'startup-cancel' | 'startup-confirm' | 'startup-confirmed' | 'startup-listening' | 'startup-closed'; instanceId: string; listened?: boolean; }
export function isLeaseMessage(value: unknown): value is LeaseMessage {
  if (typeof value !== 'object' || value === null || !('type' in value) || !('instanceId' in value) || typeof value.instanceId !== 'string' || value.instanceId.length > 200) return false;
  if (Object.keys(value).some(key => !['type', 'instanceId', 'listened'].includes(key))) return false;
  return ['startup-ready', 'startup-proceed', 'startup-cancel', 'startup-confirm', 'startup-confirmed', 'startup-listening', 'startup-closed'].includes(String(value.type)) && (!('listened' in value) || typeof value.listened === 'boolean');
}

/** The private child-process channel carries only lifecycle enums and public identity. */
export class ParentStartupLease {
  private closed = false;
  private neverListened = false;
  private confirmed = false;
  private listened = false;
  private aborting = false;
  constructor(private readonly child: ChildProcess, private readonly instanceId: string) {
    child.on('message', this.message);
    child.once('close', this.close);
    // Process exit proves the listener is gone; some Windows IPC runtimes delay
    // the aggregate stdio 'close' event after a deliberate disconnect.
    child.once('exit', this.close);
  }
  private readonly message = (value: unknown): void => {
    if (!isLeaseMessage(value) || value.instanceId !== this.instanceId) return;
    if (value.type === 'startup-ready') this.send(this.aborting ? 'startup-cancel' : 'startup-proceed');
    if (value.type === 'startup-listening') { this.listened = true; this.neverListened = false; }
    if (value.type === 'startup-closed' && value.listened === false && !this.listened) this.neverListened = true;
    if (value.type === 'startup-confirmed') this.confirmed = true;
  };
  private readonly close = (): void => { this.closed = true; };
  private send(type: 'startup-cancel' | 'startup-confirm' | 'startup-proceed'): void {
    if (!this.child.connected || !this.child.send) return;
    try { this.child.send({ type, instanceId: this.instanceId }, () => undefined); } catch { /* Lease/disconnect still fails closed. */ }
  }
  async confirm(): Promise<void> {
    this.send('startup-confirm');
    const deadline = performance.now() + 20_000;
    while (!this.confirmed && !this.closed && performance.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
    if (!this.confirmed) throw new PortwiseError(startupMessage({ step: 'status', reason: 'startup_confirmation_failed' }), 'gateway_start_failed');
    this.dispose();
    if (this.child.connected) this.child.disconnect();
  }
  async abort(): Promise<{ closed: boolean; neverListened: boolean }> {
    this.cancel();
    // Synthetic failure fixtures without IPC cannot prove closure or authorize retry.
    if (typeof this.child.send === 'function') {
      const deadline = performance.now() + 20_000;
      while (!this.closed && performance.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
    }
    this.dispose();
    if (this.child.connected) this.child.disconnect();
    return { closed: this.closed, neverListened: this.closed && this.neverListened && !this.listened };
  }
  cancel(): void { this.aborting = true; this.send('startup-cancel'); }
  dispose(): void { this.child.off('message', this.message); this.child.off('close', this.close); this.child.off('exit', this.close); }
}

/** An unconfirmed child closes only the server object that it created itself. */
export class ChildStartupLease {
  private server: { close(): Promise<void> } | undefined;
  private starting = false;
  private cancelled = false;
  private confirmed = false;
  private finished = false;
  private listened = false;
  private permission: ((allowed: boolean) => void) | undefined;
  private readonly timer: ReturnType<typeof setTimeout>;
  constructor(private readonly instanceId: string, private readonly send: (message: LeaseMessage) => void, private readonly finish: () => void, milliseconds = 120_000) {
    this.timer = setTimeout(() => { void this.cancel(); }, milliseconds); this.timer.unref();
  }
  begin(): boolean { if (this.cancelled) return false; this.starting = true; return true; }
  waitForStart(): Promise<boolean> {
    if (this.cancelled) return Promise.resolve(false);
    return new Promise(resolve => { this.permission = resolve; this.send({ type: 'startup-ready', instanceId: this.instanceId }); });
  }
  async attach(server: { close(): Promise<void> }): Promise<void> {
    this.server = server; this.listened = true; this.starting = false;
    if (this.cancelled) await this.cancel();
    else this.send({ type: 'startup-listening', instanceId: this.instanceId });
  }
  async handle(value: unknown): Promise<void> {
    if (!isLeaseMessage(value) || value.instanceId !== this.instanceId) return;
    if (value.type === 'startup-proceed' && !this.cancelled) this.permission?.(true);
    if (value.type === 'startup-cancel') await this.cancel();
    if (value.type === 'startup-confirm' && this.server && !this.cancelled && !this.finished) {
      this.confirmed = true; clearTimeout(this.timer);
      this.send({ type: 'startup-confirmed', instanceId: this.instanceId });
    }
  }
  async disconnected(): Promise<void> { if (!this.confirmed) await this.cancel(); }
  async failed(): Promise<void> { this.starting = false; await this.cancel(); }
  async cancel(): Promise<void> {
    this.cancelled = true; clearTimeout(this.timer);
    this.permission?.(false);
    if (this.starting || this.finished) return;
    this.finished = true;
    try {
      await this.server?.close();
      this.send({ type: 'startup-closed', instanceId: this.instanceId, listened: this.listened });
    } finally { this.finish(); }
  }
}
