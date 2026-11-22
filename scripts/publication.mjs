// Publication validation only. This module never publishes, executes the candidate, or reads Codex files.
import { createHash } from 'node:crypto';
import { appendFile, lstat, readFile, readdir } from 'node:fs/promises';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { readVSIXPackage } from '@vscode/vsce/out/zip.js';

const repository = 'GitHubsantu/portwise';
const workflowPath = '.github/workflows/ci.yml';
const maximumVsixBytes = 25 * 1024 * 1024;

function reject(reason) {
  throw new Error(`Publication validation failed [reason=${reason}]. Check the approved CI run, artifact and checksum; publication was not attempted.`);
}

export function validateInputs(input, context) {
  if (context.repository !== repository || context.ref !== 'refs/heads/main' || context.event !== 'workflow_dispatch') reject('dispatch');
  if (!/^[a-f0-9]{40}$/.test(input.commit ?? '')) reject('commit');
  if (!/^[1-9][0-9]{0,15}$/.test(input.runId ?? '') || !Number.isSafeInteger(Number(input.runId))) reject('run_id');
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/.test(input.artifactName ?? '')) reject('artifact_name');
  if (!/^[a-fA-F0-9]{64}$/.test(input.sha256 ?? '')) reject('checksum');
}

export function validateEnvironment(environment) {
  if (environment?.name !== 'marketplace-production' || !Array.isArray(environment.protection_rules) ||
      !environment.protection_rules.some(rule => rule.type === 'required_reviewers' && Array.isArray(rule.reviewers) && rule.reviewers.some(entry => ['User', 'Team'].includes(entry.type) && Number.isSafeInteger(entry.reviewer?.id) && entry.reviewer.id > 0))) reject('environment_review');
}

export function validateSelection(input, context, workflow, run, artifacts, jobs) {
  validateInputs(input, context);
  if (!workflow || !run || !Array.isArray(artifacts) || !Array.isArray(jobs)) reject('metadata');
  if (workflow.path !== workflowPath || workflow.state !== 'active' || !Number.isSafeInteger(workflow.id) || run.workflow_id !== workflow.id) reject('workflow');
  if (run.id !== Number(input.runId) || run.repository?.full_name !== repository || run.head_repository?.full_name !== repository || !Number.isSafeInteger(run.repository.id) || run.repository.id <= 0 || run.head_repository.id !== run.repository.id) reject('repository');
  if (run.status !== 'completed' || run.conclusion !== 'success') reject('ci_not_green');
  if (run.head_sha !== input.commit || run.head_branch !== 'main' || run.event !== 'push' || run.path !== workflowPath) reject('ci_commit');
  for (const name of ['verify (ubuntu-latest)', 'verify (windows-latest)']) {
    const matches = jobs.filter(job => job.name === name);
    if (matches.length !== 1 || matches[0].status !== 'completed' || matches[0].conclusion !== 'success') reject('platform_ci');
  }
  const matches = artifacts.filter(artifact => artifact.name === input.artifactName);
  if (matches.length !== 1) reject('artifact_missing');
  const artifact = matches[0];
  const origin = artifact.workflow_run;
  if (artifact.expired !== false || !Number.isSafeInteger(artifact.id) || artifact.id <= 0 || !Number.isSafeInteger(artifact.size_in_bytes) || artifact.size_in_bytes <= 0 || artifact.size_in_bytes > maximumVsixBytes) reject('artifact_unavailable');
  if (origin?.id !== run.id || origin.head_sha !== input.commit || origin.head_branch !== 'main' || origin.repository_id !== run.repository.id || origin.head_repository_id !== run.repository.id) reject('artifact_origin');
  return artifact.id;
}

export function validateIdentity(manifest, xmlManifest, expected) {
  if (expected.name !== 'portwise' || expected.publisher !== 'santu-dev' || !/^\d+\.\d+\.\d+$/.test(expected.version)) reject('expected_identity');
  const identity = xmlManifest?.PackageManifest?.Metadata?.[0]?.Identity?.[0]?.$;
  if (manifest?.name !== expected.name || manifest.publisher !== expected.publisher || manifest.version !== expected.version ||
      identity?.Id !== expected.name || identity.Publisher !== expected.publisher || identity.Version !== expected.version ||
      manifest.repository?.url !== 'https://github.com/GitHubsantu/portwise.git') reject('manifest_identity');
}

export async function verifyVsix(directory, sha256, expected) {
  if (!/^[a-fA-F0-9]{64}$/.test(sha256 ?? '')) reject('checksum');
  // Validate the trusted manifest before using its version to construct a filename.
  if (expected.name !== 'portwise' || expected.publisher !== 'santu-dev' || !/^\d+\.\d+\.\d+$/.test(expected.version)) reject('expected_identity');
  const filename = `portwise-${expected.version}.vsix`;
  let bytes;
  const file = path.resolve(directory, filename);
  try {
    const folder = await lstat(directory);
    const entries = await readdir(directory);
    const stat = await lstat(file);
    if (!folder.isDirectory() || folder.isSymbolicLink() || entries.length !== 1 || entries[0] !== filename || !stat.isFile() || stat.isSymbolicLink() || stat.size <= 0 || stat.size > maximumVsixBytes) reject('artifact_files');
    bytes = await readFile(file);
  } catch { reject('artifact_files'); }
  const digest = createHash('sha256').update(bytes).digest('hex');
  if (digest !== sha256.toLowerCase()) reject('checksum_mismatch');
  let parsed;
  try { parsed = await readVSIXPackage(file); } catch { reject('manifest_unreadable'); }
  validateIdentity(parsed.manifest, parsed.xmlManifest, expected);
  return { path: file, sha256: digest, length: bytes.length, version: expected.version };
}

// Called in both jobs immediately after downloading the same immutable artifact ID.
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const expected = JSON.parse(await readFile('package.json', 'utf8'));
    const result = await verifyVsix(process.env.VSIX_DIRECTORY, process.env.APPROVED_SHA256, expected);
    if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `vsix_path=${result.path}\n`);
    console.log(`Verified santu-dev.portwise ${result.version}: ${result.length} bytes; SHA256 ${result.sha256}`);
  } catch {
    console.error('Publication artifact verification failed. Check the approved CI artifact, SHA256 and manifest identity/version; publication was not attempted.');
    process.exitCode = 1;
  }
}
