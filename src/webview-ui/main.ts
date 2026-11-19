import { isHostToWebview } from '../shared/protocol';
import type { WebviewToHost } from '../shared/protocol';

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
  node.textContent = text; // textContent only. Never innerHTML (docs/SECURITY.md T5).
  return node;
}

function render(version: string, status: string): void {
  if (!root) return;
  root.replaceChildren(
    el('h1', 'title', 'Portwise'),
    el('p', 'status', status),
    el('p', 'footer', `v${version}`),
  );
}

window.addEventListener('message', (event: MessageEvent<unknown>) => {
  if (!isHostToWebview(event.data)) return;
  render(event.data.state.version, event.data.state.status);
});

render('…', 'Loading…');
vscode.postMessage({ type: 'ready' });
