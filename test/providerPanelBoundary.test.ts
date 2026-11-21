import { describe, expect, it, vi } from 'vitest';
import { PanelProvider } from '../src/ui/panelProvider';
import type { HostToWebview, ProviderPanelItem } from '../src/shared/protocol';

vi.mock('vscode', () => ({ Uri: { joinPath: (_root: unknown, ...parts: string[]) => parts.join('/') } }));

describe('provider panel boundary', () => {
  it.each([false, true])('projects fields and refuses malformed provider state without logging it (malformed=%s)', async malformed => {
    const credential = 'test-panel-private-0000';
    const provider = { id: 'random-id', name: '<img onerror=alert(1)>', baseUrl: 'https://provider.invalid/v1', enabled: true, tokenMask: malformed ? credential : '••••••••0000', token: credential, snapshot: credential };
    const log = { warn: vi.fn(), error: vi.fn() }; const posted = vi.fn(async (value: HostToWebview) => value.type === 'state');
    let receive: ((message: unknown) => void) | undefined;
    const panel = new PanelProvider({ extensionUri: {}, extension: { packageJSON: { version: 'test' } } } as unknown as ConstructorParameters<typeof PanelProvider>[0], log as unknown as ConstructorParameters<typeof PanelProvider>[1], {
      listProviders: async () => [provider] as ProviderPanelItem[], listAccounts: async () => ({ accounts: [], accountMatchAvailability: 'unavailable' }), gatewayState: async () => ({ running: false, label: 'Stopped' }), runPanelCommand: async () => undefined, handle: async () => undefined,
    });
    panel.resolveWebviewView({ webview: { options: {}, html: '', cspSource: 'test', asWebviewUri: String, onDidReceiveMessage: (handler: (message: unknown) => void) => { receive = handler; }, postMessage: posted }, onDidDispose: () => undefined } as unknown as Parameters<PanelProvider['resolveWebviewView']>[0]);
    receive?.({ type: 'ready' });
    await vi.waitFor(() => expect(malformed ? log.error : posted).toHaveBeenCalledOnce());
    if (malformed) expect(posted).not.toHaveBeenCalled();
    else expect(posted.mock.calls[0]?.[0].state.providers).toEqual([{ id: provider.id, name: provider.name, baseUrl: provider.baseUrl, enabled: true, tokenMask: '••••••••0000' }]);
    expect(JSON.stringify([posted.mock.calls, log.error.mock.calls])).not.toContain(credential);
  });
});
