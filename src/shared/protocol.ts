/**
 * Message protocol between the extension host and the webview.
 * Pure types + runtime guards. No DOM and no Node imports so both sides can use it.
 * Every message crossing the boundary MUST pass through a guard (docs/SECURITY.md T5).
 */

export type WebviewToHost = { type: 'ready' } | { type: 'refresh' };

export type PanelState = {
  /** Extension version, shown in the footer. */
  version: string;
  /** Human-readable status line. Never contains secrets. */
  status: string;
};

export type HostToWebview = { type: 'state'; state: PanelState };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isWebviewToHost(value: unknown): value is WebviewToHost {
  if (!isRecord(value)) return false;
  return value['type'] === 'ready' || value['type'] === 'refresh';
}

export function isHostToWebview(value: unknown): value is HostToWebview {
  if (!isRecord(value) || value['type'] !== 'state') return false;
  const state = value['state'];
  return (
    isRecord(state) && typeof state['version'] === 'string' && typeof state['status'] === 'string'
  );
}
