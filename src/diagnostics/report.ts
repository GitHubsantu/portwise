import { redactSecrets } from '../core/redact';

export type DiagnosticStatus = 'PASS' | 'FAIL' | 'WARN';
export interface DiagnosticCheck { name: string; status: DiagnosticStatus; hint: string; }
export interface DiagnosticsReport { checks: DiagnosticCheck[]; restartRequired: boolean; }

const ALLOWED_NAMES = new Set(['daemon', 'health', 'local-token', 'config', 'credential-delivery', 'permissions', 'codex-home', 'provider']);

/** Builds an allow-listed, redacted report suitable for output or copying. */
export function formatDiagnostics(checks: readonly DiagnosticCheck[], restartRequired: boolean): string {
  const safe = checks.filter((check) => ALLOWED_NAMES.has(check.name) && ['PASS', 'FAIL', 'WARN'].includes(check.status)).map((check) => `${check.status} ${check.name}: ${check.hint}`);
  if (restartRequired) safe.push('WARN restart: Restart Codex/VS Code to load the updated gateway credential.');
  return redactSecrets(safe.join('\n'));
}
