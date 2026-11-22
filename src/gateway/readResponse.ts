import { PortwiseError } from '../core/errors';

export const GATEWAY_RESPONSE_MAX_BYTES = 4096;
export type GatewayResponseKind = 'health' | 'status';
interface GatewayResponseBody { instanceId: string; [key: string]: unknown; }
export interface GatewayResponse { status: number; body: GatewayResponseBody; }

export class GatewayResponseUnavailableError extends PortwiseError {
  constructor() {
    super('Gateway health/status is unavailable: the response was invalid, too large, or incomplete. Stop the gateway from its owning profile, then Start Gateway and run Diagnostics. If it cannot be stopped there, change portwise.gatewayPort or manually stop the identified process.', 'gateway_response_unavailable', 'gateway');
    this.name = 'GatewayResponseUnavailableError';
  }
}

/** Consume at most 4 KiB; transport deadlines remain responsible for slow/stalled bodies. */
export async function readGatewayResponse(response: Response, kind: GatewayResponseKind): Promise<GatewayResponse> {
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    reader = response.body?.getReader();
    if (response.status !== 200 || !reader) throw new GatewayResponseUnavailableError();
    const chunks: Uint8Array[] = []; let size = 0;
    for (;;) {
      const next = await reader.read(); if (next.done) break;
      size += next.value.byteLength;
      if (size > GATEWAY_RESPONSE_MAX_BYTES) throw new GatewayResponseUnavailableError();
      chunks.push(next.value);
    }
    // Reject invalid UTF-8 instead of silently replacing malformed response bytes.
    const body: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
    if (!validBody(body, kind)) throw new GatewayResponseUnavailableError();
    return { status: response.status, body };
  } catch { throw new GatewayResponseUnavailableError(); }
  finally { await reader?.cancel().catch(() => undefined); }
}

function validBody(value: unknown, kind: GatewayResponseKind): value is GatewayResponseBody {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && 'instanceId' in value && typeof value.instanceId === 'string' && value.instanceId.length > 0 && value.instanceId.length <= 200 && (kind === 'health' || 'running' in value && value.running === true);
}
