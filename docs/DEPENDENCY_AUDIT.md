# Phase 8 dependency audit

Date: 2026-11-21. Scope: the committed lockfile, including development and optional platform packages. This is an inventory and findings report, not a licence exception or a dependency upgrade approval. Reproduce the metadata inventory from the repository root with `node scripts/auditDependencies.mjs`.

## Approved maintenance disposition (2026-11-21)

### 0.1.0 decision: defer Vitest upgrade (2026-11-22)

The user accepted the Vitest 4.1.12 trial as evidence, **not for adoption in 0.1.0**. Keep `trial/vitest-4.1.12` local at `2c65e86`, unmerged and unpushed. Main retains Vitest 3.2.7, the existing lockfile and the previously accepted development-only audit risk. No dependency, Node-policy or licence-policy change is made here.

The candidate's Windows Node 22 verification passed 250 tests; Node 20.19 passed 249 with one Windows open-file replacement fixture failure. Its full audit reported zero critical/high and three moderate vsce-chain entries, with runtime audit clean. These are candidate results only; they do not clear the main baseline's two critical/four moderate development entries recorded below. The candidate also introduced MPL-2.0 dev-only Lightning CSS packages; that exception remains unapproved.

Post-release adoption must address all four open items:

1. Fix the Windows Node 20 fixture while preserving assertions, or formally raise the Node policy to 22 (existing Azure dev-tool engine constraints also need consideration).
2. Obtain explicit approval for the MPL-2.0 development-only Lightning CSS licence exception, including platform packages.
3. Run cross-platform CI on the candidate branch; only local Windows evidence exists so far.
4. Resolve the Vite config-format warning without suppression.

This supersedes the earlier proposal to migrate during Phase 8. The accepted report-only evaluation below remains historical context. The separate local trial report is available with `git show trial/vitest-4.1.12:docs/VITEST_TRIAL.md`; it is deliberately not merged into main. No automatic audit fix or vsce change is authorized.

**Last maintenance evaluation completed, report only:** [VITEST_EVALUATION.md](VITEST_EVALUATION.md) assesses exact Vitest 4.1.12 after the README CI gate. Current full/runtime audits remain 2 critical + 4 moderate / zero respectively. No dependency, lockfile or Node-policy change; a candidate upgrade is not approved or tested by that report.

The user accepted the dev-only audit risk as non-blocking for release while runtime audit remains clean. Do not change dependencies in the security batches. Evaluate Vitest 4.x versus the Node policy as the LAST Phase 8 maintenance item, after security fixes; leave vsce unchanged unless an upgrade demonstrably clears its audit findings. No automatic `audit fix` is authorized.

Reviewed exceptions approved for development/CI use only, with no redistribution in the VSIX: BlueOak-1.0.0 packages/variants listed below; Artistic-2.0 packages; Python-2.0 and PSF-2.0 argparse variants; CC-BY-3.0 spdx-exceptions (preserve its notices/attribution in development distributions); CC0-1.0 spdx-license-ids; pako's MIT AND Zlib terms; and Microsoft vsce-sign and its platform binaries solely for the permitted Visual Studio development/testing use. These are scoped exceptions, not a reclassification as MIT or permission to distribute the Microsoft signing binaries.

@azu/style-format's WTFPL parent chain is documented as an existing dev-only exception: replacing it requires changes through vsce/secretlint/textlint, rather than a trivial direct-package removal. Revisit when a compatible parent upgrade is justified. OR expressions offering MIT/BSD/Apache are used under an allowed alternative. Preserve upstream licence notices in the installed development tree.

Declared-but-disabled dev installation hooks are approved for the existing packages listed below; `npm ci --ignore-scripts` remains mandatory. This supersedes the earlier unresolved-policy disposition below, without clearing advisories or permitting hooks to execute. The runtime dependency policy is unchanged.

## Runtime and direct dependencies

The lockfile contains 542 dependency entries (including platform variants); Windows `npm ci --ignore-scripts` installed 459 packages. `toml@5.0.1` is the sole runtime dependency, exact-pinned, MIT, with no runtime dependencies or installation hooks. It is bundled by esbuild. Its existing approval, purpose, alternatives and maintenance record remain in D-8 and the dependency log.

