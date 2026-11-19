/**
 * Secret redaction. Every string that reaches a log, a notification or a diagnostics
 * report MUST pass through redactSecrets() (docs/SECURITY.md T3).
 * Pure function: no vscode import, fully unit-testable.
 */

const REPLACEMENT = '[REDACTED]';

const PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  // Authorization headers: keep the scheme, drop the credential.
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, `$1 ${REPLACEMENT}`],
  // key=value / "key": "value" style secrets.
  [
    /(["']?(?:api[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|token|secret|password|authorization)["']?\s*[:=]\s*)(["']?)(?!(?:Bearer|Basic)\s|\[REDACTED\])[^\s"',;]{4,}\2/gi,
    `$1$2${REPLACEMENT}$2`,
  ],
  // OpenAI-style keys.
  [/\bsk-[A-Za-z0-9_-]{16,}\b/g, REPLACEMENT],
  // JWT-shaped strings (three base64url segments).
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, REPLACEMENT],
];

export function redactSecrets(input: string): string {
  let output = input;
  for (const [pattern, replacement] of PATTERNS) {
    output = output.replace(pattern, replacement);
  }
  return output;
}

/** Mask a known secret for display: keeps only the last 4 characters. */
export function maskSecret(secret: string): string {
  if (secret.length <= 8) return '••••';
  return `••••••••${secret.slice(-4)}`;
}
