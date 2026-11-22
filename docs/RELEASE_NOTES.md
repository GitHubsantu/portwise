# Portwise 0.1.0 — unreleased draft

This is an unreleased draft. The user has accepted the Windows VSIX installation and real-account Codex login checks on a second PC. Final release review and explicit approval are still required; no release or tag has been created.

## Included

- Provider profiles with host-only token input, masked panel state and live authenticated daemon synchronization.
- A detached loopback-only gateway on a configurable stable port; local auth, bounded uploads, streaming backpressure and hop-specific failures.
- Explicit config/provider switching, fresh exact-path config/.env confirmations, byte-idempotent Configure, retained timestamped backups and exact restore with a safety backup.
- File-store account snapshots in SecretStorage, single-use login-launch permits, ownership-checked locks and explicit legacy recovery.
- Text-only provider/account rendering, a short walkthrough, keyboard flow and themed responsive sections.
- Read-only measured diagnostics, private-file permission verification and explicit redacted report copying.
- Compact backup-directory keys with legacy backup Restore/retention support and pre-write Windows path-length checks.
- Slow-PC fix: read-only Windows ACL inspection gets 20 seconds and at most one timeout-only retry after the previous process closes. Identity resolution and ACL apply retain five-second deadlines; ACL apply is never retried, and unverified permissions still prevent committing private files.

## Boundaries

Account save/switch supports only explicit file-store mode; keyring/auto/ephemeral/unknown modes are refused. Restart Codex/VS Code after switching accounts or changing gateway-token delivery. Windows directory write access remains unproven by read-only diagnostics. Diagnostics neither repairs files nor proves a running Codex process loaded the delivered environment.

No quota scraping, automatic account rotation, telemetry or remote gateway hosting. Account snapshots stay in SecretStorage; Codex's active file credential and the local gateway-token delivery file still exist where Codex requires them. Do not describe all credentials as absent from disk.

## Second-PC acceptance (2026-11-22)

Part A steps 1–5 passed on `fab0415`: fresh isolated VSIX installation, Configure/private permissions, repeat-Configure byte/timestamp no-op, no-write Start/Stop/Cancel and expected Diagnostics rows. This resolved the earlier backup/icacls exit 3 blocker in the tested setup.

Part B steps 6–10 passed on `83d1ffb`, using standard VS Code, an isolated profile/home, local account Admin, Codex CLI 0.171.0 and an i3 sixth-generation/4 GB machine. The VSIX was 75,152 bytes with SHA256 `7AB11D5E9CA20647AD559E66DF7726AB1A090D9E92028227AD81016B0BF193EA`, verified on both PCs. Official login showed the exact-path dialog and created auth.json (4484 bytes); Save worked once, the second Save was refused with one toast, Switch succeeded after the ACL-read fix, and Remove changed no files and left no stale lock. The user did not use the real Codex home on this PC; the agent did not perform the real-account checks.

Known observation: the panel did not automatically refresh after Save; use the existing **Refresh** action to show the saved account. The official CLI printed "could not create PATH aliases" for the TEMP home without preventing the successful login. No panel-refresh behavior change is included in this acceptance record.

## Validation and remaining release checks

Security-fix Batches A/B/C and their isolated-home F5 checks are accepted; honest automated-only skips and the still-open formal T1–T15 review checklist are recorded in [PLAN.md](PLAN.md). The accepted `83d1ffb` implementation passed 335 tests in 43 files, typecheck, lint, production build and VSIX packaging, with Ubuntu/Windows CI green. The [Windows checks](PRE_RELEASE_CHECKS.md) retain the reproducible manual procedure and accepted results.

Runtime audit refreshed on 2026-11-22: zero vulnerabilities. Accepted dev-only advisories and the post-release Vitest upgrade deferral are recorded in [DEPENDENCY_AUDIT.md](DEPENDENCY_AUDIT.md); the 4.1.12 trial remains on its local branch, outside the 0.1.0 release.

Before release: close the formal threat-review checklist, confirm the final VSIX contents/checksum and verification/CI evidence, finalize this draft and decide whether to supply or defer real screenshots. Marketplace publication remains pending. Release-channel selection, publication and tagging require the user's explicit approval. The Refresh workaround is a documented limitation, not an implemented fix.

[README](../README.md) · [Changelog](../CHANGELOG.md)
