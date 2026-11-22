import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChildStartupLease, ParentStartupLease, isLeaseMessage, type LeaseMessage } from '../src/gateway/startupLease';

afterEach(() => vi.useRealTimers());
function childLease(milliseconds = 120_000) {
  const sent: LeaseMessage[] = []; const close = vi.fn(async () => undefined); const finish = vi.fn();
  const lease = new ChildStartupLease('test-id', message => sent.push(message), finish, milliseconds);
  return { lease, sent, close, finish };
}
describe('child-owned startup lease', () => {
  it('rejects malformed or foreign confirmation messages', async () => {
    const f = childLease(); f.lease.begin(); await f.lease.attach({ close: f.close });
    for (const value of [null, {}, { type: 'startup-confirm', instanceId: 'other' }, { type: 'credential', instanceId: 'test-id' }]) await f.lease.handle(value);
    await f.lease.disconnected(); expect(f.close).toHaveBeenCalledTimes(1);
    expect(f.sent.some(message => message.type === 'startup-confirmed')).toBe(false);
  });
  it('does not bind after cancellation and explicitly reports never listened', async () => {
    const f = childLease(); await f.lease.cancel(); expect(f.lease.begin()).toBe(false);
    expect(f.sent).toEqual([{ type: 'startup-closed', instanceId: 'test-id', listened: false }]); expect(f.finish).toHaveBeenCalledTimes(1);
  });
  it('closes a listener arriving after cancellation exactly once', async () => {
    const f = childLease(); f.lease.begin(); await f.lease.cancel(); expect(f.finish).not.toHaveBeenCalled();
    await f.lease.attach({ close: f.close }); await f.lease.cancel();
    expect(f.close).toHaveBeenCalledTimes(1); expect(f.sent).toEqual([{ type: 'startup-closed', instanceId: 'test-id', listened: true }]);
  });
  it('keeps only a confirmed child alive after the parent disconnects', async () => {
    const f = childLease(); f.lease.begin(); await f.lease.attach({ close: f.close });
    await f.lease.handle({ type: 'startup-confirm', instanceId: 'test-id' }); await f.lease.disconnected();
    expect(f.close).not.toHaveBeenCalled(); expect(f.sent.some(message => message.type === 'startup-confirmed')).toBe(true);
    await f.lease.cancel(); expect(f.close).toHaveBeenCalledTimes(1);
  });
  it('expires and closes its own unconfirmed listener', async () => {
    vi.useFakeTimers(); const f = childLease(20); f.lease.begin(); await f.lease.attach({ close: f.close });
    await vi.advanceTimersByTimeAsync(20); expect(f.close).toHaveBeenCalledTimes(1); expect(f.finish).toHaveBeenCalledTimes(1);
  });
  it('does not claim closed/never-listened if server closure fails', async () => {
    const f = childLease(); f.lease.begin(); await f.lease.attach({ close: async () => { throw new Error('test-failure-0000'); } });
    await expect(f.lease.cancel()).rejects.toThrow('test-failure-0000');
    expect(f.sent.some(message => message.type === 'startup-closed')).toBe(false);
  });
});

describe('parent retry eligibility', () => {
  it('never grants proceed after cancellation, even when ready arrives late', async () => {
    const send = vi.fn(); const child = Object.assign(new EventEmitter(), { connected: true, send, disconnect: vi.fn() }) as unknown as ChildProcess;
    const lease = new ParentStartupLease(child, 'test-id'); lease.cancel();
    child.emit('message', { type: 'startup-ready', instanceId: 'test-id' });
    expect(send.mock.calls.every(call => (call[0] as LeaseMessage).type === 'startup-cancel')).toBe(true);
    child.emit('message', { type: 'startup-closed', instanceId: 'test-id', listened: false }); child.emit('exit');
    expect(await lease.abort()).toEqual({ closed: true, neverListened: true });
  });
  it('rejects a foreign confirmation with a fixed error after the bounded deadline', async () => {
    vi.useFakeTimers(); const child = Object.assign(new EventEmitter(), { connected: true, send: vi.fn(), disconnect: vi.fn() }) as unknown as ChildProcess;
    const lease = new ParentStartupLease(child, 'test-id'); const pending = expect(lease.confirm()).rejects.toMatchObject({ code: 'gateway_start_failed', message: expect.stringContaining('reason=startup_confirmation_failed') });
    child.emit('message', { type: 'startup-confirmed', instanceId: 'other' });
    await vi.advanceTimersByTimeAsync(20_000); await pending; lease.dispose();
  });
  it.each(['closed-never', 'closed-listened', 'foreign', 'disconnect-only'])('requires an exact never-listened summary and child closure: %s', async mode => {
    const child = Object.assign(new EventEmitter(), { connected: true, send: vi.fn(), disconnect: vi.fn() }) as unknown as ChildProcess;
    const lease = new ParentStartupLease(child, 'test-id');
    if (mode === 'closed-listened') child.emit('message', { type: 'startup-listening', instanceId: 'test-id' });
    child.emit('message', { type: 'startup-closed', instanceId: mode === 'foreign' ? 'foreign' : 'test-id', listened: false });
    if (mode === 'disconnect-only') { vi.useFakeTimers(); child.emit('disconnect'); const result = lease.abort(); await vi.advanceTimersByTimeAsync(20_000); expect(await result).toEqual({ closed: false, neverListened: false }); }
    else { child.emit('close'); expect(await lease.abort()).toEqual({ closed: true, neverListened: mode === 'closed-never' }); }
  });
  it('accepts only the bounded non-secret protocol', () => {
    for (const input of [null, [], {}, { type: 'startup-closed', instanceId: 'x'.repeat(201) }, { type: 'startup-closed', instanceId: 'test', listened: 'false' }, { type: 'startup-ready', instanceId: 'test', token: 'test-token-0000' }]) expect(isLeaseMessage(input)).toBe(false);
  });
});
