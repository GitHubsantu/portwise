# Portwise 0.1.2 — real screenshots, same runtime

The README now shows the real panel and Diagnostics captures supplied by the maintainer. Both were taken from the 0.1.1 Marketplace build in an isolated profile with a fake provider. The Diagnostics warnings stay visible: this is the result that was captured, not a mockup.

**0.1.2 is a review candidate. It has not been published, tagged or released.** This is a docs/metadata release; runtime sources, commands, settings, dependencies and behavior are unchanged from 0.1.1.

## What changed

- The README embeds `docs/images/panel.png` and `docs/images/diagnostics.png`, with full-size links and descriptive alt text.
- The panel capture shows the gateway Running on port 8787 and an Enabled Fake Upstream provider card. Diagnostics shows **6 PASS, 3 WARN, 0 FAIL**.
- The two old Markdown placeholder pages now link to the real images. They stay in place so links from the 0.1.1 README still work. No image was redrawn, generated or edited.
- Package and lockfile metadata move to **0.1.2**. The runtime, existing installation routes, security boundaries and accepted limits are unchanged.

## Same runtime, same boundaries

Your gateway and account flows stay as they were in 0.1.1. The [packaged runtime comparison](DIST_0.1.2.md) records byte equality for every `dist` file against the exact 0.1.1 VSIX baseline. The final CI artifact checksum and exact packaged-file differences belong in the candidate report; a rebuild is not automatically approved for publication.

The existing gateway still requires shared-secret ownership proof before sending credentials, with authenticated control on the exact verified connection. Health/status reads keep their 4 KiB cap and deadlines. Config/.env writes still require fresh exact-path confirmation, verified private permissions and retained pre-write backups. Restore still makes a safety backup, verifies the result and preserves external edits. Account snapshots remain in SecretStorage.

> [!NOTE]
> Portwise is an independent community extension. It is not affiliated with, endorsed by, or sponsored by OpenAI or Microsoft. It is not a fork of any other project. “Codex” describes compatibility only.

## Boundaries

Account save/switch supports only explicit file-store mode; keyring/auto/ephemeral/unknown modes are refused. Restart Codex/VS Code after switching accounts or changing gateway-token delivery. Windows directory write access remains unproven by read-only diagnostics. Diagnostics neither repairs files nor proves a running Codex process loaded the delivered environment.

No quota scraping, automatic account rotation, telemetry or remote gateway hosting. Account snapshots stay in SecretStorage; Codex's active file credential and the local gateway-token delivery file still exist where Codex requires them. Do not describe all credentials as absent from disk.

### Accepted known limits

- Portwise relays configured-provider response bodies and does not remove content a provider chooses to reflect.
- Verified writes retain private recovery material and preserve external edits, but persistent OS/I/O failure, an external edit, or power loss can require manual recovery.
- The total request deadline bounds lifecycle probes; the connection phase has no independently tested deadline.
- Legacy or unverified daemons are deliberately not adopted or stopped automatically. Stop them from a verified owning profile or choose another port.

## A few things worth knowing

On the isolated slow Windows PC, the final 0.1.0 artifact passed first Start, matching panel/status bar state, Diagnostics, Configure, Reload and Stop. Earlier isolated real-login/account-flow and dev-PC ownership/Restore checks remain accepted for their recorded builds. The [manual acceptance record](PRE_RELEASE_CHECKS.md) keeps that history; these 0.1.1 screenshots are documentation evidence, not a new 0.1.2 manual test.

The read-only Windows ACL inspection keeps its 20-second deadline and at most one timeout-only retry after the previous process closes. Identity resolution and ACL apply retain five-second deadlines; ACL apply is never retried, and unverified permissions still prevent committing private files.

Known observation: the panel did not automatically refresh after Save; use the existing **Refresh** action to show the saved account. The official CLI printed "could not create PATH aliases" for the TEMP home without preventing the successful login. This release does not change panel refresh behavior.

Fresh macOS installation has not been manually validated; CI covers Ubuntu and Windows. Accepted development-only advisories remain in [DEPENDENCY_AUDIT.md](DEPENDENCY_AUDIT.md). The Vitest upgrade stays deferred. Green CI is not a claim of zero dev advisories or an all-PASS security guarantee; see the [security review](SECURITY_REVIEW.md).

## Before this candidate ships

Review the changed docs, verify the CI-built 0.1.2 VSIX identity/checksum and the packaged runtime comparison, then explicitly approve the exact artifact and release actions. No 0.1.2 publication, tag, GitHub draft release or publishing workflow dispatch is authorized or performed by this preparation.

[README](../README.md) · [Changelog](../CHANGELOG.md)
