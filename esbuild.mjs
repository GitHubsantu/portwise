import { build, context } from 'esbuild';
import { copyFile, mkdir } from 'node:fs/promises';

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/** @type {import('esbuild').BuildOptions} */
const shared = {
  bundle: true,
  sourcemap: !production,
  minify: production,
  logLevel: 'info',
};

const extension = {
  ...shared,
  entryPoints: ['src/extension.ts'],
  outfile: 'dist/extension.js',
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['vscode'],
};

const webview = {
  ...shared,
  entryPoints: ['src/webview-ui/main.ts'],
  outfile: 'dist/webview/main.js',
  platform: 'browser',
  format: 'iife',
  target: 'es2022',
};

async function copyAssets() {
  await mkdir('dist/webview', { recursive: true });
  await copyFile('src/webview-ui/main.css', 'dist/webview/main.css');
}

await copyAssets();

if (watch) {
  const contexts = await Promise.all([context(extension), context(webview)]);
  await Promise.all(contexts.map((c) => c.watch()));
  console.log('[portwise] watching for changes...');
} else {
  await Promise.all([build(extension), build(webview)]);
}
