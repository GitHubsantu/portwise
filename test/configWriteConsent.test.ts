import { mkdir, readFile, readdir, stat, symlink, utimes, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { temporaryDirectory } from './helpers/temporaryDirectory';
import { PERMISSION_IO_TEST_MS } from './helpers/permissionBudget';
import { backupDirectories } from '../src/sync/backups';
import { GatewayController } from '../src/gateway/controller';
import * as atomic from '../src/core/atomicWrite';

const ui = vi.hoisted(() => ({ home: '', warning: vi.fn(), commands: new Map<string, () => Promise<void>>(), errors: vi.fn() }));
vi.mock('vscode', () => ({
  window: {
    createOutputChannel: () => ({ appendLine: vi.fn(), dispose: vi.fn() }),
    createStatusBarItem: () => ({ show: vi.fn(), dispose: vi.fn() }),
    registerWebviewViewProvider: () => ({ dispose: vi.fn() }),
    showWarningMessage: ui.warning, showErrorMessage: ui.errors, showInformationMessage: vi.fn(),
    createQuickPick: () => {
      let accepted: (() => void) | undefined;
      const picker = { items: [] as unknown[], selectedItems: [] as unknown[], show: () => { picker.selectedItems = picker.items.slice(0, 1); queueMicrotask(() => accepted?.()); }, dispose: vi.fn(), onDidAccept: (handler: () => void) => { accepted = handler; return { dispose: vi.fn() }; }, onDidHide: () => ({ dispose: vi.fn() }) };
      return picker;
    },
  },
  commands: { registerCommand: (id: string, handler: () => Promise<void>) => { ui.commands.set(id, handler); return { dispose: vi.fn() }; } },
  workspace: { getConfiguration: () => ({ get: (key: string, fallback: unknown) => key === 'codexHome' ? ui.home : key === 'autoStartGateway' ? false : fallback }), onDidChangeConfiguration: () => ({ dispose: vi.fn() }) },
  StatusBarAlignment: { Left: 1 },
}));
import { activate } from '../src/extension';

afterEach(() => vi.restoreAllMocks());

async function fixture() {
  const directory = await temporaryDirectory('portwise-fresh-config-consent');
  const home = path.join(directory.path, 'home'); const storage = path.join(directory.path, 'storage');
  await mkdir(home); await mkdir(storage); ui.home = home;
  await writeFile(path.join(home, 'config.toml'), '# fake\nmodel_provider = "other"\n');
  await writeFile(path.join(home, '.env'), '# fake\r\nOTHER=unchanged\r\nPORTWISE_GATEWAY_TOKEN=test-old-0000\r\n\r\n');
  const values = new Map<string, unknown>([['portwise.codexHomeConsent', [home]]]);
  ui.warning.mockReset().mockResolvedValue(undefined); ui.errors.mockReset();
  vi.spyOn(GatewayController.prototype, 'status').mockResolvedValue({ pid: 1, port: 0, instanceId: 'fake', startedAt: 'fake', version: 'test' });
  activate({ subscriptions: [], extensionPath: directory.path, globalStorageUri: { fsPath: storage }, extension: { packageJSON: { version: 'test' } },
    globalState: { get: (key: string) => values.get(key), update: async (key: string, value: unknown) => { values.set(key, value); } },
    secrets: { get: async () => 'test-token-0000', store: vi.fn() },
  } as unknown as Parameters<typeof activate>[0]);
  const backups = (await backupDirectories(storage, home)).current;
  const run = async (command = 'portwise.configureCodex') => { const handler = ui.commands.get(command); if (!handler) throw new Error('missing command'); await handler(); };
  const files = async () => Promise.all(['config.toml', '.env'].map(async name => { const file = path.join(home, name); const info = await stat(file); return { name, bytes: await readFile(file), mtime: info.mtimeMs, ino: info.ino }; }));
  const backupState = async () => {
    const names = await readdir(backups).catch((error: unknown) => { if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') return []; throw error; });
    return Promise.all(names.sort().map(async name => ({ name, bytes: await readFile(path.join(backups, name)), mtime: (await stat(path.join(backups, name))).mtimeMs })));
  };
  return { directory, home, storage, backups, values, run, files, backupState };
}

describe('fresh config-write consent and no-op Configure', () => {
  it('asks on every Configure despite stored approval; cancellation changes no bytes, timestamps or backups', async () => {
    const f = await fixture();
    try {
      ui.warning.mockResolvedValueOnce('Configure'); await f.run();
      const before = await f.files(); const backups = await f.backupState();
      ui.warning.mockClear(); await f.run();
      expect(ui.warning).toHaveBeenCalledExactlyOnceWith(expect.stringContaining(f.home), { modal: true }, 'Configure');
      expect(await f.files()).toEqual(before); expect(await f.backupState()).toEqual(backups);
      ui.warning.mockClear().mockResolvedValueOnce('Configure'); await f.run();
      expect(ui.warning).toHaveBeenCalledTimes(1); expect(await f.files()).toEqual(before); expect(await f.backupState()).toEqual(backups);
      expect(ui.errors).not.toHaveBeenCalled();
    } finally { await f.directory.dispose(); }
  }, PERMISSION_IO_TEST_MS);

  it('ignores malformed legacy consent state and asks again after refusing a junction and returning to B', async () => {
    const f = await fixture();
    try {
      f.values.set('portwise.codexHomeConsent', { invalid: true });
      ui.warning.mockResolvedValueOnce('Configure'); await f.run();
      const before = await f.files(); const backups = await f.backupState();
      const link = path.join(f.directory.path, 'junction'); await symlink(f.home, link, process.platform === 'win32' ? 'junction' : 'dir');
      ui.home = link; ui.warning.mockClear(); await f.run();
      expect(ui.warning).not.toHaveBeenCalled(); expect(ui.errors).toHaveBeenCalledOnce();
      ui.home = f.home; await f.run();
      expect(ui.warning).toHaveBeenCalledExactlyOnceWith(expect.stringContaining(f.home), { modal: true }, 'Configure');
      expect(await f.files()).toEqual(before); expect(await f.backupState()).toEqual(backups);
    } finally { await f.directory.dispose(); }
  }, PERMISSION_IO_TEST_MS);

  it('creates exact extension-storage pre-write backups before each real replacement, then leaves no-op timestamps untouched', async () => {
    const f = await fixture();
    const realWrite = atomic.atomicWrite;
    try {
      const originals = await f.files(); let checked = 0;
      const spy = vi.spyOn(atomic, 'atomicWrite').mockImplementation(async (target, contents, options) => {
        const original = originals.find(file => file.name === path.basename(target));
        if (!original) throw new Error('unexpected write');
        const backups = await f.backupState();
        expect(backups.some(backup => backup.name.startsWith(original.name + '.') && backup.bytes.equals(original.bytes))).toBe(true);
        expect(await readFile(target)).toEqual(original.bytes); checked++;
        await realWrite(target, contents, options);
      });
      ui.warning.mockResolvedValueOnce('Configure'); await f.run(); expect(checked).toBe(2); spy.mockRestore();
      for (const name of ['config.toml', '.env']) await utimes(path.join(f.home, name), new Date(0), new Date(0));
      const before = await f.files(); const backups = await f.backupState();
      for (let index = 0; index < 3; index++) { ui.warning.mockResolvedValueOnce('Configure'); await f.run(); }
      expect(await f.files()).toEqual(before); expect(await f.backupState()).toEqual(backups); expect(ui.errors).not.toHaveBeenCalled();
    } finally { await f.directory.dispose(); }
  }, PERMISSION_IO_TEST_MS);

  it('requires a fresh exact-path provider-switch and Restore confirmation every time, even with legacy stored consent', async () => {
    const f = await fixture();
    try {
      const original = await f.files();
      for (let index = 0; index < 2; index++) await f.run('portwise.switchToGateway');
      expect(ui.warning).toHaveBeenCalledTimes(2);
      for (const [message, options, action] of ui.warning.mock.calls) { expect(message).toContain(f.home); expect(options).toEqual({ modal: true }); expect(action).toBe('Switch'); }
      expect(await f.files()).toEqual(original); expect(await f.backupState()).toEqual([]);
      ui.warning.mockResolvedValueOnce('Switch'); await f.run('portwise.switchToGateway');
      const switched = await f.files(); const backups = await f.backupState();
      ui.warning.mockClear();
      for (let index = 0; index < 2; index++) await f.run('portwise.restoreConfig');
      expect(ui.warning).toHaveBeenCalledTimes(2);
      for (const [message, options, action] of ui.warning.mock.calls) { expect(message).toContain(f.home); expect(options).toEqual({ modal: true }); expect(action).toBe('Restore'); }
      expect(await f.files()).toEqual(switched); expect(await f.backupState()).toEqual(backups); expect(ui.errors).not.toHaveBeenCalled();
    } finally { await f.directory.dispose(); }
  }, PERMISSION_IO_TEST_MS);
});