| Direct development dependency | Locked version | Licence | Purpose |
|---|---|---|---|
| @eslint/js | 10.0.1 | MIT | JavaScript lint rules |
| @types/node | 22.20.5 | MIT | Node API types |
| @types/vscode | 1.106.1 | MIT | Target engine API types |
| @vscode/test-electron | 2.5.2 | MIT | Separate Extension Development Host tests |
| @vscode/vsce | 3.9.2 | MIT | VSIX packaging and package-list checks |
| esbuild | 0.25.12 | MIT | Bundle extension, daemon and webview |
| eslint | 10.15.0 | MIT | Lint gate |
| typescript | 5.9.3 | Apache-2.0 | Strict typechecking |
| typescript-eslint | 8.73.0 | MIT | TypeScript lint rules |
| vitest | 3.2.7 | MIT | Unit and fake-upstream integration tests |

All direct licences fit RULES.md. This does not establish compliance of their transitive dependencies. No dependency or lockfile change was made in this audit.

## Findings requiring review before release

1. **Critical, development only:** npm reports `tinypool` prototype-pollution/RCE advisories GHSA-5gmw-xhrv-c9v3 and GHSA-85c8-ppgw-ccpr, inherited by `vitest`. These are two critical package entries, not proof of two reachable Portwise exploits. The reported upgrade path changes the Vitest major; do not run `npm audit fix --force`. Assess reachability and propose a compatible upgrade in the findings-only security review.
2. **Moderate, development only:** four package entries (`@vitest/mocker`, `glob`, `minimatch`, and `@vscode/vsce` as an affected parent). Vitest also inherits moderate advisories but npm counts each package by its highest severity. Advisories: GHSA-82fw-gwwq-j7x9, GHSA-qxg6-89mg-rqv8, GHSA-3g3m-2fjr-6pw4 and GHSA-g3hv-75wg-m249. Full audit totals: **2 critical, 4 moderate, 0 high**. Runtime-only audit: **0 vulnerabilities**. Existing CI gates runtime dependencies only; green CI does not clear development advisories.
3. **Licence policy conflict, development only:** single-licence transitive packages include BlueOak-1.0.0 (glob/minimatch/minipass/path-scurry/lru-cache/graceful-fs/sax and variants), WTFPL (@azu/style-format), Artistic-2.0 (binaryextensions/editions/istextorbinary/textextensions/version-range), Python-2.0/PSF-2.0 (argparse variants), CC-BY-3.0 (spdx-exceptions), and CC0-1.0 (spdx-license-ids). These are outside the MIT/BSD/ISC/Apache-2.0 allow-list. `@vscode/vsce-sign@2.1.1` and its optional binary variants use separate Microsoft terms; the installed LICENSE.txt confirms restricted use with Visual Studio products/services and redistribution restrictions, rather than MIT. These require an explicit policy decision or replacements; this report grants no exception. Multi-licence OR expressions that offer MIT/BSD/Apache have an allowed choice (jszip, type-fest, expand-template, rc); pako's MIT AND Zlib expression needs separate review. The inventory deliberately flags all compound expressions for review rather than parsing SPDX expressions itself.
4. **Installation hooks, development only:** lock metadata flags @vscode/vsce-sign@2.1.1, esbuild@0.25.12, vite's esbuild@0.28.2, optional fsevents@2.3.3 and optional keytar@7.9.0. They predate this audit. `npm ci --ignore-scripts` succeeds with hooks disabled; this does not satisfy a literal claim that no dependency declares hooks. Keep hooks disabled and resolve the existing policy conflict before release.
5. **Maintenance warnings:** installation reports deprecated whatwg-encoding@3.1.1, prebuild-install@7.1.3 and @secretlint/secretlint-rule-preset-recommend@10.2.2. Evaluate with the parent-tool upgrade proposals; no automatic update was applied.

Evidence: package-lock.json integrity/version/licence/hasInstallScript metadata, installed toml/package.json and @vscode/vsce-sign/LICENSE.txt, `npm ci --ignore-scripts`, `npm audit --json` (nonzero), and `npm audit --omit=dev --json` (zero). Advisory pages are linked from npm's report under https://github.com/advisories/. This is an automated advisory/metadata inventory, not a completed adversarial security review or legal determination.
