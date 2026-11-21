# Delivery Plan

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
| 8 | Hardening and release | 🟨 CI pins and dependency audit; review/fixes pending |

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

**Manual release checklists prepared, NOT RUN:** docs/PRE_RELEASE_CHECKS.md supplies individual PowerShell/UI steps for a fresh Windows VSIX installation and real codex login using a new isolated TEMP home/profile. Blocks are syntax-parsed only, not executed. No real credentials or real-home files were read by the agent. User-run acceptance remains open, along with real screenshots and any approved future dependency migration. Phase 8 is not complete.

**Final report/checklist validation:** `npm.cmd run verify` exited 0 on the unchanged Vitest 3.2.7: 37 test files, 250 tests, no skips; typecheck/lint/build/package passed (17 entries, about 70.04 KB). README/release links validated (26 local references), ten PowerShell blocks syntax-parsed without execution, and secret scan clean. Package/lockfile/Node policy/CI configuration and runtime sources are unchanged by the evaluation. Final documentation CI follows the push; manual checks remain pending.

**Acceptance:**
- [ ] All T1..T15 rated PASS in the review
- [ ] Fresh-machine install test from the VSIX on Windows
- [ ] `npm audit --omit=dev` clean at high severity; dependency log complete
