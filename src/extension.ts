import * as os from 'node:os';
import * as vscode from 'vscode';
import { Logger, type LogLevel } from './core/logger';
import { resolveCodexHome } from './core/paths';
import { PANEL_VIEW_ID, PanelProvider } from './ui/panelProvider';

const LOG_LEVELS: readonly LogLevel[] = ['error', 'warn', 'info', 'debug'];

function readLogLevel(): LogLevel {
  const value = vscode.workspace.getConfiguration('portwise').get<string>('logLevel', 'info');
  return (LOG_LEVELS as readonly string[]).includes(value) ? (value as LogLevel) : 'info';
}

export function activate(context: vscode.ExtensionContext): void {
  const logger = new Logger(readLogLevel());
  const panel = new PanelProvider(context, logger);

  context.subscriptions.push(
    logger,
    vscode.window.registerWebviewViewProvider(PANEL_VIEW_ID, panel),
    vscode.commands.registerCommand('portwise.openPanel', () =>
      vscode.commands.executeCommand(`${PANEL_VIEW_ID}.focus`),
    ),
    vscode.commands.registerCommand('portwise.refresh', () => panel.refresh()),
    vscode.commands.registerCommand('portwise.showLogs', () => logger.show()),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('portwise.logLevel')) logger.setLevel(readLogLevel());
    }),
  );

  try {
    const home = resolveCodexHome({
      configured: vscode.workspace.getConfiguration('portwise').get<string>('codexHome'),
      envCodexHome: process.env['CODEX_HOME'],
      homedir: os.homedir(),
    });
    logger.info(`Portwise activated. Codex home: ${home}`);
  } catch (error) {
    logger.error(`Invalid Codex home: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function deactivate(): void {
  // Disposables are registered on context.subscriptions.
}
