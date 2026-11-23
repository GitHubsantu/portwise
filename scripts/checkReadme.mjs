// Optional documentation check; --online checks only the explicitly requested badge URLs.
import assert from 'node:assert/strict';
import { readFile, access, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { URL } from 'node:url';
import { marked } from 'marked'; // Already installed by the exact-pinned VSIX development toolchain.

const manifest = JSON.parse(await readFile('package.json', 'utf8'));
const readme = await readFile('README.md', 'utf8');
const documents = ['README.md', 'docs/RELEASE_NOTES.md', 'docs/images/panel.md', 'docs/images/diagnostics.md'];
const badgeUrls = new Set(); let localLinks = 0;
const slug = value => value.toLowerCase().replace(/[^\p{L}\p{N}_\-\s]/gu, '').replace(/\s/g, '-');
function anchors(source) {
  const names = new Set();
  marked.walkTokens(marked.lexer(source), token => { if (token.type === 'heading') names.add(slug(token.text)); });
  for (const match of source.matchAll(/<h[1-6]\b[^>]*>([^<]+)<\/h[1-6]>/g)) names.add(slug(match[1]));
  return names;
}
function references(tokens) {
  const result = [];
  marked.walkTokens(tokens, token => {
    if (token.type === 'link' || token.type === 'image') result.push(token.href);
    if (token.type === 'html') for (const match of token.text.matchAll(/(?:href|src)="([^"]+)"/g)) result.push(match[1].replaceAll('&amp;', '&'));
  });
  return result;
}
for (const file of documents) {
  const source = await readFile(file, 'utf8');
  for (const target of references(marked.lexer(source))) {
    assert.equal(typeof target, 'string');
    if (/^https:\/\//.test(target)) { if (new URL(target).hostname === 'img.shields.io') badgeUrls.add(target); continue; }
    assert(!/^[a-z][a-z0-9+.-]*:/i.test(target), `Unexpected link scheme: ${target}`);
    const [relative, fragment] = target.split('#'); const resolved = relative ? path.resolve(path.dirname(file), decodeURIComponent(relative)) : path.resolve(file);
    assert(resolved.startsWith(path.resolve('.') + path.sep), `Link escapes repository: ${target}`);
    await access(resolved); localLinks++;
    if (fragment) assert(anchors(await readFile(resolved, 'utf8')).has(decodeURIComponent(fragment)), `Missing anchor: ${file} -> ${target}`);
  }
}
for (const command of manifest.contributes.commands) assert(readme.includes(`| ${command.category}: ${command.title} | \`${command.command}\` |`), `Missing or renamed command ${command.command}`);
for (const [name, setting] of Object.entries(manifest.contributes.configuration.properties)) assert(readme.includes(`| \`${name}\` | \`${JSON.stringify(setting.default)}\` |`), `Wrong default for ${name}`);
assert(readme.includes('| Copy redacted report | Notification action; no command ID |'));
assert((await readFile('src/extension.ts', 'utf8')).includes("'Copy redacted report'"));
const marketplace = 'https://marketplace.visualstudio.com/items?itemName=santu-dev.portwise';
assert(readme.includes(marketplace)); assert(readme.includes('code --install-extension santu-dev.portwise'));
assert(readme.includes('Install from VSIX')); assert(readme.includes(`portwise-${manifest.version}.vsix`));
assert(!readme.includes('Marketplace: not published yet')); assert(!readme.includes('Marketplace installation is pending'));
assert.equal(badgeUrls.size, 5);
assert(!readme.match(/shields\.io\/(?:visual-studio-marketplace|vscode-marketplace)/), 'Direct Marketplace badge routes are retired.');
for (const type of ['version-short', 'installs']) {
  assert([...badgeUrls].some(value => {
    const badge = new URL(value);
    return badge.pathname === '/badge/dynamic/regex' && badge.searchParams.get('url') === `https://vsmarketplacebadges.dev/${type}/santu-dev.portwise.svg` && badge.searchParams.get('replace') === '$1';
  }), `Missing live Marketplace ${type} badge.`);
}
for (const url of badgeUrls) assert.equal(new URL(url).searchParams.get('style'), 'flat-square');
const diagrams = marked.lexer(readme).filter(token => token.type === 'code' && token.lang === 'mermaid');
assert.equal(diagrams.length, 1); assert(diagrams[0].text.startsWith('flowchart LR\n'));
assert(diagrams[0].text.includes('127.0.0.1:47831')); assert.equal((diagrams[0].text.match(/-->/g) ?? []).length, 2);
for (const kind of ['NOTE', 'IMPORTANT', 'WARNING']) assert(readme.includes(`> [!${kind}]\n> `));
assert.equal((readme.match(/<details>/g) ?? []).length, (readme.match(/<\/details>/g) ?? []).length);
console.log(`README: ${localLinks} local links/anchors, ${manifest.contributes.commands.length} commands, 4 settings/defaults, ${badgeUrls.size} badges, install routes, Mermaid fence and alert syntax checked.`);
if (process.argv.includes('--online')) {
  const results = await Promise.allSettled([...badgeUrls].map(async url => {
    const response = await globalThis.fetch(url, { signal: globalThis.AbortSignal.timeout(20_000) }); const svg = await response.text();
    assert.equal(response.status, 200); assert(svg.includes('<svg')); assert(!/(?:retired badge|not found|invalid|inaccessible|unavailable|unknown|error)/i.test(svg.match(/aria-label="([^"]+)"/)?.[1] ?? ''), `Badge reports an error: ${url}`);
    console.log(`Badge OK: ${new URL(url).pathname}`);
  }));
  for (const result of results) if (result.status === 'rejected') throw result.reason;
}
if (process.argv.includes('--render-request')) {
  const directory = await mkdtemp(path.join(tmpdir(), 'portwise-readme-review-'));
  await writeFile(path.join(directory, 'request.json'), JSON.stringify({ text: readme, mode: 'gfm', context: 'GitHubsantu/portwise' }));
  console.log(`GitHub render request: ${path.join(directory, 'request.json')}`);
}
