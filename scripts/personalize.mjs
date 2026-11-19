#!/usr/bin/env node
/**
 * Replace the placeholders in this kit with your own identity.
 *
 *   npm run personalize -- --publisher my-id --github my-user --author "Santu"
 *
 * Only touches known text files. Safe to run more than once.
 */
import { readFile, writeFile } from 'node:fs/promises';

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .reduce((acc, token, i, all) => {
      if (token.startsWith('--')) acc.push([token.slice(2), all[i + 1]]);
      return acc;
    }, []),
);

const required = ['publisher', 'github', 'author'];
const missing = required.filter((key) => !args[key] || args[key].startsWith('--'));
if (missing.length > 0) {
  console.error(`Missing: ${missing.map((m) => `--${m}`).join(', ')}`);
  console.error('Usage: npm run personalize -- --publisher <id> --github <user> --author "<Name>"');
  process.exit(1);
}

if (!/^[a-z0-9][a-z0-9-]*$/i.test(args.publisher)) {
  console.error('--publisher may only contain letters, digits and hyphens.');
  process.exit(1);
}
if (!/^[a-z0-9][a-z0-9-]*$/i.test(args.github)) {
  console.error('--github may only contain letters, digits and hyphens.');
  process.exit(1);
}

const replacements = [
  ['your-publisher-id', args.publisher],
  ['your-github-user', args.github],
  ['YOUR NAME', args.author],
];

const files = [
  'package.json',
  'README.md',
  'LICENSE',
  'CHANGELOG.md',
  'docs/BRANDING.md',
  'docs/CONTEXT.md',
];

for (const file of files) {
  let text;
  try {
    text = await readFile(file, 'utf8');
  } catch {
    continue;
  }
  let next = text;
  for (const [from, to] of replacements) next = next.split(from).join(to);
  if (next !== text) {
    await writeFile(file, next);
    console.log(`updated ${file}`);
  }
}
console.log('Done.');
