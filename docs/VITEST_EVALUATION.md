# Vitest 4.x evaluation — report only

Date: 2026-11-21. Performed after README commit `982bba3` passed Ubuntu/Windows CI and the live GitHub rendering check. No package was installed, upgraded or overridden; package.json, package-lock.json, .nvmrc and CI are unchanged.

## Recommendation

Propose **exact-pinned devDependency `vitest@4.1.12`** for an approved migration trial. It is the registry's current V4-tag version, not the latest overall major. Do not upgrade automatically: tests have not run on 4.x, and a newly resolved dependency tree has not been audited or licensed. Keep vsce unchanged under the existing maintenance decision.

## Node and package evidence

| Item | Observed evidence | Implication |
| --- | --- | --- |
| Portwise | Node >=20.19.0 in package.json; .nvmrc = 22; @types/node 22; CI uses .nvmrc on both OSes | Preserve Node 20.19 support; do not silently raise the policy. |
| Installed Vitest | 3.2.7; direct range ^3.0.0 | This remains the tested version. |
| Proposed 4.1.12 | Node ^20.0.0 or ^22.0.0 or >=24.0.0; MIT; unpacked size 1,909,161 bytes; direct package has dev/build scripts, no preinstall/install/postinstall | Node 20.19 and current Node 22 CI fit the declared engines. Full transitive licence/hooks review still needed. |
| Vite | 4.1.12 permits Vite ^6/^7/^8; installed Vite is 7.3.8; current registry Vite is 8.3.8 | Vite 7.3.8/8.3.8 require Node ^20.19.0 or >=22.12.0. Early Node 22.0–22.11 is unsuitable already; this is not newly introduced by Vitest 4. |
| npm's suggested fix | Vitest 5.1.1; Node ^22.12.0 or ^24.0.0 or >=26.0.0 | It drops Node 20 and needs a separate policy decision. Do not accept an automatic major fix. |

Read-only commands: npm view vitest dist-tags; npm view vitest@4 version; npm view vitest@4.1.12 version engines dependencies peerDependencies license scripts dist.unpackedSize; npm view @vitest/mocker@4.1.12 dependencies scripts; npm view vitest@5.1.1 engines peerDependencies; npm view vite version engines; npm explain tinypool. See [official registry metadata](https://registry.npmjs.org/vitest/4.1.12).

The literal root >=20.19 range is broader than these tool engines: v4 does not admit Node 21/23, and recent Vite excludes early Node 22. Do not claim compatibility with every possible version above the minimum. An approved trial must validate the intended supported Node branches and flag any policy clarification separately; this report changes neither the engine range nor .nvmrc.

## Audit effect: evidence versus inference

The refreshed CURRENT lockfile audit still reports **2 critical + 4 moderate**, dev/CI only. Runtime-only audit reports **0 vulnerabilities**. None of these tools ships in the VSIX.

| Current entry | Proposed 4.1.12 effect |
| --- | --- |
| tinypool — critical, currently 1.1.1 via vitest only | Vitest 4 removes tinypool from its pool implementation/dependencies. This is expected to remove this path, not patch tinypool in place. |
| vitest — critical affected parent | 4.1.12 is outside the refreshed affected range ending at 4.1.10, and no longer depends on tinypool. |
| @vitest/mocker — moderate, affected through 4.1.11 in the aggregated audit | 4.1.12 pins @vitest/mocker exactly 4.1.12, beyond both reported mocker fixes. |
| glob, minimatch, @vscode/vsce — three moderate entries | A Vitest-only upgrade is not expected to clear these vsce-chain entries. No vsce upgrade is justified by this evaluation. |

npm's Bulk Advisory endpoint returned `{}` for the exact pair vitest@4.1.12 and @vitest/mocker@4.1.12. That is a two-package metadata check, **not** an audit of an installed 4.x dependency graph. Expect the Vitest-related entries to disappear, subject to actual resolution; do not promise a zero-advisory development audit.

## Migration risk and approval gate

The config uses only include and environment=node; no custom pools, browser mode or coverage provider is configured. The v4 migration guide describes a pool rewrite and changed spy restoration/mock semantics. Inspect the existing FS-module/Map spies and cleanup in fileLock, accountPrompts, fileTransactions and panelRendering tests. Preserve all 250 scenarios and assertions, including real Windows ACLs, fault injection, seeded input and child termination. Do not mask failures by disabling isolation, skipping tests or weakening lint.

If approved, change only the Vitest dev dependency/necessary lockfile subtree, inventory new licences/hooks, run npm ci --ignore-scripts, verify on supported Node/OS combinations (including the Node 20.19 floor), inspect the VSIX and compare full/runtime audits. A trial may expose additional compatibility work; this report certifies no 4.x test result. The older-major support window is not established by a dist-tag.

## Primary sources checked

- [Vitest v4 migration guide](https://v4.vitest.dev/guide/migration.html) — requirements, pool rewrite and mock changes.
- [Vitest v5 migration guide](https://vitest.dev/guide/migration/) — higher Node requirement; do not substitute it for v4 documentation.
- [Tinypool worker-options advisory](https://github.com/advisories/GHSA-5gmw-xhrv-c9v3) and [run-options advisory](https://github.com/advisories/GHSA-85c8-ppgw-ccpr).
- [Mocker traversal advisory](https://github.com/advisories/GHSA-82fw-gwwq-j7x9) and [manual-mock advisory](https://github.com/advisories/GHSA-qxg6-89mg-rqv8).
- [npm audit/Bulk Advisory documentation](https://docs.npmjs.com/cli/v11/commands/npm-audit/); public registry version manifests and current npm audit output.

The existing dev-risk acceptance remains in [DEPENDENCY_AUDIT.md](DEPENDENCY_AUDIT.md). Upgrade approval is still required.
