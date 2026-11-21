import type { IncomingMessage } from 'node:http';

export class PayloadLimitError extends Error {}

/** Bounded upload collection; aborting a total deadline also interrupts slow uploads. */
export function readBody(request: IncomingMessage, limit: number, signal: AbortSignal): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []; let bytes = 0;
    const cleanup = () => { request.off('data', data); request.off('end', end); request.off('aborted', aborted); request.off('error', failed); signal.removeEventListener('abort', cancelled); };
    const failed = (error: unknown) => { cleanup(); request.pause(); reject(error); };
    const cancelled = () => failed(signal.reason);
    const aborted = () => failed(new Error('client disconnected'));
    const data = (chunk: Buffer) => { bytes += chunk.length; if (bytes > limit) failed(new PayloadLimitError()); else chunks.push(chunk); };
    const end = () => { cleanup(); resolve(Buffer.concat(chunks, bytes)); };
    if (signal.aborted) { failed(signal.reason); return; }
    const advertised = Number(request.headers['content-length']);
    if (Number.isFinite(advertised) && advertised > limit) { failed(new PayloadLimitError()); return; }
    request.on('data', data); request.once('end', end); request.once('aborted', aborted); request.once('error', failed);
    signal.addEventListener('abort', cancelled, { once: true });
  });
}
