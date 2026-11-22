import { access, readFile, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountStore } from '../src/accounts/accountStore';
import { temporaryDirectory } from './helpers/temporaryDirectory';
import { PERMISSION_IO_TEST_MS } from './helpers/permissionBudget';
import { FileLock } from '../src/core/fileLock';
import type { PanelProvider } from '../src/ui/panelProvider';
import type { PanelCommand } from '../src/shared/protocol';
import { GatewayController } from '../src/gateway/controller';
import { GatewayLifecycleError } from '../src/gateway/controller';
import { startGateway } from '../src/gateway/daemon/server';
import * as permissions from '../src/core/privateFile';
import { FileUpdateVerificationError } from '../src/sync/verifiedUpdate';
import { startupMessage } from '../src/gateway/probeFailure';

const ui = vi.hoisted(() => ({
  home: '', port: 47831, commands: new Map<string, () => Promise<void> | void>(),
  input: vi.fn(), pick: vi.fn(), warning: vi.fn(), info: vi.fn(), error: vi.fn(),
  terminal: vi.fn(), clipboard: vi.fn(), logs: [] as string[], panel: undefined as PanelProvider | undefined, lastCommand: undefined as Promise<unknown> | undefined,
}));
vi.mock('vscode', () => ({
  window: {
    createOutputChannel: () => ({ appendLine: (line: string) => { ui.logs.push(line); }, show: vi.fn(), dispose: vi.fn() }),
    createStatusBarItem: () => ({ show: vi.fn(), dispose: vi.fn() }),
    registerWebviewViewProvider: (_id: string, provider: PanelProvider) => { ui.panel = provider; return { dispose: vi.fn() }; },
    createTerminal: ui.terminal,
    showInputBox: ui.input, showQuickPick: ui.pick, showWarningMessage: ui.warning, showInformationMessage: ui.info, showErrorMessage: ui.error,
  },
  commands: { registerCommand: (id: string, run: () => Promise<void> | void) => { ui.commands.set(id, run); return { dispose: vi.fn() }; }, executeCommand: (id: string) => { ui.lastCommand = Promise.resolve(ui.commands.get(id)?.()); return ui.lastCommand; } },
  workspace: { getConfiguration: () => ({ get: (key: string, fallback: unknown) => key === 'codexHome' ? ui.home : key === 'gatewayPort' ? ui.port : key === 'autoStartGateway' ? false : fallback }), onDidChangeConfiguration: () => ({ dispose: vi.fn() }) },
  env: { clipboard: { writeText: ui.clipboard } },
  StatusBarAlignment: { Left: 1 },
  Uri: { joinPath: (_root: unknown, ...parts: string[]) => parts.join('/') },
}));
import { activate } from '../src/extension';

afterEach(() => vi.clearAllMocks());

async function setup() {
  const directory = await temporaryDirectory('portwise-prompts'); ui.home = directory.path; ui.port = 47831; ui.clipboard.mockReset();
  for (const mock of [ui.input, ui.pick, ui.warning, ui.info, ui.error]) mock.mockReset().mockResolvedValue(undefined);
  ui.terminal.mockReset().mockReturnValue({ show: vi.fn() }); ui.lastCommand = undefined;
  ui.logs = [];
  await writeFile(path.join(directory.path, 'config.toml'), 'cli_auth_credentials_store = "file"\n');
  await writeFile(path.join(directory.path, 'auth.json'), '{"token":"test-prompt-token-0000"}');
  const values = new Map<string, unknown>(); const secrets = new Map<string, string>();
  values.set('portwise.loginHomeConsent', [directory.path]);
  const state = { get: <T>(key: string) => values.get(key) as T | undefined, update: async (key: string, value: unknown) => { values.set(key, value); } };
  const secretStore = { get: async (key: string) => secrets.get(key), store: async (key: string, value: string) => { secrets.set(key, value); }, delete: async (key: string) => { secrets.delete(key); } };
  const accounts = new AccountStore(state, secretStore); const account = await accounts.capture('Fake account', directory.path, '{"token":"test-other-token-0000"}');
  activate({ subscriptions: [], globalState: state, secrets: secretStore, extensionPath: directory.path, extensionUri: {}, globalStorageUri: { fsPath: directory.path }, extension: { packageJSON: { version: 'test' } } } as unknown as Parameters<typeof activate>[0]);
  let receive: ((message: unknown) => void) | undefined;
  const posted = vi.fn(async () => true);
  ui.panel?.resolveWebviewView({ webview: {
    options: {}, html: '', cspSource: 'vscode-webview://test', asWebviewUri: String,
    onDidReceiveMessage: (handler: (message: unknown) => void) => { receive = handler; }, postMessage: posted,
  }, onDidDispose: () => undefined } as unknown as Parameters<PanelProvider['resolveWebviewView']>[0]);
  const run = async (command: string, source = 'palette') => {
    if (source === 'panel') {
      posted.mockClear(); receive?.({ type: 'runPanelCommand', command }); await ui.lastCommand;
      await vi.waitFor(() => expect(posted).toHaveBeenCalled());
    } else {
      const handler = ui.commands.get(command); if (!handler) throw new Error('missing command'); await handler();
    }
  };
  const providerAction = async (message: unknown) => { posted.mockClear(); receive?.(message); await vi.waitFor(() => expect(posted).toHaveBeenCalled()); };
  return { directory, account, run, values, accounts, providerAction, posted, secrets };
}

