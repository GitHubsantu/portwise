import { existsSync, readFileSync } from 'node:fs';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { listFiles, PackageManager } from '@vscode/vsce';
import { describe, expect, it } from 'vitest';
import { temporaryDirectory } from './helpers/temporaryDirectory';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

type Icon = string | { light: string; dark: string };
interface Manifest {
  icon: string;
  contributes: {
    commands: Array<{ icon?: Icon }>;
    viewsContainers: Record<string, Array<{ icon: Icon }>>;
    views: Record<string, Array<{ icon?: Icon }>>;
  };
}
const manifest = JSON.parse(readFileSync('package.json', 'utf8')) as Manifest;
function iconPaths(icon: Icon | undefined): string[] {
  if (!icon) return [];
  if (typeof icon === 'string') return icon.startsWith('$(') ? [] : [icon];
  return [icon.light, icon.dark];
}
const referenced = [...new Set([
  manifest.icon,
  ...Object.values(manifest.contributes.viewsContainers).flatMap((containers) => containers.flatMap((container) => iconPaths(container.icon))),
  ...Object.values(manifest.contributes.views).flatMap((views) => views.flatMap((view) => iconPaths(view.icon))),
  ...manifest.contributes.commands.flatMap((command) => iconPaths(command.icon)),
])];

describe('local icon packaging', () => {
  it('uses the new 128x128 PNG for the extension and retains the original artwork files', () => {
    expect(manifest.icon).toBe('images/icon-128.png');
    const png = readFileSync(manifest.icon);
    expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(png.toString('ascii', 12, 16)).toBe('IHDR');
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([128, 128]);
    for (const original of ['images/icon.svg', 'images/icon.png', 'images/activity.svg']) expect(existsSync(original)).toBe(true);
  });

  it('includes every referenced local icon using the real VSIX ignore rules and no-dependencies packaging mode', async () => {
    const files = new Set((await listFiles({ packageManager: PackageManager.None })).map((file) => file.replace(/\\/g, '/')));
    expect(referenced).toContain('images/activity.svg');
    for (const icon of referenced) {
      expect(existsSync(icon), icon).toBe(true);
      expect(files.has(icon), `${icon} must survive .vscodeignore`).toBe(true);
    }
  });

  it('detects exclusion of referenced icons by .vscodeignore in a temporary package', async () => {
    const directory = await temporaryDirectory('portwise-icon-ignore');
    try {
      await copyFile('package.json', path.join(directory.path, 'package.json'));
      for (const icon of referenced) {
        const target = path.join(directory.path, icon); await mkdir(path.dirname(target), { recursive: true }); await copyFile(icon, target);
      }
      await writeFile(path.join(directory.path, '.vscodeignore'), readFileSync('.vscodeignore', 'utf8') + '\nimages/**\n');
      const files = await listFiles({ cwd: directory.path, packageManager: PackageManager.None });
      for (const icon of referenced) expect(files.map((file) => file.replace(/\\/g, '/'))).not.toContain(icon);
    } finally { await directory.dispose(); }
  });

  it('excludes private recovery files from both Git and the VSIX without excluding ordinary files', async () => {
    const names = ['.env.test-recovery.bak', 'nested/.env.test-recovery.bak'];
    const { stdout } = await promisify(execFile)('git', ['check-ignore', '--no-index', ...names, 'retained.txt'], { windowsHide: true });
    expect(stdout.trim().split(/\r?\n/)).toEqual(names);
    const directory = await temporaryDirectory('portwise-recovery-package');
    try {
      await copyFile('package.json', path.join(directory.path, 'package.json')); await copyFile('.vscodeignore', path.join(directory.path, '.vscodeignore'));
      for (const name of names) { const file = path.join(directory.path, name); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, 'test-private-recovery-0000'); }
      await writeFile(path.join(directory.path, 'retained.txt'), 'ordinary package file');
      const files = (await listFiles({ cwd: directory.path, packageManager: PackageManager.None })).map(file => file.replace(/\\/g, '/'));
      for (const name of names) expect(files).not.toContain(name);
      expect(files).toContain('retained.txt');
    } finally { await directory.dispose(); }
  });
});
