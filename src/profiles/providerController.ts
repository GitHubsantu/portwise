import * as vscode from 'vscode';
import { testProviderConnection } from './connectionTest';
import type { ProviderInput, ProviderView } from './models';
import type { WebviewToHost } from '../shared/protocol';
import type { ProfileStore } from './profileStore';
import type { PanelActions } from '../ui/panelProvider';

export class ProviderController implements PanelActions {
  constructor(private readonly profiles: ProfileStore) {}
  async listProviders(): Promise<ProviderView[]> { return this.profiles.list(); }
  async handle(message: Exclude<WebviewToHost, { type: 'ready' } | { type: 'refresh' }>): Promise<string | undefined> {
    if (message.type === 'addProvider') { const input = await this.collect(); if (!input) return; await this.profiles.create(input); return 'Provider added.'; }
    if (message.type === 'editProvider') { const current = (await this.profiles.list()).find((provider) => provider.id === message.id); if (!current) return 'Provider profile was not found.'; const input = await this.collect(current); if (!input) return; await this.profiles.update(message.id, input); return 'Provider updated.'; }
    if (message.type === 'deleteProvider') { const ok = await vscode.window.showWarningMessage('Delete this provider profile? Its stored token will also be removed.', { modal: true }, 'Delete'); if (ok !== 'Delete') return; await this.profiles.delete(message.id); return 'Provider deleted.'; }
    if (message.type === 'toggleProvider') { await this.profiles.setEnabled(message.id, message.enabled); return message.enabled ? 'Provider enabled.' : 'Provider disabled.'; }
    const provider = (await this.profiles.list()).find((item) => item.id === message.id);
    if (!provider) return 'Provider profile was not found.';
    const result = await testProviderConnection(provider.baseUrl, await this.profiles.getToken(provider.id));
    return result.message;
  }
  private async collect(current?: ProviderView): Promise<ProviderInput | undefined> {
    const name = await vscode.window.showInputBox({ title: current ? 'Edit provider' : 'Add provider', prompt: 'Provider display name', value: current?.name ?? '', validateInput: (value) => value.trim() ? undefined : 'A provider name is required.' });
    if (name === undefined) return undefined;
    const baseUrl = await vscode.window.showInputBox({ title: current ? 'Edit provider' : 'Add provider', prompt: 'Provider base URL', value: current?.baseUrl ?? '', validateInput: (value) => { try { new URL(value); return undefined; } catch { return 'Enter an absolute URL.'; } } });
    if (baseUrl === undefined) return undefined;
    const token = await vscode.window.showInputBox({ title: current ? 'Edit provider token' : 'Add provider token', prompt: current ? 'Leave blank to keep the existing token.' : 'Provider token', password: true, ignoreFocusOut: true });
    if (token === undefined) return undefined;
    return { name, baseUrl, token };
  }
}
