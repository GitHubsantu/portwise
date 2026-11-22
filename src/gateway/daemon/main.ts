import { startGateway, type GatewayOptions } from './server';
import { isGatewayOptions } from './options';
import { ChildStartupLease, isLeaseMessage, type LeaseMessage } from '../startupLease';

let buffered = '';
let failed = false;
const leased = typeof process.send === 'function';
let lease: ChildStartupLease | undefined;
let pendingCancel: string | undefined;
let disconnected = leased && !process.connected;
let closing = false;
const send = (value: LeaseMessage): void => {
  if (!process.connected) return;
  if (value.type === 'startup-closed') closing = true;
  process.send?.(value, () => { if (value.type === 'startup-closed' && process.connected) process.disconnect(); });
};
if (leased) {
  process.on('message', (value: unknown) => {
    if (!isLeaseMessage(value)) return;
    if (lease) void lease.handle(value).catch(() => fail('gateway_start_failed'));
    else if (value.type === 'startup-cancel') {
      pendingCancel = value.instanceId; failed = true; process.stdin.destroy();
      send({ type: 'startup-closed', instanceId: value.instanceId, listened: false });
      if (process.connected && !closing) process.disconnect();
    }
  });
  process.on('disconnect', () => {
    disconnected = true;
    if (!lease) { failed = true; process.stdin.destroy(); process.exitCode = 1; }
    else void lease.disconnected().catch(() => fail('gateway_start_failed'));
  });
}
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk: string) => {
  if (failed) return;
  if (Buffer.byteLength(buffered) + Buffer.byteLength(chunk) > 64 * 1024) { fail('gateway_bootstrap_invalid'); return; }
  buffered += chunk;
});
process.stdin.on('error', () => fail('gateway_bootstrap_invalid'));
process.stdin.on('end', () => { void bootstrap(); });
async function bootstrap(): Promise<void> {
  if (failed) return;
  let value: unknown;
  try { value = JSON.parse(buffered); } catch { fail('gateway_bootstrap_invalid'); return; }
  buffered = '';
  if (!isGatewayOptions(value)) { fail('gateway_bootstrap_invalid'); return; }
  const options = value as GatewayOptions;
  if (leased) {
    lease = new ChildStartupLease(options.instanceId ?? '', send, () => { if (process.connected && !closing) process.disconnect(); });
    if (disconnected || pendingCancel === options.instanceId) await lease.cancel();
    if (!await lease.waitForStart() || !lease.begin()) return;
  }
  try { const gateway = await startGateway(options); await lease?.attach(gateway); }
  catch (error) { fail(typeof error === 'object' && error !== null && 'code' in error && error.code === 'EADDRINUSE' ? 'gateway_bind_failed' : 'gateway_start_failed'); await lease?.failed(); }
}
function fail(code: string): void {
  if (failed) return;
  failed = true; buffered = ''; process.stdin.destroy(); process.exitCode = 1;
  process.stderr.write(JSON.stringify({ error: { type: 'gateway_startup_error', code, hop: 'gateway', message: 'Gateway startup failed.', hint: 'Check the configured port and bootstrap settings, then retry Start Gateway.' } }) + '\n');
  if (leased && !lease && process.connected) process.disconnect();
}
