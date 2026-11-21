import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { randomUUID, timingSafeEqual } from 'node:crypto';

export interface GatewayProvider { baseUrl: string; token: string; enabled: boolean; }
export interface GatewayOptions { token: string; provider?: GatewayProvider; port?: number; maxBodyBytes?: number; totalTimeoutMs?: number; instanceId?: string; onShutdown?: () => void; }
export interface GatewayInstance { server: Server; port: number; instanceId: string; close(): Promise<void>; }
const BODY_LIMIT = 64 * 1024 * 1024;

export async function startGateway(options: GatewayOptions): Promise<GatewayInstance> {
  const port = options.port ?? 0; const instanceId = options.instanceId ?? randomUUID();
  let provider = options.provider;
  const server = createServer({ maxHeaderSize: 16 * 1024 }, (request, response) => void handle(request, response, options, instanceId, () => provider, (next) => { provider = next; }, () => void server.close()));
  server.maxConnections = 100;
  server.on('upgrade', (_request, socket) => { socket.write('HTTP/1.1 426 Upgrade Required\r\nConnection: close\r\n\r\n'); socket.destroy(); });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', () => { server.off('error', reject); resolve(); }); });
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Gateway did not receive a TCP port.');
  return { server, port: address.port, instanceId, close: () => server.listening ? new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())) : Promise.resolve() };
}
async function handle(request: IncomingMessage, response: ServerResponse, options: GatewayOptions, instanceId: string, getProvider: () => GatewayProvider | undefined, setProvider: (provider: GatewayProvider | undefined) => void, shutdown: () => void): Promise<void> {
  try {
    if (request.headers.origin) return error(response, 403, 'origin_not_allowed', 'Browser-originated requests are not allowed.', 'Only Codex should call this.');
    if (request.url === '/healthz') return json(response, 200, { instanceId });
    const localPort = response.socket?.localPort ?? 0;
    if (!validHost(request.headers.host, localPort)) return error(response, 421, 'host_not_allowed', 'Unexpected Host header.', 'Do not expose the gateway; check proxies.');
    if (!matchesToken(request.headers.authorization, options.token)) return error(response, 401, 'local_token_invalid', 'The local gateway token is missing or stale.', 'Repair credential delivery.');
    if (request.url === '/_portwise/status' && request.method === 'GET') return json(response, 200, { instanceId, running: true });
    if (request.url === '/_portwise/providers' && request.method === 'PUT') { const body = await readJson(request); if (body !== null && !isProvider(body)) return error(response, 400, 'internal_error', 'Invalid provider control payload.', 'Send a complete provider configuration.'); setProvider(body === null ? undefined : body); return json(response, 200, { updated: true }); }
    if (request.url === '/_portwise/shutdown' && request.method === 'POST') { json(response, 200, { stopping: true }); setTimeout(() => { shutdown(); options.onShutdown?.(); }, 0); return; }
    if (request.url?.startsWith('/_portwise/')) return error(response, 404, 'internal_error', 'Unknown control route.', 'Check the Portwise version.');
    if (!request.url?.startsWith('/v1/')) return error(response, 404, 'internal_error', 'Route not found.', 'Use a /v1/ route.');
    const provider = getProvider(); if (!provider?.enabled) return error(response, 503, 'no_active_provider', 'No provider is active.', 'Pick a provider in the panel.');
    await proxy(request, response, provider, options.maxBodyBytes ?? BODY_LIMIT, options.totalTimeoutMs ?? 30_000);
  } catch { error(response, 500, 'internal_error', 'Gateway request handling failed.', 'Copy redacted diagnostics and file an issue.'); }
}
async function readJson(request: IncomingMessage): Promise<unknown> { let text = ''; for await (const chunk of request) text += String(chunk); try { return JSON.parse(text) as unknown; } catch { return undefined; } }
function isProvider(value: unknown): value is GatewayProvider { return typeof value === 'object' && value !== null && typeof (value as GatewayProvider).baseUrl === 'string' && typeof (value as GatewayProvider).token === 'string' && typeof (value as GatewayProvider).enabled === 'boolean'; }
function validHost(host: string | undefined, port: number): boolean { return host === `127.0.0.1:${port}` || host === `localhost:${port}`; }
function matchesToken(value: string | undefined, token: string): boolean { const actual = Buffer.from(value?.replace(/^Bearer\s+/i, '') ?? ''); const expected = Buffer.from(token); return actual.length === expected.length && timingSafeEqual(actual, expected); }
async function proxy(request: IncomingMessage, response: ServerResponse, provider: GatewayProvider, limit: number, timeout: number): Promise<void> {
  const controller = new AbortController(); request.on('aborted', () => controller.abort()); response.on('close', () => { if (!response.writableEnded) controller.abort(); });
  const upstream = new URL(request.url ?? '/', provider.baseUrl); const headers = new Headers(); for (const [key, value] of Object.entries(request.headers)) { if (value && ['content-type','accept','accept-language','user-agent'].includes(key.toLowerCase())) headers.set(key, Array.isArray(value) ? value.join(', ') : value); } headers.set('authorization', `Bearer ${provider.token}`);
  try { const method = request.method ?? 'GET'; const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(timeout)]); const body = method === 'GET' || method === 'HEAD' ? undefined : await readBody(request, limit); const init = body === undefined ? { method, headers, redirect: 'error' as const, signal } : { method, headers, body, redirect: 'error' as const, signal }; const upstreamResponse = await fetch(upstream, init); response.statusCode = upstreamResponse.status; upstreamResponse.headers.forEach((value, key) => response.setHeader(key, value)); response.setHeader('x-portwise-hop', 'upstream'); if (!upstreamResponse.body) { response.end(); return; } const reader = upstreamResponse.body.getReader(); for (;;) { const next = await reader.read(); if (next.done) break; response.write(next.value); } response.end(); } catch (cause) { if (response.destroyed || response.headersSent) return; if (cause instanceof PayloadLimitError) { error(response, 413, 'payload_too_large', 'Request body exceeds the gateway limit.', 'Raise portwise.gateway.maxBodyMiB.'); return; } const timeoutError = cause instanceof DOMException && cause.name === 'TimeoutError'; error(response, timeoutError ? 504 : 502, timeoutError ? 'upstream_timeout' : 'upstream_unreachable', timeoutError ? 'Upstream request timed out.' : 'Upstream provider could not be reached.', 'Check the provider URL and network.'); }
}
class PayloadLimitError extends Error {}
async function readBody(request: IncomingMessage, limit: number): Promise<Buffer> { const chunks: Buffer[] = []; let bytes = 0; for await (const chunk of request) { const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk); bytes += buffer.length; if (bytes > limit) throw new PayloadLimitError(); chunks.push(buffer); } return Buffer.concat(chunks); }
function error(response: ServerResponse, status: number, code: string, message: string, hint: string): void { json(response, status, { error: { type: 'gateway_error', code, message, hint, hop: 'gateway' } }); }
function json(response: ServerResponse, status: number, value: unknown): void { response.writeHead(status, { 'content-type': 'application/json' }); response.end(JSON.stringify(value)); }
