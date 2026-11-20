import { isHostToWebview } from '../shared/protocol';
import type { AccountPanelItem, GatewayPanelState, PanelCommand, ProviderPanelItem, WebviewToHost } from '../shared/protocol';
import { UI_STRINGS } from '../ui/strings';

interface VsCodeApi { postMessage(message: WebviewToHost): void; }
declare function acquireVsCodeApi(): VsCodeApi;
const vscode = acquireVsCodeApi();
const root = document.getElementById('app');

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag); node.className = className; node.textContent = text; return node;
}
type ButtonKind = 'primary' | 'secondary' | 'destructive';
function action(label: string, message: WebviewToHost, kind: ButtonKind = 'secondary'): HTMLButtonElement {
  const node = document.createElement('button'); node.type = 'button'; node.className = `button button-${kind}`; node.textContent = label; node.setAttribute('aria-label', label); node.addEventListener('click', () => vscode.postMessage(message)); return node;
}
function commandAction(label: string, command: PanelCommand, kind: ButtonKind = 'secondary'): HTMLButtonElement { return action(label, { type: 'runPanelCommand', command }, kind); }
function section(title: string): HTMLElement { const node = document.createElement('section'); node.className = 'panel-section'; node.setAttribute('aria-label', title); node.append(el('h2', 'section-title', title)); return node; }

function render(version: string, status: string, providers: ProviderPanelItem[], accounts: AccountPanelItem[], gateway: GatewayPanelState): void {
  if (!root) return;
  root.replaceChildren(el('h1', 'title', UI_STRINGS.panelTitle), panelStatus(status), gatewaySection(gateway), accountSection(accounts), providerSection(providers), el('p', 'footer', `v${version}`));
}
function panelStatus(status: string): HTMLElement { const node = el('p', 'status status-badge', status); node.setAttribute('role', 'status'); node.setAttribute('aria-label', `Portwise status: ${status}`); return node; }
function gatewaySection(gateway: GatewayPanelState): HTMLElement {
  const node = section('Gateway'); const badge = el('p', 'gateway-badge', gateway.label); badge.setAttribute('role', 'status'); badge.setAttribute('aria-label', `Gateway ${gateway.label}`);
  const controls = document.createElement('div'); controls.className = 'section-actions'; controls.append(commandAction('Start gateway', 'portwise.startGateway', 'primary'), commandAction('Stop gateway', 'portwise.stopGateway'), commandAction('Configure Codex home', 'portwise.configureCodex'));
  node.append(badge, controls); return node;
}
function accountSection(accounts: AccountPanelItem[]): HTMLElement {
  const node = section('Accounts');
  if (accounts.length === 0) node.append(el('p', 'empty-copy', 'No saved accounts yet.'));
  else { const list = document.createElement('ul'); list.className = 'account-list'; list.setAttribute('aria-label', 'Saved accounts'); for (const account of accounts) list.append(el('li', 'account-name', account.name)); node.append(list); }
  const controls = document.createElement('div'); controls.className = 'section-actions'; controls.append(commandAction('Add via Codex Login', 'portwise.startCodexLogin', 'primary'), commandAction('Save Current', 'portwise.saveCodexAccount'), commandAction('Switch', 'portwise.switchCodexAccount'), commandAction('Remove', 'portwise.removeCodexAccount', 'destructive')); node.append(controls); return node;
}
function providerSection(providers: ProviderPanelItem[]): HTMLElement {
  const node = section(UI_STRINGS.providerProfiles);
  if (providers.length === 0) { const empty = document.createElement('div'); empty.className = 'empty-state'; empty.setAttribute('aria-label', 'No provider profiles'); empty.append(el('p', 'empty-copy', UI_STRINGS.noProviders), action(UI_STRINGS.addProvider, { type: 'addProvider' }, 'primary')); node.append(empty); return node; }
  node.append(action(UI_STRINGS.addProvider, { type: 'addProvider' }, 'primary'));
  const list = document.createElement('ul'); list.className = 'providers'; list.setAttribute('aria-label', UI_STRINGS.providerProfiles);
  for (const provider of providers) { const item = document.createElement('li'); item.className = 'provider'; const header = document.createElement('div'); header.className = 'provider-header'; header.append(el('strong', 'provider-name', provider.name), el('span', 'provider-state', provider.enabled ? 'Enabled' : 'Disabled')); const controls = document.createElement('div'); controls.className = 'provider-actions'; controls.append(action(UI_STRINGS.editProvider, { type: 'editProvider', id: provider.id }), action(provider.enabled ? UI_STRINGS.disableProvider : UI_STRINGS.enableProvider, { type: 'toggleProvider', id: provider.id, enabled: !provider.enabled }), action(UI_STRINGS.testProvider, { type: 'testProvider', id: provider.id }), action(UI_STRINGS.deleteProvider, { type: 'deleteProvider', id: provider.id }, 'destructive')); item.append(header, el('span', 'provider-detail', `${provider.baseUrl} · ${provider.tokenMask}`), controls); list.append(item); }
  node.append(list); return node;
}
window.addEventListener('message', (event: MessageEvent<unknown>) => { if (!isHostToWebview(event.data)) return; render(event.data.state.version, event.data.state.status, event.data.state.providers, event.data.state.accounts, event.data.state.gateway); });
render('…', UI_STRINGS.loading, [], [], { running: false, label: 'Stopped' });
vscode.postMessage({ type: 'ready' });