describe('account prompt cancellation', () => {
  it('diagnoses the home selected now, copies only the redacted report on request, and never creates a missing gateway token', async () => {
    const fixture = await setup(); const other = await temporaryDirectory('portwise-diagnostic-home'); const daemon = await startGateway({ token: 'test-local-0000', port: 0 });
    try {
      ui.home = other.path; ui.port = daemon.port;
      await writeFile(path.join(fixture.directory.path, 'gateway.json'), JSON.stringify({ port: daemon.port, instanceId: daemon.instanceId }));
      await writeFile(path.join(other.path, 'config.toml'), 'bad = [test-opaque-config-0000\n');
      const before = await readFile(path.join(other.path, 'config.toml')); const count = fixture.secrets.size;
      fixture.values.set('portwise.gatewayEnvPermissions', true); // A cached flag must not make a missing .env pass.
      await fixture.run('portwise.runDiagnostics');
      expect(ui.clipboard).not.toHaveBeenCalled(); expect(fixture.secrets.size).toBe(count); expect(fixture.secrets.has('portwise.gatewayToken')).toBe(false);
      expect(ui.logs.join('\n')).toContain('FAIL config:'); expect(ui.logs.join('\n')).toContain('FAIL credential-delivery:'); expect(ui.logs.join('\n')).not.toContain('test-opaque-config-0000');
      ui.info.mockResolvedValueOnce('Copy redacted report'); await fixture.run('portwise.runDiagnostics');
      expect(ui.clipboard).toHaveBeenCalledOnce(); const copied: unknown = ui.clipboard.mock.calls[0]?.[0];
      expect(copied).toEqual(expect.stringContaining('FAIL config:')); expect(copied).toEqual(expect.stringContaining('Restart Codex/VS Code'));
      expect(copied).toEqual(expect.not.stringMatching(/test-local-0000|test-opaque-config-0000|test-other-token-0000/));
      expect(await readFile(path.join(other.path, 'config.toml'))).toEqual(before); await expect(access(path.join(other.path, '.env'))).rejects.toThrow(); expect(ui.error).not.toHaveBeenCalled();
    } finally { await daemon.close(); await other.dispose(); await fixture.directory.dispose(); }
  });
  it('never prints an opaque credential from an unexpected storage exception in notifications, logs or panel messages', async () => {
    const fixture = await setup(); const credential = 'test-opaque-value-0000';
    try {
      const getter = vi.spyOn(fixture.secrets, 'get').mockImplementationOnce(() => { throw new Error(credential); });
      await fixture.run('portwise.runDiagnostics'); getter.mockRestore();
      expect(ui.error).toHaveBeenCalledOnce(); expect(JSON.stringify(ui.error.mock.calls)).not.toContain(credential); expect(JSON.stringify(ui.logs)).not.toContain(credential);
      ui.input.mockResolvedValueOnce('fake').mockResolvedValueOnce('https://provider.invalid/v1').mockResolvedValueOnce('test-token-0000');
      await fixture.providerAction({ type: 'addProvider' });
      const records = fixture.values.get('portwise.providers') as Array<{ id: string }>; const id = records[0]?.id; if (!id) throw new Error('missing provider');
      const failed = vi.spyOn(fixture.secrets, 'get').mockImplementationOnce(() => { throw new Error(credential); });
      await fixture.providerAction({ type: 'testProvider', id }); failed.mockRestore();
      expect(JSON.stringify(ui.logs)).not.toContain(credential); expect(JSON.stringify(fixture.posted.mock.calls)).not.toContain(credential);
    } finally { await fixture.directory.dispose(); }
  });
  it('configures the current home only after its own consent, leaving the previously consented home unchanged', async () => {
    const fixture = await setup(); const other = await temporaryDirectory('portwise-configure-current');
    const daemon = await startGateway({ token: 'test-local-token-0000', port: 0 });
    try {
      ui.port = daemon.port;
      const before = await readFile(path.join(fixture.directory.path, 'config.toml'));
      await writeFile(path.join(other.path, 'config.toml'), 'model = "fake"\n');
      await writeFile(path.join(fixture.directory.path, 'gateway.json'), JSON.stringify({ pid: 123, port: daemon.port, instanceId: daemon.instanceId, startedAt: 'test', version: 'test' }));
      fixture.secrets.set('portwise.gatewayToken', 'test-local-token-0000');
      fixture.values.set('portwise.codexHomeConsent', [fixture.directory.path]); ui.home = other.path;
      await fixture.run('portwise.configureCodex');
      expect(ui.warning).toHaveBeenCalledWith(expect.stringContaining(other.path), { modal: true }, 'Configure');
      expect(await readFile(path.join(other.path, 'config.toml'), 'utf8')).toBe('model = "fake"\n');
      ui.warning.mockResolvedValueOnce('Configure'); await fixture.run('portwise.configureCodex');
      expect(await readFile(path.join(other.path, 'config.toml'), 'utf8')).toContain('[model_providers.portwise]');
      expect(await readFile(path.join(other.path, '.env'), 'utf8')).toBe('PORTWISE_GATEWAY_TOKEN=test-local-token-0000\n');
      expect(await readFile(path.join(fixture.directory.path, 'config.toml'))).toEqual(before);
      await expect(access(path.join(fixture.directory.path, '.env'))).rejects.toThrow();
      expect(ui.error).not.toHaveBeenCalled();
    } finally { await daemon.close(); await other.dispose(); await fixture.directory.dispose(); }
  }, PERMISSION_IO_TEST_MS);
  it('shows one fixed verification failure after delivery rolls back, without a success notification or credential output', async () => {
    const fixture = await setup(); const token = 'test-local-token-0000';
    const daemon = await startGateway({ token, port: 0 }); const verify = permissions.verifyPrivateFile;
    const env = path.join(fixture.directory.path, '.env'); let injected = false;
    const spy = vi.spyOn(permissions, 'verifyPrivateFile').mockImplementation(async (file, options) => {
      if (file === env && !injected) { injected = true; throw new Error('test-opaque-file-failure-0000'); }
      await verify(file, options);
    });
    try {
      ui.port = daemon.port; fixture.secrets.set('portwise.gatewayToken', token);
      await writeFile(path.join(fixture.directory.path, 'gateway.json'), JSON.stringify({ pid: 123, port: daemon.port, instanceId: daemon.instanceId, startedAt: 'test', version: 'test' }));
      const auth = await readFile(path.join(fixture.directory.path, 'auth.json'));
      ui.warning.mockResolvedValueOnce('Configure'); await fixture.run('portwise.configureCodex');
      expect(injected).toBe(true); expect(ui.error).toHaveBeenCalledExactlyOnceWith(`Portwise extension: ${new FileUpdateVerificationError('restored').message}`);
      expect(ui.info).not.toHaveBeenCalled(); expect(JSON.stringify([ui.error.mock.calls, ui.logs])).not.toMatch(/test-opaque-file-failure-0000|test-local-token-0000/);
      await expect(access(env)).rejects.toMatchObject({ code: 'ENOENT' });
      expect(await readFile(path.join(fixture.directory.path, 'auth.json'))).toEqual(auth);
    } finally { spy.mockRestore(); await daemon.close(); await fixture.directory.dispose(); }
  }, PERMISSION_IO_TEST_MS);

  it('shows one bounded startup error without raw failure data or a success notification', async () => {
    const fixture = await setup();
    const message = startupMessage({ step: 'status', reason: 'verified_socket_changed' });
    const failure = new GatewayLifecycleError(message, 'gateway_start_failed'); failure.stack = 'test-opaque-credential-0000';
    const start = vi.spyOn(GatewayController.prototype, 'start').mockRejectedValue(failure);
    try {
      await fixture.run('portwise.startGateway');
      expect(ui.error).toHaveBeenCalledExactlyOnceWith(`Portwise extension: ${message}`);
      expect(ui.info).not.toHaveBeenCalled();
      expect(JSON.stringify([ui.error.mock.calls, ui.logs])).not.toContain('test-opaque-credential-0000');
    } finally { start.mockRestore(); await fixture.directory.dispose(); }
  });
  it('syncs edited, disabled and deleted provider state through panel wiring and explicitly reports synchronization failure', async () => {
    const fixture = await setup(); const sync = vi.spyOn(GatewayController.prototype, 'syncProvider').mockResolvedValue(undefined);
    try {
      ui.input.mockResolvedValueOnce('Fake provider').mockResolvedValueOnce('https://provider.invalid/v1').mockResolvedValueOnce('test-token-0000');
      await fixture.providerAction({ type: 'addProvider' });
      const providers = fixture.values.get('portwise.providers') as Array<{ id: string }>;
      const id = providers[0]?.id; if (!id) throw new Error('missing provider');
      expect(sync).toHaveBeenLastCalledWith({ baseUrl: 'https://provider.invalid/v1', token: 'test-token-0000', enabled: true });
      ui.input.mockResolvedValueOnce('Edited provider').mockResolvedValueOnce('https://other.invalid/v1').mockResolvedValueOnce('test-replacement-token-0000');
      await fixture.providerAction({ type: 'editProvider', id });
      expect(sync).toHaveBeenLastCalledWith({ baseUrl: 'https://other.invalid/v1', token: 'test-replacement-token-0000', enabled: true });
      await fixture.providerAction({ type: 'toggleProvider', id, enabled: false }); expect(sync).toHaveBeenLastCalledWith(undefined);
      await fixture.providerAction({ type: 'toggleProvider', id, enabled: true });
      sync.mockRejectedValueOnce(new GatewayLifecycleError('Gateway synchronization failed. Stop the gateway, then start it again.', 'gateway_provider_sync_failed'));
      ui.warning.mockResolvedValueOnce('Delete');
      await fixture.providerAction({ type: 'deleteProvider', id }); expect(sync).toHaveBeenLastCalledWith(undefined);
      // Provider metadata mutation succeeds; failure must not be reported as "Provider deleted".
      expect(fixture.values.get('portwise.providers')).toEqual([]);
      expect(fixture.posted).toHaveBeenLastCalledWith(expect.objectContaining({ state: expect.objectContaining({ status: expect.stringContaining('Gateway synchronization failed') }) }));
    } finally { sync.mockRestore(); await fixture.directory.dispose(); }
  });
  it('resolves a changed home without reload and launches exactly codex login with that home after confirmation', async () => {
    const fixture = await setup(); const other = await temporaryDirectory('portwise-new-home');
    try {
      const before = await readFile(path.join(fixture.directory.path, 'auth.json'));
      ui.home = other.path;
      await fixture.run('portwise.startCodexLogin');
      expect(ui.warning).toHaveBeenCalledWith(expect.stringContaining(other.path), { modal: true }, 'Start login');
      expect(ui.terminal).not.toHaveBeenCalled();
      ui.warning.mockResolvedValueOnce('Start login');
      await fixture.run('portwise.startCodexLogin');
      expect(ui.terminal).toHaveBeenCalledWith({ name: 'Portwise: Codex Login', shellPath: 'codex', shellArgs: ['login'], env: { CODEX_HOME: other.path } });
      expect(fixture.values.get('portwise.pendingCodexLoginHome')).toBe(other.path);
      expect(await readFile(path.join(fixture.directory.path, 'auth.json'))).toEqual(before);
    } finally { await other.dispose(); await fixture.directory.dispose(); }
  });

  it('switches model_provider only in the currently configured home and cancels if the setting changes during confirmation', async () => {
    const fixture = await setup(); const other = await temporaryDirectory('portwise-current-home');
    try {
      const old = path.join(fixture.directory.path, 'config.toml'); const next = path.join(other.path, 'config.toml');
      const before = await readFile(old); await writeFile(next, 'model_provider = "other"\n');
      fixture.values.set('portwise.codexHomeConsent', [fixture.directory.path]);
      ui.home = other.path;
      await fixture.run('portwise.switchToGateway');
      expect(ui.warning).toHaveBeenCalledWith(expect.stringContaining(other.path), { modal: true }, 'Switch');
      expect(await readFile(next, 'utf8')).toBe('model_provider = "other"\n');
      ui.warning.mockResolvedValueOnce('Switch');
      await fixture.run('portwise.switchToGateway');
      expect(await readFile(next, 'utf8')).toBe('model_provider = "portwise"\n');
      expect(await readFile(old)).toEqual(before);
      ui.warning.mockImplementationOnce(async () => { ui.home = fixture.directory.path; return 'Switch'; });
      await fixture.run('portwise.switchToGateway');
      expect(ui.error).toHaveBeenCalledWith(expect.stringContaining('changed during the operation'));
      expect(await readFile(old)).toEqual(before);
    } finally { await other.dispose(); await fixture.directory.dispose(); }
  });
  const commands: PanelCommand[] = ['portwise.switchCodexAccount', 'portwise.saveCodexAccount', 'portwise.startCodexLogin', 'portwise.removeCodexAccount'];
  const cases = commands.flatMap((command) => ['palette', 'panel'].flatMap((source) => ['confirm', 'cancel', 'live'].map((outcome) => ({ command, source, outcome }))));
  it.each(cases)('$source $command handles $outcome legacy/live lock through one recovery boundary', async ({ command, source, outcome }) => {
    const fixture = await setup(); const file = path.join(fixture.directory.path, '.portwise-auth.lock');
    let live: FileLock | undefined;
    try {
      fixture.values.set('portwise.pendingCodexLoginHome', fixture.directory.path);
      fixture.values.set('portwise.accountHomeConsent', [fixture.directory.path]);
      ui.pick.mockResolvedValue({ account: fixture.account }); ui.input.mockResolvedValue('New fake snapshot');
      ui.warning.mockImplementation(async (message: string) => message.includes('legacy lock') ? outcome === 'confirm' ? 'Recover lock' : undefined : 'Remove');
      if (outcome === 'live') live = await FileLock.acquire(file); else await writeFile(file, '');
      const lockBefore = await readFile(file, 'utf8'); const authBefore = await readFile(path.join(fixture.directory.path, 'auth.json'), 'utf8');
      await fixture.run(command, source);
      const recovery = ui.warning.mock.calls.filter(([message]) => String(message).includes('legacy lock'));
      if (outcome === 'live') {
        expect(recovery).toHaveLength(0); expect(ui.error).toHaveBeenCalledTimes(1);
      } else {
        expect(recovery).toHaveLength(1); expect(recovery[0]?.[0]).toContain(file);
        expect(recovery[0]?.[1]).toEqual({ modal: true }); expect(ui.error).not.toHaveBeenCalled();
      }
      if (outcome !== 'confirm') {
        expect(await readFile(file, 'utf8')).toBe(lockBefore);
        expect(await readFile(path.join(fixture.directory.path, 'auth.json'), 'utf8')).toBe(authBefore);
        expect(fixture.accounts.list(fixture.directory.path)).toHaveLength(1); expect(ui.terminal).not.toHaveBeenCalled();
        expect(fixture.values.get('portwise.pendingCodexLoginHome')).toBe(fixture.directory.path);
      } else {
        await expect(access(file)).rejects.toThrow();
        if (command === 'portwise.switchCodexAccount') expect(await readFile(path.join(fixture.directory.path, 'auth.json'), 'utf8')).toBe('{"token":"test-other-token-0000"}');
        if (command === 'portwise.saveCodexAccount') expect(fixture.accounts.list(fixture.directory.path)).toHaveLength(2);
        if (command === 'portwise.startCodexLogin') expect(ui.terminal).toHaveBeenCalledTimes(1);
        if (command === 'portwise.removeCodexAccount') expect(fixture.accounts.list(fixture.directory.path)).toHaveLength(0);
      }
    } finally { await live?.dispose(); await fixture.directory.dispose(); }
  });
  it('cannot save two snapshots from concurrent Save commands after a single launch', async () => {
    const fixture = await setup();
    try {
      await fixture.run('portwise.startCodexLogin');
      ui.input.mockResolvedValueOnce('Concurrent one').mockResolvedValueOnce('Concurrent two');
      await Promise.all([fixture.run('portwise.saveCodexAccount'), fixture.run('portwise.saveCodexAccount')]);
      expect(fixture.accounts.list(fixture.directory.path)).toHaveLength(2); // One seeded fixture, one new snapshot.
      expect(fixture.values.get('portwise.pendingCodexLoginHome')).toBeUndefined();
    } finally { await fixture.directory.dispose(); }
  });
  it('requires a fresh launch for each save command and keeps failed captures consumed', async () => {
    const fixture = await setup();
    try {
      await fixture.run('portwise.saveCodexAccount'); expect(ui.input).not.toHaveBeenCalled();
      await fixture.run('portwise.startCodexLogin'); ui.input.mockResolvedValueOnce('Saved through login');
      await fixture.run('portwise.saveCodexAccount'); expect(fixture.accounts.list(fixture.directory.path)).toHaveLength(2);
      await fixture.run('portwise.saveCodexAccount'); expect(ui.input).toHaveBeenCalledTimes(1);
      await fixture.run('portwise.startCodexLogin'); ui.input.mockResolvedValueOnce('Fake account');
      await fixture.run('portwise.saveCodexAccount'); // Duplicate name causes capture failure.
      await fixture.run('portwise.saveCodexAccount'); expect(ui.input).toHaveBeenCalledTimes(2);
      expect(fixture.accounts.list(fixture.directory.path)).toHaveLength(2);
    } finally { await fixture.directory.dispose(); }
  });
  it.each(['picker', 'confirmation', 'legacy recovery', 'save name', 'remove picker', 'remove confirmation'])('dismisses %s without retaining a lock or changing auth, and permits another switch', async (prompt) => {
    const fixture = await setup(); const auth = path.join(fixture.directory.path, 'auth.json');
    try {
      const before = await readFile(auth, 'utf8');
      if (prompt === 'save name') {
        await fixture.run('portwise.startCodexLogin'); await fixture.run('portwise.saveCodexAccount');
      } else if (prompt.startsWith('remove')) {
        if (prompt === 'remove confirmation') ui.pick.mockResolvedValueOnce({ account: fixture.account });
        await fixture.run('portwise.removeCodexAccount');
      } else {
        if (prompt !== 'picker') ui.pick.mockResolvedValueOnce({ account: fixture.account });
        if (prompt === 'legacy recovery') { ui.warning.mockResolvedValueOnce('Switch account'); await writeFile(path.join(fixture.directory.path, '.portwise-auth.lock'), ''); }
        await fixture.run('portwise.switchCodexAccount');
      }
      expect(await readFile(auth, 'utf8')).toBe(before);
      ui.pick.mockResolvedValueOnce({ account: fixture.account });
      ui.warning.mockImplementation(async (message: string) => message.includes('legacy lock') ? 'Recover lock' : 'Switch account');
      await fixture.run('portwise.switchCodexAccount');
      expect(await readFile(auth, 'utf8')).toBe('{"token":"test-other-token-0000"}');
      await expect(access(path.join(fixture.directory.path, '.portwise-auth.lock'))).rejects.toThrow();
    } finally { await fixture.directory.dispose(); }
  });
});
