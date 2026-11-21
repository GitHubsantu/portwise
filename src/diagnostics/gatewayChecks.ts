import { readFile } from 'node:fs/promises';
import { resolveCodexFile } from '../core/paths';
import type { DiagnosticCheck } from './report';

export interface GatewayDiagnosticOptions { storageDirectory: string; port: number; token?: string; timeoutMs?: number; }

/** Never send the local token until health matches the saved instance on the configured port. */
export async function gatewayChecks(options: GatewayDiagnosticOptions): Promise<DiagnosticCheck[]> {
  const checks: DiagnosticCheck[] = [];
  let identity: string | undefined;
  try {
    const state: unknown = JSON.parse(await readFile(await resolveCodexFile(options.storageDirectory, 'gateway.json'), 'utf8'));
    if (record(state) && state['port'] === options.port && typeof state['instanceId'] === 'string' && state['instanceId'].length > 0) identity = state['instanceId'];
  } catch { /* Missing/invalid/linked state cannot establish daemon ownership. */ }
  try {
    const health = await readJson(options, '/healthz');
    const healthy = health.status === 200 && record(health.body) && typeof health.body['instanceId'] === 'string';
    checks.push({ name: 'health', status: healthy ? 'PASS' : 'FAIL', hint: healthy ? 'Gateway hop: health endpoint responded.' : 'Gateway hop: invalid health response. Stop the other process or change portwise.gatewayPort, then Start Gateway.' });
    if (!identity || !record(health.body) || health.body['instanceId'] !== identity || !healthy) {
      checks.push({ name: 'daemon', status: 'FAIL', hint: 'Gateway hop: ownership is not verified on the configured port. Stop the other process or change portwise.gatewayPort, then Start Gateway.' });
      checks.push({ name: 'local-token', status: 'WARN', hint: 'Gateway hop: authentication was not attempted because daemon ownership is unverified.' });
      return checks;
    }
  } catch {
    return [{ name: 'health', status: 'FAIL', hint: 'Gateway hop: health endpoint is unreachable or timed out. Start Gateway; check portwise.gatewayPort.' }, { name: 'daemon', status: 'FAIL', hint: 'Gateway hop: no verified daemon is reachable on the configured port. Start Gateway.' }, { name: 'local-token', status: 'WARN', hint: 'Gateway hop: authentication was not attempted because daemon ownership is unverified.' }];
  }
  checks.push({ name: 'daemon', status: 'PASS', hint: 'Gateway hop: saved instance matches health on the configured port.' });
  if (!options.token) checks.push({ name: 'local-token', status: 'FAIL', hint: 'Extension hop: the local gateway token is missing from SecretStorage. Start Gateway, Configure Codex, then restart Codex/VS Code.' });
  else {
    try {
      const status = await readJson(options, '/_portwise/status', options.token);
      const accepted = status.status === 200 && record(status.body) && status.body['instanceId'] === identity;
      checks.push({ name: 'local-token', status: accepted ? 'PASS' : 'FAIL', hint: accepted ? 'Gateway hop: the local token was accepted by the matching instance.' : 'Gateway hop: authentication failed or instance changed. Stop/Start Gateway, Configure Codex, then restart Codex/VS Code.' });
    } catch { checks.push({ name: 'local-token', status: 'FAIL', hint: 'Gateway hop: authenticated status timed out or failed. Stop/Start Gateway, then retry diagnostics.' }); }
  }
  return checks;
}

async function readJson(options: GatewayDiagnosticOptions, route: string, token?: string): Promise<{ status: number; body: unknown }> {
  if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535) throw new Error('Invalid configured port');
  const response = await fetch(`http://127.0.0.1:${options.port}${route}`, { headers: token ? { authorization: `Bearer ${token}` } : {}, redirect: 'error', signal: AbortSignal.timeout(options.timeoutMs ?? 1000) });
  const reader = response.body?.getReader(); if (!reader) throw new Error('Missing health body');
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) { const next = await reader.read(); if (next.done) break; size += next.value.byteLength; if (size > 4096) throw new Error('Oversized health response'); chunks.push(next.value); }
    return { status: response.status, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown };
  } finally { await reader.cancel().catch(() => undefined); }
}
function record(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
