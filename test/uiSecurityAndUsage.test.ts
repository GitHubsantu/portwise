import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Phase 7 UI security and usage command', () => {
  it('renders all untrusted display text with textContent and retains CSP-safe event wiring', () => {
    const source = readFileSync('src/webview-ui/main.ts', 'utf8');
    const protocol = readFileSync('src/shared/protocol.ts', 'utf8');
    expect(source).toContain('node.textContent = text');
    expect(source).toContain('provider.name');
    expect(source).toContain("setAttribute('role', 'status')");
    expect(source).toContain("className = `button button-${kind}`");
    expect(source).toContain("action(UI_STRINGS.deleteProvider, { type: 'deleteProvider', id: provider.id }, 'destructive')");
    expect(source).toContain("addEventListener('click'");
    expect(source).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|on(?:click|input)\s*=/);
    expect(protocol).toContain('export type AccountPanelItem = { id: string; name: string }');
    expect(protocol).not.toMatch(/AccountPanelItem[^;]*(?:token|credential|snapshot|auth)/i);
  });

  it('maps panel gateway and account buttons to existing commands without forwarding arguments', () => {
    const source = readFileSync('src/webview-ui/main.ts', 'utf8');
    const host = readFileSync('src/extension.ts', 'utf8');
    const manifest = JSON.parse(readFileSync('package.json', 'utf8')) as { contributes: { commands: Array<{ command: string }> } };
    expect(source).toContain("{ type: 'runPanelCommand', command }");
    expect(host).toContain('vscode.commands.executeCommand(command)');
    expect(host).not.toContain('vscode.commands.executeCommand(command,');
    for (const command of ['portwise.startGateway', 'portwise.stopGateway', 'portwise.configureCodex', 'portwise.startCodexLogin', 'portwise.saveCodexAccount', 'portwise.switchCodexAccount', 'portwise.removeCodexAccount']) {
      expect(manifest.contributes.commands.some((entry) => entry.command === command)).toBe(true);
    }
  });

  it('uses VS Code theme and contrast-border variables for visual states', () => {
    const css = readFileSync('src/webview-ui/main.css', 'utf8');
    const source = readFileSync('src/webview-ui/main.ts', 'utf8');
    expect(css).toContain('--vscode-contrastBorder');
    expect(css).toContain('@media (forced-colors: active)');
    expect(css).toContain('@media (max-width: 260px)');
    expect(css).toContain('.account-row');
    expect(css).toContain('.gateway-badge');
    expect(css).toContain('border-bottom: 1px solid var(--pw-border)');
    expect(source).toContain("node.disabled = disabled");
    expect(source).toContain("setAttribute('aria-describedby', 'gateway-state-reason')");
    expect(source).toContain("const clearlyRunning = gateway.running && gateway.label.startsWith('Running on port ')");
    expect(source).toContain("const clearlyStopped = gateway.label === 'Stopped'");
    expect(source).toContain("clearlyStopped ? 'primary' : 'secondary'");
    expect(source).toContain('`gateway-badge gateway-status-${stateName}`');
    expect(source).toContain("icon.setAttribute('aria-hidden', 'true')");
    for (const stateClass of ['gateway-status-running', 'gateway-status-stopped', 'gateway-status-error', 'gateway-status-unknown']) {
      expect(css).toContain(`.gateway-badge.${stateClass} { background:`);
    }
    expect(css).toContain('.button:not(:disabled) { cursor: pointer; }');
    expect(css).toContain('.button:disabled { cursor: not-allowed;');
  });

  it('uses neutral list dividers, terminal Activity styling and reachable high-contrast controls', () => {
    const css = readFileSync('src/webview-ui/main.css', 'utf8');
    expect(css).not.toMatch(/border-left|border-inline-start|--pw-card/);
    expect(css).toContain('--vscode-terminal-background');
    expect(css).toContain('--vscode-editor-font-family');
    expect(css).toContain('min-height: 32px');
    expect(css).toContain('margin-inline-start: 8px');
    expect(css).toContain('margin-block-start: 8px');
    expect(css).toContain('.vscode-high-contrast .gateway-badge');
    expect(css).toContain('.vscode-high-contrast-light .button');
    expect(css).toContain('.button:focus-visible');
  });

  it('launches plain codex for the user to run /status without reading credentials or displaying quota', () => {
    const source = readFileSync('src/extension.ts', 'utf8');
    const manifest = readFileSync('package.json', 'utf8');
    const strings = readFileSync('src/ui/strings.ts', 'utf8');
    expect(manifest).toContain('"command": "portwise.openCodexUsage"');
    expect(source).toContain("shellPath: 'codex', shellArgs: []");
    expect(strings).toContain('run /status to view Codex rate limits');
    expect(source).not.toMatch(/openCodexUsage[\s\S]{0,500}auth\.json/);
  });

  it('provides a three-step walkthrough with packaged local media that users can close and return to later', () => {
    const manifest = JSON.parse(readFileSync('package.json', 'utf8')) as { engines: { vscode: string }; contributes: { commands: Array<{ command: string }>; walkthroughs: Array<{ description: string; steps: Array<{ description: string; media?: { markdown: string } }> }> } };
    const walkthrough = manifest.contributes.walkthroughs[0];
    expect(walkthrough?.steps).toHaveLength(3);
    expect(walkthrough?.description).toContain('close this walkthrough and return later');
    expect(manifest.engines.vscode).toBe('^1.106.0');
    for (const step of walkthrough?.steps ?? []) {
      expect(typeof step.media?.markdown).toBe('string');
      expect(existsSync(step.media?.markdown ?? '')).toBe(true);
      const command = step.description.match(/\]\(command:([^)]+)\)/)?.[1];
      expect(command).toBeDefined();
      expect(manifest.contributes.commands.some((item) => item.command === command)).toBe(true);
    }
    expect(readFileSync('.vscodeignore', 'utf8')).not.toContain('media/**');
  });
});
