import { readFile, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { deliverGatewayToken, replaceEnvironmentValue } from '../src/sync/credentialDelivery';
import { listBackups } from '../src/sync/backups';
import { temporaryDirectory } from './helpers/temporaryDirectory';
import { PERMISSION_IO_TEST_MS, PERMISSION_RETENTION_TEST_MS } from './helpers/permissionBudget';

describe('credential delivery', () => {
  it('preserves unrelated CRLF bytes and rejects duplicate assignments before any write', async () => {
    const directory = await temporaryDirectory('portwise-env-byte-preservation');
    try {
      const file = path.join(directory.path, '.env');
      const source = '# keep\r\nOTHER=unchanged\r\n  PORTWISE_GATEWAY_TOKEN=test-old-0000\r\n\r\n# final comment';
      await writeFile(file, source);
      await deliverGatewayToken(directory.path, 'test-token-0000', path.join(directory.path, 'backups'));
      expect(await readFile(file, 'utf8')).toBe(source.replace('test-old-0000', 'test-token-0000'));
      const invalid = 'PORTWISE_GATEWAY_TOKEN=test-token-0000\r\nPORTWISE_GATEWAY_TOKEN=test-other-0000\r\n';
      await writeFile(file, invalid);
      await expect(deliverGatewayToken(directory.path, 'test-token-0000', path.join(directory.path, 'backups'))).rejects.toThrow('duplicate');
      expect(await readFile(file, 'utf8')).toBe(invalid);
      expect(await listBackups(file, path.join(directory.path, 'backups'))).toHaveLength(1);
    } finally { await directory.dispose(); }
  }, PERMISSION_IO_TEST_MS);
  it('changes only the Portwise local-token line and requires restart', async () => {
    const directory = await temporaryDirectory('portwise-env');
    try {
      const env = path.join(directory.path, '.env');
      await writeFile(env, '# retain\nOTHER_TOKEN=untouched\nPORTWISE_GATEWAY_TOKEN=old-local-token\n');
      const result = await deliverGatewayToken(directory.path, 'test-token-0000', path.join(directory.path, 'backups'));
      expect(result).toEqual({ permissionsEnforced: true, restartRequired: true });
      await expect(readFile(env, 'utf8')).resolves.toBe('# retain\nOTHER_TOKEN=untouched\nPORTWISE_GATEWAY_TOKEN=test-token-0000\n');
      expect(await listBackups(env, path.join(directory.path, 'backups'))).toHaveLength(1);
    } finally { await directory.dispose(); }
  }, PERMISSION_IO_TEST_MS);

  it('rejects token newline injection', () => {
    expect(() => replaceEnvironmentValue('', 'PORTWISE_GATEWAY_TOKEN', 'test-token-0000\nEVIL=value')).toThrow('invalid');
  });

  // Includes staged, rollback and final native ACL verification; assertions and product deadlines stay unchanged.
  it('retains only the ten newest pre-write .env backups', async () => {
    const directory = await temporaryDirectory('portwise-env-retention');
    try {
      const env = path.join(directory.path, '.env');
      const backups = path.join(directory.path, 'backups');
      for (let index = 0; index < 12; index += 1) await deliverGatewayToken(directory.path, `test-token-${index.toString().padStart(4, '0')}`, backups);
      expect(await listBackups(env, backups)).toHaveLength(10);
    } finally { await directory.dispose(); }
  }, PERMISSION_RETENTION_TEST_MS);
});
