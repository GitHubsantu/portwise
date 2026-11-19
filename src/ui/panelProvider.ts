import * as vscode from 'vscode';
import type { Logger } from '../core/logger';
import { createNonce } from '../core/nonce';
import { buildWebviewCsp } from '../core/webviewCsp';
import type { HostToWebview, ProviderPanelItem, WebviewToHost } from '../shared/protocol';
import { isWebviewToHost } from '../shared/protocol';

export const PANEL_VIEW_ID = 'portwise.panel';

export interface PanelActions {
  listProviders(): Promise<ProviderPanelItem[]>;
  handle(message: Exclude<WebviewToHost, { type: 'ready' } | { type: 'refresh' }>): Promise<string | undefined>;
}

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
    private readonly actions: PanelActions,
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
      } else {
        void this.actions.handle(message).then((status) => this.postState(status)).catch((error: unknown) => {
          this.logger.error(error instanceof Error ? error.message : 'Provider action failed.');
          this.postState('The provider action failed. Check the Portwise log for details.');
        });
      }
    });

    view.onDidDispose(() => {
      this.view = undefined;
    });
  }

  refresh(): void {
    this.postState();
  }

  private postState(status = 'Ready.'): void {
    void this.actions.listProviders().then((providers) => {
      const message: HostToWebview = {
      type: 'state',
      state: {
        version: String(this.context.extension.packageJSON.version ?? '0.0.0'),
        status,
        providers,
      },
      };
      void this.view?.webview.postMessage(message);
    });
  }

  private renderHtml(webview: vscode.Webview, webviewRoot: vscode.Uri): string {
    const nonce = createNonce();
    const script = webview.asWebviewUri(vscode.Uri.joinPath(webviewRoot, 'main.js'));
    const style = webview.asWebviewUri(vscode.Uri.joinPath(webviewRoot, 'main.css'));
    const csp = buildWebviewCsp(webview.cspSource, nonce);

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
