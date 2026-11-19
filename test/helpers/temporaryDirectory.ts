import { mkdtemp, rm } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

export async function temporaryDirectory(prefix: string): Promise<{ path: string; dispose(): Promise<void> }> {
  const directory = await mkdtemp(path.join(os.tmpdir(), `${prefix}-`));
  return { path: directory, dispose: () => rm(directory, { recursive: true, force: true }) };
}
