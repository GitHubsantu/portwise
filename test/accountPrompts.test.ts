import { access, readFile, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountStore } from '../src/accounts/accountStore';
import { temporaryDirectory } from './helpers/temporaryDirectory';
import { FileLock } from '../src/core/fileLock';
import type { PanelProvider } from '../src/ui/panelProvider';
import type { PanelCommand } from '../src/shared/protocol';

const ui = vi.hoisted(() => ({
  home: '', commands: new Map<string, () => Promise<void> | void>(),
  input: vi.fn(), pick: vi.fn(), warning: vi.fn(), info: vi.fn(), error: vi.fn(),
  terminal: vi.fn(), panel: undefined as PanelProvider | undefined, lastCommand: undefined as Promise<unknown> | undefined,
}));
vi.mock('vscode', () => ({
  window: {
    createOutputChannel: () => ({ appendLine: vi.fn(), show: vi.fn(), dispose: vi.fn() }),
    createStatusBarItem: () => ({ show: vi.fn(), dispose: vi.fn() }),
    registerWebviewViewProvider: (_id: string, provider: PanelProvider) => { ui.panel = provider; return { dispose: vi.fn() }; },
    createTerminal: ui.terminal,
    showInputBox: ui.input, showQuickPick: ui.pick, showWarningMessage: ui.warning, showInformationMessage: ui.info, showErrorMessage: ui.error,
  },
  commands: { registerCommand: (id: string, run: () => Promise<void> | void) => { ui.commands.set(id, run); return { dispose: vi.fn() }; }, executeCommand: (id: string) => { ui.lastCommand = Promise.resolve(ui.commands.get(id)?.()); return ui.lastCommand; } },
  workspace: { getConfiguration: () => ({ get: (key: string, fallback: unknown) => key === 'codexHome' ? ui.home : key === 'autoStartGateway' ? false : fallback }), onDidChangeConfiguration: () => ({ dispose: vi.fn() }) },
  StatusBarAlignment: { Left: 1 },
  Uri: { joinPath: (_root: unknown, ...parts: string[]) => parts.join('/') },
}));
import { activate } from '../src/extension';

afterEach(() => vi.clearAllMocks());

async function setup() {
  const directory = await temporaryDirectory('portwise-prompts'); ui.home = directory.path;
  for (const mock of [ui.input, ui.pick, ui.warning, ui.info, ui.error]) mock.mockReset().mockResolvedValue(undefined);
  ui.terminal.mockReset().mockReturnValue({ show: vi.fn() }); ui.lastCommand = undefined;
  await writeFile(path.join(directory.path, 'config.toml'), 'cli_auth_credentials_store = "file"\n');
  await writeFile(path.join(directory.path, 'auth.json'), '{"token":"test-prompt-token-0000"}');
  const values = new Map<string, unknown>(); const secrets = new Map<string, string>();
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
  return { directory, account, run, values, accounts };
}

describe('account prompt cancellation', () => {
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
