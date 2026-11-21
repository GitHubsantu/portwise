import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('gateway lifecycle secret hygiene', () => {
  it('passes bootstrap only through stdin, never argv or an environment override', () => {
    const source = readFileSync('src/gateway/controller.ts', 'utf8');
    expect(source).toContain("this.run(process.execPath, [this.options.gatewayScript]");
    expect(source).toContain("stdio: ['pipe', 'ignore', 'pipe']");
    expect(source).toContain('Never forward raw stderr');
    expect(source).toContain('child.stdin.end(JSON.stringify(configuration))');
    expect(source).not.toMatch(/this\.run\([^\n]+token/);
    expect(source).not.toContain('env:');
  });
});
