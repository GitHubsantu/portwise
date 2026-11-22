import { randomBytes } from 'node:crypto';
import { Agent, request as httpRequest, type IncomingMessage } from 'node:http';
import { Readable } from 'node:stream';
import type { Socket } from 'node:net';
import { PortwiseError } from '../core/errors';
import { OWNERSHIP_CHALLENGE_HEADER, verifyOwnershipProof } from './ownershipProof';

type ControlRoute = '/_portwise/status' | '/_portwise/providers' | '/_portwise/shutdown';
export interface OwnershipTarget { port: number; instanceId: string; token: string; timeoutMs?: number; }

/** Credentials are added only to the exact TCP connection that proved ownership. */
export class OwnedGatewayConnection {
  private readonly agent = new Agent({ keepAlive: true, maxSockets: 1, maxFreeSockets: 1 });
  private socket: Socket | undefined;
  private verified = false;
  private constructor(private readonly target: OwnershipTarget) {}

  static async open(target: OwnershipTarget): Promise<OwnedGatewayConnection> {
    if (!Number.isInteger(target.port) || target.port < 1 || target.port > 65535 || !target.instanceId || !target.token) throw unverified();
    const connection = new OwnedGatewayConnection(target);
    try {
      const challenge = randomBytes(32).toString('base64url');
      const response = await connection.exchange('/healthz', 'GET', undefined, challenge);
      const reader = response.body?.getReader();
      if (!response.ok || !reader) throw unverified();
      const chunks: Uint8Array[] = []; let size = 0;
      try {
        for (;;) {
          const next = await reader.read(); if (next.done) break;
          size += next.value.byteLength; if (size > 4096) throw unverified();
          chunks.push(next.value);
        }
      } finally { await reader.cancel().catch(() => undefined); }
      const body: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!verifyOwnershipProof(body, target.token, target.instanceId, target.port, challenge)) throw unverified();
      connection.verified = true;
      return connection;
    } catch { connection.close(); throw unverified(); }
  }

  request(route: ControlRoute, body?: unknown): Promise<Response> {
    if (!this.verified) return Promise.reject(unverified());
    const method = route === '/_portwise/providers' ? 'PUT' : route === '/_portwise/shutdown' ? 'POST' : 'GET';
    return this.exchange(route, method, body === undefined ? undefined : JSON.stringify(body));
  }

  close(): void { this.verified = false; this.socket?.destroy(); this.agent.destroy(); }

  private exchange(route: string, method: string, body?: string, challenge?: string): Promise<Response> {
    return new Promise((resolve, reject) => {
      let message: IncomingMessage | undefined;
      const request = httpRequest({ hostname: '127.0.0.1', port: this.target.port, path: route, method, agent: this.agent }, incoming => {
        message = incoming;
        incoming.on('error', () => undefined);
        incoming.once('end', () => clearTimeout(timer));
        incoming.once('close', () => clearTimeout(timer));
        try {
          resolve(new Response(Readable.toWeb(incoming) as ReadableStream<Uint8Array>, { status: incoming.statusCode ?? 502 }));
        } catch { incoming.destroy(); reject(unverified()); }
      });
      const timer = setTimeout(() => {
        const error = unverified(); message?.destroy(error); request.destroy(error); reject(error);
      }, this.target.timeoutMs ?? (route === '/healthz' || route === '/_portwise/status' ? 500 : 1000));
      request.once('error', () => { clearTimeout(timer); reject(unverified()); });
      request.once('close', () => { if (!message) { clearTimeout(timer); reject(unverified()); } });
      request.once('upgrade', (_response, socket) => { socket.destroy(); request.destroy(unverified()); reject(unverified()); });
      request.once('socket', socket => {
        // Do not even queue credential headers/body until the socket identity is checked.
        if (this.socket && (socket !== this.socket || socket.destroyed)) { request.destroy(unverified()); return; }
        if (!this.socket) this.socket = socket;
        if (challenge !== undefined) request.setHeader(OWNERSHIP_CHALLENGE_HEADER, challenge);
        else {
          if (!this.verified) { request.destroy(unverified()); return; }
          request.setHeader('authorization', `Bearer ${this.target.token}`);
          if (body !== undefined) request.setHeader('content-type', 'application/json');
        }
        request.end(body);
      });
    });
  }
}

function unverified(): PortwiseError {
  return new PortwiseError('Gateway ownership could not be verified. No credentials or control requests were sent to an unverified listener. Change portwise.gatewayPort, or manually stop the identified process before starting Portwise again.', 'gateway_ownership_unverified');
}
