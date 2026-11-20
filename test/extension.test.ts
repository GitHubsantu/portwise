import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';

const recorded = vi.hoisted(() => ({ commands: [] as string[], views: [] as string[], handlers: new Map<string, () => unknown>(), status: undefined as { command?: string; text?: string; accessibilityInformation?: { label: string }; tooltip?: string; show: () => void; dispose: () => void } | undefined }));

vi.mock('vscode', () => ({
  window: {
    createOutputChannel: () => ({ appendLine: vi.fn(), show: vi.fn(), dispose: vi.fn() }),
    createStatusBarItem: () => {
      const status = { show: vi.fn(), dispose: vi.fn() };
      recorded.status = status;
      return status;
    },
    registerWebviewViewProvider: (id: string) => {
      recorded.views.push(id);
      return { dispose: vi.fn() };
    },
    showErrorMessage: vi.fn(),
    showInformationMessage: vi.fn(),
    showWarningMessage: vi.fn(),
  },
  commands: {
    registerCommand: (id: string, handler: () => unknown) => {
      recorded.commands.push(id);
      recorded.handlers.set(id, handler);
      return { dispose: vi.fn() };
    },
    executeCommand: vi.fn(),
  },
  workspace: {
    getConfiguration: () => ({ get: (key: string, fallback?: unknown) => key === 'autoStartGateway' ? false : fallback }),
    onDidChangeConfiguration: () => ({ dispose: vi.fn() }),
  },
  Uri: { joinPath: vi.fn() },
  StatusBarAlignment: { Left: 1 },
}));

import { activate } from '../src/extension';

interface Manifest {
  contributes: {
    commands: Array<{ command: string }>;
    views: Record<string, Array<{ id: string; name: string }>>;
    viewsContainers: Record<string, Array<{ id: string; title: string; icon: string }>>;
    configuration: { properties: Record<string, { scope?: string }> };
  };
}

const manifest = JSON.parse(readFileSync('package.json', 'utf8')) as Manifest;

describe('extension wiring (contract with package.json)', () => {
  const context = {
    subscriptions: [] as unknown[],
    extensionUri: {},
    extensionPath: 'E:/test-extension',
    globalStorageUri: { fsPath: 'E:/test-storage' },
    extension: { packageJSON: { version: '0.0.0-test' } },
    globalState: { get: vi.fn(), update: vi.fn() },
    secrets: { get: vi.fn(), store: vi.fn(), delete: vi.fn() },
  } as unknown as Parameters<typeof activate>[0];

  activate(context);

  it('registers exactly the commands declared in package.json', () => {
    const declared = manifest.contributes.commands.map((c) => c.command).sort();
    expect([...recorded.commands].sort()).toEqual(declared);
  });

  it('registers exactly the views declared in package.json', () => {
    const declared = Object.values(manifest.contributes.views)
      .flat()
      .map((v) => v.id)
      .sort();
    expect([...recorded.views].sort()).toEqual(declared);
  });

  it('pushes every disposable onto context.subscriptions', () => {
    expect(context.subscriptions.length).toBeGreaterThan(0);
  });

  it('keeps every Portwise setting machine-scoped (T1)', () => {
    for (const [key, configuration] of Object.entries(manifest.contributes.configuration.properties)) {
      if (key.startsWith('portwise.')) expect(configuration.scope).toBe('machine');
    }
  });

  it('shows the resolved Codex-home target in the status-bar tooltip', () => {
    expect(recorded.status?.tooltip).toContain('.codex');
  });

  it('uses the existing status bar as an accessible panel entry point', async () => {
    expect(recorded.status?.command).toBe('portwise.openPanel');
    expect(recorded.status?.text).toContain('Portwise: stopped');
    expect(recorded.status?.text).toMatch(/^\$\([a-z-]+\) Portwise:/);
    expect(recorded.status?.accessibilityInformation?.label).toContain('gateway stopped');
    expect(recorded.status?.tooltip).toContain('Open the Portwise panel');
    await recorded.handlers.get('portwise.openPanel')?.();
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith('portwise.panel.focus');
  });

  it('contributes one consistently named secondary-sidebar view and a monochrome local icon', () => {
    const containers = manifest.contributes.viewsContainers['secondarySidebar'];
    expect(containers).toHaveLength(1);
    expect(containers?.[0]).toEqual({ id: 'portwise', title: 'Portwise', icon: 'images/activity.svg' });
    expect(manifest.contributes.views['portwise']).toEqual([{ type: 'webview', id: 'portwise.panel', name: 'Portwise' }]);
    const icon = readFileSync('images/activity.svg', 'utf8');
    expect(icon).toContain('stroke="currentColor"');
    expect(icon).not.toMatch(/#[a-f0-9]{3,8}\b|https?:\/\/(?!www\.w3\.org\/2000\/svg)/i);
  });
});
