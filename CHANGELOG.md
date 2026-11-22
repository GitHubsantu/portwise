# Changelog

All notable changes to Portwise are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: [SemVer](https://semver.org/).

## [Unreleased]

### Added
- New 128×128 extension PNG rendered from the existing original SVG; original artwork and the monochrome view-container SVG remain unchanged. Packaging tests cover icon paths and VSIX inclusion.
- Phase 7 including 7b–7h completed: the full T1–T10 F5 matrix passed on the isolated test home. Non-secret Gateway and Accounts panel sections dispatch existing commands; credentials remain outside webview state.
- Phase 7 completed: text-based accessible panel status and empty states, a short walkthrough, and a plain-Codex `/status` terminal command. Isolated-home walkthrough F5 validation passed; real Codex files remained unchanged.
- Phase 5 completed: file-store-only Codex account snapshots in SecretStorage, fault-injected atomic switching with rollback, official login launcher, and keyring-store refusal. Isolated fake-credential F5 validation passed; real Codex files remained unchanged.
- Phase 4 completed: detached gateway lifecycle commands, authenticated daemon adoption, managed-block `config.toml` sync with exact-backup restore, secure `.env` local-token delivery, redacted diagnostics, and gateway status indicator. CI #21 and isolated-home F5 validation passed.
- `toml@5.0.1` is bundled into extension output solely to parse and validate config changes; the VSIX remains dependency-free.
- Codex-file writes now require path-specific explicit confirmation; gateway activation and Start Gateway never modify a Codex home.
- Config and credential delivery now create retained timestamped pre-write backups; Restore selects a backup and snapshots the current file first.

### Changed
- Allow 20 seconds for read-only Windows ACL inspection and one timeout-only retry after the prior process closes. Reuse the file operation's resolved SID and apply result; keep five-second identity/apply deadlines, validate every fresh ACL response and fail closed on exhaustion or unconfirmed close. Add bounded phase/retry status to permission errors. Second-PC real login and Save were reported working; Switch/restart/removal validation remains open.
- Second-PC fresh-install Part A (steps 1–5) accepted on fab0415 with the VSIX hash verified on both PCs: Configure/private permissions succeeded, repeat Configure preserved bytes/timestamps, Start/Stop and Cancel wrote nothing, Diagnostics showed the expected PASS/WARN rows, and the palette showed 15 Portwise commands plus VS Code's own view entry. The reported backup/icacls exit 3 blocker is resolved in this setup. Part B real-login checks (steps 6–10) remain pending because the second PC has no Codex CLI; Phase 8 release acceptance remains open.
- Use compact canonical-home SHA256 backup keys; keep legacy directories readable in Restore and retain ten snapshots across both layouts without migrating existing files. Reject overlong Windows staging/backup paths before private bytes, and add bounded existence/length/exit-name diagnostics with an explicit not-reached principal state. Existing ACL requirements remain unchanged; second-PC Part A passed on fab0415.
- Windows private-file permission errors now identify a bounded stage, target role, command/result, verification reason and principal kind without paths, account names or credential data. Normalize ACL principals through Windows/.NET numeric SIDs, preserve the protected current-user permission gate, and keep the original failure when cleanup also fails. The five-second command deadline remains unchanged; second-PC Part A passed on fab0415.
- Record the report-only Vitest 4.1.12 evaluation after README CI; dependencies remain unchanged. Add syntax-checked, user-run Windows VSIX/login steps using a new isolated Codex home and VS Code profile, with no credential output or automatic real login. Manual release acceptance remains open.
- Rewrite the README around the implemented extension: original-artwork hero, independent-project disclaimer, real CI/license/TypeScript badges, three-step setup, code-checked security limits, manifest-matched command/settings tables and collapsible help. Add real-capture placeholders and an unreleased notes draft; no feature, dependency, publication or tag change.
- Batch C accepted after F5 on 322692d: separate diagnostic rows, explicit redacted copy/dismiss, stopped-gateway guidance, stale token/config detection and normal panel refresh passed; Diagnostics preserved bytes/timestamps. A permissions failure correctly detected a private ACL removed by manual rewriting on the disposable copy. Malformed/oversized/slow health responses and linked targets remain automated-only. Real-home hashes/auth.json were reported unchanged, with no stale locks. Batch C is complete; Phase 8 release checks and README approval remain open.
- Phase 8 Batch C: validate provider payload fields/masks and project outgoing panel data; replace cached diagnostics with read-only config/token-delivery/ACL, gateway identity/auth and provider models checks. Add explicit Copy redacted report. Diagnostics never reads auth.json, creates a token or repairs files; Windows home write access and an already-running Codex environment remain unverified with actionable warnings. README rewrite remains on hold.
- Fix a Windows concurrency race by closing recovery-guard handles before unlinking them; retain all ownership checks and legacy recovery confirmations. A real-filesystem ordering regression accompanies Batch B acceptance.
- Batch B accepted after isolated-home F5 on e00b9bb: no-write Start/Stop, no-op Configure, exact Restore/safety backup, live provider synchronization and protected current-user ACLs passed. Fake-account switching was manually skipped because official login removed fake auth.json; failure-message checks were automated-only. Real-home hashes/auth.json were reported unchanged, with no stale locks. Fake home A's baseline changed after Configure and is recorded separately in docs/PLAN.md. Batch B is complete; Phase 8 and Batch C remain open.
- Phase 8 Batch B: verify private-file permissions before writing replacement/backup bytes and fail closed on ACL errors; serialize file/store mutations, preserve external edits and retry failed backup cleanup. Bound gateway control/bootstrap uploads, honor streaming backpressure/deadlines, preserve compressed response bytes, tighten header boundaries, and handle process failures with fixed credential-safe errors. No dependencies changed; manual Batch B F5 acceptance is not claimed.
- Batch A accepted after isolated-home F5 on 93a7ba3: fresh consent/idempotence/backups, explicit login home, junction refusal, live provider synchronization and blank-guard Confirm/Cancel passed. File-symlink, Save/Remove guard checks and Restore were automated-only in this retest. User reports real-home hashes/auth.json and fake home A unchanged, with no stale locks. Batch A is complete; Phase 8 hardening continues.
- Batch A F5 follow-up: Configure now asks for the exact canonical home every time; Restore and provider-switch also require fresh exact-path confirmation. Legacy stored config consent is ignored. Repeated identical Configure preserves bytes and timestamps without redundant backups or ACL changes; managed-block separators and .env line endings remain intact. Account/login consent is unchanged.
- Phase 8 Batch A: resolve and confirm current canonical homes per operation; bind official login to that home; reject linked/changed targets; synchronize provider edits/disable/delete to the authenticated daemon; recover abandoned guards safely; preserve selected restore bytes before retention. Regression tests and an isolated-home F5 checklist accompany the changes. Document approved development-only licence/disabled-hook exceptions; dependency versions are unchanged.
- Phase 8(a–b): pin checkout v7.0.1, setup-node v7.1.0 and upload-artifact v7.0.2 to full commit SHAs, all declaring Node 24. Record the dependency audit: runtime clean; development advisories, transitive licence exceptions and install hooks remain open for review before fixes.
- Final Phase 7 F5 on 3e53b3d passed T1–T10: lock recovery, restart/reload, Escape/Cancel, single-use save permit, gateway controls, keyring refusal, long/XSS-name handling, empty state and Add-provider cancellation. Test-home hashes matched baseline; user reports real Codex-home config/.env hashes and auth.json metadata unchanged, with no stale lock. The separate Phase 8 real-account login pre-release check remains open.
- Responsive panel layout: full-width Add actions, consistent section headers, account command grid, compact provider action grids with separate destructive slots, and safely truncated names with full-name titles. Commands, payloads and keyboard order are unchanged.
- Fix Activity Bar discovery: contribute the existing Portwise container to activitybar instead of secondarySidebar, retaining the original SVG, view id and commands.
- F5 retest on `2e65865` passed Current 0/1/2+ matches, legacy recovery on Switch/Save/Remove, restart-notification reload and Escape/Cancel. User reports real Codex-home hashes and auth.json Length/LastWriteTime unchanged. Final-layout T6–T10 checks remain open; see docs/PLAN.md.
- Phase 7h: host-only exact snapshot matching and ambiguity notes; unsupported stores skip credential reads silently; account entries contain only id/name/isCurrent plus a non-secret panel availability flag.
- Phase 7g: status-bar click opens the consistently named panel; the duplicate inner title is removed while preserving its accessible name.
- Account save safety: consume the single-use login permit under the operation lock before capture; failed captures require a fresh launch.
- Account lock safety: release before restart notification, use non-secret ownership metadata, confirm legacy recovery, serialize abandoned-owner checks and report cleanup failures.
- Phase 7f: minimal list/toolbar layout, neutral dividers, latest-message Activity strip, comfortable targets and separated destructive actions. Full theme/keyboard/empty-state manual validation remains open.
- Phase 4 F5 validation passed against an isolated Codex-home copy; the real Codex configuration and `.env` remained hash-identical.

### Changed
- Phase 0 completed: recorded sourced Codex and VS Code compatibility decisions; usage-limit support is intentionally omitted because no public documented source exists. Extension Development Host smoke check passed.

### Changed
- Marketplace display title is now "Portwise: Codex Account & Provider Switcher"; keywords and categories updated for search.

### Added
- Phase 3 gateway daemon: stdin-only secret bootstrap, loopback proxy, authenticated control API, strict request boundaries, and fake-upstream integration coverage.
- Phase 2 provider profiles: SecretStorage-backed tokens, atomic metadata/secret rollback, masked panel display, host-only password entry, and loopback-only connection-test coverage.

### Changed
- Phase 3 completed: CI #18 is green; automated gateway integration coverage replaces manual smoke testing until Phase 4 adds lifecycle control.
- Phase 2 verification completed: manual Extension Development Host checklist passed for provider add, edit, test, enable/disable, validation, safe rendering, log hygiene, and confirmed deletion.
- Phase 1 foundation hardening: atomic writes, file locking, typed errors, provider URL validation, path safety checks, CSP/manifest tests, and an Extension Development Host integration-test job.
- Phase 1 verification completed: CI is green on Windows and Linux, including the Ubuntu Xvfb Extension Development Host test; manual F5 smoke check passed.
- Project scaffold: build (esbuild), typecheck, lint, tests, VSIX packaging, CI.
- Webview panel with strict CSP and a validated message protocol.
- Secret redaction utility and Codex-home path resolver (with tests).
- Planning kit in `docs/`: master prompt, context, spec, architecture, security, rules, plan, branding.
