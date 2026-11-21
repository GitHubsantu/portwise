import { describe, expect, it } from 'vitest';
import { formatDiagnostics, type DiagnosticStatus } from '../src/diagnostics/report';

describe('diagnostics report', () => {
  it('rejects unknown statuses and ignores credential-bearing fields outside the report schema', () => {
    const extra = { name: 'config', status: 'PASS' as const, hint: 'Fixed safe hint.', token: 'test-opaque-0000' };
    const report = formatDiagnostics([extra, { name: 'daemon', status: 'unexpected' as DiagnosticStatus, hint: 'must-not-appear' }], false);
    expect(report).toBe('PASS config: Fixed safe hint.'); expect(report).not.toMatch(/test-opaque|must-not-appear|unexpected/);
  });
  it('uses an allow-list and redacts secrets', () => {
    const report = formatDiagnostics([{ name: 'daemon', status: 'PASS', hint: 'Bearer test-token-0000' }, { name: 'unapproved', status: 'FAIL', hint: 'must not appear' }], true);
    expect(report).not.toContain('test-token-0000');
    expect(report).not.toContain('unapproved');
    expect(report).toContain('Restart Codex/VS Code');
  });
});
