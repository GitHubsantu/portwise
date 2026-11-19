import { isHostToWebview } from '../shared/protocol';
import type { ProviderPanelItem, WebviewToHost } from '../shared/protocol';

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
  const list = document.createElement('ul');
  list.className = 'providers';
  list.setAttribute('aria-label', 'Provider profiles');
  for (const provider of providers) {
    const item = document.createElement('li');
    item.className = 'provider';
    const controls = document.createElement('div');
    controls.className = 'provider-actions';
    controls.append(action('Edit provider', { type: 'editProvider', id: provider.id }), action(provider.enabled ? 'Disable provider' : 'Enable provider', { type: 'toggleProvider', id: provider.id, enabled: !provider.enabled }), action('Test provider connection', { type: 'testProvider', id: provider.id }), action('Delete provider', { type: 'deleteProvider', id: provider.id }));
    item.append(el('strong', 'provider-name', provider.name), el('span', 'provider-detail', `${provider.baseUrl} · ${provider.tokenMask}`), controls);
    list.append(item);
  }
  root.replaceChildren(
    el('h1', 'title', 'Portwise'),
    el('p', 'status', status),
    action('Add provider', { type: 'addProvider' }),
    list,
    el('p', 'footer', `v${version}`),
  );
}

window.addEventListener('message', (event: MessageEvent<unknown>) => {
  if (!isHostToWebview(event.data)) return;
  render(event.data.state.version, event.data.state.status, event.data.state.providers);
});

render('…', 'Loading…');
vscode.postMessage({ type: 'ready' });
