// Optional local diagnostic: node scripts/checkPanelLayout.mjs <Chrome-or-Edge-path>
// Uses existing esbuild, fake display data and a disposable offline browser profile.
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

const browser = process.argv[2];
if (!browser) throw new Error('Pass the absolute path of an installed Chrome or Edge browser.');
const directory = await mkdtemp(path.join(tmpdir(), 'portwise-layout-'));
const widths = [220, 300, 400, 600, 900];
const themes = ['vscode-dark', 'vscode-light', 'vscode-high-contrast', 'vscode-high-contrast-light'];
try {
  const bundle = await build({ entryPoints: ['src/webview-ui/main.ts'], bundle: true, platform: 'browser', format: 'iife', write: false });
  const output = bundle.outputFiles[0]; if (!output) throw new Error('Missing renderer bundle.');
  await writeFile(path.join(directory, 'renderer.js'), output.contents);
  const fixtureThemes = `
    :root { --vscode-font-family: system-ui; --vscode-font-size: 13px; --vscode-editor-font-family: monospace; --vscode-editor-font-size: 13px; }
    .vscode-dark, .vscode-high-contrast { --vscode-foreground: #eee; --vscode-descriptionForeground: #ccc; --vscode-editor-background: #181818; --vscode-editorWidget-background: #252525; --vscode-button-secondaryBackground: #333; --vscode-button-secondaryForeground: #fff; --vscode-badge-background: #333; --vscode-badge-foreground: #fff; --vscode-panel-border: #666; --vscode-button-background: #065a9c; --vscode-button-foreground: #fff; --vscode-errorForeground: #f88; --vscode-focusBorder: #009fff; }
    .vscode-light, .vscode-high-contrast-light { --vscode-foreground: #111; --vscode-descriptionForeground: #444; --vscode-editor-background: #fff; --vscode-editorWidget-background: #eee; --vscode-button-secondaryBackground: #ddd; --vscode-button-secondaryForeground: #111; --vscode-badge-background: #ddd; --vscode-badge-foreground: #111; --vscode-panel-border: #777; --vscode-button-background: #065a9c; --vscode-button-foreground: #fff; --vscode-errorForeground: #900; --vscode-focusBorder: #065a9c; }
    .vscode-high-contrast { --vscode-contrastBorder: #fff; --vscode-contrastActiveBorder: #fff; }
    .vscode-high-contrast-light { --vscode-contrastBorder: #000; --vscode-contrastActiveBorder: #000; }
  `;
  await writeFile(path.join(directory, 'panel.css'), (await readFile('src/webview-ui/main.css', 'utf8')) + fixtureThemes);
  const name = '<img onerror=alert(1)>' + 'long-name-'.repeat(40);
  const state = { type: 'state', state: {
    version: 'layout-fixture', status: 'Ready.', accountMatchAvailability: 'available',
    accounts: [{ id: 'fake-account', name, isCurrent: true }],
    providers: [true, false].map((enabled, index) => ({ id: `fake-provider-${index}`, name, enabled, baseUrl: 'https://example.test/' + 'long-path'.repeat(40), tokenMask: '••••0000' })),
    gateway: { running: true, label: 'Running on port 47831' },
  } };
  const data = JSON.stringify(state).replaceAll('<', '\\u003c');
  await writeFile(path.join(directory, 'bootstrap.js'), `globalThis.acquireVsCodeApi = () => ({ postMessage() {} });`);
  await writeFile(path.join(directory, 'state.js'), `window.postMessage(${data}, '*');`);
  await writeFile(path.join(directory, 'panel.html'), `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src file:; script-src file:; img-src 'none'; connect-src 'none'; font-src 'none'"><link rel="stylesheet" href="panel.css"></head><body><main id="app"></main><script src="bootstrap.js"></script><script src="renderer.js"></script><script src="state.js"></script></body></html>`);
  // This outer fixture measures real iframe viewports, avoiding headless minimum-window widths.
  await writeFile(path.join(directory, 'measure.js'), `
    const results = [];
    const frames = [...document.querySelectorAll('iframe')];
    for (const frame of frames) frame.addEventListener('load', () => {
      const doc = frame.contentDocument; doc.body.className = frame.dataset.theme;
      setTimeout(() => {
        const view = frame.contentWindow;
        const viewport = doc.documentElement.clientWidth;
        const buttons = [...doc.querySelectorAll('button')];
        const main = [...doc.querySelector('.provider-main-actions').children];
        const accountButtons = [...doc.querySelector('.account-actions').querySelectorAll('button')];
        const equal = nodes => Math.max(...nodes.map(n => n.getBoundingClientRect().width)) - Math.min(...nodes.map(n => n.getBoundingClientRect().width)) < 1;
        const row = doc.querySelector('.account-row'); const current = doc.querySelector('.account-current');
        const providerName = doc.querySelector('.provider-name');
        const focusButton = buttons.find(b => !b.disabled); focusButton.focus();
        const focus = view.getComputedStyle(focusButton);
        results.push({
          theme: frame.dataset.theme, width: Number(frame.width), viewport,
          scroll: doc.documentElement.scrollWidth,
          horizontalOverflow: doc.documentElement.scrollWidth > viewport || [...doc.querySelectorAll('body *')].some(n => n.getBoundingClientRect().right > viewport + 0.5 || n.getBoundingClientRect().left < -0.5),
          minimumButtonHeight: Math.min(...buttons.map(b => b.getBoundingClientRect().height)),
          accessibleButtons: buttons.every(b => Boolean(b.getAttribute('aria-label'))),
          equalProviderActions: equal(main), equalAccountActions: equal(viewport < 400 ? accountButtons.slice(0, 2) : accountButtons),
          nameEllipsis: view.getComputedStyle(providerName).textOverflow === 'ellipsis' && providerName.title === providerName.textContent && providerName.scrollWidth > providerName.clientWidth,
          currentRightAligned: Math.abs(current.getBoundingClientRect().right - row.getBoundingClientRect().right) < 1,
          visibleFocus: parseFloat(focus.outlineWidth) >= 2 && focus.outlineStyle !== 'none',
          textOnlyNames: doc.querySelectorAll('img').length === 0,
        });
        if (results.length === frames.length) document.getElementById('layout-results').textContent = JSON.stringify(results);
      }, 100);
    });
  `);
  const frames = themes.flatMap((theme) => widths.map((width) => `<iframe width="${width}" height="3000" data-theme="${theme}" src="panel.html"></iframe>`)).join('');
  await writeFile(path.join(directory, 'index.html'), `<!doctype html><html><head><meta charset="utf-8"><style>iframe { border: 0; display: block; }</style></head><body><pre id="layout-results"></pre>${frames}<script src="measure.js"></script></body></html>`);
  const run = spawnSync(browser, [
    '--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-proxy-server',
    '--host-resolver-rules=MAP * ~NOTFOUND', '--allow-file-access-from-files', `--user-data-dir=${path.join(directory, 'profile')}`,
    '--window-size=1100,900', '--virtual-time-budget=5000', '--dump-dom', pathToFileURL(path.join(directory, 'index.html')).href,
  ], { encoding: 'utf8', windowsHide: true, timeout: 30_000, maxBuffer: 4 * 1024 * 1024 });
  if (run.error) throw run.error;
  const report = run.stdout.match(/<pre id="layout-results">([^]*?)<\/pre>/)?.[1];
  if (run.status !== 0 || !report) throw new Error(`Local browser layout check failed (exit ${run.status}).`);
  const results = JSON.parse(report);
  if (results.length !== widths.length * themes.length) throw new Error('Incomplete browser layout results.');
  for (const result of results) {
    console.log(`${result.theme} ${result.width}px: scroll=${result.scroll}, minTarget=${result.minimumButtonHeight.toFixed(1)}px`);
    if (result.horizontalOverflow || result.viewport !== result.width || result.minimumButtonHeight < 32 || !result.accessibleButtons || !result.equalProviderActions || !result.equalAccountActions || !result.nameEllipsis || !result.currentRightAligned || !result.visibleFocus || !result.textOnlyNames) throw new Error(`Layout assertion failed: ${JSON.stringify(result)}`);
  }
  console.log(`PASS: ${results.length} local browser viewport/theme cases. Synthetic themes; VS Code F5 visual acceptance remains manual.`);
} finally {
  await rm(directory, { recursive: true, force: true });
}
