# Delivery Plan

**T9 browser acceptance (2026-11-23): CLOSED pending second-PC recheck.** Owner reports `santu-dev` ownership/MFA on; GitHub `marketplace-production` required reviewer `GitHubsantu`, prevent self-review off (sole owner), admin bypass OFF, deployment branches limited to `main`, and no secrets/variables. Marketplace policy **Portwise release** is **Active** for `GitHubsantu/portwise`, `publish.yml`, `marketplace-production`, last used **never**. This supersedes historical T9-browser-open statements. Actual OIDC exchange/publication is not claimed or authorized; accepted T4/T7/T12/T13 limits remain unchanged.

**Pinned artifact and pending check:** Owner verified the dev-PC download from green Ubuntu/Windows CI [45112267614](https://github.com/GitHubsantu/portwise/actions/runs/45112267614), source `e579bfe384f0fa787c5d6750a3d3dbe05ec975ba`, artifact `portwise-vsix`, VSIX 82556 bytes, SHA256 `A3E5D5CC70703B9B236917A984E11277948AA4594D02863B74276E0B18A2B9ED`. Second-PC recheck remains pending on these exact bytes. Record only in SECURITY_REVIEW.md, TRUSTED_PUBLISHING.md, PLAN.md and PRE_PUBLISH_CHECKLIST.md, all excluded by .vscodeignore. Per the owner's latest instruction, leave packaged README/CHANGELOG unchanged. Verify/CI rebuilds may have different ZIP checksums; do not silently replace the approved artifact or infer approval for new bytes. No code/workflow/dependency change, dispatch, publish, tag, release or real Codex-home access.

**Browser-record local verification:** Node 22.23.5 `npm run verify` exited 0: 50 files, 496 tests passed, zero skips; typecheck/lint/build and warning-free 17-file VSIX packaging passed. The before/after local VSIX comparison found zero changed payload files and no docs entries; the original approved CI download still hashes to A3E5D5CC70703B9B236917A984E11277948AA4594D02863B74276E0B18A2B9ED. The local rebuild's ZIP checksum differs despite identical payloads and is not selected/approved. README checks and syntax-only parsing of four copy-only PowerShell blocks passed; no checklist commands were executed. Fresh docs-commit CI is verification evidence only, not replacement-artifact approval.

**Manual publication workflow preparation (2026-11-23):** Tool-change commit 4987a3b passed local verify (453 tests) and Ubuntu/Windows CI 45061368792 before this work. Add dispatch-only publish.yml with approved SHA/run/artifact/checksum inputs, required-reviewer preflight, same-repository main CI/two-platform/artifact provenance checks, immutable artifact download and JSON/XML identity verification in both jobs. OIDC permission exists only on the marketplace-production job; no rebuild or PAT fallback. Main CI records the VSIX SHA256 and retains the named portwise-vsix artifact for 30 days. D-50 and TRUSTED_PUBLISHING.md describe setup, full action pins and evidence limits. No dispatch, publish, tag, release or real Codex-home access. T9 trust/environment setup and release approval remain open; local verification/CI results follow in the report.

**Workflow local verification:** Node 22.23.5 `npm run verify` exited 0: 50 files, 495 tests passed (42 new publication regressions), zero skips; typecheck/lint/build and warning-free 17-file VSIX packaging passed. An earlier full attempt hit the existing 50 ms slow-body ownership fixture before its body phase (unverified vs response-unavailable classification); its four focused cases and complete full rerun passed with all assertions, deadlines and production code unchanged. This is recorded as an observed timing-sensitive fixture, not a gateway fix. README link/command/default checks and secret-pattern scan passed. Read-only validation against actual green CI 45061368792 accepted artifact 14769671513; no workflow dispatch or OIDC exchange was performed. Final main CI and its artifact checksum are reported after push.

**Cross-platform workflow-test correction:** CI 45062838278 on 90ecb10 passed Ubuntu and failed one Windows assertion because its workflow-job split assumed LF while checkout produced CRLF. Normalize line endings for the structural check and run every original gate/pin/artifact/no-PAT assertion against both explicit LF and CRLF inputs. No workflow or application behavior changes, dropped assertions, dependency changes or publishing dispatch. Record this as a separate corrective commit rather than rewriting pushed history. Its full verification and both-platform CI must pass before reporting a releasable CI artifact.

**Correction local verification:** Node 22.23.5 `npm run verify` exited 0: 50 test files, 496 tests passed (43 publication regressions), zero skips; typecheck/lint/build and warning-free 17-file packaging passed. README checks and diff whitespace check passed. Publication is still unrun; only the final successful main CI artifact and its independently measured VSIX checksum should be considered for later approval.

**Existing activation-fixture race:** Ubuntu CI 45111781023 on d6e66e8 passed the newline/publication cases but exposed the pre-existing extension-wiring test's race: activation ran in the describe body, so its read-only probe could reach Stopped before the sixth test asserted Checking. Hold the probe through a controllable mocked GatewayController.statusView promise, retain all Checking/accessibility/command assertions, then release it and additionally assert Stopped/accessibility/unchanged panel command. This wiring fixture performs no gateway/file I/O; real owned/stopped/unverified probes retain the existing integration coverage. No application or workflow change and no weakened/skipped assertion. Full verify and fresh both-platform CI remain required.

**Activation-fixture local verification:** The focused extension/publication suites passed 51 tests. Full Node 22.23.5 `npm run verify` then exited 0: 50 files, 496 tests, zero skips; typecheck/lint/build and warning-free 17-file VSIX packaging passed. Windows had already passed on d6e66e8; a fresh final main CI run must still pass both platforms. No publication workflow dispatch or real Codex-home access.

**Trusted Publishing preparation (2026-11-23):** Docs-only policy commit 4240493 passed verify (453 tests) and Ubuntu/Windows CI 45060430856. The separately evaluated and approved exact development pin @vscode/vsce 4.1.0 requires Node 22 for builds, matching .nvmrc and both CI platforms; runtime engines.node remains unchanged. Isolated install with scripts disabled and packaging passed, retaining 17 VSIX entries and identical runtime JavaScript. No new hooks or licence exceptions; runtime audit zero, full dev audit reduced to 2 critical/3 moderate. See D-49 and DEPENDENCY_AUDIT.md. Publication workflow preparation follows only after this tool-change commit has green CI; no publish, tag or release is authorized.

**Packaging-tool local verification:** Node 22.23.5 `npm run verify` exited 0 with 453/453 tests in 49 files, zero skips, successful typecheck/lint/build and warning-free 17-file packaging. The optional README checker was adapted from removed transitive markdown-it to the new toolchain's existing marked parser; its 30 local links, 15 commands, four settings, three badges and diagram/alert assertions pass, as does its ESLint check. No extra dependency, licence exception or runtime behavior change. CI must pass both platforms before the workflow commit starts.

Status legend: ⬜ not started · 🟨 in progress · ✅ done. Update this table as you go. One phase at a time. Each phase ends with a PHASE REPORT (see `docs/PROMPT.md` §7).

| Phase | Name | Status |
|---|---|---|
| 0 | Research and decisions | ✅ |
| 1 | Foundation hardening | ✅ |
| 2 | Storage and provider profiles | ✅ |
| 3 | Gateway daemon | ✅ |
| 4 | Lifecycle, config sync, diagnostics | ✅ |
| 5 | Account profiles | ✅ |
| 6 | Usage limits (conditional) | ⬜ |
| 7 | UX polish and accessibility (7b–7h included) | ✅ |
| 8 | Hardening and release | 🟨 Review closed with accepted limits; T9 browser gates closed pending second-PC recheck; publication not authorized |

The scaffold already provides: build, typecheck, lint, 19 tests, VSIX packaging, CI, a validated webview shell, redaction and path utilities.

---

## Phase 0 — Research and decisions (no feature code)

**Goal:** replace every `UNVERIFIED` assumption with a sourced decision.
**Deliverables:** `docs/DECISIONS.md` with one entry per question in `docs/PROMPT.md` §4 (source URL, date, decision, fallback). Optional throwaway spikes under `spikes/` (not shipped).
**Acceptance:**
- [ ] All six questions answered or explicitly marked UNVERIFIED with a safe fallback
- [ ] Credential-delivery method chosen (GW-10) with rationale and rejected alternatives
- [ ] Config-sync strategy chosen (ARCHITECTURE §9); dependency log entry if a TOML library is proposed
- [ ] Usage-limits feasibility decided (USG-1)
- [ ] Default port confirmed free on the author's machine (`netstat`), or changed

## Phase 1 — Foundation hardening

**Deliverables:** `core/atomicWrite.ts`, `core/fileLock.ts`, `core/errors.ts`, `core/urlValidate.ts`; temp-Codex-home test helper; manifest test that all `portwise.*` settings are machine-scoped; CSP string test; VS Code integration smoke test (`@vscode/test-electron`, approved dependency) running in CI on Linux; CI also on Windows.
**Acceptance:**
- [ ] `npm run verify` green on Windows and Linux CI
- [ ] Fault-injection tests prove atomic write rolls back (T7)
- [ ] Symlink and `..` tests pass (T6)
- [ ] Integration smoke test activates the extension and finds all contributed commands

## Phase 2 — Storage and provider profiles

**Deliverables:** `profiles/` (ProfileStore on `globalState` + `SecretStorage`), provider add/edit/delete/enable, URL validation (PRV-2), masked display, **Test connection** (PRV-4, against a fake server in tests), webview list UI.
**Acceptance:**
- [ ] PRV-1..PRV-4 covered by tests
- [ ] Storage audit test: no secret in `globalState`, logs, or the webview message stream (T3, T4, T14)
- [ ] Manual: add, edit, test, delete a provider in the Extension Development Host

## Phase 3 — Gateway daemon

**Deliverables:** `gateway/daemon/` built to `dist/gateway.js`; loopback listener, Host/Origin checks, local-token auth, `/healthz`, `/v1/**` streaming proxy, error taxonomy, body/time limits, control API, secrets over stdin; fake-upstream integration tests.
**Acceptance:**
- [ ] GW-1, GW-5..GW-8 covered; scenarios 4, 5, 6, 7 from `docs/SPEC.md` §5 automated
- [ ] Slow-client and oversized-header tests pass (T12)
- [ ] Redirect and absolute-URI tests pass (T8)
- [ ] Daemon never exits on malformed input (NFR-5): fuzz a few hundred random requests

**Manual smoke substitution:** Phase 3 is covered by the automated loopback gateway integration suite because the lifecycle controller that can start the detached daemon arrives in Phase 4. The suite covers gateway start, health, authenticated control paths, proxying, shutdown, and security-negative cases without using a real provider.

## Phase 4 — Lifecycle, config sync, diagnostics

**Deliverables:** `gateway/controller.ts` (spawn detached, adopt, restart, stop, state file), `sync/` (managed-entry edit, backup, restore, credential delivery per Phase 0), `diagnostics/` + command, status-bar item, Start/Stop/Restart commands.
**Acceptance:**
- [ ] Scenarios 1, 2, 3, 8 automated; scenario 9 (secret hygiene) automated
- [ ] Killing the daemon with `taskkill /F` (or `kill -9`) self-heals on next activation
- [ ] Diagnostics pinpoints each deliberately broken condition (stale port, wrong token, config drift, upstream down)
- [ ] Sync restore returns byte-identical original config

**Completed 2026-11-20:** lifecycle, managed-block config sync, `.env` credential delivery, diagnostics, commands, status bar, and their temporary-directory tests are implemented. Gateway activation and Start Gateway never write Codex files; a path-specific explicit confirmation is required by Configure Codex for Gateway before any `config.toml` or `.env` modification. Manual F5 passed against `E:\portwise-test-codex`: Start and cancel wrote nothing; Configure wrote only the test home; a changed path re-prompted; Switch changed exactly `model_provider`; Restore preserved an external edit and a second restore undid the first. Hashes of the real `config.toml` and `.env` stayed unchanged. CI #21 is green. No automated test or script touches `~/.codex`.

**Current consent policy (2026-11-21, updated D-12):** Confirmation before every config/.env write operation, showing its exact canonical target. Configure receives one approval for its two-file operation; Restore and provider-switch each have a fresh exact-path confirmation. Old stored config consent is ignored. Account/login consent remains unchanged. Repeated identical Configure asks but does not replace files, change LastWriteTime or create backups.

## Phase 5 — Account profiles

**Deliverables:** account list, add via the official flow (Phase 0), atomic switch with lock + backup + rollback, restart-extension-host prompt, remove with confirmation, snapshots in `SecretStorage`.
**Acceptance:**
- [ ] ACC-1..ACC-5 covered; fault-injection proves rollback on every step failure
- [ ] No plaintext snapshot anywhere except the active credential file
- [ ] Conversation history untouched (test asserts untouched files)

**Completed 2026-11-20:** F5 validation passed against `E:\portwise-test-codex3` using only a fake `auth.json`: account snapshots stayed in SecretStorage, switching showed the exact-home confirmation and restart message, removal left `auth.json` intact, and `config.toml`, `.env`, history, and session hashes stayed unchanged. Keyring-mode refusal left `auth.json` unchanged. Hashes of the real `~/.codex` stayed unchanged throughout. Each snapshot intentionally requires a fresh **Add Account via Codex Login** launch; this prevents saving arbitrary credentials outside the official-flow handoff. The real `codex login` completion flow was not tested by design; source and regression test verify its launcher is exactly `codex login` with no supplied credentials or extra arguments. **Test safety:** disable the Codex panel when using a fake `auth.json`, because Codex itself may alter invalid credentials. Known lifecycle limitation recorded below: an orphaned daemon with no matching state is safely reported as a port conflict rather than adopted or killed.

**Known lifecycle observation:** If an extension-host restart loses its matching gateway state while a detached Portwise daemon remains on port 47831, the controller deliberately refuses adoption because it cannot meet the required instance-id match. It reports a port conflict and does not kill the process. This is not changed in Phase 5; a future lifecycle change would need an explicit safe recovery action.

## Phase 6 — Usage limits (only if Phase 0 allows)

**Deliverables:** USG-2 implementation using the documented source, lazy and rate-limited; or a short note in README that the feature is intentionally absent.
**Acceptance:**
- [ ] No undocumented endpoint is called
- [ ] Offline and error states are quiet and clear

## Phase 7 — UX polish and accessibility

**Deliverables:** UX-1..UX-6 complete, walkthrough ("Get started" in the Welcome page), empty and error states, keyboard and screen-reader pass, high-contrast check, strings module.
**Acceptance:**
- [x] Every action reachable by keyboard; axe-style manual checklist passed
- [x] Every error follows UX-3 (what / which hop / fix button)

**Completed 2026-11-21:** Phase 7 including 7b–7h passed the complete F5 matrix on `E:\portwise-test-codex3`. This closes Phase 7 only; Phase 8 release acceptance, including its separate real-account `codex login` pre-release check (D-17), remains open.

**Final F5 acceptance — `3e53b3d`, T1–T10 (2026-11-21):**

- [x] Legacy-lock Cancel/Confirm on Switch, Save Current and Remove; restart-notification reload; and Escape/Cancel paths.
- [x] A second Save was refused by the single-use login permit with one toast only.
- [x] Gateway stop/start and Configure Codex Home cancellation.
- [x] Keyring mode refused Switch with one toast, with no Current label or matching note.
- [x] Long/XSS-like name rendering was covered by V5; the empty state and Add provider cancellation passed.
- [x] Test-home `config.toml`, history and `.env` hashes matched their baseline; the user reports real `~/.codex/config.toml` and `.env` hashes unchanged, real `auth.json` Length 4129 and LastWriteTime `21-11-2026 04:41:09` unchanged, and no stale `.portwise` lock. No real credential contents were inspected by the agent.

**Earlier functional F5 retest — `2e65865`, `E:\portwise-test-codex3` (2026-11-21); T1/T4/T5 now require re-confirmation:**

- [x] Current label: 0 matches, exactly 1 match, and 2+ identical matches handled correctly; ambiguous matches do not guess an account.
- [x] Legacy lock recovery on Switch, Save Current and Remove.
- [x] Reload while the restart notification is open, followed by another switch.
- [x] Escape/Cancel paths.
- [x] User reports real `~/.codex` hashes and `auth.json` Length/LastWriteTime unchanged throughout the retest. No real credential inspection was performed by the agent.
- [ ] F5 T6–T10: not yet reported as verified. These are the user's manual-check identifiers, not the security threat IDs in `docs/SECURITY.md`; their precise numbered descriptions are not recorded in this repository.

**Earlier confirmed F5 evidence:** The three walkthrough links worked; Configure ticked its walkthrough step; test-home config/history/.env and real-home hashes were unchanged. Keyboard-only provider add/disable/delete passed before the final redesign. Dark-theme final layout, Activity strip, gateway stop/start badge, hover feedback, disabled Start reason and secondary Stop passed. Configure Codex Home was cancelled with hashes unchanged. Gateway/Accounts/Provider sections and fake-account names appeared correctly.

**Manual scope closed:** T1–T10 are now accepted. The bce76c7 visual pass covers final-layout light/High Contrast, narrow and wide placement, long/XSS-like names and keyboard focus. The `3e53b3d` retest adds the remaining functional checks, including keyring-mode and empty-state behavior. Use fake accounts in `E:\portwise-test-codex3` with the Codex panel disabled for any future regression testing. Real-account login completion remains the separate Phase 8 pre-release check (D-17).

**Completed implementation:** Minimal divider-based rows and Activity strip; themed/accessible controls; existing-command Gateway and Accounts sections; consistent Portwise naming/status-bar entry point; host-only current-account matching and ambiguity handling; shared exact-path legacy recovery and silent cancellation; lock release before restart notification; single-use login permit consumed under the operation lock. Account payloads contain only id/name/isCurrent plus a non-secret availability flag. No credentials, snapshots or hashes are sent to the panel.

**Automated evidence:** Full verification passed after lock recovery (114 tests), permits (120), discoverability (123), initial matcher/termination work (138), F5 regression fixes (27 files, 169 tests), and responsive completion (28 files, 176 tests). Each passed typecheck, lint, production build and VSIX packaging. Tests include a real child-host termination fixture, command-palette/panel confirm/cancel/live-lock matrix, concurrent Save calls, 0/1/2+ matches, unsupported-store no-read checks and actual outgoing payload hygiene. Tests/scripts use temporary homes only.

### Icon packaging follow-up

**Icon packaging follow-up (2026-11-21):** Preserve all original artwork: activity.svg (420 bytes, 24×24, viewBox 0 0 24 24, currentColor), icon.svg (741 bytes, 256×256, viewBox 0 0 256 256, fixed brand colours), and icon.png (12,931 bytes, 256×256). The existing view-container reference already uses the monochrome activity.svg; the status-bar codicon and sidebar location remain unchanged. ImageMagick 7.1.2-27 generated a new images/icon-128.png (5,026 bytes, 128×128 RGBA) from icon.svg; package.json references the new PNG. Tests check referenced paths, PNG dimensions, real VSIX ignore processing and negative icon exclusion in a temporary package. No dependency was added. Phase 7 F5 T6–T10 remain OPEN.

**Icon verification:** `npm.cmd run verify` passed: 28 files, 172 tests, typecheck, lint, production build and VSIX packaging. Packaging includes both referenced icons and all preserved originals. This does not close any F5 T6–T10 item.

### Activity Bar discovery correction

**Activity Bar discovery correction (2026-11-21):** User F5 on 6737374 found no Activity Bar entry. The container had been contributed only to secondarySidebar; the icon path and portwise.panel registration were correct. activity.svg parses as XML and renders non-empty pixels at 24×24 (ImageMagick alpha coverage 0.204534, max alpha 1), with fill=none and stroke=currentColor and no fixed colours. Move the same single container to activitybar; keep ids, original artwork, status-bar codicon and command behavior unchanged. A regression test enforces exactly one Activity Bar location linked to the registered view, alongside existing icon packaging checks. Manual icon retest and F5 T6–T10 remain open.

**Activity Bar validation update:** User F5 on 462bd96 confirms the Activity Bar icon now appears. Its local verify run passed 173 tests. This closes the icon-visibility retest, not F5 T6–T10.

### Responsive panel layout

**Responsive panel implementation (2026-11-21):** User confirmed the Activity Bar icon appears on 462bd96. Narrow-width wrapping is addressed with uniform section headers, full-width Add actions, account rows and a grouped global-command fallback, equal secondary grid tracks, and separate destructive slots. Provider/account names remain literal text with full-name titles; provider labels may be short visually but retain their full accessible names. Account commands still take no webview arguments; provider payloads and all keyboard ordering are preserved. No protocol or runtime behavior changes are made. scripts/checkPanelLayout.mjs passed 20 real headless Chrome geometry cases across 220/300/400/600/900px and four synthetic themes, with no horizontal overflow, equal secondary tracks, minimum target height 32.9px, ellipsis/title, right-aligned Current and focus outlines.

**User F5 visual pass — bce76c7, V1–V5 (2026-11-21):** Normal width, 220px width, secondary sidebar at 600px+, long/XSS-like names, keyboard focus, light theme and High Contrast passed in the Extension Development Host. User reports real `~/.codex` hashes and `auth.json` unchanged; no agent inspection of real credentials was performed. The user now authorizes pushing both 462bd96 (Activity Bar placement) and bce76c7 (responsive layout), with this documentation record. This closes the visual acceptance gate for pushing these changes, not T1/T4/T5 re-confirmation or T6–T10.

**Responsive verification:** `npm.cmd run verify` exited 0 with 28 test files and 176 tests; typecheck, lint, production build and VSIX packaging passed. All 20 browser geometry cases passed separately. The final F5 acceptance above closes the functional checks.

## Phase 8 — Hardening and release

**Dev-PC reload recheck (2026-11-23), user-reported PASS:** `be64c4a363485e53bb947bc03b747717d1fec30d`, VSIX SHA256 `DF5859E00091C28C1BC22543D560AD7D72692871373708F35369ADFC18050C4E` verified, isolated profile, port 47834. After Reload Window with the owned daemon running and autoStartGateway off, panel and status bar both showed Running on port 47834 without Start; Stop showed Stopped on both and freed the port. Earlier reported ebb0220/8369843 Start/Stop/Restart, reload adoption, orphan refusal and Configure/Restore results stand as evidence for those builds. T9-independent security review items are closed with T4/T7/T12/T13 accepted limits; this is not an all-PASS claim or T9/release clearance. No new second-PC result is inferred.

**Reload status follow-up (2026-11-23):** User reported panel Running but status bar Stopped after reload with auto-start disabled on 8369843. Both surfaces now share a Checking/verified Running/Stopped/Unavailable state; activation performs a read-only existing-token check without creating credentials or starting, stopping or syncing the daemon. Temporary loopback tests cover owned daemon, free port and unverified listeners. Full verify/CI and final VSIX follow this commit; fresh F5 and T9 remain open.

**Startup follow-up, Commit 2:** Commit 1 dca63e1 passed 433 tests/48 files and Ubuntu/Windows CI (run 45052063154), including registered command/settings coverage. Its real pipe-failure probe established that a late child could still bind without state. The approved lease now requires private ready/proceed permission before bind and confirmation after R1/R3 plus saved state; cancellation, expiry or pre-confirmation parent loss closes only the child's own listener. Retry is capped at one and requires confirmed termination, exact never-listened evidence and a free port. No foreign/unverified process is adopted or killed. New real and negative lease tests accompany final verify/CI; exact final totals/artifact are reported in the phase report. The prior manual passes remain tied to their recorded builds; fresh final-VSIX/second-PC recheck and T9 remain open.

**Second-PC startup follow-up, Commit 1:** Serialize lifecycle entry points and read/diagnose effective settings at execution time; detect changes during startup, distinguish fixed bootstrap failure reasons and wait up to 20 seconds for the same cold child. Add real delayed-child, overlap, effective-settings and registered Extension Host command tests. A temporary real-child pipe-failure regression confirms orphan risk remains: Commit 2's child-side lease is needed after Commit 1 verify/push/green CI. The second-PC observation's exact original pipe/bind cause is not established by the old combined message. No real Codex home, publish or tag.

**Dev-PC final VSIX recheck (2026-11-22):** User reports PASS on `ebb0220`, SHA256 `16FCE98763C481820CA5D5D154F1B8CF3BD3A0E5A1D139BE000C928B0275D411`, hash verified, isolated profile, fresh empty Codex home, port 47833. Start/Stop/Start/Restart left Codex files untouched; reload adoption passed Diagnostics health/daemon/local-token, retained one listener PID and freed the port after Stop. A second isolated profile was refused Start/Stop/Restart with the unverified-listener message; the original PID stayed running without adoption, stop or configuration delivery. Configure Cancel/Approve and repeat byte/timestamp no-op passed; external edit was preserved; oldest backup Restore and undo passed. No leftover .tmp/.bak/lock; Diagnostics and copied redacted report contained no credentials. The earlier Extension Host first-start failure is resolved in this tested setup. This is user-reported evidence on the specified artifact, not a new second-PC test. T4/T7/T12/T13 limits are accepted; T9 and release approval remain open.

**Approved startup transport follow-up (2026-11-22):** The ce02369 final-VSIX recheck exposed VS Code replacing the requested keep-alive agent: a valid small health/proof response closed, so R1 refused the replacement status socket. Use native ClientRequest, keep the exact socket guard, proof and 4 KiB cap, and report fixed startup stage/reason fields. Add substituted-factory, credential-free socket replacement, classified failures and one-toast regressions. The separate real Extension Host runner uses explicit temporary empty home/storage/user data and fake credentials; it runs first Start/status/reuse/Restart/Stop/port release against dist/gateway.js on both CI operating systems. Installed development-PC Extension Host lifecycle passed locally. Full verify and green Ubuntu/Windows CI accompany the one approved commit; final totals are reported with those results. User final-VSIX F5 recheck and T9 remain open. T4/T7/T12/T13 known limits are accepted. No dependency change, real-home access, publication or tag.

**Approved order:** CI action versions/full-SHA pins → dependency/licence/audit → adversarial review (findings only, ranked by severity; wait for user approval of fix list) → confirmed fixes with regression tests → VSIX inspection → README installation/diagnostics and release notes → final verify and CI. Publishing, tagging and release creation are not authorized.

**Phase 8(a–b), 2026-11-21:** CI actions updated to verified Node 24 releases and full commit SHAs with version comments (D-28). The project's `.nvmrc` build runtime remains Node 22; it is separate from action runtimes. Exact locked installation with `npm ci --ignore-scripts` passed. Dependency inventory and open findings are in `docs/DEPENDENCY_AUDIT.md` (D-29): runtime audit clean; full dev audit reports 2 critical and 4 moderate package entries, plus existing transitive licence/install-hook policy conflicts. No dependency or policy changes are approved by this audit. Phase 8 remains incomplete.

**Next review scope:** T1–T15, covering locks/recovery, single-use login permit, gateway loopback binding/auth/control/proxy/resource limits and daemon identity, webview CSP/XSS/messages, secrets in logs/telemetry/errors/diagnostics, path handling/symlinks, atomic writes/backups/restore, SecretStorage use and supply chain. Report ranked findings and proposed fixes before implementing any security fix. Tests/scripts must use temporary homes only. Fresh Windows VSIX installation and real `codex login` remain user-run pre-release checks; supply an exact copy-only PowerShell checklist with metadata/hash checks and no credential contents when preparing those steps.

**8(a–b) local validation:** `npm.cmd run verify` exited 0: 28 test files, 176 tests, typecheck, lint, production build and VSIX package (17 files). Secret scan clean. These results do not clear the dependency findings or complete Phase 8.

**Batch A complete (2026-11-21):** Findings #1/#2/#3/#4/#14/#7 implemented with temporary-home/fake-upstream regressions. User F5 acceptance on `93a7ba3` is recorded below, with honest manual skips. Maintenance decisions are recorded in D-30; dev-only advisory risk is accepted, dependencies stay unchanged, and the Vitest evaluation is the LAST Phase 8 item. Phase 8 is not complete.

**Batch A local validation:** `npm.cmd run verify` passed with 29 test files and 190 tests, zero skips; typecheck, lint, production build and VSIX packaging passed (17 files). On Windows the real ACL Configure regression requires an unsandboxed test runner so its own temporary `.env` can be removed. That rerun passed without test changes; the exact failed temporary fixture was recovered and removed. No real Codex home was read or modified by the agent. User F5 results are not yet available.

**CI portability correction:** The first Batch A CI passed Ubuntu but exposed Windows runner TEMP's 8.3 alias (`RUNNER~1`) versus canonical `runneradmin`. Fixture account/consent paths were seeded with the alias, while production correctly used the canonical target. The temporary-directory helper now returns realpath for consistent test identities; no assertion was removed or weakened. This correction is a follow-up commit within Batch A, not the start of Batch B.

**Batch A F5 consent/idempotence follow-up (2026-11-21):** User approved fresh confirmations for each Configure/Restore/provider-switch operation and byte-level no-op handling. Regressions cover remembered/malformed old config consent, junction refusal then return, Cancel preserving bytes/timestamps/backups, extension-storage backups preceding real writes, LF/CRLF separator preservation, and repeat no-op Configure. User acceptance on `93a7ba3` closes this follow-up.

**User F5 results on `93a7ba3` (isolated fake home B, 2026-11-21):**

- #1 passed: fresh consent on every Configure, idempotent repeat, backups verified in extension storage.
- #2 passed: login terminal home B, env CODEX_HOME equals home, exactly codex login; codex-login.log appeared inside B.
- #3 passed: junction refused for Configure and Save Current. File-symlink manual check skipped; automated coverage retained.
- #4 passed: running daemon followed edit/disable/enable/delete without restart, yielding 401/200/503/200/503; no sync-failure message observed. Failure paths remain automated coverage.
- #14 passed: blank-guard Confirm removed the guard; Cancel left it with no Portwise error toast. Save/Remove with a guard manually skipped; automated coverage retained.
- #7 Restore was automated-only, not manually verified in this retest.
- User reports real ~/.codex hashes and auth.json unchanged, original fake home A unchanged, and no stale locks. No agent inspection of real credential files occurred.

Batch B (#5/#6/#8/#9/#10/#11/#12/#13/#15) may begin only after the acceptance-record commit verifies and CI is green on Ubuntu and Windows. Batch C remains pending.

**Batch A acceptance gate passed:** Recording commit `347a866` passed verification (197 tests) and [CI on Ubuntu and Windows](https://github.com/GitHubsantu/portwise/actions/runs/44896351206). Batch B then began within the approved scope.

**Batch B implementation (2026-11-21):** #5 secures and verifies empty replacement/backup files before writing bytes, with no Windows Users fallback and fail-closed ACL errors. #6 uses exclusive random temporary files, serializes config operations and preserves external edits. #8 retains account backups in insertion order and keeps failed-cleanup references. #9 serializes store mutations and reads provider URL/token pairs together. #10 honors streaming backpressure and closes failed streams. #11 bounds bootstrap/control uploads and partial-upload deadlines and validates provider URLs. #12 checks Host on health, rejects empty Origin and strips CORS/Connection-nominated headers. #13 replaces raw exception/parser text with fixed actionable messages. #15 handles spawn/stdin/bootstrap/bind failures without uncaught errors or raw process output. D-32 records the contracts and limits. All tests use fake data, temporary homes and port-0 upstreams; no dependency change or real-home access. Batch C, user-run Batch B F5 and Phase 8 release checks remain pending.

**Batch B local verification:** `npm.cmd run verify` exited 0: 35 files, 232 tests, no skips; typecheck, lint, production build and VSIX packaging passed without warnings (17 packaged files, 62.8 KB). Secret-pattern scan clean. The existing twelve-switch retention test also has a 30-second budget for real Windows ACL verification, with every retention assertion preserved. Ubuntu/Windows CI is the next acceptance gate; manual smoke is not claimed. Suggested isolated-home checks are in `docs/F5_BATCH_B.md`.

**Batch B Windows portability follow-up:** CI on `c8a03ce` passed Ubuntu but failed the strict Windows ACL gate. D-32 records Windows's LA SID abbreviation and explicit OS-based resolution, retaining current-user identity verification and all negative ACL assertions. Full local verification passed again: 35 files, 233 tests, no skips, typecheck/lint/build/package successful (17 packaged files, 62.99 KB). The follow-up remains part of Batch B; Batch C has not started. Cross-platform CI must pass before that next gate.

**Follow-up local verification:** `npm.cmd run verify` exited 0 with 30 test files and 197 tests, zero skips; typecheck, lint, production build and VSIX packaging passed (17 files, about 59.21 KB). Secret-pattern scan clean. No dependency change or real Codex-home access occurred. This is a single consent/idempotence follow-up commit; broader Phase 8 hardening remains incomplete.

**Approved README rewrite plan update:** The security/Quick Start sections must say "confirmation before every config/.env write", one exact-path approval per Configure operation, no automatic apply on settings changes, and no replacement/backup for byte-identical Configure. Keep account/login remembered consent distinct. The broader README rewrite still follows the security-fix batches; only its obsolete automatic-sync feature wording is corrected now.
**Batch B complete (2026-11-21):** User F5 acceptance on `e00b9bb` closes findings #5/#6/#8/#9/#10/#11/#12/#13/#15 with the honest manual skips below. [CI on Ubuntu and Windows](https://github.com/GitHubsantu/portwise/actions/runs/44899124623) passed on that commit. This supersedes earlier pending Batch B F5/CI notes, without completing Phase 8.

**User F5 results on `e00b9bb` (isolated fake homes, 2026-11-21):**

- Checklist #1 passed: Start/Stop wrote no Codex files; repeat Configure was a byte/timestamp no-op.
- Checklist #3 passed: Restore from the backup of managed-block drift preserved the external edit and created a safety backup.
- Checklist #4 passed: running daemon followed edit/disable/enable/delete without restart (401/200/503/200/503), with clean Output logs.
- Checklist #5 passed: .env and config.toml each had a single protected current-user ACL, with no Users/Everyone access or inherited entries.
- Checklist #2 (fake-snapshot account switch) manually skipped because the official login launch removed fake auth.json. Automated account-switch coverage remains; this is not a real-login completion check.
- Checklist #6 (natural-failure messages) automated-only, not manually verified.
- User reports real ~/.codex hashes and auth.json unchanged (Length 4129 / LastWriteTime 04:41:09), with no stale locks. No agent inspection of real credentials occurred.
- Test home A has a NEW post-Configure baseline: config.toml hash `7900F08E...81E7`, .env hash `551C0F37...0BCB` (user-provided abbreviated hashes only). Do not claim A still matches its earlier baseline or infer omitted hash characters.

Batch C (#16 provider-message guards, #17 real diagnostics) starts only after this acceptance-record commit verifies and CI is green on Ubuntu and Windows. README rewrite remains on hold until the user approves starting it.

**Acceptance verification correction:** The first verification exposed a Windows guard close/unlink race in the existing concurrent ConfigSync test (EPERM while reading a delete-pending guard). D-33 closes handles before identity-checked removal, with a deterministic ordering regression; ownership and recovery rules are unchanged. This remains a Batch B correction, before Batch C begins.

**Batch B acceptance verification:** `npm.cmd run verify` exited 0 with 35 files and 234 tests, zero skips; typecheck, lint, production build and VSIX packaging passed (17 files, 63.26 KB). Secret-pattern scan clean. The checklist numbers above refer to `docs/F5_BATCH_B.md`, not review finding numbers. No dependency change or real Codex-home access occurred.

**Guard CI follow-up:** `81bfbaf` passed Ubuntu but Windows reproduced delete-pending EPERM during exclusive guard creation. Closing our own handle alone did not cover another reader's handle. Guard acquisition now retries this condition within its existing bound without deleting on permission errors; transient/permanent fault regressions accompany the correction. Batch C remains gated on green Ubuntu/Windows CI.

**Guard follow-up local verification:** `npm.cmd run verify` exited 0 with 35 files and 236 tests, no skips; typecheck, lint, production build and VSIX packaging passed (17 files, 63.28 KB). Secret-pattern scan clean.

**Batch B acceptance gate passed:** `e908984` passed [CI on Ubuntu and Windows](https://github.com/GitHubsantu/portwise/actions/runs/44910391397); Batch B is complete with the user-reported manual skips above. Batch C began only after this gate.

**Batch C implementation (2026-11-21):** #16 projects provider payloads to allowed fields and validates each provider on both sides; malformed/raw-credential state is not posted or rendered. #17 replaces cached diagnostics claims with read-only current-home/config/.env/ACL checks, bounded health/instance/auth probes and a harmless configured-provider GET models. No auth.json/snapshot read, token creation, repair or Codex-home write occurs. A Copy redacted report action is explicit. Windows home writability remains an honest WARN, and running Codex's inherited environment cannot be inspected: restart is still required. D-34 records limits and regression scope. User-run Batch C F5, remaining release checks and final Phase 8 acceptance remain pending. Do not start the README rewrite until the user approves it.

**Batch C local verification:** `npm.cmd run verify` exited 0: 37 test files, 250 tests, zero skips; typecheck, lint, production build and VSIX packaging passed without warnings (17 files, 65.79 KB). Secret-pattern scan clean. Read-only diagnostics tests verified byte/LastWriteTime preservation and no auth.json reads; real command tests verified Copy is explicit, current settings are used and a missing token is never created. Manual checks are in `docs/F5_BATCH_C.md`; no manual pass or release readiness is claimed.

**Batch C complete (2026-11-21):** User F5 acceptance on `322692d` closes findings #16/#17 with the automated-only skips below. [Implementation CI on Ubuntu and Windows](https://github.com/GitHubsantu/portwise/actions/runs/44911327030) passed. This supersedes earlier pending Batch C F5 statements; Phase 8 release acceptance remains open.

**User F5 results on `322692d` (disposable test homes, 2026-11-21):**

- Run Diagnostics showed separate PASS/WARN/FAIL rows for health, daemon, local-token, codex-home, config, credential-delivery, permissions, provider and restart.
- Copy redacted report contained statuses/hints only; dismissing copied nothing.
- With Gateway stopped, health/daemon failed with Start Gateway guidance; nothing started or was written.
- With a wrong FAKE local token on a disposable copy, credential-delivery failed without exposing the token. Permissions also failed correctly: the user's manual rewrite removed the private ACL. This was an expected detection, not an ACL regression.
- With a stale base_url on the copy, config failed with Configure guidance.
- Bytes/timestamps stayed unchanged after every Diagnostics run; panel refresh was normal.
- User reports real ~/.codex hashes and auth.json unchanged (Length 4129 / LastWriteTime 04:41:09), with no stale locks. No agent inspection of real credential files occurred.
- Honest manual skips: malformed/oversized/slow health responses and linked targets remain automated-only; no manual pass is claimed for those cases.

**Remaining work proposal:** README rewrite requires fresh user approval before editing. After documentation/packaging work, evaluate the Vitest upgrade as the last maintenance item against the Node policy and audit evidence; do not change dependencies without approval. Then prepare user-run fresh Windows VSIX-install and real codex-login pre-release checklists with an isolated home and copy-only PowerShell commands, reporting only hashes/Length/LastWriteTime and no credentials. Phase 8 stays open; no publish, tag or release is authorized.

**Batch C acceptance verification:** `npm.cmd run verify` exited 0: 37 test files, 250 tests, no skips; typecheck, lint, production build and VSIX packaging passed without warnings (17 files, 65.96 KB). Secret-pattern scan clean. Only PLAN.md and CHANGELOG.md change in this acceptance record; no implementation, dependency or README change and no real Codex-home access occurred.

**README/release-notes pass (2026-11-21):** User approved the updated README scope after Batch C acceptance. Replace scaffold/planned-feature wording with manifest-verified current functionality, original artwork, real CI/license/TypeScript badges and unpublished Marketplace text. Add the independent/not-a-fork disclaimer near the top, code-backed security/storage claims and limits, three-step setup, a simple architecture Mermaid, exact commands/settings, collapsible help and linked real-capture placeholders under docs/images. D-35 records the sources and decisions. The release-notes file remains explicitly an unreleased draft. No feature, dependency, publish or tag change.

**README validation evidence:** Local links/anchors and all 15 commands/four defaults checked with scripts/checkReadme.mjs; three real Shields SVG endpoints returned 200 without error labels. GitHub Markdown API rendered all three alert types, six details/summary blocks and Mermaid enrichment markup. Initial VSIX inspection found that raw HTML hrefs are not rewritten by vsce; use Markdown capture links/absolute badge targets instead. Final verify/packaged-link inspection, live GitHub diagram check and CI are the completion gates. Real screenshots and user-run Windows install/login acceptance remain pending.

**README local gates passed:** Final check covered 24 local links/anchors, 15 commands/four setting defaults and three live badge SVGs. GitHub API confirmed the centered capture table's links, three alerts, six expandable sections and one Mermaid container. `npm.cmd run verify` exited 0: 37 test files, 250 tests, no skips; typecheck, lint, production build and VSIX packaging passed without warnings. Actual ZIP inspection: 17 entries, 71,616 bytes; manifest santu-dev.portwise 0.1.0 and icon-128.png correct; README image/docs links rewritten for packaging; no source/tests/node_modules/docs, sourcemaps, .env or auth.json payload. No dependency or runtime-source change. Browser diagram rendering and CI follow the push; full Phase 8 acceptance stays open.

**README completed (2026-11-21):** `982bba3` passed [Ubuntu/Windows CI](https://github.com/GitHubsantu/portwise/actions/runs/44932616924). A fresh-profile headless Chrome check of the public GitHub README confirmed the Portwise hero, three alerts, zero broken README images and the actual Mermaid iframe rendering Codex, the loopback address and the configured provider. GitHub adds its own expandable diagram controls; the source's six FAQ/troubleshooting details were separately confirmed through the Markdown API. No fake capture, publish or tag was created.

**Last maintenance item evaluated, no dependency change:** docs/VITEST_EVALUATION.md records exact 4.1.12 metadata/advisory evidence and a conditional recommendation. Current audit remains 2 critical + 4 moderate dev-only, runtime zero. Candidate-pair advisory check is clean, but no 4.x install/test/full-tree audit was performed; package.json/package-lock/.nvmrc/CI remain unchanged. D-36 records this boundary and the Node-policy reason not to accept npm's 5.x major fix automatically.

**0.1.0 maintenance decision (2026-11-22):** The user accepted the subsequent Vitest 4.1.12 trial as evidence but deferred adoption until after release. Keep `trial/vitest-4.1.12` at local commit `2c65e86`; do not merge or push it. Main retains Vitest 3.2.7 and its existing lockfile, Node policy and accepted dev-only audit risk. Trial Windows results: Node 22 verify passed all 250 tests; Node 20.19 verify passed 249 and failed one open-file replacement fixture; full candidate audit had three moderate dev-only entries and runtime audit was clean. These candidate results do not describe main's dependency tree.

Post-release upgrade task, open items:

1. Fix the Windows Node 20 fixture without weakening assertions, or formally approve raising the Node policy to 22.
2. Review and approve the new MPL-2.0 dev-only licence exception for Lightning CSS and its platform packages.
3. Run cross-platform CI on the candidate branch before adoption; the local trial has no such CI result.
4. Resolve the Vite config-format warning without hiding it.

No dependency change or licence exception is approved for 0.1.0 by this decision. User-run pre-release checks remain next; Phase 8 release acceptance stays open. No publication or tag is authorized.

**Deferral validation (2026-11-22):** On main with its unchanged lockfile, Node 22.23.5 / npm 10.9.9 `npm ci --ignore-scripts` and `npm run verify` exited 0: Vitest 3.2.7, 37 files, 250 tests passed with no skips; typecheck, lint, production build and VSIX packaging passed (17 files, about 70.06 KB). Secret-pattern scan clean. This documentation-only change touches PLAN.md and DEPENDENCY_AUDIT.md; CI follows the push. The trial stays local and user-run pre-release checks remain unperformed by the agent.

**Manual release checklists prepared, NOT RUN:** docs/PRE_RELEASE_CHECKS.md supplies individual PowerShell/UI steps for a fresh Windows VSIX installation and real codex login using a new isolated TEMP home/profile. Blocks are syntax-parsed only, not executed. No real credentials or real-home files were read by the agent. User-run acceptance remains open, along with real screenshots and any approved future dependency migration. Phase 8 is not complete.

**Final report/checklist validation:** `npm.cmd run verify` exited 0 on the unchanged Vitest 3.2.7: 37 test files, 250 tests, no skips; typecheck/lint/build/package passed (17 entries, about 70.04 KB). README/release links validated (26 local references), ten PowerShell blocks syntax-parsed without execution, and secret scan clean. Package/lockfile/Node policy/CI configuration and runtime sources are unchanged by the evaluation. Final documentation CI follows the push; manual checks remain pending.

**Acceptance:**
- [x] Formal T1–T15 assessment completed with code/test/F5 mapping — SECURITY_REVIEW.md (2026-11-22).
- [ ] All T1..T15 rated PASS in the review — R1/R2/R3 implementation gaps have automated fixes; manual retests, documented OS/external-edit/power-loss limits and T9 publishing gate require final sign-off. D-10 remains the previously accepted limit.
- [x] Fresh-machine install test from the VSIX on Windows — second-PC Part A steps 1–5 passed on fab0415 (2026-11-22).
- [x] Real official login/account-flow manual gate — second-PC Part B steps 6–10 accepted on 83d1ffb (2026-11-22), with observations below.
- [x] `npm audit --omit=dev` clean at high severity; dependency review recorded in DEPENDENCY_AUDIT.md. Refreshed 2026-11-22: zero runtime vulnerabilities; accepted dev-only advisories remain documented.

**Second-PC Configure ACL follow-up (2026-11-22):** Approved implementation adds bounded permission-error stages/target roles and numeric Windows/.NET ACE normalization (D-38), retaining fail-closed ACL enforcement and empty-file verification before writes. Cleanup preserves an earlier failure. Regressions cover display-name casing/domain/spaces, a real inherited parent ACL, unsafe ACEs, malformed responses, command failures/deadlines, delayed application and close/removal failures. Repeated native inspection requires scoped functional Windows test budgets; assertions and the five-second product command deadline remain unchanged. Second-PC F5 and user-run pre-release acceptance remain open; no real Codex home is accessed by the agent and no publication/tag is authorized.

**ACL follow-up local verification:** Node 22.23.5 `npm run verify` exited 0: 40 test files, 293 tests passed (43 additional regressions), zero skips; typecheck, lint, production build and VSIX packaging passed without warnings (17 entries, about 71.58 KB). Both config/account transaction-lock cleanup regressions preserve the original permission failure and add only the fixed cleanup marker. The VSIX excludes source/tests/node_modules/docs, sourcemaps and credential files. Dependencies, Node policy and CI configuration are unchanged; the separate Vitest trial stays local. CI follows the push; the second-PC error/result is still needed before closing its blocker.

**Second-PC path follow-up (2026-11-22):** User reported backup/icacls exit 3 on 349e5d7. The approved fix uses compact canonical-home hash keys for new backups while preserving legacy directories for Restore and combined retention. Add pre-write Windows staging/backup length guards and bounded existence/bucket/error-name diagnostics; not-reached no longer suggests failed principal normalization. D-39 records the policy and evidence limits. No private bytes are written on an overlong-path failure; no machine policy, dependency or ACL weakening. Real-home access, publication and tags remain prohibited. Second-PC and pre-release manual acceptance remain open.

**Path follow-up local verification:** Node 22.23.5 `npm run verify` exited 0: 42 files, 316 tests passed (23 additional regressions), zero skips; typecheck, lint, production build and VSIX packaging passed without warnings (17 entries, about 72.70 KB). Restore recovered a legacy snapshot before safety-backup retention pruned its old file; subsequent Restore undid it. Combined config/.env retention, name collisions, linked/foreign selections and directories, Unicode/spaces/brackets, path boundaries and length-limited-tool simulation passed using fake data and temporary homes/storage only. CI follows the single approved commit/push; second-PC acceptance remains pending.

**Second-PC Part A accepted (2026-11-22):** User reports fresh-install steps 1–5 PASS on `fab0415`, using standard installed VS Code, an isolated profile and a local account. VSIX SHA256 `1B70C3F5E9CA139218910FA307B4659965227543923D0D64106899B3A5FD917C` matched on both PCs. Configure succeeded (config.toml 36 → 298 bytes; .env created at 67 bytes); repeat Configure was a byte/timestamp no-op. Start/Stop and Cancel wrote nothing. Diagnostics: health/daemon/local-token/credential-delivery/permissions PASS; config/provider/codex-home/restart WARN as expected. Command Palette: 15 Portwise commands plus VS Code's own View: Show Portwise entry. This closes the reported `349e5d7` backup/icacls exit 3 blocker for this setup; long-path compatibility is the likely explanation, not a separately demonstrated native cause. These results supersede earlier pending second-PC Part A notes.

**Honest remaining gate:** Part B real `codex login`, steps 6–10 in PRE_RELEASE_CHECKS.md, is PENDING because the second PC has no Codex CLI yet. Do not infer a real-login or account-flow pass from Part A. The agent has not installed the CLI, run real login or accessed the real Codex home. Phase 8 release acceptance stays open; publication and tags remain unauthorized.

**Part A acceptance-record verification:** Node 22.23.5 `npm run verify` exited 0: 42 files, 316 tests passed, zero skips; typecheck, lint, production build and VSIX packaging passed without warnings (17 files, about 72.92 KB). Secret-pattern scan clean. Only PLAN.md, PRE_RELEASE_CHECKS.md and CHANGELOG.md changed; implementation, tests, dependencies, Node policy and CI configuration remain unchanged. CI follows the documentation push. Manual acceptance above refers to the hash-verified fab0415 artifact; no real-login check was performed by the agent.

**Part B progress and slow-PC follow-up (2026-11-22):** The user now reports real login and Save worked on the second PC; Configure and icacls apply also worked. Step 9 Switch failed with a five-second read-only PowerShell ACL inspection timeout, on an i3 sixth-generation/4 GB machine where empty PowerShell startup measured 2.2–3.3 seconds. This supersedes the earlier CLI-unavailable status, but does not accept all Part B steps. The approved D-40 fix gives only that inspection 20 seconds and one timeout-only retry after confirmed child close, retaining five-second defaults elsewhere and all private-file gates. Preserve the resolved SID/apply within the file operation, recheck identity before retry and expose only fixed phase/retry fields. No real account data is used in automated tests. The user must still retest Switch/restart/removal and report the remaining checklist results; Phase 8 stays open and no publish/tag is authorized.

**Slow-PC fix local verification:** Node 22.23.5 `npm run verify` exited 0: 43 files, 335 tests passed (19 new regressions), zero skips; typecheck/lint/build/VSIX packaging passed without warnings (17 files, about 73.39 KB). Controlled process/timer tests proved close-before-retry, the 20-second inspection and unchanged five-second default deadlines, bounded unconfirmed-close refusal, single SID/apply use, retry exhaustion/result validation, identity recheck and byte/timestamp-preserving diagnostics. No dependencies, Node policy, global harness budgets or ACL rules changed; secret scan clean and the VSIX excludes source/tests/dependencies/sourcemaps/credentials. CI follows the one approved commit/push; second-PC Switch and the rest of Part B are still unaccepted.

**Second-PC Part B accepted (2026-11-22):** The user reports steps 6–10 PASS on `83d1ffb`, using standard installed VS Code, an isolated profile/home, local account Admin, an i3 sixth-generation CPU, 4 GB RAM and Codex CLI 0.171.0. The VSIX was 75,152 bytes; SHA256 `7AB11D5E9CA20647AD559E66DF7726AB1A090D9E92028227AD81016B0BF193EA` was verified on both PCs. Add Account via Codex Login showed the exact-path dialog and created auth.json (Length 4484 bytes). Save Current succeeded once; a second Save was refused with one toast. Switch succeeded after the 20-second read-only ACL inspection fix, resolving the prior timeout. Remove changed no files and left no stale lock. Part A steps 1–5 had already passed on `fab0415`. These user-reported results supersede all earlier Part B pending/CLI-unavailable/timeout notes above; they do not imply that the agent performed real login or read credentials. The real Codex home was not used on this PC.

**Accepted observations:** The panel did not auto-refresh after Save; the existing Refresh action showed the saved account. This is a documented workaround, with no refresh implementation change in this record. The official CLI printed "could not create PATH aliases" for the TEMP home, without preventing the reported successful login. The slow-PC fix retains fail-closed ACL verification; no permission requirement was relaxed.

**Remaining before 0.1.0:** Close the formal T1–T15 review checklist above; confirm the final release artifact's contents/checksum and final verify/Ubuntu/Windows CI evidence; reconcile final release documentation and supply or explicitly defer real screenshots. Both Windows manual gates are now accepted. Keep the Refresh workaround visible. Vitest 4.1.12 remains a local trial deferred to post-release, not a 0.1.0 blocker. Final release/channel approval is still required; do not publish or tag without it.

**Part B acceptance-record verification:** Node 22.23.5 `npm run verify` exited 0: 43 test files, 335 tests passed, zero skips; typecheck, lint, production build and VSIX packaging passed without warnings (17 files, about 73.63 KB). Documentation validation checked 25 local links/anchors, all 15 commands and four settings/defaults; the secret-pattern scan found no matches. Runtime audit reported zero vulnerabilities. Only PLAN.md, PRE_RELEASE_CHECKS.md, CHANGELOG.md and RELEASE_NOTES.md changed; source, tests, dependencies, Node policy and CI configuration remain unchanged. The packaged file list excludes source/tests/dependencies/sourcemaps/credentials. CI follows this documentation push; the user's manual acceptance remains tied to the earlier hash-verified artifacts, not a retest of this documentation build. No real-home access, publication or tag was performed.

**Final assessment and candidate preparation (2026-11-22):** SECURITY_REVIEW.md maps T1–T15 and all fixed findings #1–#17 to implementation/tests and accepted F5, closing the assessment task but not the all-PASS criterion. R1 HIGH: the public instanceId plus acceptance of a bearer request does not authenticate a daemon; a port-0 fake service received fake local/provider credentials on adoption. R2 MEDIUM: .env lacks post-rename readback and Restore lacks ownership-aware rollback on verification failure (code inspection). R3 MEDIUM: lifecycle response.json is uncapped; a 32,811-byte fake health reply was accepted. No runtime fix or new regression was added; obtain approval before coding. T9 still needs verified publisher/MFA and approved protected CI publication. The current workflow only verifies. Screenshots are explicitly deferred for 0.1.0; release notes and copy-only pre-publish steps are prepared. No publication, release creation, tag or real-home access is authorized. Final verification/build and CI accompany this documentation commit; artifact bytes/checksum are reported after rebuilding from its clean HEAD. Earlier manual acceptance applies to the recorded builds, not a new manual test.

**R1 follow-up (2026-11-22):** Implement the approved shared-secret proof before any credential-bearing HTTP request, with instance/port/nonce binding and exact TCP-socket continuity for status and control. Start/Stop/Restart refuse unverified listeners, preserve their state and never send provider configuration or kill a process. Diagnostics distinguishes public liveness from verified ownership. Twenty-two new regressions cover public-id impostors across all entry points, orphan state, fresh/replayed/wrong proofs, cross-port relay, replacement sockets, genuine adoption/status/shutdown and real detached fixture Start/Restart/Stop. Only fake tokens, port-0-derived loopback fixtures and temporary directories are used. Existing fetch-seam tests now exercise native transport/valid ports without removing failure assertions. Full verify/Ubuntu/Windows CI accompany this single R1 commit. R2 and remaining R3 status-response bounds are not implemented here. Manual rechecks in F5_R1.md remain user-run; previous second-PC acceptance does not imply acceptance of this changed ownership protocol.

**R1 pre-amend local verification:** Node 22.23.5 `npm run verify` exited 0: 44 test files, 353 tests passed (18 added), zero skips; typecheck, lint, production build and VSIX package passed without warnings (17 entries, about 75.36 KB). Full verification exposed a Configure fixture whose setting still pointed at 47831 while its daemon used an ephemeral port: set the fixture's current setting to that daemon port and add a separate mismatched-port negative test. Startup-failure fixtures now reserve valid ephemeral ports instead of probing port 0. All original consent/startup/sync assertions remain. README validation passed 29 local references/all 15 commands/four defaults; two copy-only F5 PowerShell blocks syntax-parse without execution. Dependency/CI/ACL/consent/account code is unchanged. CI follows the single requested R1 commit/push; manual F5 and second-PC gateway rechecks remain pending.

**Final R1 hostile-reply check:** A separate port-0 probe found an HTTP 101 ownership reply could leave the new reader pending after request destruction. Before any push, amend the same R1 commit to reject upgrades/early close explicitly, reject directly on the deadline and destroy both request and response/socket. Four added ownership-reader regressions cover upgrade, incomplete slow body, malformed JSON and oversize proof replies with no credential delivery; all 22 ownership cases and typecheck pass locally. Final full post-commit verify/CI follows this amendment, with its actual result in the phase report. This corrects the new R1 handshake reader, not the separate R3 status JSON byte-cap work.

**R3 response bounds (2026-11-22):** The separate approved R3 fix uses one fixed 4096-byte reader for public/challenged health and authenticated status. Count actual bytes before retaining data, reject invalid UTF-8/JSON/minimal schema and non-200 replies, cancel rejected bodies, and expose only gateway_response_unavailable with fixed owner-controlled recovery guidance. Lifecycle status is unavailable after failure; explicit Start/Stop fail safely, provider sync reports its existing contextual error without a PUT, and diagnostics no longer marks a bad status optimistically PASS. R1 HMAC/nonce/port checks and socket continuity remain mandatory; transport deadlines, ACL/consent/account/provider code, dependencies and CI are unchanged. Twenty-two new cases cover byte boundaries/multibyte overflow, malformed input, cancellation/stream errors, positive bounds, no adoption/control/state changes and slow/endless replies on port-0 fake servers and temporary storage only. Targeted lint/typecheck and all 22 R3 plus 22 R1 tests pass. Full post-commit verify/Ubuntu/Windows CI follows the single R3 commit; actual totals are reported with that result. R2 and manual gateway retesting remain separate. No real-home access, publication or tag.

**R2 verified file updates (2026-11-22):** The separate approved R2 implementation shares staged/final content and private-permission verification between .env delivery and config Restore, including restored TOML parsing. Prepare private original bytes from the exact pre-write backup before publication; device/inode/path/byte guards allow a recovery rename (or restoration of absence) only for the owned replacement. Preserve external edits/links, recheck ownership during rollback, and never report successful completion after a failed check. If OS/I/O denial blocks safe recovery, keep private repair material and the retained backup with one fixed actionable error; no universal OS/power-loss guarantee is claimed. Recovery names .env.<UUID>.bak are covered by existing Git ignores and explicitly excluded from the VSIX. Twenty-seven new transaction cases include simulated ACL-command fault injection plus actual native successful/private rollback under permission drift; one additional command test checks one toast/no false success/no credential output, and one packaging test checks Git/VSIX exclusion. Targeted tests/typecheck/lint pass. Affected-suite concurrency exposed two 5000 ms .env functional budgets after extra native verification; reuse existing platform-specific I/O budgets with all assertions/product deadlines unchanged (D-44). Full post-commit verify/Ubuntu/Windows CI follows the single R2 commit; actual totals are reported there. R1/R3, ACL policy, consent, account/provider implementations and dependencies remain unchanged. F5_R2.md is a user-run isolated checklist, not a claimed manual pass. No real-home access, publish or tag.
