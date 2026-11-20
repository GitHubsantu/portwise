import * as os from 'node:os';
import * as path from 'node:path';
import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import { formatDiagnostics, type DiagnosticCheck } from './diagnostics/report';
import { GatewayController, GatewayLifecycleError } from './gateway/controller';
import { Logger, type LogLevel } from './core/logger';
import { resolveCodexHome } from './core/paths';
import { PANEL_VIEW_ID, PanelProvider } from './ui/panelProvider';
import { ProviderController } from './profiles/providerController';
import { ProfileStore } from './profiles/profileStore';
import { ConfigSync } from './sync/configSync';
import { deliverGatewayToken } from './sync/credentialDelivery';
import { consentMessage, HomeConsent } from './sync/homeConsent';
import type { BackupEntry } from './sync/backups';

const LOG_LEVELS: readonly LogLevel[] = ['error', 'warn', 'info', 'debug'];

function readLogLevel(): LogLevel {
  const value = vscode.workspace.getConfiguration('portwise').get<string>('logLevel', 'info');
  return (LOG_LEVELS as readonly string[]).includes(value) ? (value as LogLevel) : 'info';
}

export function activate(context: vscode.ExtensionContext): void {
  const logger = new Logger(readLogLevel());
  const home = resolveHome(logger);
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBar.command = 'portwise.runDiagnostics';
  statusBar.text = '$(debug-disconnect) Portwise: stopped';
  statusBar.tooltip = `Portwise gateway status. Target Codex home: ${home ?? 'unavailable'}. Run diagnostics.`;
  statusBar.show();
  const profileStore = new ProfileStore(context.globalState, context.secrets);
  const providers = new ProviderController(profileStore);
  const panel = new PanelProvider(context, logger, providers);
  const consent = new HomeConsent(context.globalState);

  async function token(): Promise<string> {
    const existing = await context.secrets.get('portwise.gatewayToken');
    if (existing) return existing;
    const created = randomBytes(32).toString('base64url');
    await context.secrets.store('portwise.gatewayToken', created);
    return created;
  }
  async function controller(): Promise<GatewayController> {
    if (!home) throw new GatewayLifecycleError('Codex home is invalid. Set portwise.codexHome to an absolute writable directory.', 'codex_home_invalid');
    return new GatewayController({ storageDirectory: context.globalStorageUri.fsPath, gatewayScript: path.join(context.extensionPath, 'dist', 'gateway.js'), port: vscode.workspace.getConfiguration('portwise').get<number>('gatewayPort', 47831), token: await token(), version: context.extension.packageJSON.version as string });
  }
  async function activeProvider() {
    const provider = (await profileStore.list()).find((candidate) => candidate.enabled);
    return provider ? { baseUrl: provider.baseUrl, token: await profileStore.getToken(provider.id), enabled: true } : undefined;
  }
  async function start(): Promise<void> {
    const control = await controller();
    const state = await control.start(await activeProvider());
    logger.info(`Gateway running on loopback port ${state.port}. Configure Codex explicitly before it can use this gateway.`);
    statusBar.text = `$(debug-start) Portwise: ${state.port}`;
  }
  async function configureCodex(): Promise<void> {
    if (!home) throw new GatewayLifecycleError('Codex home is invalid. Set portwise.codexHome to an absolute writable directory.', 'codex_home_invalid');
    const state = await (await controller()).status();
    if (!state) throw new GatewayLifecycleError('Gateway is not running. Start Gateway before configuring Codex.', 'gateway_not_running');
    await consent.runWithConsent(home, confirmCodexWrite, async () => {
      const backups = backupDirectory(context.globalStorageUri.fsPath, home);
      const sync = new ConfigSync({ codexHome: home, backupDirectory: backups, gatewayBaseUrl: `http://127.0.0.1:${state.port}/v1` });
      await sync.sync();
      const delivery = await deliverGatewayToken(home, await token(), backups);
      await context.globalState.update('portwise.gatewayEnvPermissions', delivery.permissionsEnforced);
      logger.info(`Codex gateway configuration updated. ${delivery.restartRequired ? 'Restart Codex/VS Code to load the updated gateway credential.' : ''}`);
      if (!delivery.permissionsEnforced) logger.warn('Gateway credential file permissions could not be restricted. Run Diagnostics for the fix.');
    });
  }
  async function showFailure(error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : 'Unexpected Portwise extension error.';
    logger.error(message);
    await vscode.window.showErrorMessage(`Portwise extension: ${message}`);
  }

  context.subscriptions.push(
    logger,
    statusBar,
    vscode.window.registerWebviewViewProvider(PANEL_VIEW_ID, panel),
    vscode.commands.registerCommand('portwise.openPanel', () =>
      vscode.commands.executeCommand(`${PANEL_VIEW_ID}.focus`),
    ),
    vscode.commands.registerCommand('portwise.refresh', () => panel.refresh()),
    vscode.commands.registerCommand('portwise.showLogs', () => logger.show()),
    vscode.commands.registerCommand('portwise.startGateway', () => start().catch(showFailure)),
    vscode.commands.registerCommand('portwise.stopGateway', async () => { try { await (await controller()).stop(); statusBar.text = '$(debug-disconnect) Portwise: stopped'; logger.info('Gateway stopped.'); } catch (error) { await showFailure(error); } }),
    vscode.commands.registerCommand('portwise.restartGateway', () => (async () => { try { await (await controller()).stop(); await start(); } catch (error) { await showFailure(error); } })()),
    vscode.commands.registerCommand('portwise.configureCodex', () => configureCodex().catch(showFailure)),
    vscode.commands.registerCommand('portwise.restoreConfig', async () => { try { if (!home) throw new Error('Codex home is unavailable.'); if (!await consent.confirm(home, confirmCodexWrite)) return; const sync = new ConfigSync({ codexHome: home, backupDirectory: backupDirectory(context.globalStorageUri.fsPath, home), gatewayBaseUrl: '' }); const backup = await chooseBackup(home, await sync.backups()); if (!backup) return; const confirm = await vscode.window.showWarningMessage(`Restore config.toml for this exact Codex home?\n\n${home}\n\nA safety backup of the current file will be created first.`, { modal: true }, 'Restore'); if (confirm !== 'Restore') return; await sync.restore(backup); await vscode.window.showInformationMessage('Portwise restored the selected config.toml backup.'); } catch (error) { await showFailure(error); } }),
    vscode.commands.registerCommand('portwise.switchToGateway', async () => { try { if (!home) throw new Error('Codex home is unavailable.'); if (!await consent.confirm(home, confirmCodexWrite)) return; const choice = await vscode.window.showWarningMessage('Switch Codex model_provider to Portwise? This changes only model_provider; it does not restart Codex.', { modal: true }, 'Switch'); if (choice === 'Switch') { await new ConfigSync({ codexHome: home, backupDirectory: backupDirectory(context.globalStorageUri.fsPath, home), gatewayBaseUrl: '' }).switchToPortwise(); await vscode.window.showInformationMessage('Codex will use Portwise after you restart Codex/VS Code.'); } } catch (error) { await showFailure(error); } }),
    vscode.commands.registerCommand('portwise.runDiagnostics', async () => { try { const control = await controller(); const state = await control.status(); const permissions = context.globalState.get<boolean>('portwise.gatewayEnvPermissions'); const checks: DiagnosticCheck[] = [{ name: 'daemon', status: state ? 'PASS' : 'FAIL', hint: state ? `Gateway is running on port ${state.port}.` : 'Start the gateway.' }, { name: 'codex-home', status: home ? 'PASS' : 'FAIL', hint: home ? 'Configured Codex home resolved.' : 'Set portwise.codexHome.' }, { name: 'credential-delivery', status: permissions === false ? 'FAIL' : 'WARN', hint: permissions === false ? 'Portwise could not restrict .env permissions. Restrict it to your user account, then restart Codex/VS Code.' : 'Restart Codex/VS Code after a token change.' }]; const report = formatDiagnostics(checks, true); logger.info(report); await vscode.window.showInformationMessage('Portwise diagnostics completed. See the Portwise output channel for the redacted report.'); } catch (error) { await showFailure(error); } }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('portwise.logLevel')) logger.setLevel(readLogLevel());
    }),
  );

  if (home) logger.info(`Portwise activated. Codex home: ${home}`);
  if (home && vscode.workspace.getConfiguration('portwise').get<boolean>('autoStartGateway', true)) {
    void start().catch(showFailure);
  }
}

