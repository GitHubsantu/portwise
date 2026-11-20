import { access, readFile, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountStore } from '../src/accounts/accountStore';
import { temporaryDirectory } from './helpers/temporaryDirectory';

const ui = vi.hoisted(() => ({
  home: '', commands: new Map<string, () => Promise<void> | void>(),
  input: vi.fn(), pick: vi.fn(), warning: vi.fn(), info: vi.fn(), error: vi.fn(),
}));
vi.mock('vscode', () => ({
  window: {
    createOutputChannel: () => ({ appendLine: vi.fn(), show: vi.fn(), dispose: vi.fn() }),
    createStatusBarItem: () => ({ show: vi.fn(), dispose: vi.fn() }),
    registerWebviewViewProvider: () => ({ dispose: vi.fn() }),
    createTerminal: () => ({ show: vi.fn() }),
    showInputBox: ui.input, showQuickPick: ui.pick, showWarningMessage: ui.warning, showInformationMessage: ui.info, showErrorMessage: ui.error,
  },
  commands: { registerCommand: (id: string, run: () => Promise<void> | void) => { ui.commands.set(id, run); return { dispose: vi.fn() }; }, executeCommand: vi.fn() },
  workspace: { getConfiguration: () => ({ get: (key: string, fallback: unknown) => key === 'codexHome' ? ui.home : key === 'autoStartGateway' ? false : fallback }), onDidChangeConfiguration: () => ({ dispose: vi.fn() }) },
  StatusBarAlignment: { Left: 1 },
}));
import { activate } from '../src/extension';

afterEach(() => vi.clearAllMocks());

async function setup() {
  const directory = await temporaryDirectory('portwise-prompts'); ui.home = directory.path;
  for (const mock of [ui.input, ui.pick, ui.warning, ui.info, ui.error]) mock.mockReset().mockResolvedValue(undefined);
  await writeFile(path.join(directory.path, 'config.toml'), 'cli_auth_credentials_store = "file"\n');
  await writeFile(path.join(directory.path, 'auth.json'), '{"token":"test-prompt-token-0000"}');
  const values = new Map<string, unknown>(); const secrets = new Map<string, string>();
  const state = { get: <T>(key: string) => values.get(key) as T | undefined, update: async (key: string, value: unknown) => { values.set(key, value); } };
  const secretStore = { get: async (key: string) => secrets.get(key), store: async (key: string, value: string) => { secrets.set(key, value); }, delete: async (key: string) => { secrets.delete(key); } };
  const accounts = new AccountStore(state, secretStore); const account = await accounts.capture('Fake account', directory.path, '{"token":"test-other-token-0000"}');
  activate({ subscriptions: [], globalState: state, secrets: secretStore, globalStorageUri: { fsPath: directory.path }, extension: { packageJSON: { version: 'test' } } } as unknown as Parameters<typeof activate>[0]);
  const run = async (command: string) => { const handler = ui.commands.get(command); if (!handler) throw new Error('missing command'); await handler(); };
  return { directory, account, run, values, accounts };
}

describe('account prompt cancellation', () => {
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
