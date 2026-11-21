# Portwise 0.1.0 — unreleased draft

This is a release-notes draft, not a published release or tag. Final Windows VSIX installation and real-account Codex login acceptance remain user-run pre-release checks.

## Included

- Provider profiles with host-only token input, masked panel state and live authenticated daemon synchronization.
- A detached loopback-only gateway on a configurable stable port; local auth, bounded uploads, streaming backpressure and hop-specific failures.
- Explicit config/provider switching, fresh exact-path config/.env confirmations, byte-idempotent Configure, retained timestamped backups and exact restore with a safety backup.
- File-store account snapshots in SecretStorage, single-use login-launch permits, ownership-checked locks and explicit legacy recovery.
- Text-only provider/account rendering, a short walkthrough, keyboard flow and themed responsive sections.
- Read-only measured diagnostics, private-file permission verification and explicit redacted report copying.

## Boundaries

Account save/switch supports only explicit file-store mode; keyring/auto/ephemeral/unknown modes are refused. Restart Codex/VS Code after switching accounts or changing gateway-token delivery. Windows directory write access remains unproven by read-only diagnostics. Diagnostics neither repairs files nor proves a running Codex process loaded the delivered environment.

No quota scraping, automatic account rotation, telemetry or remote gateway hosting. Account snapshots stay in SecretStorage; Codex's active file credential and the local gateway-token delivery file still exist where Codex requires them. Do not describe all credentials as absent from disk.

## Validation and open items

Security-fix Batches A/B/C and their recorded isolated-home F5 checks are accepted; honest automated-only skips remain in [PLAN.md](PLAN.md). The pre-documentation baseline passed 250 tests plus typecheck, lint, production build and VSIX packaging on local Windows, with Ubuntu/Windows CI green.

Runtime dependency audit was clean at the recorded audit date; accepted dev-only advisories are listed in [DEPENDENCY_AUDIT.md](DEPENDENCY_AUDIT.md). Vitest 4.x evaluation is the last maintenance item; no dependency upgrade is implied by this draft. Real captures and Marketplace publication are pending. No publishing/tagging is authorized.

The README passed manifest/link/badge validation, actual GitHub Mermaid rendering and Ubuntu/Windows CI on 982bba3. [Vitest evaluation](VITEST_EVALUATION.md) is complete as a report only; no upgrade is installed. Follow the [individual Windows VSIX/login checks](PRE_RELEASE_CHECKS.md) for the remaining manual gate; those checks have not been run by the agent.

[README](../README.md) · [Changelog](../CHANGELOG.md)
