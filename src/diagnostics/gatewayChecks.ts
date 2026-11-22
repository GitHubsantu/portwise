import { readFile } from 'node:fs/promises';
import { resolveCodexFile } from '../core/paths';
import type { DiagnosticCheck } from './report';
import { OwnedGatewayConnection } from '../gateway/ownedConnection';
import { GatewayResponseUnavailableError, readGatewayResponse } from '../gateway/readResponse';

export interface GatewayDiagnosticOptions { storageDirectory: string; port: number; token?: string; timeoutMs?: number; }

/** Public health is liveness only; credentials require proof on a pinned connection. */
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
    return [{ name: 'health', status: 'FAIL', hint: `Gateway hop: ${new GatewayResponseUnavailableError().message}` }, { name: 'daemon', status: 'FAIL', hint: 'Gateway hop: no verified daemon is reachable on the configured port. Start Gateway.' }, { name: 'local-token', status: 'WARN', hint: 'Gateway hop: authentication was not attempted because daemon ownership is unverified.' }];
  }
  if (!options.token) {
    checks.push({ name: 'daemon', status: 'WARN', hint: 'Gateway hop: public instance matches, but ownership cannot be verified without the local secret.' });
    checks.push({ name: 'local-token', status: 'FAIL', hint: 'Extension hop: the local gateway token is missing from SecretStorage. Start Gateway, Configure Codex, then restart Codex/VS Code.' });
  }
  else {
    let owned: OwnedGatewayConnection | undefined;
    try {
      owned = await OwnedGatewayConnection.open({ port: options.port, instanceId: identity, token: options.token, ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}) });
      const status = await readGatewayResponse(await owned.request('/_portwise/status'), 'status');
      const accepted = status.status === 200 && record(status.body) && status.body['instanceId'] === identity;
      checks.push({ name: 'daemon', status: accepted ? 'PASS' : 'FAIL', hint: accepted ? 'Gateway hop: the saved instance proved ownership with the shared secret on this connection.' : 'Gateway hop: authenticated status changed instance. Stop the gateway from its owning profile, then Start Gateway.' });
      checks.push({ name: 'local-token', status: accepted ? 'PASS' : 'FAIL', hint: accepted ? 'Gateway hop: the local token was accepted by the matching instance.' : 'Gateway hop: authentication failed or instance changed. Stop/Start Gateway, Configure Codex, then restart Codex/VS Code.' });
    } catch (error) {
      const unavailable = error instanceof GatewayResponseUnavailableError;
      const hint = unavailable ? `Gateway hop: ${new GatewayResponseUnavailableError().message}` : 'Gateway hop: ownership/status could not be verified. Portwise left the listener untouched. Change portwise.gatewayPort, or manually stop the identified process.';
      checks.push({ name: 'daemon', status: 'FAIL', hint });
      checks.push({ name: 'local-token', status: 'FAIL', hint: unavailable ? hint : owned ? 'Gateway hop: authenticated status timed out or failed. Stop/Start Gateway, then retry diagnostics.' : 'Gateway hop: ownership was not verified; the local token was not sent. Check the gateway port and installed version.' });
    } finally { owned?.close(); }
  }
  return checks;
}

async function readJson(options: GatewayDiagnosticOptions, route: string): Promise<{ status: number; body: unknown }> {
  if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535) throw new Error('Invalid configured port');
  const response = await fetch(`http://127.0.0.1:${options.port}${route}`, { redirect: 'error', signal: AbortSignal.timeout(options.timeoutMs ?? 1000) });
  return readGatewayResponse(response, 'health');
}
function record(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
