# Changelog

All notable changes to Portwise are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: [SemVer](https://semver.org/).

## [Unreleased]

### Added
- New 128×128 extension PNG rendered from the existing original SVG; original artwork and the monochrome view-container SVG remain unchanged. Packaging tests cover icon paths and VSIX inclusion.
- Phase 7 including 7b–7h implementation complete, with F5 T6–T10 still open. Non-secret Gateway and Accounts panel sections dispatch existing commands; credentials remain outside webview state.
- Phase 7 completed: text-based accessible panel status and empty states, a short walkthrough, and a plain-Codex `/status` terminal command. Isolated-home walkthrough F5 validation passed; real Codex files remained unchanged.
- Phase 5 completed: file-store-only Codex account snapshots in SecretStorage, fault-injected atomic switching with rollback, official login launcher, and keyring-store refusal. Isolated fake-credential F5 validation passed; real Codex files remained unchanged.
- Phase 4 completed: detached gateway lifecycle commands, authenticated daemon adoption, managed-block `config.toml` sync with exact-backup restore, secure `.env` local-token delivery, redacted diagnostics, and gateway status indicator. CI #21 and isolated-home F5 validation passed.
- `toml@5.0.1` is bundled into extension output solely to parse and validate config changes; the VSIX remains dependency-free.
- Codex-file writes now require path-specific explicit confirmation; gateway activation and Start Gateway never modify a Codex home.
- Config and credential delivery now create retained timestamped pre-write backups; Restore selects a backup and snapshots the current file first.

### Changed
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
