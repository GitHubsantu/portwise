import * as os from 'node:os';
import * as path from 'node:path';
import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import { formatDiagnostics } from './diagnostics/report';
import { runDiagnostics } from './diagnostics/checks';
import { GatewayController, GatewayLifecycleError } from './gateway/controller';
import { Logger, type LogLevel } from './core/logger';
import { canonicalCodexHome, resolveCodexFile, resolveCodexHome } from './core/paths';
import { PANEL_VIEW_ID, PanelProvider } from './ui/panelProvider';
import { ProviderController } from './profiles/providerController';
import { ProfileStore } from './profiles/profileStore';
import { ConfigSync } from './sync/configSync';
import { deliverGatewayToken } from './sync/credentialDelivery';
import { consentMessage, HomeConsent } from './sync/homeConsent';
import { backupDirectories as backupDirectory, type BackupEntry } from './sync/backups';
import { AccountStore } from './accounts/accountStore';
import { AccountSwitcher } from './accounts/accountSwitcher';
import { LoginPermit } from './accounts/loginPermit';
import { currentAccounts } from './accounts/currentAccount';
import { withAccountOperation } from './accounts/accountOperation';
import { LockRecoveryCancelledError } from './core/errors';
import { UI_STRINGS } from './ui/strings';
import { safeErrorMessage } from './core/safeError';
import { OperationQueue } from './core/operationQueue';
import { readGatewaySettings, assertGatewaySettings, settingsChanged, type GatewaySettings } from './gateway/settings';

const LOG_LEVELS: readonly LogLevel[] = ['error', 'warn', 'info', 'debug'];

function readLogLevel(): LogLevel {
  const value = vscode.workspace.getConfiguration('portwise').get<string>('logLevel', 'info');
  return (LOG_LEVELS as readonly string[]).includes(value) ? (value as LogLevel) : 'info';
}

