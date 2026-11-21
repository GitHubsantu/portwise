import { request as httpRequest, type IncomingMessage, type ServerResponse } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { once } from 'node:events';
import { readBody } from './body';
import type { GatewayProvider } from './server';

const HOP_HEADERS = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade', 'authorization']);
export async function proxy(request: IncomingMessage, response: ServerResponse, provider: GatewayProvider, limit: number, signal: AbortSignal): Promise<void> {
  const origin = new URL(provider.baseUrl);
  const target = new URL(request.url ?? '/', origin);
  if (target.origin !== origin.origin) throw new Error('provider origin mismatch');
  const headers: Record<string, string | string[]> = {};
  const nominated = new Set(request.headers.connection?.split(',').map(name => name.trim().toLowerCase()));
  for (const [name, value] of Object.entries(request.headers)) if (value !== undefined && !nominated.has(name) && ['content-type', 'accept', 'accept-language', 'user-agent'].includes(name)) headers[name] = value;
  headers['authorization'] = `Bearer ${provider.token}`;
  const method = request.method ?? 'GET';
  const body = method === 'GET' || method === 'HEAD' ? undefined : await readBody(request, limit, signal);
  if (body !== undefined) headers['content-length'] = String(body.length);
  const upstream = await new Promise<IncomingMessage>((resolve, reject) => {
    const outgoing = (target.protocol === 'https:' ? httpsRequest : httpRequest)(target, { method, headers, signal }, resolve);
    outgoing.once('error', reject);
    outgoing.end(body);
  });
  // Keep the established no-redirect behavior; no retry or follow-up request is made.
  if ((upstream.statusCode ?? 0) >= 300 && (upstream.statusCode ?? 0) < 400 && upstream.headers.location) { upstream.destroy(); throw new Error('redirect refused'); }
  const blocked = new Set(HOP_HEADERS);
  for (const name of upstream.headers.connection?.split(',') ?? []) blocked.add(name.trim().toLowerCase());
  response.statusCode = upstream.statusCode ?? 502;
  for (const [name, value] of Object.entries(upstream.headers)) if (value !== undefined && !blocked.has(name) && !name.startsWith('access-control-')) response.setHeader(name, value);
  response.setHeader('x-portwise-hop', 'upstream');
  try {
    for await (const chunk of upstream) {
      if (signal.aborted) throw signal.reason;
      if (!response.write(chunk)) await once(response, 'drain', { signal });
    }
    response.end();
  } finally { if (!upstream.complete) upstream.destroy(); }
}
