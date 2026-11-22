import { PortwiseError } from '../core/errors';

export type ProbeStage = 'spawn' | 'health' | 'proof' | 'status';
export type ProbeReason = 'spawn_failed' | 'process_exited' | 'bootstrap_failed' | 'stdin_failed' | 'stderr_failed' | 'bootstrap_invalid' | 'bind_failed' | 'child_start_failed' | 'startup_confirmation_failed' | 'connection_refused' | 'connection_failed' | 'timeout' | 'response_invalid' | 'response_too_large' | 'response_incomplete' | 'proof_mismatch' | 'verified_socket_changed';
export interface ProbeDetail { step: ProbeStage; reason: ProbeReason; }

export class OwnershipVerificationError extends PortwiseError {
  constructor(readonly detail: ProbeDetail) {
    super('Gateway ownership could not be verified. No credentials or control requests were sent to an unverified listener. Change portwise.gatewayPort, or manually stop the identified process before starting Portwise again.', 'gateway_ownership_unverified');
  }
}

export function startupMessage(detail: ProbeDetail): string {
  return `Gateway startup failed [step=${detail.step}; reason=${detail.reason}]. The daemon may still be running. Run Diagnostics and identify its owning profile before stopping it.`;
}
