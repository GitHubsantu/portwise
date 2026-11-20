import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Phase 7 UI security and usage command', () => {
  it('renders all untrusted display text with textContent and retains CSP-safe event wiring', () => {
    const source = readFileSync('src/webview-ui/main.ts', 'utf8');
    const protocol = readFileSync('src/shared/protocol.ts', 'utf8');
    expect(source).toContain('node.textContent = text');
    expect(source).toContain('provider.name');
    expect(source).toContain("setAttribute('role', 'status')");
    expect(source).toContain("addEventListener('click'");
    expect(source).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|on(?:click|input)\s*=/);
    expect(protocol).not.toContain('accounts:');
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
