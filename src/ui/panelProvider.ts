import * as vscode from 'vscode';
import type { Logger } from '../core/logger';
import { createNonce } from '../core/nonce';
import type { HostToWebview } from '../shared/protocol';
import { isWebviewToHost } from '../shared/protocol';

export const PANEL_VIEW_ID = 'portwise.panel';

/**
 * Hosts the Portwise webview.
 * Security: strict CSP with nonce, no remote resources, restricted localResourceRoots,
 * and every inbound message is validated by a type guard.
 */
export class PanelProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly logger: Logger,
  ) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    const webviewRoot = vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview');

    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [webviewRoot],
    };
    view.webview.html = this.renderHtml(view.webview, webviewRoot);

    view.webview.onDidReceiveMessage((message: unknown) => {
      if (!isWebviewToHost(message)) {
        this.logger.warn('Ignored an invalid message from the webview.');
        return;
      }
      if (message.type === 'ready' || message.type === 'refresh') {
        this.postState();
      }
    });

    view.onDidDispose(() => {
      this.view = undefined;
    });
  }

  refresh(): void {
    this.postState();
  }

  private postState(): void {
    const message: HostToWebview = {
      type: 'state',
      state: {
        version: String(this.context.extension.packageJSON.version ?? '0.0.0'),
        status: 'Ready. Gateway and profiles arrive in later phases (docs/PLAN.md).',
      },
    };
    void this.view?.webview.postMessage(message);
  }

  private renderHtml(webview: vscode.Webview, webviewRoot: vscode.Uri): string {
    const nonce = createNonce();
    const script = webview.asWebviewUri(vscode.Uri.joinPath(webviewRoot, 'main.js'));
    const style = webview.asWebviewUri(vscode.Uri.joinPath(webviewRoot, 'main.css'));
    const csp = [
      "default-src 'none'",
      `style-src ${webview.cspSource}`,
      `script-src 'nonce-${nonce}'`,
      `img-src ${webview.cspSource} data:`,
      `font-src ${webview.cspSource}`,
    ].join('; ');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="${style}" />
  <title>Portwise</title>
</head>
<body>
  <main id="app" aria-live="polite"></main>
  <script nonce="${nonce}" src="${script}"></script>
</body>
</html>`;
  }
}
