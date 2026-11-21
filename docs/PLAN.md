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
| 7 | UX polish and accessibility (7b–7h included) | 🟨 F5 T1/T4/T5 re-confirm and T6-T10 open |
| 8 | Hardening and release | ⬜ |

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
- [ ] Every action reachable by keyboard; axe-style manual checklist passed
- [ ] Every error follows UX-3 (what / which hop / fix button)

**Implementation delivered; manual acceptance open (2026-11-21):** Phase 7 including 7b–7h remains "F5 T1/T4/T5 re-confirm and T6-T10 open" at the user's request. The visual V1–V5 pass on bce76c7 below does not close these functional checks or imply Phase 8 release acceptance.

**Earlier functional F5 retest — `2e65865`, `E:\portwise-test-codex3` (2026-11-21); T1/T4/T5 now require re-confirmation:**

- [x] Current label: 0 matches, exactly 1 match, and 2+ identical matches handled correctly; ambiguous matches do not guess an account.
- [x] Legacy lock recovery on Switch, Save Current and Remove.
- [x] Reload while the restart notification is open, followed by another switch.
- [x] Escape/Cancel paths.
- [x] User reports real `~/.codex` hashes and `auth.json` Length/LastWriteTime unchanged throughout the retest. No real credential inspection was performed by the agent.
- [ ] F5 T6–T10: not yet reported as verified. These are the user's manual-check identifiers, not the security threat IDs in `docs/SECURITY.md`; their precise numbered descriptions are not recorded in this repository.

**Earlier confirmed F5 evidence:** The three walkthrough links worked; Configure ticked its walkthrough step; test-home config/history/.env and real-home hashes were unchanged. Keyboard-only provider add/disable/delete passed before the final redesign. Dark-theme final layout, Activity strip, gateway stop/start badge, hover feedback, disabled Start reason and secondary Stop passed. Configure Codex Home was cancelled with hashes unchanged. Gateway/Accounts/Provider sections and fake-account names appeared correctly.

**Remaining manual scope:** T1/T4/T5 require functional re-confirmation after the layout change; T6–T10 remain open and their numbering is not inferred from the distinct V1–V5 visual checks. The bce76c7 visual pass below covers final-layout light/High Contrast, narrow and wide placement, long/XSS names and keyboard focus; these are no longer listed as unverified visual cases. Provider empty state and any other unreported functional cases remain open. Status-bar click, keyring-mode current-label behavior and Add Login recovery remain automated-only unless separately confirmed. Use fake accounts in `E:\portwise-test-codex3` with the Codex panel disabled. Real-account login completion remains the separate Phase 8 pre-release check (D-17).

**Completed implementation:** Minimal divider-based rows and Activity strip; themed/accessible controls; existing-command Gateway and Accounts sections; consistent Portwise naming/status-bar entry point; host-only current-account matching and ambiguity handling; shared exact-path legacy recovery and silent cancellation; lock release before restart notification; single-use login permit consumed under the operation lock. Account payloads contain only id/name/isCurrent plus a non-secret availability flag. No credentials, snapshots or hashes are sent to the panel.

**Automated evidence:** Full verification passed after lock recovery (114 tests), permits (120), discoverability (123), initial matcher/termination work (138), and F5 regression fixes (27 files, 169 tests). Each passed typecheck, lint, production build and VSIX packaging. Tests include a real child-host termination fixture, command-palette/panel confirm/cancel/live-lock matrix, concurrent Save calls, 0/1/2+ matches, unsupported-store no-read checks and actual outgoing payload hygiene. Tests/scripts use temporary homes only. Automated checks do not close F5 T6–T10.

### Icon packaging follow-up

**Icon packaging follow-up (2026-11-21):** Preserve all original artwork: activity.svg (420 bytes, 24×24, viewBox 0 0 24 24, currentColor), icon.svg (741 bytes, 256×256, viewBox 0 0 256 256, fixed brand colours), and icon.png (12,931 bytes, 256×256). The existing view-container reference already uses the monochrome activity.svg; the status-bar codicon and sidebar location remain unchanged. ImageMagick 7.1.2-27 generated a new images/icon-128.png (5,026 bytes, 128×128 RGBA) from icon.svg; package.json references the new PNG. Tests check referenced paths, PNG dimensions, real VSIX ignore processing and negative icon exclusion in a temporary package. No dependency was added. Phase 7 F5 T6–T10 remain OPEN.

**Icon verification:** `npm.cmd run verify` passed: 28 files, 172 tests, typecheck, lint, production build and VSIX packaging. Packaging includes both referenced icons and all preserved originals. This does not close any F5 T6–T10 item.

### Activity Bar discovery correction

**Activity Bar discovery correction (2026-11-21):** User F5 on 6737374 found no Activity Bar entry. The container had been contributed only to secondarySidebar; the icon path and portwise.panel registration were correct. activity.svg parses as XML and renders non-empty pixels at 24×24 (ImageMagick alpha coverage 0.204534, max alpha 1), with fill=none and stroke=currentColor and no fixed colours. Move the same single container to activitybar; keep ids, original artwork, status-bar codicon and command behavior unchanged. A regression test enforces exactly one Activity Bar location linked to the registered view, alongside existing icon packaging checks. Manual icon retest and F5 T6–T10 remain open.

**Activity Bar validation update:** User F5 on 462bd96 confirms the Activity Bar icon now appears. Its local verify run passed 173 tests. This closes the icon-visibility retest, not F5 T6–T10.

### Responsive panel layout

**Responsive panel implementation (2026-11-21):** User confirmed the Activity Bar icon appears on 462bd96. Narrow-width wrapping is addressed with uniform section headers, full-width Add actions, account rows and a grouped global-command fallback, equal secondary grid tracks, and separate destructive slots. Provider/account names remain literal text with full-name titles; provider labels may be short visually but retain their full accessible names. Account commands still take no webview arguments; provider payloads and all keyboard ordering are preserved. No protocol or runtime behavior changes are made. scripts/checkPanelLayout.mjs passed 20 real headless Chrome geometry cases across 220/300/400/600/900px and four synthetic themes, with no horizontal overflow, equal secondary tracks, minimum target height 32.9px, ellipsis/title, right-aligned Current and focus outlines.

**User F5 visual pass — bce76c7, V1–V5 (2026-11-21):** Normal width, 220px width, secondary sidebar at 600px+, long/XSS-like names, keyboard focus, light theme and High Contrast passed in the Extension Development Host. User reports real `~/.codex` hashes and `auth.json` unchanged; no agent inspection of real credentials was performed. The user now authorizes pushing both 462bd96 (Activity Bar placement) and bce76c7 (responsive layout), with this documentation record. This closes the visual acceptance gate for pushing these changes, not T1/T4/T5 re-confirmation or T6–T10.

**Responsive verification:** `npm.cmd run verify` exited 0 with 28 test files and 176 tests; typecheck, lint, production build and VSIX packaging passed. All 20 browser geometry cases passed separately. Actual VS Code visual acceptance is now recorded above; functional status remains "F5 T1/T4/T5 re-confirm and T6-T10 open".

## Phase 8 — Hardening and release

**Deliverables:** run the **Security review prompt** (`docs/PROMPT.md`), fix findings; pin CI actions to commit SHAs; README with screenshots; `vsce ls` audit; tag `v0.1.0`; GitHub release with VSIX; Marketplace and/or Open VSX publish.
**Acceptance:**
- [ ] All T1..T15 rated PASS in the review
- [ ] Fresh-machine install test from the VSIX on Windows
- [ ] `npm audit --omit=dev` clean at high severity; dependency log complete
