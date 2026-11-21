import { mkdtemp, realpath, rm } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

export async function temporaryDirectory(prefix: string): Promise<{ path: string; dispose(): Promise<void> }> {
  // Hosted Windows runners expose an 8.3 TEMP alias; fixtures must use the same
  // canonical identities as production consent and account metadata.
  const directory = await realpath(await mkdtemp(path.join(os.tmpdir(), `${prefix}-`)));
  return { path: directory, dispose: () => rm(directory, { recursive: true, force: true }) };
}
