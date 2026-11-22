import { createHash } from 'node:crypto';
import { createWriteStream, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';
import { describe, expect, it } from 'vitest';
import { validateInputs, validateEnvironment, validateSelection, validateIdentity, verifyVsix } from '../scripts/publication.mjs';
import { temporaryDirectory } from './helpers/temporaryDirectory';

// Reuse the exact-pinned packaging tool's ZIP writer for tiny fake VSIX fixtures.
const require = createRequire(import.meta.url);
const { ZipFile } = require('yazl') as { ZipFile: new () => { addBuffer(bytes: Buffer, name: string): void; end(): void; outputStream: Readable } };
const expected = { name: 'portwise', publisher: 'santu-dev', version: '0.1.0' };
const manifest = { ...expected, engines: { vscode: '^1.106.0' }, repository: { type: 'git', url: 'https://github.com/GitHubsantu/portwise.git' } };
const identity = (patch: Record<string, string> = {}) => ({ PackageManifest: { Metadata: [{ Identity: [{ $: { Id: 'portwise', Publisher: 'santu-dev', Version: '0.1.0', ...patch } }] }] } });
const input = { commit: 'a'.repeat(40), runId: '12345', artifactName: 'portwise-vsix', sha256: 'b'.repeat(64) };
const context = { repository: 'GitHubsantu/portwise', ref: 'refs/heads/main', event: 'workflow_dispatch' };
const workflow = { id: 99, path: '.github/workflows/ci.yml', state: 'active' };
const run = {
  id: 12345, workflow_id: 99, repository: { id: 12, full_name: context.repository }, head_repository: { id: 12, full_name: context.repository },
  status: 'completed', conclusion: 'success', head_sha: input.commit, head_branch: 'main', event: 'push', path: workflow.path,
};
const artifact = {
  id: 54321, name: input.artifactName, expired: false, size_in_bytes: 1234,
  workflow_run: { id: run.id, head_sha: input.commit, head_branch: 'main', repository_id: 12, head_repository_id: 12 },
};
const jobs = ['ubuntu-latest', 'windows-latest'].map(os => ({ name: `verify (${os})`, status: 'completed', conclusion: 'success' }));

async function fakeVsix(directory: string, changes: Record<string, unknown> = {}, xmlChanges: Record<string, string> = {}): Promise<string> {
  const zip = new ZipFile();
  const attrs = { Id: 'portwise', Publisher: 'santu-dev', Version: '0.1.0', ...xmlChanges };
  zip.addBuffer(Buffer.from(JSON.stringify({ ...manifest, ...changes })), 'extension/package.json');
  zip.addBuffer(Buffer.from(`<PackageManifest><Metadata><Identity Id="${attrs.Id}" Publisher="${attrs.Publisher}" Version="${attrs.Version}"/></Metadata></PackageManifest>`), 'extension.vsixmanifest');
  const output = createWriteStream(join(directory, 'portwise-0.1.0.vsix'));
  zip.outputStream.pipe(output); zip.end(); await finished(output);
  return createHash('sha256').update(readFileSync(join(directory, 'portwise-0.1.0.vsix'))).digest('hex');
}

describe('approved artifact publication boundary', () => {
  it('requires an existing production environment with an actual required reviewer', () => {
    const environment = { name: 'marketplace-production', protection_rules: [{ type: 'required_reviewers', reviewers: [{ type: 'User', reviewer: { id: 123 } }] }] };
    expect(() => validateEnvironment(environment)).not.toThrow();
    for (const invalid of [undefined, {}, { ...environment, name: 'other' }, { ...environment, protection_rules: [] }, { ...environment, protection_rules: [{ type: 'required_reviewers', reviewers: [] }] }]) {
      expect(() => validateEnvironment(invalid)).toThrow('reason=environment_review');
    }
  });

  it('accepts only the matching green main CI artifact and both platform jobs', () => {
    expect(validateSelection(input, context, workflow, run, [artifact], jobs)).toBe(54321);
  });

  it.each([
    { commit: 'main' }, { commit: 'a'.repeat(39) }, { runId: '12;echo unsafe' }, { runId: '9007199254740993' },
    { artifactName: '../artifact' }, { artifactName: 'artifact\nunsafe' }, { sha256: 'b'.repeat(63) },
  ])('rejects malformed inputs without reflecting them: %j', patch => {
    expect(() => validateInputs({ ...input, ...patch }, context)).toThrow(/^Publication validation failed/);
  });

  it.each([
    { repository: 'fork/portwise' }, { ref: 'refs/heads/trial' }, { event: 'push' },
  ])('rejects a dispatch from an untrusted context: %j', patch => {
    expect(() => validateInputs(input, { ...context, ...patch })).toThrow('reason=dispatch');
  });

  it.each([
    { head_sha: 'c'.repeat(40) }, { conclusion: 'failure' }, { status: 'in_progress' }, { head_branch: 'trial' }, { event: 'pull_request' },
    { path: '.github/workflows/other.yml' }, { workflow_id: 123 }, { id: 999 },
    { repository: { id: 12, full_name: 'fork/portwise' } }, { head_repository: { id: 98, full_name: context.repository } },
  ])('rejects foreign, incomplete or mismatched runs: %j', patch => {
    expect(() => validateSelection(input, context, workflow, { ...run, ...patch }, [artifact], jobs)).toThrow(/^Publication validation failed/);
  });

  it('rejects the wrong workflow, a skipped Windows job, missing or duplicated jobs', () => {
    expect(() => validateSelection(input, context, { ...workflow, path: '.github/workflows/other.yml' }, run, [artifact], jobs)).toThrow('reason=workflow');
    for (const badJobs of [jobs.slice(0, 1), [...jobs, jobs[0]], jobs.map(job => ({ ...job, conclusion: 'skipped' }))]) {
      expect(() => validateSelection(input, context, workflow, run, [artifact], badJobs)).toThrow('reason=platform_ci');
    }
  });

  it.each([
    [], [artifact, artifact], [{ ...artifact, name: 'other' }], [{ ...artifact, expired: true }], [{ ...artifact, size_in_bytes: 30 * 1024 * 1024 }],
    [{ ...artifact, workflow_run: { ...artifact.workflow_run, id: 456 } }],
    [{ ...artifact, workflow_run: { ...artifact.workflow_run, head_sha: 'd'.repeat(40) } }],
    [{ ...artifact, workflow_run: { ...artifact.workflow_run, head_repository_id: 99 } }],
  ].map(artifacts => ({ artifacts })))('rejects missing, expired or substituted artifact metadata: %j', ({ artifacts }) => {
    expect(() => validateSelection(input, context, workflow, run, artifacts, jobs)).toThrow(/^Publication validation failed/);
  });

  it.each([{ name: 'other' }, { publisher: 'other' }, { version: '0.2.0' }, { repository: { url: 'https://example.invalid' } }])('rejects altered package identity: %j', patch => {
    expect(() => validateIdentity({ ...manifest, ...patch }, identity(), expected)).toThrow('reason=manifest_identity');
  });

  it.each([{ Id: 'other' }, { Publisher: 'other' }, { Version: '0.2.0' }])('rejects disagreement in VSIX XML identity: %j', patch => {
    expect(() => validateIdentity(manifest, identity(patch), expected)).toThrow('reason=manifest_identity');
  });

  it('reads an actual fake VSIX, checks its bytes, both manifests and returns the same file without rebuilding', async () => {
    const directory = await temporaryDirectory('portwise-publication');
    try {
      const digest = await fakeVsix(directory.path);
      const file = join(directory.path, 'portwise-0.1.0.vsix'); const before = readFileSync(file);
      const result = await verifyVsix(directory.path, digest.toUpperCase(), expected);
      expect(result).toEqual({ path: file, sha256: digest, length: before.length, version: '0.1.0' });
      expect(readFileSync(file)).toEqual(before);
      await expect(verifyVsix(directory.path, '0'.repeat(64), expected)).rejects.toThrow('reason=checksum_mismatch');
      await writeFile(join(directory.path, 'extra.txt'), 'test-credential-0000');
      await expect(verifyVsix(directory.path, digest, expected)).rejects.toThrow('reason=artifact_files');
    } finally { await directory.dispose(); }
  });

  it('rejects an actual ZIP with a substituted manifest despite a matching byte checksum', async () => {
    const directory = await temporaryDirectory('portwise-publication-wrong');
    try {
      const digest = await fakeVsix(directory.path, { publisher: 'other' });
      await expect(verifyVsix(directory.path, digest, expected)).rejects.toThrow('reason=manifest_identity');
    } finally { await directory.dispose(); }
  });

  it('rejects malformed VSIX data, directories and absent files with fixed non-sensitive messages', async () => {
    const directory = await temporaryDirectory('portwise-publication-invalid');
    try {
      const file = join(directory.path, 'portwise-0.1.0.vsix');
      await expect(verifyVsix(directory.path, input.sha256, expected)).rejects.toThrow('reason=artifact_files');
      await writeFile(file, 'test-credential-0000');
      const digest = createHash('sha256').update(readFileSync(file)).digest('hex');
      await expect(verifyVsix(directory.path, digest, expected)).rejects.toThrow('reason=manifest_unreadable');
      await mkdir(join(directory.path, 'nested'));
      await expect(verifyVsix(directory.path, digest, expected)).rejects.not.toThrow('test-credential-0000');
    } finally { await directory.dispose(); }
  });

  it('keeps dispatch-only publication gated, pinned, artifact-only and without a PAT fallback', () => {
    const source = readFileSync('.github/workflows/publish.yml', 'utf8');
    const [validation, publication] = source.split('\n  publish:\n');
    expect(validation).toBeDefined(); expect(publication).toBeDefined();
    expect(source).toContain('  workflow_dispatch:');
    expect(source).not.toMatch(/^ {2}(?:push|pull_request|workflow_run|schedule):/m);
    expect(source).toContain('permissions: {}');
    expect(source).toContain('validateEnvironment(environment)');
    expect(validation).not.toContain('id-token: write');
    expect(publication).toContain('environment: marketplace-production');
    expect(publication).toContain('id-token: write');
    expect(source.match(/id-token: write/g)).toHaveLength(1);
    expect(source).not.toMatch(/VSCE_PAT|--pat|npm run (?:build|package)|vsce package|secrets\./);
    expect(source).toContain('publish --oidc --packagePath "$VSIX_PATH"');
    expect(source.match(/run: node scripts\/publication\.mjs/g)).toHaveLength(2);
    expect(source.match(/persist-credentials: false/g)).toHaveLength(2);
    expect(source).not.toMatch(/\brun:.*\$\{\{\s*inputs\./);
    const actions = [...source.matchAll(/uses:\s*([^\s]+)\s+#\s+v[\d.]+/g)];
    expect(actions.length).toBe(7);
    for (const action of actions) expect(action[1]).toMatch(/@[a-f0-9]{40}$/);
    const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
    expect(ci).toContain('name: portwise-vsix'); expect(ci).toContain('sha256sum portwise-*.vsix');
    expect(ci).toContain("github.event_name == 'push' && github.ref == 'refs/heads/main'");
  });
});
