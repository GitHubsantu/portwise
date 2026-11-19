# Changelog

All notable changes to Portwise are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: [SemVer](https://semver.org/).

## [Unreleased]

### Changed
- Phase 0 completed: recorded sourced Codex and VS Code compatibility decisions; usage-limit support is intentionally omitted because no public documented source exists. Extension Development Host smoke check passed.

### Changed
- Marketplace display title is now "Portwise: Codex Account & Provider Switcher"; keywords and categories updated for search.

### Added
- Phase 1 foundation hardening: atomic writes, file locking, typed errors, provider URL validation, path safety checks, CSP/manifest tests, and an Extension Development Host integration-test job.
- Phase 1 verification completed: CI is green on Windows and Linux, including the Ubuntu Xvfb Extension Development Host test; manual F5 smoke check passed.
- Project scaffold: build (esbuild), typecheck, lint, tests, VSIX packaging, CI.
- Webview panel with strict CSP and a validated message protocol.
- Secret redaction utility and Codex-home path resolver (with tests).
- Planning kit in `docs/`: master prompt, context, spec, architecture, security, rules, plan, branding.
