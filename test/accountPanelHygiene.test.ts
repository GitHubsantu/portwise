import { writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { AccountStore } from '../src/accounts/accountStore';
import { currentAccounts } from '../src/accounts/currentAccount';
import type { HostToWebview } from '../src/shared/protocol';
import { PanelProvider } from '../src/ui/panelProvider';
import { temporaryDirectory } from './helpers/temporaryDirectory';

vi.mock('vscode', () => ({ Uri: { joinPath: (_root: unknown, ...parts: string[]) => parts.join('/') } }));

describe('actual account webview message boundary', () => {
  it('sends only id/name/isCurrent with fake credentials and strips extra internal fields', async () => {
    const directory = await temporaryDirectory('portwise-account-panel');
    try {
      const credential = '{"token":"test-panel-credential-0000"}';
      await writeFile(path.join(directory.path, 'config.toml'), 'cli_auth_credentials_store = "file"\n');
      await writeFile(path.join(directory.path, 'auth.json'), credential);
      const values = new Map<string, unknown>(); const secrets = new Map<string, string>();
      const store = new AccountStore({
        get: <T>(key: string) => values.get(key) as T | undefined,
        update: async (key, value) => { values.set(key, value); },
      }, {
        get: async (key) => secrets.get(key), store: async (key, value) => { secrets.set(key, value); }, delete: async (key) => { secrets.delete(key); },
      });
      await store.capture('Fake account', directory.path, credential);
      const safe = await currentAccounts(directory.path, store);
      const internal = { ...safe, accounts: safe.accounts.map((account) => ({ ...account, accidentalInternalData: credential })) };
      let receive: ((message: unknown) => void) | undefined;
      let posted: ((message: HostToWebview) => void) | undefined;
      const message = new Promise<HostToWebview>((resolve) => { posted = resolve; });
      const logger = { warn: vi.fn(), error: vi.fn() };
      const panel = new PanelProvider({ extensionUri: {}, extension: { packageJSON: { version: 'test' } } } as unknown as ConstructorParameters<typeof PanelProvider>[0], logger as unknown as ConstructorParameters<typeof PanelProvider>[1], {
        listProviders: async () => [], listAccounts: async () => internal,
        gatewayState: async () => ({ running: false, label: 'Stopped' }), runPanelCommand: async () => undefined, handle: async () => undefined,
      });
      panel.resolveWebviewView({
        webview: {
          options: {}, html: '', cspSource: 'vscode-webview://test', asWebviewUri: (uri: unknown) => String(uri),
          onDidReceiveMessage: (handler: (value: unknown) => void) => { receive = handler; },
          postMessage: async (value: HostToWebview) => { posted?.(value); return true; },
        }, onDidDispose: () => undefined,
      } as unknown as Parameters<PanelProvider['resolveWebviewView']>[0]);
      receive?.({ type: 'ready' });
      const payload = await message;
      expect(payload.state.accountMatchAvailability).toBe('available');
      expect(payload.state.accounts).toEqual([{ id: safe.accounts[0]?.id, name: 'Fake account', isCurrent: true }]);
      expect(Object.keys(payload.state.accounts[0] ?? {}).sort()).toEqual(['id', 'isCurrent', 'name']);
      expect(JSON.stringify(payload)).not.toMatch(/test-panel-credential-0000|accidentalInternalData|snapshot|hash/);
      expect(JSON.stringify([...values])).not.toContain('test-panel-credential-0000');
      expect(logger.error).not.toHaveBeenCalled();
    } finally { await directory.dispose(); }
  });
});
