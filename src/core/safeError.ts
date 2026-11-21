import { PortwiseError } from './errors';
import { redactSecrets } from './redact';

/** Unknown exceptions may contain arbitrary credential bytes; never format them. */
export function safeErrorMessage(error: unknown): string {
  if (error instanceof PortwiseError) return redactSecrets(error.message);
  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
  if (code === 'ENOENT') return 'The Portwise target folder or file is unavailable. Create or select an existing Codex home, then retry.';
  if (code === 'EACCES' || code === 'EPERM') return 'Portwise cannot access the target file. Check that your account can read and write the selected Codex home, then retry.';
  return 'The Portwise extension operation failed. Run Portwise: Run Diagnostics, check folder access and the configured provider, then retry.';
}