export function activate(context: vscode.ExtensionContext): void {
  const logger = new Logger(readLogLevel());
  const home = resolveHome(logger);
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBar.command = 'portwise.openPanel';
  statusBar.text = '$(debug-disconnect) Portwise: stopped';
  statusBar.accessibilityInformation = { label: 'Portwise gateway stopped', role: 'status' };
  statusBar.tooltip = `Open the Portwise panel. Target Codex home: ${home ?? 'unavailable'}.`;
  statusBar.show();
  const profileStore = new ProfileStore(context.globalState, context.secrets);
  const providers = new ProviderController(profileStore);
  // Legacy portwise.codexHomeConsent is intentionally ignored. Config writes
  // require a new operation-scoped confirmation, even with old stored approval.
  const accountConsent = new HomeConsent(context.globalState, 'portwise.accountHomeConsent');
  const loginConsent = new HomeConsent(context.globalState, 'portwise.loginHomeConsent');
  const accounts = new AccountStore(context.globalState, context.secrets);
  const configOperations = new OperationQueue();
  const gatewayOperations = new OperationQueue();
  let gatewaySettingsEpoch = 0;

  async function targetHome(): Promise<string> {
    const resolved = resolveHome(logger);
    if (!resolved) throw new GatewayLifecycleError('Codex home is invalid. Set portwise.codexHome to an absolute real directory.', 'codex_home_invalid');
    const current = await canonicalCodexHome(resolved);
    statusBar.tooltip = `Open the Portwise panel. Target Codex home: ${current}.`;
    return current;
  }
  async function assertCurrentHome(expected: string): Promise<void> {
    if (await targetHome() !== expected) throw new GatewayLifecycleError('The target Codex home changed during the operation. Run the command again and confirm the new exact path.', 'codex_home_changed');
  }

  async function token(): Promise<string> {
    const existing = await context.secrets.get('portwise.gatewayToken');
    if (existing) return existing;
    const created = randomBytes(32).toString('base64url');
    await context.secrets.store('portwise.gatewayToken', created);
    return created;
  }
  const gatewaySettings = () => readGatewaySettings(vscode.workspace.getConfiguration('portwise'));
  async function controller(expected?: GatewaySettings): Promise<GatewayController> {
    const epoch = gatewaySettingsEpoch;
    return new GatewayController({ storageDirectory: context.globalStorageUri.fsPath, gatewayScript: path.join(context.extensionPath, 'dist', 'gateway.js'), port: expected?.port ?? gatewaySettings().port, token: await token(), version: context.extension.packageJSON.version as string,
      ...(expected ? { assertSettings: () => { assertGatewaySettings(expected, gatewaySettings()); if (epoch !== gatewaySettingsEpoch) throw settingsChanged(); } } : {}),
    });
  }
  function runGateway(operation: 'start' | 'stop' | 'restart', trigger: 'auto' | 'command'): Promise<void> {
    return gatewayOperations.run(async () => {
      const settings = gatewaySettings();
      logger.info(`Gateway operation [trigger=${trigger}; port=${settings.port}; autoStart=${settings.autoStart}; portSource=${settings.portSource}; autoStartSource=${settings.autoStartSource}].`);
      if (trigger === 'auto' && !settings.autoStart) return;
      if (operation === 'stop') {
        await (await controller(settings)).stop(); statusBar.text = '$(debug-disconnect) Portwise: stopped'; statusBar.accessibilityInformation = { label: 'Portwise gateway stopped', role: 'status' }; logger.info('Gateway stopped.');
      } else await start(settings, operation === 'restart');
    });
  }
  async function activeProvider() {
    return profileStore.connection();
  }
  async function diagnostics(): Promise<void> {
    const currentHome = resolveHome(logger) ?? '';
    const gatewayToken = await context.secrets.get('portwise.gatewayToken');
    const provider = await activeProvider();
    const result = await runDiagnostics({ codexHome: currentHome, storageDirectory: context.globalStorageUri.fsPath, port: vscode.workspace.getConfiguration('portwise').get<number>('gatewayPort', 47831), ...(gatewayToken ? { token: gatewayToken } : {}), ...(provider ? { provider } : {}) });
    const report = formatDiagnostics(result.checks, result.restartRequired);
    logger.info(report);
    const action = await vscode.window.showInformationMessage('Portwise diagnostics completed. See the Portwise output channel for the redacted report.', 'Copy redacted report');
    if (action === 'Copy redacted report') await vscode.env.clipboard.writeText(report);
  }
  async function start(settings: GatewaySettings, restart: boolean): Promise<void> {
    const control = await controller(settings);
    const provider = await activeProvider();
    const state = await (restart ? control.restart(provider) : control.start(provider));
    logger.info(`Gateway running on loopback port ${state.port}. Configure Codex explicitly before it can use this gateway.`);
    statusBar.text = `$(debug-start) Portwise: ${state.port}`;
    statusBar.accessibilityInformation = { label: `Portwise gateway running on port ${state.port}`, role: 'status' };
  }
  async function configureCodex(): Promise<void> {
    const home = await targetHome();
    const state = await (await controller()).status();
    if (!state) throw new GatewayLifecycleError('Gateway is not running. Start Gateway before configuring Codex.', 'gateway_not_running');
    if (!await confirmCodexWrite(home)) return;
    await assertCurrentHome(home);
    await resolveCodexFile(home, 'config.toml');
    await resolveCodexFile(home, '.env');
    const backups = await backupDirectory(context.globalStorageUri.fsPath, home);
    const sync = new ConfigSync({ codexHome: home, backupDirectory: backups, gatewayBaseUrl: `http://127.0.0.1:${state.port}/v1` });
    await writeConfig(home, async () => {
      await sync.sync();
      const delivery = await deliverGatewayToken(home, await token(), backups);
      if (delivery.permissionsEnforced !== undefined) await context.globalState.update('portwise.gatewayEnvPermissions', delivery.permissionsEnforced);
      logger.info(`Codex gateway configuration checked. ${delivery.restartRequired ? 'Restart Codex/VS Code to load the updated gateway credential.' : ''}`);
      if (delivery.permissionsEnforced === false) logger.warn('Gateway credential file permissions could not be restricted. Run Diagnostics for the fix.');
    });
  }
  async function writeConfig(home: string, write: () => Promise<void>): Promise<void> {
    await configOperations.run(async () => { await assertCurrentHome(home); await write(); });
  }
  async function accountSwitcher(home: string): Promise<AccountSwitcher> {
    return new AccountSwitcher({ codexHome: home, store: accounts, confirmLegacyRecovery });
  }
  function loginPermit(home: string): LoginPermit {
    return new LoginPermit(context.globalState, home, { confirmLegacyRecovery });
  }
  async function startCodexLogin(): Promise<void> {
    const home = await targetHome();
    if (!await loginConsent.confirm(home, async (target) => (await vscode.window.showWarningMessage(`Launch official Codex login for this exact Codex home?\n\n${target}\n\nCodex may update credentials in this directory.`, { modal: true }, 'Start login')) === 'Start login')) return;
    await assertCurrentHome(home);
    await loginPermit(home).launch(() => {
      const terminal = vscode.window.createTerminal({ name: 'Portwise: Codex Login', shellPath: 'codex', shellArgs: ['login'], env: { CODEX_HOME: home } });
      terminal.show();
    });
    await vscode.window.showInformationMessage('Complete the official Codex login in the terminal, then run “Portwise: Save Current Codex Account”.');
  }
  async function saveAccount(): Promise<void> {
    const home = await targetHome();
    const permit = loginPermit(home); permit.requirePending();
    const name = await vscode.window.showInputBox({ prompt: 'Name this Codex account snapshot', ignoreFocusOut: true, validateInput: (value) => value.trim() ? undefined : 'An account name is required.' });
    if (!name) return;
    await assertCurrentHome(home);
    await permit.consumeAndCapture(async () => (await accountSwitcher(home)).captureCurrent(name));
    await vscode.window.showInformationMessage('Codex account saved securely. Credentials remain in SecretStorage.');
  }
  async function switchAccount(): Promise<void> {
    const home = await targetHome();
    const items = accounts.list(home).map((account) => ({ label: account.name, description: account.id, account }));
    const choice = await vscode.window.showQuickPick(items, { placeHolder: `Switch Codex account for ${home}` });
    if (!choice) return;
    if (!await accountConsent.confirm(home, confirmAccountWrite)) return;
    await assertCurrentHome(home);
    await (await accountSwitcher(home)).switchTo(choice.account.id, async () => { await vscode.window.showInformationMessage('Codex account switched. Restart Codex/VS Code to load the selected account.'); });
  }
  async function removeAccount(): Promise<void> {
    const home = await targetHome();
    const items = accounts.list(home).map((account) => ({ label: account.name, description: account.id, account }));
    const choice = await vscode.window.showQuickPick(items, { placeHolder: `Remove saved Codex account for ${home}` });
    if (!choice) return;
    const confirm = await vscode.window.showWarningMessage(`Remove the saved account “${choice.account.name}”? Its SecretStorage snapshot will be deleted; auth.json will not be changed.`, { modal: true }, 'Remove');
    if (confirm !== 'Remove') return;
    await assertCurrentHome(home);
    await withAccountOperation(home, { confirmLegacyRecovery }, async () => accounts.remove(choice.account.id));
    await vscode.window.showInformationMessage('Saved Codex account removed.');
  }
  const panel = new PanelProvider(context, logger, {
    listProviders: () => providers.listProviders(),
    listAccounts: async () => { try { return await currentAccounts(await targetHome(), accounts); } catch { return { accounts: [], accountMatchAvailability: 'unavailable' }; } },
    gatewayState: async () => {
      if (!resolveHome(logger)) return { running: false, label: 'Stopped: Codex home unavailable' };
      const state = await (await controller()).status();
      return state ? { running: true, label: `Running on port ${state.port}` } : { running: false, label: 'Stopped' };
    },
    runPanelCommand: async (command) => { await vscode.commands.executeCommand(command); },
    handle: async (message) => {
      const status = await providers.handle(message);
      if (status && message.type !== 'testProvider') await (await controller()).syncProvider(await activeProvider());
      return status;
    },
  });
  async function showFailure(error: unknown): Promise<void> {
    if (error instanceof LockRecoveryCancelledError) return;
    const message = safeErrorMessage(error);
    logger.error(message);
    await vscode.window.showErrorMessage(`Portwise extension: ${message}`);
  }

  context.subscriptions.push(
    logger,
    profileStore, accounts, configOperations, gatewayOperations,
    statusBar,
    vscode.window.registerWebviewViewProvider(PANEL_VIEW_ID, panel),
    vscode.commands.registerCommand('portwise.openPanel', () =>
      vscode.commands.executeCommand(`${PANEL_VIEW_ID}.focus`),
    ),
    vscode.commands.registerCommand('portwise.refresh', () => panel.refresh()),
    vscode.commands.registerCommand('portwise.showLogs', () => logger.show()),
    vscode.commands.registerCommand('portwise.startGateway', () => runGateway('start', 'command').catch(showFailure)),
    vscode.commands.registerCommand('portwise.stopGateway', () => runGateway('stop', 'command').catch(showFailure)),
    vscode.commands.registerCommand('portwise.restartGateway', () => runGateway('restart', 'command').catch(showFailure)),
    vscode.commands.registerCommand('portwise.configureCodex', () => configureCodex().catch(showFailure)),
    vscode.commands.registerCommand('portwise.restoreConfig', async () => { try { const home = await targetHome(); const sync = new ConfigSync({ codexHome: home, backupDirectory: await backupDirectory(context.globalStorageUri.fsPath, home), gatewayBaseUrl: '' }); const backup = await chooseBackup(home, await sync.backups()); if (!backup) return; const confirm = await vscode.window.showWarningMessage(`Restore config.toml for this exact Codex home?\n\n${home}\n\nA safety backup of the current file will be created first.`, { modal: true }, 'Restore'); if (confirm !== 'Restore') return; await writeConfig(home, () => sync.restore(backup)); await vscode.window.showInformationMessage('Portwise restored the selected config.toml backup.'); } catch (error) { await showFailure(error); } }),
    vscode.commands.registerCommand('portwise.switchToGateway', async () => { try { const home = await targetHome(); const choice = await vscode.window.showWarningMessage(`Switch Codex model_provider to Portwise for this exact Codex home?\n\n${home}\n\nThis changes only model_provider; it does not restart Codex.`, { modal: true }, 'Switch'); if (choice === 'Switch') { await writeConfig(home, async () => new ConfigSync({ codexHome: home, backupDirectory: await backupDirectory(context.globalStorageUri.fsPath, home), gatewayBaseUrl: '' }).switchToPortwise()); await vscode.window.showInformationMessage('Codex will use Portwise after you restart Codex/VS Code.'); } } catch (error) { await showFailure(error); } }),
    vscode.commands.registerCommand('portwise.startCodexLogin', () => startCodexLogin().catch(showFailure)),
    vscode.commands.registerCommand('portwise.saveCodexAccount', () => saveAccount().catch(showFailure)),
    vscode.commands.registerCommand('portwise.switchCodexAccount', () => switchAccount().catch(showFailure)),
    vscode.commands.registerCommand('portwise.removeCodexAccount', () => removeAccount().catch(showFailure)),
    vscode.commands.registerCommand('portwise.openCodexUsage', async () => { const terminal = vscode.window.createTerminal({ name: UI_STRINGS.usageTerminal, shellPath: 'codex', shellArgs: [] }); terminal.show(); await vscode.window.showInformationMessage(UI_STRINGS.usageReady); }),
    vscode.commands.registerCommand('portwise.runDiagnostics', () => diagnostics().catch(showFailure)),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('portwise.gatewayPort') || event.affectsConfiguration('portwise.autoStartGateway')) gatewaySettingsEpoch++;
      if (event.affectsConfiguration('portwise.logLevel')) logger.setLevel(readLogLevel());
      if (event.affectsConfiguration('portwise.codexHome')) { statusBar.tooltip = `Open the Portwise panel. Target Codex home: ${resolveHome(logger) ?? 'unavailable'}.`; panel.refresh(); }
    }),
  );

  if (home) logger.info(`Portwise activated. Codex home: ${home}`);
  if (home) void runGateway('start', 'auto').catch(showFailure);
}

async function confirmCodexWrite(home: string): Promise<boolean> {
  const choice = await vscode.window.showWarningMessage(consentMessage(home), { modal: true }, 'Configure');
  return choice === 'Configure';
}

async function confirmAccountWrite(home: string): Promise<boolean> {
  const choice = await vscode.window.showWarningMessage(`Portwise will replace auth.json in this exact Codex home with a saved SecretStorage snapshot:\n\n${home}\n\nIt will create a rollback backup first. Continue?`, { modal: true }, 'Switch account');
  return choice === 'Switch account';
}

async function confirmLegacyRecovery(lockPath: string): Promise<boolean> {
  const choice = await vscode.window.showWarningMessage(`Portwise found a legacy lock or recovery guard with no verifiable owner:\n\n${lockPath}\n\nClose other Portwise Extension Development Hosts/windows before recovering it. Portwise will recheck this exact file before removal. Recover this lock?`, { modal: true }, 'Recover lock');
  return choice === 'Recover lock';
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
  catch { logger.error('Invalid Codex home. Set portwise.codexHome to an absolute real directory without null bytes, then retry.'); return undefined; }
}

export function deactivate(): void {
  // Disposables are registered on context.subscriptions.
}
