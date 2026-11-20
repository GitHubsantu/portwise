import { readFile, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { deliverGatewayToken, replaceEnvironmentValue } from '../src/sync/credentialDelivery';
import { listBackups } from '../src/sync/backups';
import { temporaryDirectory } from './helpers/temporaryDirectory';

describe('credential delivery', () => {
  it('changes only the Portwise local-token line and requires restart', async () => {
    const directory = await temporaryDirectory('portwise-env');
    try {
      const env = path.join(directory.path, '.env');
      await writeFile(env, '# retain\nOTHER_TOKEN=untouched\nPORTWISE_GATEWAY_TOKEN=old-local-token\n');
      const result = await deliverGatewayToken(directory.path, 'test-token-0000', path.join(directory.path, 'backups'), 'linux');
      expect(result).toEqual({ permissionsEnforced: true, restartRequired: true });
      await expect(readFile(env, 'utf8')).resolves.toBe('# retain\nOTHER_TOKEN=untouched\nPORTWISE_GATEWAY_TOKEN=test-token-0000\n');
      expect(await listBackups(env, path.join(directory.path, 'backups'))).toHaveLength(1);
    } finally { await directory.dispose(); }
  });

  it('rejects token newline injection', () => {
    expect(() => replaceEnvironmentValue('', 'PORTWISE_GATEWAY_TOKEN', 'test-token-0000\nEVIL=value')).toThrow('invalid');
  });

  it('retains only the ten newest pre-write .env backups', async () => {
    const directory = await temporaryDirectory('portwise-env-retention');
    try {
      const env = path.join(directory.path, '.env');
      const backups = path.join(directory.path, 'backups');
      for (let index = 0; index < 12; index += 1) await deliverGatewayToken(directory.path, `test-token-${index.toString().padStart(4, '0')}`, backups, 'linux');
      expect(await listBackups(env, backups)).toHaveLength(10);
    } finally { await directory.dispose(); }
  });
});
