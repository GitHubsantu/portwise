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
  | { type: 'testProvider'; id: string }
  | { type: 'runPanelCommand'; command: PanelCommand };

export type ProviderPanelMessage = { type: 'addProvider' } | { type: 'editProvider'; id: string } | { type: 'deleteProvider'; id: string } | { type: 'toggleProvider'; id: string; enabled: boolean } | { type: 'testProvider'; id: string };

export type PanelCommand = 'portwise.startGateway' | 'portwise.stopGateway' | 'portwise.configureCodex' | 'portwise.startCodexLogin' | 'portwise.saveCodexAccount' | 'portwise.switchCodexAccount' | 'portwise.removeCodexAccount';

export type ProviderPanelItem = { id: string; name: string; baseUrl: string; enabled: boolean; tokenMask: string };
export type AccountPanelItem = { id: string; name: string; isCurrent: boolean };
export type AccountMatchAvailability = 'available' | 'unsupported' | 'unavailable' | 'ambiguous';
export type AccountPanelState = { accounts: AccountPanelItem[]; accountMatchAvailability: AccountMatchAvailability };
export type GatewayPanelState = { running: boolean; label: string };

export type PanelState = {
  /** Extension version, shown in the footer. */
  version: string;
  /** Human-readable status line. Never contains secrets. */
  status: string;
  providers: ProviderPanelItem[];
  accounts: AccountPanelItem[];
  accountMatchAvailability: AccountMatchAvailability;
  gateway: GatewayPanelState;
};

export type HostToWebview = { type: 'state'; state: PanelState };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isWebviewToHost(value: unknown): value is WebviewToHost {
  if (!isRecord(value)) return false;
  if (value['type'] === 'ready' || value['type'] === 'refresh' || value['type'] === 'addProvider') return true;
  if (value['type'] === 'runPanelCommand') return Object.keys(value).length === 2 && isPanelCommand(value['command']);
  if (value['type'] === 'toggleProvider') return typeof value['id'] === 'string' && typeof value['enabled'] === 'boolean';
  return (value['type'] === 'editProvider' || value['type'] === 'deleteProvider' || value['type'] === 'testProvider') && typeof value['id'] === 'string';
}

export function isHostToWebview(value: unknown): value is HostToWebview {
  if (!isRecord(value) || value['type'] !== 'state') return false;
  const state = value['state'];
  return (
    isRecord(state) && typeof state['version'] === 'string' && typeof state['status'] === 'string' && Array.isArray(state['providers']) && state['providers'].every(isProviderPanelItem) && Array.isArray(state['accounts']) && state['accounts'].every(isAccountPanelItem) && isAccountMatchAvailability(state['accountMatchAvailability']) && isGatewayPanelState(state['gateway'])
  );
}

function isProviderPanelItem(value: unknown): value is ProviderPanelItem {
  return isRecord(value) && Object.keys(value).length === 5 && typeof value['id'] === 'string' && typeof value['name'] === 'string' && typeof value['baseUrl'] === 'string' && typeof value['enabled'] === 'boolean' && typeof value['tokenMask'] === 'string' && /^(?:•{4}|•{4}.{4}|•{8}.{4})$/u.test(value['tokenMask']);
}

function isPanelCommand(value: unknown): value is PanelCommand {
  return value === 'portwise.startGateway' || value === 'portwise.stopGateway' || value === 'portwise.configureCodex' || value === 'portwise.startCodexLogin' || value === 'portwise.saveCodexAccount' || value === 'portwise.switchCodexAccount' || value === 'portwise.removeCodexAccount';
}
function isGatewayPanelState(value: unknown): value is GatewayPanelState { return isRecord(value) && typeof value['running'] === 'boolean' && typeof value['label'] === 'string'; }
function isAccountPanelItem(value: unknown): value is AccountPanelItem { return isRecord(value) && Object.keys(value).length === 3 && typeof value['id'] === 'string' && typeof value['name'] === 'string' && typeof value['isCurrent'] === 'boolean'; }
function isAccountMatchAvailability(value: unknown): value is AccountMatchAvailability { return value === 'available' || value === 'unsupported' || value === 'unavailable' || value === 'ambiguous'; }
