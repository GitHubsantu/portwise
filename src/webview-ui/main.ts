import { isHostToWebview } from '../shared/protocol';
import type { ProviderPanelItem, WebviewToHost } from '../shared/protocol';
import { UI_STRINGS } from '../ui/strings';

interface VsCodeApi {
  postMessage(message: WebviewToHost): void;
}
declare function acquireVsCodeApi(): VsCodeApi;

const vscode = acquireVsCodeApi();
const root = document.getElementById('app');

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text; // DOM text assignment only (docs/SECURITY.md T5).
  return node;
}

function action(label: string, message: WebviewToHost): HTMLButtonElement {
  const node = document.createElement('button');
  node.type = 'button';
  node.textContent = label;
  node.setAttribute('aria-label', label);
  node.addEventListener('click', () => vscode.postMessage(message));
  return node;
}

function render(version: string, status: string, providers: ProviderPanelItem[] = []): void {
  if (!root) return;
  const statusNode = el('p', 'status', status);
  statusNode.setAttribute('role', 'status');
  statusNode.setAttribute('aria-label', `Portwise status: ${status}`);
  const list = document.createElement('ul');
  list.className = 'providers';
  list.setAttribute('aria-label', UI_STRINGS.providerProfiles);
  for (const provider of providers) {
    const item = document.createElement('li');
    item.className = 'provider';
    const controls = document.createElement('div');
    controls.className = 'provider-actions';
    controls.append(action(UI_STRINGS.editProvider, { type: 'editProvider', id: provider.id }), action(provider.enabled ? UI_STRINGS.disableProvider : UI_STRINGS.enableProvider, { type: 'toggleProvider', id: provider.id, enabled: !provider.enabled }), action(UI_STRINGS.testProvider, { type: 'testProvider', id: provider.id }), action(UI_STRINGS.deleteProvider, { type: 'deleteProvider', id: provider.id }));
    item.append(el('strong', 'provider-name', provider.name), el('span', 'provider-detail', `${provider.baseUrl} · ${provider.tokenMask}`), controls);
    list.append(item);
  }
  root.replaceChildren(
    el('h1', 'title', UI_STRINGS.panelTitle),
    statusNode,
    action(UI_STRINGS.addProvider, { type: 'addProvider' }),
    providers.length === 0 ? el('p', 'empty-state', UI_STRINGS.noProviders) : list,
    el('p', 'footer', `v${version}`),
  );
}

window.addEventListener('message', (event: MessageEvent<unknown>) => {
  if (!isHostToWebview(event.data)) return;
  render(event.data.state.version, event.data.state.status, event.data.state.providers);
});

render('…', UI_STRINGS.loading);
vscode.postMessage({ type: 'ready' });
