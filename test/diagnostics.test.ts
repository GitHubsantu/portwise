import { describe, expect, it } from 'vitest';
import { formatDiagnostics } from '../src/diagnostics/report';

describe('diagnostics report', () => {
  it('uses an allow-list and redacts secrets', () => {
    const report = formatDiagnostics([{ name: 'daemon', status: 'PASS', hint: 'Bearer test-token-0000' }, { name: 'unapproved', status: 'FAIL', hint: 'must not appear' }], true);
    expect(report).not.toContain('test-token-0000');
    expect(report).not.toContain('unapproved');
    expect(report).toContain('Restart Codex/VS Code');
  });
});
