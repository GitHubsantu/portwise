import { spawn } from 'node:child_process';
import type * as childProcess from 'node:child_process';
import { once } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PERMISSION_COMMAND_DEADLINE_MS, runPermissionCommand } from '../src/core/permissionCommand';

vi.mock('node:child_process', () => ({ spawn: vi.fn() }));
afterEach(() => { vi.useRealTimers(); vi.resetAllMocks(); });

async function child(script: string) {
  const original = await vi.importActual<typeof childProcess>('node:child_process');
  const process = original.spawn(globalThis.process.execPath, ['-e', script], { shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
  vi.mocked(spawn).mockReturnValue(process); return process;
}

describe('bounded private-permission commands', () => {
  it('uses an args array, closes stdin and waits for successful exit', async () => {
    await child("process.stdin.resume(); process.stdin.on('end', () => process.stdout.write('safe-result'))");
    await expect(runPermissionCommand('powershell.exe', ['-NoProfile'], 'test-input-0000')).resolves.toBe('safe-result');
    expect(spawn).toHaveBeenCalledWith('powershell.exe', ['-NoProfile'], { shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
  });
  it('keeps numeric nonzero exit status without output text', async () => {
    await child("process.stdout.write('test-private-output-0000'); process.exitCode=7");
    await expect(runPermissionCommand('icacls', [])).rejects.toMatchObject({ category: 'nonzero exit', exitCode: 7, message: 'Permission command failed.' });
  });
  it('reports synchronous and asynchronous spawn failures without OS text', async () => {
    vi.mocked(spawn).mockImplementation(() => { throw new Error('test-private-spawn-0000'); });
    await expect(runPermissionCommand('icacls', [])).rejects.toMatchObject({ category: 'spawn failure', message: 'Permission command failed.' });
    const process = await child('setInterval(() => {}, 1000)'); const closed = new Promise<void>(resolve => process.once('close', () => resolve()));
    const result = expect(runPermissionCommand('icacls', [])).rejects.toMatchObject({ category: 'spawn failure' });
    process.emit('error', new Error('test-private-spawn-0000')); await result; await closed;
  });
  it('rejects oversized output instead of accepting a truncated ACL', async () => {
    const process = await child("process.stdout.write('x'.repeat(17000)); setInterval(() => {}, 1000)"); const closed = once(process, 'close');
    await expect(runPermissionCommand('powershell.exe', [])).rejects.toMatchObject({ category: 'output limit' }); await closed;
  });
  it('bounds a stalled command, kills only that child and never retries it', async () => {
    const process = await child('setInterval(() => {}, 1000)'); const closed = once(process, 'close');
    vi.useFakeTimers(); const result = expect(runPermissionCommand('icacls', [])).rejects.toMatchObject({ category: 'timeout' });
    await vi.advanceTimersByTimeAsync(PERMISSION_COMMAND_DEADLINE_MS); await result; expect(spawn).toHaveBeenCalledTimes(1);
    vi.useRealTimers(); await closed;
  });
  it.each(['stdin', 'stdout'] as const)('fails closed on %s errors', async stream => {
    const process = await child('setInterval(() => {}, 1000)'); const closed = once(process, 'close');
    const result = expect(runPermissionCommand('powershell.exe', [])).rejects.toMatchObject({ category: 'output failure' });
    process[stream]?.destroy(new Error('test-private-stream-0000')); await result; await closed;
  });
});
