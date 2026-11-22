import { createHmac, timingSafeEqual } from 'node:crypto';

export const OWNERSHIP_CHALLENGE_HEADER = 'x-portwise-challenge';
const ENCODED_32_BYTES = /^[A-Za-z0-9_-]{43}$/;

export function isOwnershipChallenge(value: unknown): value is string {
  return typeof value === 'string' && ENCODED_32_BYTES.test(value);
}

/** Port binding prevents relaying a challenge to a legitimate daemon on another port. */
export function ownershipProof(token: string, instanceId: string, port: number, challenge: string): string {
  return createHmac('sha256', token).update(JSON.stringify(['portwise-daemon-ownership-v1', '127.0.0.1', port, instanceId, challenge])).digest('base64url');
}

export function verifyOwnershipProof(value: unknown, token: string, instanceId: string, port: number, challenge: string): boolean {
  if (typeof value !== 'object' || value === null || !('instanceId' in value) || value.instanceId !== instanceId || !('proof' in value) || !isOwnershipChallenge(value.proof)) return false;
  return timingSafeEqual(Buffer.from(value.proof, 'base64url'), Buffer.from(ownershipProof(token, instanceId, port, challenge), 'base64url'));
}
