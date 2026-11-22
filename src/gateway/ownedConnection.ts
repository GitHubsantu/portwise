import { randomBytes } from 'node:crypto';
import { Agent, ClientRequest, type IncomingMessage } from 'node:http';
import { Readable } from 'node:stream';
import type { Socket } from 'node:net';
import type { PortwiseError } from '../core/errors';
import { OWNERSHIP_CHALLENGE_HEADER, verifyOwnershipProof } from './ownershipProof';
import { GatewayResponseUnavailableError, readGatewayResponse } from './readResponse';
import { OwnershipVerificationError, type ProbeStage, type ProbeReason } from './probeFailure';

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
      const { body } = await readGatewayResponse(response, 'health');
      if (!verifyOwnershipProof(body, target.token, target.instanceId, target.port, challenge)) throw unverified('proof', 'proof_mismatch');
      connection.verified = true;
      return connection;
    } catch (error) {
      connection.close();
      if (error instanceof GatewayResponseUnavailableError || error instanceof OwnershipVerificationError) throw error;
      throw unverified('health', 'connection_failed');
    }
  }

  request(route: ControlRoute, body?: unknown): Promise<Response> {
    if (!this.verified) return Promise.reject(unverified());
    const method = route === '/_portwise/providers' ? 'PUT' : route === '/_portwise/shutdown' ? 'POST' : 'GET';
    return this.exchange(route, method, body === undefined ? undefined : JSON.stringify(body));
  }

  close(): void { this.verified = false; this.socket?.destroy(); this.agent.destroy(); }

  private exchange(route: string, method: string, body?: string, challenge?: string): Promise<Response> {
    return new Promise((resolve, reject) => {
      const stage = route === '/healthz' ? 'health' : 'status';
      let message: IncomingMessage | undefined;
      // VS Code patches http.request and can replace its agent. Use the native
      // constructor so credentials stay on the exact socket that proved ownership.
      const request = new ClientRequest({ hostname: '127.0.0.1', port: this.target.port, path: route, method, agent: this.agent }, incoming => {
        message = incoming;
        incoming.on('error', () => undefined);
        incoming.once('end', () => clearTimeout(timer));
        incoming.once('close', () => clearTimeout(timer));
        try {
          resolve(new Response(Readable.toWeb(incoming) as ReadableStream<Uint8Array>, { status: incoming.statusCode ?? 502 }));
        } catch { incoming.destroy(); reject(unverified(stage, 'response_invalid')); }
      });
      const timer = setTimeout(() => {
        const error = unverified(stage, 'timeout'); message?.destroy(error); request.destroy(error); reject(error);
      }, this.target.timeoutMs ?? (route === '/healthz' || route === '/_portwise/status' ? 500 : 1000));
      request.once('error', error => { clearTimeout(timer); reject(error instanceof OwnershipVerificationError ? error : unverified(stage, 'code' in error && error.code === 'ECONNREFUSED' ? 'connection_refused' : 'connection_failed')); });
      request.once('close', () => { if (!message) { clearTimeout(timer); reject(unverified(stage, 'response_incomplete')); } });
      request.once('upgrade', (_response, socket) => { const error = unverified(stage, 'response_invalid'); socket.destroy(); request.destroy(error); reject(error); });
      request.once('socket', socket => {
        // Do not even queue credential headers/body until the socket identity is checked.
        if (this.socket && (socket !== this.socket || socket.destroyed)) { request.destroy(unverified(stage, 'verified_socket_changed')); return; }
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

function unverified(step: ProbeStage = 'proof', reason: ProbeReason = 'proof_mismatch'): PortwiseError {
  return new OwnershipVerificationError({ step, reason });
}
