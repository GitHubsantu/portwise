import { createServer, type RequestListener } from 'node:http';
import { mkdir, readFile, readdir, stat, symlink, writeFile } from 'node:fs/promises';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { startGateway } from '../src/gateway/daemon/server';
import { atomicWrite } from '../src/core/atomicWrite';
import { runDiagnostics, type DiagnosticOptions } from '../src/diagnostics/checks';
import { formatDiagnostics } from '../src/diagnostics/report';
import { gatewayChecks } from '../src/diagnostics/gatewayChecks';
import { temporaryDirectory } from './helpers/temporaryDirectory';

vi.mock('node:fs/promises', async importOriginal => ({ ...await importOriginal<typeof fs>() }));
const localToken = 'test-local-0000'; const upstreamToken = 'test-upstream-0000';

async function fixture(handler?: RequestListener) {
  const directory = await temporaryDirectory('portwise-diagnostic'); const home = path.join(directory.path, 'home'); const storage = path.join(directory.path, 'storage');
  await mkdir(home); await mkdir(storage);
  const received: Array<{ url: string | undefined; method: string | undefined; auth: string | undefined }> = [];
  const upstream = createServer((request, response) => { received.push({ url: request.url, method: request.method, auth: request.headers.authorization }); if (handler) handler(request, response); else response.end('test-body-must-not-be-displayed-0000'); });
  await new Promise<void>(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const address = upstream.address(); if (!address || typeof address === 'string') throw new Error('missing fixture port');
  const provider = { baseUrl: `http://127.0.0.1:${address.port}/v1`, token: upstreamToken, enabled: true };
  const daemon = await startGateway({ token: localToken, provider, port: 0 });
  const source = `model_provider = "portwise"\n[model_providers.portwise]\nbase_url = "http://127.0.0.1:${daemon.port}/v1"\nenv_key = "PORTWISE_GATEWAY_TOKEN"\nwire_api = "responses"\nrequires_openai_auth = false\nsupports_websockets = false\n`;
  await writeFile(path.join(home, 'config.toml'), source); await writeFile(path.join(home, 'auth.json'), '{"token":"test-auth-never-read-0000"}'); await writeFile(path.join(home, 'history.jsonl'), 'fake history');
  await atomicWrite(path.join(home, '.env'), `OTHER=test-unrelated-0000\nPORTWISE_GATEWAY_TOKEN=${localToken}\n`);
  const state = { pid: 123, port: daemon.port, instanceId: daemon.instanceId, startedAt: 'test', version: 'test' };
  await writeFile(path.join(storage, 'gateway.json'), JSON.stringify(state));
  const options: DiagnosticOptions = { codexHome: home, storageDirectory: storage, port: daemon.port, token: localToken, provider, timeoutMs: 200 };
  return { directory, home, storage, daemon, upstream, provider, received, state, options, dispose: async () => { await daemon.close(); upstream.closeAllConnections(); await new Promise<void>(resolve => upstream.close(() => resolve())); await directory.dispose(); } };
}

describe('read-only measured diagnostics', () => {
  it('measures current config, delivery, ACLs, health, ownership, auth and provider without reading auth.json or modifying files', async () => {
    const f = await fixture();
    const realRead = fs.readFile;
    const guard = vi.spyOn(fs, 'readFile').mockImplementation(((...args: Parameters<typeof fs.readFile>) => {
      if (String(args[0]).endsWith('auth.json')) throw new Error('auth.json must not be read by diagnostics');
      return realRead(...args);
    }) as typeof fs.readFile);
    try {
      const before = await Promise.all(['config.toml', '.env', 'auth.json', 'history.jsonl'].map(async name => ({ name, bytes: await realRead(path.join(f.home, name)), mtime: (await stat(path.join(f.home, name))).mtimeMs })));
      const result = await runDiagnostics(f.options);
      for (const name of ['health', 'daemon', 'local-token', 'config', 'credential-delivery', 'permissions', 'provider']) expect(result.checks.find(check => check.name === name)?.status).toBe('PASS');
      expect(result.checks.find(check => check.name === 'codex-home')?.status).toBe(process.platform === 'win32' ? 'WARN' : 'PASS');
      expect(f.received).toEqual([{ url: '/v1/models', method: 'GET', auth: `Bearer ${upstreamToken}` }]);
      const output = formatDiagnostics(result.checks, result.restartRequired);
      for (const secret of [localToken, upstreamToken, 'test-auth-never-read-0000', 'test-unrelated-0000', 'test-body-must-not-be-displayed-0000']) expect(output).not.toContain(secret);
      expect(output).toContain('Restart Codex/VS Code');
      for (const entry of before) { expect(await realRead(path.join(f.home, entry.name))).toEqual(entry.bytes); expect((await stat(path.join(f.home, entry.name))).mtimeMs).toBe(entry.mtime); }
      expect((await readdir(f.home)).sort()).toEqual(['.env', 'auth.json', 'config.toml', 'history.jsonl']);
    } finally { guard.mockRestore(); await f.dispose(); }
  });
  it('detects stale and duplicate delivered tokens, config drift and a non-selected Portwise provider', async () => {
    const f = await fixture();
    try {
      await writeFile(path.join(f.home, '.env'), 'PORTWISE_GATEWAY_TOKEN=test-stale-0000\n');
      await writeFile(path.join(f.home, 'config.toml'), (await readFile(path.join(f.home, 'config.toml'), 'utf8')).replace(`:${f.daemon.port}/v1`, ':1/v1'));
      const stale = await runDiagnostics(f.options);
      expect(stale.checks.find(check => check.name === 'config')?.status).toBe('FAIL'); expect(stale.checks.find(check => check.name === 'credential-delivery')?.status).toBe('FAIL');
      await writeFile(path.join(f.home, '.env'), `PORTWISE_GATEWAY_TOKEN=${localToken}\nPORTWISE_GATEWAY_TOKEN=${localToken}\n`);
      const duplicate = await runDiagnostics(f.options); expect(duplicate.checks.find(check => check.name === 'credential-delivery')?.status).toBe('FAIL');
      await fs.appendFile(path.join(f.home, 'config.toml'), 'experimental_bearer_token = "test-extra-credential-0000"\n');
      const extra = await runDiagnostics(f.options); expect(extra.checks.find(check => check.name === 'config')?.status).toBe('FAIL'); expect(JSON.stringify(extra)).not.toContain('test-extra-credential-0000');
      await writeFile(path.join(f.home, 'config.toml'), (await readFile(path.join(f.home, 'config.toml'), 'utf8')).replace('experimental_bearer_token = "test-extra-credential-0000"\n', ''));
      await writeFile(path.join(f.home, 'config.toml'), (await readFile(path.join(f.home, 'config.toml'), 'utf8')).replace(':1/v1', `:${f.daemon.port}/v1`).replace('model_provider = "portwise"', 'model_provider = "other"'));
      expect((await runDiagnostics(f.options)).checks.find(check => check.name === 'config')?.status).toBe('WARN');
    } finally { await f.dispose(); }
  }, 30_000); // Repeated real Windows ACL inspection includes command startup time.
  it('refuses linked homes/files and missing, invalid or opaque credential-bearing config input without echoing it', async () => {
    const f = await fixture();
    try {
      const link = path.join(f.directory.path, 'linked-home'); await symlink(f.home, link, process.platform === 'win32' ? 'junction' : 'dir');
      expect((await runDiagnostics({ ...f.options, codexHome: link })).checks.find(check => check.name === 'codex-home')?.status).toBe('FAIL');
      await writeFile(path.join(f.home, 'config.toml'), 'credential = "test-opaque-0000"\nbad = [not-toml\n');
      const result = await runDiagnostics(f.options); expect(result.checks.find(check => check.name === 'config')?.status).toBe('FAIL');
      expect(JSON.stringify(result)).not.toContain('test-opaque-0000'); expect(JSON.stringify(result)).not.toContain('not-toml');
      await fs.rm(path.join(f.home, '.env')); await symlink(path.join(f.home, 'auth.json'), path.join(f.home, '.env'));
      const linked = await runDiagnostics(f.options); expect(linked.checks.find(check => check.name === 'credential-delivery')?.status).toBe('FAIL');
      expect(JSON.stringify(linked)).not.toContain('test-auth-never-read-0000');
      expect((await runDiagnostics({ ...f.options, codexHome: path.join(f.directory.path, 'missing') })).checks.find(check => check.name === 'codex-home')?.status).toBe('FAIL');
    } finally { await f.dispose(); }
  });
  it('distinguishes upstream authentication rejection, timeouts, redirects and no enabled provider without following redirects', async () => {
    let mode = '401'; let redirected = 0;
    const f = await fixture((request, response) => {
      if (request.url === '/redirect-target') redirected++;
      if (mode === 'timeout') return;
      if (mode === 'redirect') { response.writeHead(302, { location: '/redirect-target' }); response.end(); return; }
      response.writeHead(401); response.end('test-error-body-0000');
    });
    try {
      expect((await runDiagnostics(f.options)).checks.find(check => check.name === 'provider')).toMatchObject({ status: 'FAIL', hint: expect.stringContaining('rejected authentication') });
      for (mode of ['timeout', 'redirect']) expect((await runDiagnostics(f.options)).checks.find(check => check.name === 'provider')?.status).toBe('FAIL');
      expect(redirected).toBe(0);
      const noProvider = await runDiagnostics({ ...f.options, provider: { ...f.provider, enabled: false } }); expect(noProvider.checks.find(check => check.name === 'provider')?.status).toBe('WARN');
      const hits = f.received.length;
      expect((await runDiagnostics({ ...f.options, provider: { ...f.provider, baseUrl: 'http://not-loopback.invalid/v1' } })).checks.find(check => check.name === 'provider')?.status).toBe('FAIL');
      expect(f.received).toHaveLength(hits);
    } finally { await f.dispose(); }
  }, 30_000); // Several independent probes also perform real read-only Windows ACL checks.
  it('does not send local tokens to an unverified instance and detects wrong tokens, changed ports and stopped daemons', async () => {
    const f = await fixture(); let authenticated = 0;
    f.daemon.server.on('request', request => { if (request.headers.authorization) authenticated++; });
    try {
      await writeFile(path.join(f.storage, 'gateway.json'), JSON.stringify({ ...f.state, instanceId: 'foreign-instance' }));
      expect((await gatewayChecks(f.options)).find(check => check.name === 'daemon')?.status).toBe('FAIL'); expect(authenticated).toBe(0);
      await writeFile(path.join(f.storage, 'gateway.json'), JSON.stringify({ ...f.state, port: f.state.port + 1 }));
      await gatewayChecks(f.options); expect(authenticated).toBe(0);
      await writeFile(path.join(f.storage, 'gateway.json'), JSON.stringify(f.state));
      expect((await gatewayChecks({ ...f.options, token: 'test-wrong-0000' })).find(check => check.name === 'local-token')?.status).toBe('FAIL');
      expect((await gatewayChecks({ storageDirectory: f.storage, port: f.daemon.port })).find(check => check.name === 'local-token')?.status).toBe('FAIL');
      await f.daemon.close(); expect((await gatewayChecks(f.options)).find(check => check.name === 'health')?.status).toBe('FAIL');
    } finally { await f.dispose(); }
  });
  it('bounds malformed, oversized, slow and redirecting health responses without forwarding the token', async () => {
    const directory = await temporaryDirectory('portwise-health-input'); let mode = 'large'; let authenticated = 0;
    const fake = createServer((request, response) => {
      if (request.headers.authorization) authenticated++;
      if (mode === 'slow') return;
      if (mode === 'slow-body') { response.writeHead(200); response.write('{"instanceId":"'); return; }
      if (mode === 'redirect') response.writeHead(302, { location: '/elsewhere' });
      response.end(mode === 'large' ? 'x'.repeat(5000) : 'test-opaque-invalid-json-0000');
    });
    await new Promise<void>(resolve => fake.listen(0, '127.0.0.1', resolve)); const address = fake.address(); if (!address || typeof address === 'string') throw new Error('missing port');
    try {
      for (mode of ['large', 'invalid', 'slow', 'slow-body', 'redirect']) {
        const checks = await gatewayChecks({ storageDirectory: directory.path, port: address.port, token: localToken, timeoutMs: 50 });
        expect(checks.find(check => check.name === 'health')?.status).toBe('FAIL'); expect(JSON.stringify(checks)).not.toContain('test-opaque');
      }
      expect(authenticated).toBe(0);
    } finally { fake.closeAllConnections(); await new Promise<void>(resolve => fake.close(() => resolve())); await directory.dispose(); }
  });
});
