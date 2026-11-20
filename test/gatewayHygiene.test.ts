import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('gateway secret hygiene', () => {
  it('bootstraps only from stdin, never argv or environment', () => {
    const main = readFileSync('src/gateway/daemon/main.ts', 'utf8');
    expect(main).toContain('process.stdin');
    expect(main).not.toContain('process.argv');
    expect(main).not.toContain('process.env');
  });
  it('does not log request headers, bodies, or tokens', () => {
    const server = readFileSync('src/gateway/daemon/server.ts', 'utf8');
    expect(server).not.toContain('console.');
    expect(server).not.toContain('.log(');
    expect(server).not.toContain('process.argv');
    expect(server).not.toContain('process.env');
  });
});
