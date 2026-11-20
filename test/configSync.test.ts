import { readFile, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ConfigSync, ConfigSyncError } from '../src/sync/configSync';
import { temporaryDirectory } from './helpers/temporaryDirectory';

const ORIGINAL = `# retain this comment\nunknown_key = "untouched"\n\n[projects.'e:\\project\\streamforge-pro']\ntrusted = true\n\n[model_providers.gateway]\nbase_url = "https://example.test/v1"\n`;

describe('ConfigSync', () => {
  it('preserves comments, unknown keys, projects, and other provider tables while adding its own table', async () => {
    const directory = await temporaryDirectory('portwise-config-sync');
    try {
      const config = path.join(directory.path, 'config.toml');
      await writeFile(config, ORIGINAL);
      const sync = new ConfigSync({ codexHome: directory.path, backupDirectory: path.join(directory.path, 'backups'), gatewayBaseUrl: 'http://127.0.0.1:47831/v1' });
      await sync.sync();
      const written = await readFile(config, 'utf8');
      expect(written).toContain(ORIGINAL);
      expect(written).toContain('[model_providers.portwise]');
      expect(written).toContain("[projects.'e:\\project\\streamforge-pro']");
      const beforeLatestSync = written;
      await sync.sync();
      expect((await readFile(config, 'utf8')).match(/\[model_providers\.portwise\]/g)).toHaveLength(1);
      await sync.restore();
      await expect(readFile(config, 'utf8')).resolves.toBe(beforeLatestSync);
    } finally { await directory.dispose(); }
  });

  it('rejects invalid TOML without changing it', async () => {
    const directory = await temporaryDirectory('portwise-invalid-toml');
    try {
      const config = path.join(directory.path, 'config.toml');
      const invalid = '[broken\nkey = 1\n';
      await writeFile(config, invalid);
      const sync = new ConfigSync({ codexHome: directory.path, backupDirectory: path.join(directory.path, 'backups'), gatewayBaseUrl: 'http://127.0.0.1:47831/v1' });
      await expect(sync.sync()).rejects.toBeInstanceOf(ConfigSyncError);
      await expect(readFile(config, 'utf8')).resolves.toBe(invalid);
    } finally { await directory.dispose(); }
  });

  it('changes model_provider only when explicitly called', async () => {
    const directory = await temporaryDirectory('portwise-switch-provider');
    try {
      const config = path.join(directory.path, 'config.toml');
      await writeFile(config, `model_provider = "gateway"\n${ORIGINAL}`);
      const sync = new ConfigSync({ codexHome: directory.path, backupDirectory: path.join(directory.path, 'backups'), gatewayBaseUrl: 'http://127.0.0.1:47831/v1' });
      await sync.switchToPortwise();
      const written = await readFile(config, 'utf8');
      expect(written).toContain('model_provider = "portwise"');
      expect(written).toContain("[projects.'e:\\project\\streamforge-pro']");
    } finally { await directory.dispose(); }
  });

  it('restores the state immediately before the latest write and can undo that restore', async () => {
    const directory = await temporaryDirectory('portwise-backup-history');
    try {
      const config = path.join(directory.path, 'config.toml');
      const backups = path.join(directory.path, 'backups');
      const sync = new ConfigSync({ codexHome: directory.path, backupDirectory: backups, gatewayBaseUrl: 'http://127.0.0.1:47831/v1' });
      await writeFile(config, 'model = "A"\n');
      await sync.sync();
      const external = 'model = "B"\n';
      await writeFile(config, external);
      await sync.sync();
      const afterLatestWrite = await readFile(config, 'utf8');
      await sync.restore();
      await expect(readFile(config, 'utf8')).resolves.toBe(external);
      await sync.restore();
      await expect(readFile(config, 'utf8')).resolves.toBe(afterLatestWrite);
    } finally { await directory.dispose(); }
  });

  it('retains only the ten newest backups per config file', async () => {
    const directory = await temporaryDirectory('portwise-backup-retention');
    try {
      const config = path.join(directory.path, 'config.toml');
      const sync = new ConfigSync({ codexHome: directory.path, backupDirectory: path.join(directory.path, 'backups'), gatewayBaseUrl: 'http://127.0.0.1:47831/v1' });
      for (let index = 0; index < 12; index += 1) { await writeFile(config, `model = "${index}"\n`); await sync.sync(); }
      expect(await sync.backups()).toHaveLength(10);
    } finally { await directory.dispose(); }
  });
});