async function confirmCodexWrite(home: string): Promise<boolean> {
  const choice = await vscode.window.showWarningMessage(consentMessage(home), { modal: true }, 'Configure');
  return choice === 'Configure';
}

function backupDirectory(storageDirectory: string, home: string): string {
  return path.join(storageDirectory, 'backups', Buffer.from(home).toString('base64url'));
}

async function chooseBackup(home: string, backups: readonly BackupEntry[]): Promise<BackupEntry | undefined> {
  type BackupItem = vscode.QuickPickItem & { backup: BackupEntry };
  const items: BackupItem[] = backups.map((backup) => ({ label: backup.createdAt, description: home, backup }));
  return new Promise((resolve) => {
    const picker = vscode.window.createQuickPick<BackupItem>();
    picker.title = 'Restore Portwise config backup';
    picker.placeholder = `Restore config.toml for ${home}`;
    picker.items = items;
    const first = items[0];
    if (first) picker.activeItems = [first];
    let finished = false;
    const finish = (value: BackupEntry | undefined): void => {
      if (finished) return;
      finished = true;
      accepted.dispose();
      hidden.dispose();
      picker.dispose();
      resolve(value);
    };
    const accepted = picker.onDidAccept(() => finish(picker.selectedItems[0]?.backup));
    const hidden = picker.onDidHide(() => finish(undefined));
    picker.show();
  });
}

function resolveHome(logger: Logger): string | undefined {
  try { return resolveCodexHome({ configured: vscode.workspace.getConfiguration('portwise').get<string>('codexHome'), envCodexHome: process.env['CODEX_HOME'], homedir: os.homedir() }); }
  catch (error) { logger.error(`Invalid Codex home: ${error instanceof Error ? error.message : String(error)}`); return undefined; }
}

export function deactivate(): void {
  // Disposables are registered on context.subscriptions.
}
