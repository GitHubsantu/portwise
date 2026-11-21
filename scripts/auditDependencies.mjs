import { readFile } from 'node:fs/promises';

// Read lockfile metadata only; never execute package scripts or read credentials.
const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
const manifest = JSON.parse(await readFile('package.json', 'utf8'));
const entries = Object.entries(lock.packages).filter(([path]) => path !== '');
const allowed = /^(MIT|BSD-2-Clause|BSD-3-Clause|0BSD|ISC|Apache-2\.0)$/;
const summary = ([path, pkg]) => ({ path, version: pkg.version, license: pkg.license ?? 'MISSING', dev: pkg.dev === true, optional: pkg.optional === true });
console.log(JSON.stringify({
  packageCount: entries.length,
  direct: Object.keys({ ...manifest.dependencies, ...manifest.devDependencies }).map(name => {
    const pkg = lock.packages[`node_modules/${name}`];
    return { name, ...summary([`node_modules/${name}`, pkg]) };
  }),
  runtime: entries.filter(([, pkg]) => !pkg.dev).map(summary),
  installScripts: entries.filter(([, pkg]) => pkg.hasInstallScript).map(summary),
  licenseReview: entries.filter(([, pkg]) => !allowed.test(pkg.license ?? '')).map(summary),
}, null, 2));
