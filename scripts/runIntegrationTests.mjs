import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTests } from '@vscode/test-electron';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import * as os from 'node:os';
import { build } from 'esbuild';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const fixture = await mkdtemp(path.join(os.tmpdir(), 'portwise-extension-host-'));
try {
  const home = path.join(fixture, 'codex-home');
  const userData = path.join(fixture, 'vscode-data');
  await mkdir(home);
  await mkdir(path.join(userData, 'User'), { recursive: true });
  await writeFile(path.join(userData, 'User', 'settings.json'), JSON.stringify({ 'portwise.codexHome': home, 'portwise.autoStartGateway': false, 'update.mode': 'none', 'extensions.autoUpdate': false, 'telemetry.telemetryLevel': 'off' }));
  const controller = path.join(fixture, 'controller.cjs');
  await build({ entryPoints: [path.join(repositoryRoot, 'src', 'gateway', 'controller.ts')], outfile: controller, bundle: true, platform: 'node', format: 'cjs', target: 'node20' });
  // The launcher must be Electron, while children spawned by the Extension Host
  // keep its own run-as-Node environment. Never modify that child environment here.
  delete process.env.ELECTRON_RUN_AS_NODE;
  await runTests({
    ...(process.env.PORTWISE_TEST_VSCODE_EXECUTABLE ? { vscodeExecutablePath: process.env.PORTWISE_TEST_VSCODE_EXECUTABLE } : { version: '1.106.0' }),
    extensionDevelopmentPath: repositoryRoot,
    extensionTestsPath: path.join(repositoryRoot, 'test', 'integration', 'commands.cjs'),
    launchArgs: ['--disable-extensions', '--skip-welcome', '--skip-release-notes', '--user-data-dir', userData, '--extensions-dir', path.join(fixture, 'extensions')],
    extensionTestsEnv: { CODEX_HOME: home, PORTWISE_FIXTURE_ROOT: fixture, PORTWISE_LIFECYCLE_MODULE: controller, PORTWISE_GATEWAY_SCRIPT: path.join(repositoryRoot, 'dist', 'gateway.js') },
  });
} finally {
  await cleanupFixture();
}

async function cleanupFixture() {
  // This exact directory was exclusively created above; never remove a caller's path.
  if (path.dirname(path.resolve(fixture)) !== path.resolve(os.tmpdir()) || !path.basename(fixture).startsWith('portwise-extension-host-')) throw new Error('Refusing cleanup outside the temporary fixture root.');
  await rm(fixture, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
