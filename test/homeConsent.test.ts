import { describe, expect, it, vi } from 'vitest';
import { readFile, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { consentMessage, HomeConsent } from '../src/sync/homeConsent';
import { ConfigSync } from '../src/sync/configSync';
import { temporaryDirectory } from './helpers/temporaryDirectory';

function state() {
  const values = new Map<string, unknown>();
  return { get: <T>(key: string) => values.get(key) as T | undefined, update: vi.fn(async (key: string, value: unknown) => { values.set(key, value); }) };
}

describe('remembered account/login home consent', () => {
  it('does not grant consent or run a write action before explicit approval', async () => {
    const directory = await temporaryDirectory('portwise-consent');
    try {
      const config = path.join(directory.path, 'config.toml');
      await writeFile(config, '# untouched until consent\nmodel = "safe"\n');
      const storage = state(); const consent = new HomeConsent(storage, 'portwise.accountHomeConsent'); const ask = vi.fn(async () => false);
      const sync = new ConfigSync({ codexHome: directory.path, backupDirectory: path.join(directory.path, 'backups'), gatewayBaseUrl: 'http://127.0.0.1:47831/v1' });
      expect(await consent.runWithConsent(directory.path, ask, () => sync.sync())).toBe(false);
      expect(storage.update).not.toHaveBeenCalled();
      await expect(readFile(config, 'utf8')).resolves.toBe('# untouched until consent\nmodel = "safe"\n');
    } finally { await directory.dispose(); }
  });

  it('remembers approval for the same resolved home', async () => {
    const storage = state(); const consent = new HomeConsent(storage, 'portwise.accountHomeConsent'); const ask = vi.fn(async () => true);
    await expect(consent.confirm('E:/portwise-test-codex', ask)).resolves.toBe(true);
    await expect(consent.confirm('E:/portwise-test-codex', ask)).resolves.toBe(true);
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it('asks again when the resolved Codex-home path changes', async () => {
    const storage = state(); const consent = new HomeConsent(storage, 'portwise.accountHomeConsent'); const ask = vi.fn(async () => true);
    await consent.confirm('E:/portwise-test-codex', ask);
    await consent.confirm('E:/other-test-codex', ask);
    expect(ask).toHaveBeenCalledTimes(2);
  });

  it('shows the exact resolved target path in the approval copy', () => {
    expect(consentMessage('E:/portwise-test-codex')).toContain('E:/portwise-test-codex');
  });
});
