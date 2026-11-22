# Portwise 0.1.0 — release notes

Prepared for 0.1.0; not published or tagged. Windows VSIX installation and real-account login acceptance passed on the isolated second PC. R1 verifies shared-secret ownership; R3 caps health/status at 4 KiB; R2 verifies delivery/Restore content/private permissions and prepares guarded rollback. Manual rechecks, known-limit sign-off and the publishing gate remain open. See [the ranked review](SECURITY_REVIEW.md). These notes do not claim an all-PASS security sign-off.

## Included

- Provider profiles with host-only token input, masked panel state and live authenticated daemon synchronization.
- A detached loopback-only gateway on a configurable stable port; local auth, bounded uploads, streaming backpressure and hop-specific failures.
- Shared-secret ownership proof before credential-bearing control requests; public-id-only, orphan and older proof-less daemons are left untouched with actionable guidance. Closed/replaced connections require a new proof, never a silent authenticated reconnect.
- Bounded health/status response parsing: invalid/oversized/incomplete replies are cancelled and reported unavailable, without raw response contents or provider configuration delivery.
- Explicit config/provider switching, fresh exact-path config/.env confirmations, byte-idempotent Configure, retained timestamped backups and exact restore with a safety backup.
- .env delivery/Restore verify staging and final content/private ACLs; Restore reparses TOML. Prepared private rollback restores owned original bytes or absence, preserving external edits. Failures produce one fixed actionable message; OS-blocked/unverifiable recovery retains private repair data rather than claiming success. Recovery files are excluded from Git/VSIX packaging.
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

Security-fix Batches A/B/C and their isolated-home F5 checks are accepted. The [completed T1–T15 assessment](SECURITY_REVIEW.md) maps every original finding to code/tests/F5 evidence and lists honest coverage limits. R1 adds 22 ownership cases, R3 adds 22 bounded-response cases, and R2 adds 27 transaction cases plus UI and packaging regressions. All-PASS release clearance is not granted. The accepted `83d1ffb` implementation passed 335 tests in 43 files, typecheck, lint, production build and VSIX packaging, with Ubuntu/Windows CI green. The [Windows checks](PRE_RELEASE_CHECKS.md) retain that manual acceptance; [R1 gateway checks](F5_R1.md) and [R2 file checks](F5_R2.md) remain user-run rechecks of the changed implementation.

Runtime audit refreshed on 2026-11-22: zero vulnerabilities. Accepted dev-only advisories and the post-release Vitest upgrade deferral are recorded in [DEPENDENCY_AUDIT.md](DEPENDENCY_AUDIT.md); the 4.1.12 trial remains on its local branch, outside the 0.1.0 release.

Real screenshots/GIFs are **deferred for 0.1.0** unless the maintainer supplies captures; placeholder links intentionally lead to explanatory Markdown, not missing or fabricated images. The manual Refresh workaround remains a known limitation. Fresh macOS installation has not been manually validated; CI covers Ubuntu and Windows.

Before release: complete manual gateway/file rechecks and known-limit sign-off, verify the resulting final commit/artifact, and complete the external publisher/authentication gate. R2 cannot override OS denial, persistent I/O failures or an external edit; private backup material is retained for manual repair in those cases. Marketplace publication is pending. Follow the [copy-only pre-publish checklist](PRE_PUBLISH_CHECKLIST.md); tag/release/publish actions require explicit approval and have not been performed.

[README](../README.md) · [Changelog](../CHANGELOG.md)
