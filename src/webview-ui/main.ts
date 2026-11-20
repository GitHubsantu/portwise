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

type ButtonKind = 'primary' | 'secondary' | 'destructive';

function action(label: string, message: WebviewToHost, kind: ButtonKind = 'secondary'): HTMLButtonElement {
  const node = document.createElement('button');
  node.type = 'button';
  node.className = `button button-${kind}`;
  node.textContent = label;
  node.setAttribute('aria-label', label);
  node.addEventListener('click', () => vscode.postMessage(message));
  return node;
}

function render(version: string, status: string, providers: ProviderPanelItem[] = []): void {
  if (!root) return;
  const statusNode = el('p', 'status status-badge', status);
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
    controls.append(action(UI_STRINGS.editProvider, { type: 'editProvider', id: provider.id }), action(provider.enabled ? UI_STRINGS.disableProvider : UI_STRINGS.enableProvider, { type: 'toggleProvider', id: provider.id, enabled: !provider.enabled }), action(UI_STRINGS.testProvider, { type: 'testProvider', id: provider.id }), action(UI_STRINGS.deleteProvider, { type: 'deleteProvider', id: provider.id }, 'destructive'));
    const header = document.createElement('div');
    header.className = 'provider-header';
    header.append(el('strong', 'provider-name', provider.name), el('span', 'provider-state', provider.enabled ? 'Enabled' : 'Disabled'));
    item.append(el('strong', 'provider-name', provider.name), el('span', 'provider-detail', `${provider.baseUrl} · ${provider.tokenMask}`), controls);
    const name = item.firstElementChild;
    if (name) item.replaceChild(header, name);
    list.append(item);
  }
  const content: Node[] = [el('h1', 'title', UI_STRINGS.panelTitle), statusNode];
  if (providers.length === 0) content.push(emptyState());
  else content.push(action(UI_STRINGS.addProvider, { type: 'addProvider' }, 'primary'), list);
  content.push(el('p', 'footer', `v${version}`));
  root.replaceChildren(...content);
}

function emptyState(): HTMLElement {
  const state = document.createElement('section');
  state.className = 'empty-state';
  state.setAttribute('aria-label', 'No provider profiles');
  state.append(el('p', 'empty-copy', UI_STRINGS.noProviders), action(UI_STRINGS.addProvider, { type: 'addProvider' }, 'primary'));
  return state;
}

window.addEventListener('message', (event: MessageEvent<unknown>) => {
  if (!isHostToWebview(event.data)) return;
  render(event.data.state.version, event.data.state.status, event.data.state.providers);
});

render('…', UI_STRINGS.loading);
vscode.postMessage({ type: 'ready' });
