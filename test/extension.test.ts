import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

const recorded = vi.hoisted(() => ({ commands: [] as string[], views: [] as string[] }));

vi.mock('vscode', () => ({
  window: {
    createOutputChannel: () => ({ appendLine: vi.fn(), show: vi.fn(), dispose: vi.fn() }),
    registerWebviewViewProvider: (id: string) => {
      recorded.views.push(id);
      return { dispose: vi.fn() };
    },
  },
  commands: {
    registerCommand: (id: string) => {
      recorded.commands.push(id);
      return { dispose: vi.fn() };
    },
    executeCommand: vi.fn(),
  },
  workspace: {
    getConfiguration: () => ({ get: (_key: string, fallback?: unknown) => fallback }),
    onDidChangeConfiguration: () => ({ dispose: vi.fn() }),
  },
  Uri: { joinPath: vi.fn() },
}));

import { activate } from '../src/extension';

interface Manifest {
  contributes: {
    commands: Array<{ command: string }>;
    views: Record<string, Array<{ id: string }>>;
    configuration: { properties: Record<string, { scope?: string }> };
  };
}

const manifest = JSON.parse(readFileSync('package.json', 'utf8')) as Manifest;

describe('extension wiring (contract with package.json)', () => {
  const context = {
    subscriptions: [] as unknown[],
    extensionUri: {},
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
});
