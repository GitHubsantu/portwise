import { startGateway, type GatewayOptions } from './server';
import { isGatewayOptions } from './options';

let buffered = '';
let failed = false;
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
  try { await startGateway(value as GatewayOptions); }
  catch (error) { fail(typeof error === 'object' && error !== null && 'code' in error && error.code === 'EADDRINUSE' ? 'gateway_bind_failed' : 'gateway_start_failed'); }
}
function fail(code: string): void {
  if (failed) return;
  failed = true; buffered = ''; process.stdin.destroy(); process.exitCode = 1;
  process.stderr.write(JSON.stringify({ error: { type: 'gateway_startup_error', code, hop: 'gateway', message: 'Gateway startup failed.', hint: 'Check the configured port and bootstrap settings, then retry Start Gateway.' } }) + '\n');
}
