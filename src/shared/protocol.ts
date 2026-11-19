/**
 * Message protocol between the extension host and the webview.
 * Pure types + runtime guards. No DOM and no Node imports so both sides can use it.
 * Every message crossing the boundary MUST pass through a guard (docs/SECURITY.md T5).
 */

export type WebviewToHost =
  | { type: 'ready' }
  | { type: 'refresh' }
  | { type: 'addProvider' }
  | { type: 'editProvider'; id: string }
  | { type: 'deleteProvider'; id: string }
  | { type: 'toggleProvider'; id: string; enabled: boolean }
  | { type: 'testProvider'; id: string };

export type ProviderPanelItem = { id: string; name: string; baseUrl: string; enabled: boolean; tokenMask: string };

export type PanelState = {
  /** Extension version, shown in the footer. */
  version: string;
  /** Human-readable status line. Never contains secrets. */
  status: string;
  providers: ProviderPanelItem[];
};

export type HostToWebview = { type: 'state'; state: PanelState };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isWebviewToHost(value: unknown): value is WebviewToHost {
  if (!isRecord(value)) return false;
  if (value['type'] === 'ready' || value['type'] === 'refresh' || value['type'] === 'addProvider') return true;
  if (value['type'] === 'toggleProvider') return typeof value['id'] === 'string' && typeof value['enabled'] === 'boolean';
  return (value['type'] === 'editProvider' || value['type'] === 'deleteProvider' || value['type'] === 'testProvider') && typeof value['id'] === 'string';
}

export function isHostToWebview(value: unknown): value is HostToWebview {
  if (!isRecord(value) || value['type'] !== 'state') return false;
  const state = value['state'];
  return (
    isRecord(state) && typeof state['version'] === 'string' && typeof state['status'] === 'string' && Array.isArray(state['providers'])
  );
}
