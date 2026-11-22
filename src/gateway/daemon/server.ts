import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { PayloadLimitError, readBody } from './body';
import { isGatewayOptions, isProvider } from './options';
import { proxy } from './proxy';
import { isOwnershipChallenge, OWNERSHIP_CHALLENGE_HEADER, ownershipProof } from '../ownershipProof';

export interface GatewayProvider { baseUrl: string; token: string; enabled: boolean; }
export interface GatewayOptions { token: string; provider?: GatewayProvider; port?: number; maxBodyBytes?: number; totalTimeoutMs?: number; maxConnections?: number; instanceId?: string; onShutdown?: () => void; }
export interface GatewayInstance { server: Server; port: number; instanceId: string; close(): Promise<void>; }
const BODY_LIMIT = 64 * 1024 * 1024;
const CONTROL_LIMIT = 64 * 1024;

export async function startGateway(options: GatewayOptions): Promise<GatewayInstance> {
  if (!isGatewayOptions(options)) throw new Error('Invalid gateway bootstrap configuration.');
  const instanceId = options.instanceId ?? randomUUID(); let provider = options.provider;
  const server = createServer({ maxHeaderSize: 16 * 1024 }, (request, response) => {
    // Late disconnect errors are expected, and must never become uncaught events.
    request.on('error', () => undefined); response.on('error', () => undefined);
    void handle(request, response, options, instanceId, () => provider, next => { provider = next; }, () => {
      server.close(); server.closeAllConnections(); options.onShutdown?.();
    });
  });
  server.maxConnections = options.maxConnections ?? 100;
  server.requestTimeout = 0; // The explicit total deadline includes upload and streaming.
  server.headersTimeout = 10_000;
  server.on('upgrade', (_request, socket) => { socket.end('HTTP/1.1 426 Upgrade Required\r\nConnection: close\r\n\r\n'); });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(options.port ?? 0, '127.0.0.1', () => { server.off('error', reject); resolve(); }); });
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Gateway did not receive a TCP port.');
  return { server, port: address.port, instanceId, close: async () => {
    server.closeAllConnections();
    if (server.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  } };
}

async function handle(request: IncomingMessage, response: ServerResponse, options: GatewayOptions, instanceId: string, getProvider: () => GatewayProvider | undefined, setProvider: (provider: GatewayProvider | undefined) => void, shutdown: () => void): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException('Gateway total deadline expired', 'TimeoutError')), options.totalTimeoutMs ?? 30_000);
  const disconnected = () => { if (!response.writableEnded) controller.abort(new Error('Client disconnected')); };
  request.once('aborted', disconnected); response.once('close', disconnected);
  try {
    if (!['127.0.0.1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress ?? '')) return error(response, 403, 'peer_not_allowed', 'Only loopback clients are allowed.', 'Connect directly to the local gateway.');
    const localPort = response.socket?.localPort ?? 0;
    if (!validHost(request.headers.host, localPort)) return error(response, 421, 'host_not_allowed', 'Unexpected Host header.', 'Do not expose the gateway; check proxies.');
    if ('origin' in request.headers) return error(response, 403, 'origin_not_allowed', 'Browser-originated requests are not allowed.', 'Only Codex should call this.');
    if (request.url === '/healthz' && request.method === 'GET') {
      const challenge = request.headers[OWNERSHIP_CHALLENGE_HEADER];
      if (challenge === undefined) return json(response, 200, { instanceId });
      if (!isOwnershipChallenge(challenge)) return error(response, 400, 'ownership_challenge_invalid', 'Invalid ownership challenge.', 'Update Portwise and retry.');
      return json(response, 200, { instanceId, proof: ownershipProof(options.token, instanceId, localPort, challenge) });
    }
    if (!matchesToken(request.headers.authorization, options.token)) return error(response, 401, 'local_token_invalid', 'The local gateway token is missing or stale.', 'Repair credential delivery.');
    if (request.url === '/_portwise/status' && request.method === 'GET') return json(response, 200, { instanceId, running: true });
    if (request.url === '/_portwise/providers' && request.method === 'PUT') {
      const bytes = await readBody(request, Math.min(CONTROL_LIMIT, options.maxBodyBytes ?? BODY_LIMIT), controller.signal);
      let body: unknown; try { body = JSON.parse(bytes.toString('utf8')); } catch { body = undefined; }
      if (body !== null && !isProvider(body)) return error(response, 400, 'provider_payload_invalid', 'Invalid provider control payload.', 'Use an HTTPS provider, or HTTP only for loopback, with a valid token.');
      setProvider(body === null ? undefined : body); return json(response, 200, { updated: true });
    }
    if (request.url === '/_portwise/shutdown' && request.method === 'POST') {
      response.once('finish', () => setImmediate(shutdown)); json(response, 200, { stopping: true }); return;
    }
    if (request.url?.startsWith('/_portwise/')) return error(response, 404, 'internal_error', 'Unknown control route.', 'Check the Portwise version.');
    if (!request.url?.startsWith('/v1/')) return error(response, 404, 'internal_error', 'Route not found.', 'Use a /v1/ route.');
    const provider = getProvider(); if (!provider?.enabled) return error(response, 503, 'no_active_provider', 'No provider is active.', 'Pick a provider in the panel.');
    await proxy(request, response, provider, options.maxBodyBytes ?? BODY_LIMIT, controller.signal);
  } catch (cause) {
    if (response.destroyed) return;
    // Once streaming begins, a second JSON response would corrupt the upstream body.
    if (response.headersSent) { response.destroy(); return; }
    if (cause instanceof PayloadLimitError) return error(response, 413, 'payload_too_large', 'Request body exceeds the gateway limit.', 'Reduce the request size or configure the gateway body limit.');
    const timeout = controller.signal.aborted && controller.signal.reason instanceof DOMException && controller.signal.reason.name === 'TimeoutError';
    error(response, timeout ? 504 : 502, timeout ? 'upstream_timeout' : 'upstream_unreachable', timeout ? 'Gateway request exceeded its total timeout.' : 'Upstream provider could not be reached.', 'Check the provider URL and network, then retry.');
  } finally {
    clearTimeout(timer); request.off('aborted', disconnected); response.off('close', disconnected);
    if (response.writableEnded && !request.readableEnded) drainRejectedBody(request, Math.min(options.totalTimeoutMs ?? 5_000, 5_000));
  }
}
/** Let clients receive a rejection before closing an unfinished upload. Never drain indefinitely. */
function drainRejectedBody(request: IncomingMessage, timeout: number): void {
  const timer = setTimeout(() => request.destroy(), timeout); timer.unref();
  const cleanup = () => { clearTimeout(timer); request.off('end', cleanup); request.off('close', cleanup); };
  request.once('end', cleanup); request.once('close', cleanup); request.resume();
}
function validHost(host: string | undefined, port: number): boolean { return host === `127.0.0.1:${port}` || host === `localhost:${port}`; }
function matchesToken(value: string | undefined, token: string): boolean { const actual = Buffer.from(value?.replace(/^Bearer\s+/i, '') ?? ''); const expected = Buffer.from(token); return actual.length === expected.length && timingSafeEqual(actual, expected); }
function error(response: ServerResponse, status: number, code: string, message: string, hint: string): void {
  json(response, status, { error: { type: 'gateway_error', code, message, hint, hop: 'gateway' } });
}
function json(response: ServerResponse, status: number, value: unknown): void { response.writeHead(status, { 'content-type': 'application/json' }); response.end(JSON.stringify(value)); }
