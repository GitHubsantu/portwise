import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('account command hygiene', () => {
  it('launches only the official codex login flow without supplied credentials or extra arguments', () => {
    const source = readFileSync('src/extension.ts', 'utf8');
    expect(source).toContain("shellPath: 'codex', shellArgs: ['login']");
    expect(source).not.toContain('sendText(');
    expect(source).not.toMatch(/shellArgs:\s*\[[^\]]+,[^\]]+\]/);
  });
});
