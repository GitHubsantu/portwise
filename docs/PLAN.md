# Delivery Plan

Status legend: ⬜ not started · 🟨 in progress · ✅ done. Update this table as you go. One phase at a time. Each phase ends with a PHASE REPORT (see `docs/PROMPT.md` §7).

| Phase | Name | Status |
|---|---|---|
| 0 | Research and decisions | ✅ |
| 1 | Foundation hardening | ✅ |
| 2 | Storage and provider profiles | ✅ |
| 3 | Gateway daemon | ✅ |
| 4 | Lifecycle, config sync, diagnostics | ✅ |
| 5 | Account profiles | ⬜ |
| 6 | Usage limits (conditional) | ⬜ |
| 7 | UX polish and accessibility | ⬜ |
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

## Phase 8 — Hardening and release

**Deliverables:** run the **Security review prompt** (`docs/PROMPT.md`), fix findings; pin CI actions to commit SHAs; README with screenshots; `vsce ls` audit; tag `v0.1.0`; GitHub release with VSIX; Marketplace and/or Open VSX publish.
**Acceptance:**
- [ ] All T1..T15 rated PASS in the review
- [ ] Fresh-machine install test from the VSIX on Windows
- [ ] `npm audit --omit=dev` clean at high severity; dependency log complete
