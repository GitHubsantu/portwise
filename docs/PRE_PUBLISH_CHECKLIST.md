# 0.1.0 pre-publish checklist — copy only

Nothing below has been executed. Perform one numbered step at a time, after explicit release approval. **Stop now: the T9 publishing gate and release approval are open.** The dev-PC gateway/file recheck passed and four known limits were accepted; a green verification run or a built VSIX does not waive remaining gates.

1. **Approve the exact CI-built candidate.** Use the latest main PHASE REPORT's full commit SHA, completed CI run ID, artifact name and contained VSIX Length/SHA256. Approve all four workflow inputs together; a historical local build checksum is not the CI artifact checksum. The dev-PC runtime reload recheck on `be64c4a363485e53bb947bc03b747717d1fec30d` remains historical evidence, not approval of the new tool/workflow artifact. Resolve the remaining T9 browser setup and explicitly approve publication of that exact VSIX. Screenshots remain deferred; confirm the Refresh workaround. Do not substitute a later or locally rebuilt package.

2. **Check Marketplace identity in the browser.** Sign in at [Manage publishers](https://marketplace.visualstudio.com/manage), verify ownership of `santu-dev`, enable MFA, and check name/display-name availability. Manifest identity must remain `santu-dev.portwise`, version `0.1.0`; repository must be `https://github.com/GitHubsantu/portwise.git`. No publisher-account access has been verified by the agent.

3. **Configure OIDC Trusted Publishing, not a PAT.** Publisher ownership/MFA were reported by the owner. Follow the numbered browser-only [Trusted Publishing setup](TRUSTED_PUBLISHING.md): GitHub environment `marketplace-production` with required reviewers/main-only deployment; Marketplace policy for `GitHubsantu/portwise`, workflow filename `publish.yml`, environment `marketplace-production`. No PAT or stored publishing token is used. Actual policy setup and publication remain owner-run gates. [Official publishing/authentication guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension).

4. **Approve the exact CI artifact separately.** `ci.yml` only verifies and uploads `portwise-vsix` for main pushes, with the contained VSIX SHA256 in its summary. The separate manual-dispatch `publish.yml` validates the approved commit, successful Ubuntu/Windows CI run ID, artifact name and VSIX SHA256. It downloads without rebuilding, checks package/XML identity/version twice and gates publication on `marketplace-production`; only its publish job has OIDC permission. Exact-pinned vsce 4.1.0 uses `--oidc --packagePath` with no version argument or PAT fallback. This workflow has not been run; do not dispatch it without explicit publication approval.

5. **Freeze the approved source and artifact.** In the repository PowerShell, replace the placeholder with the explicitly approved full SHA. These checks are read-only. Stop if the commit, working tree, version or checksum differs from the approved report.

   ```powershell
   $pwReleaseCommit = 'APPROVED_40_CHARACTER_COMMIT_SHA'
   if ($pwReleaseCommit -notmatch '^[0-9a-f]{40}$') { throw 'Enter the approved full commit SHA first.' }
   if ((git rev-parse HEAD) -ne $pwReleaseCommit) { throw 'Checkout does not match the approved commit.' }
   git status --short
   $pwManifest = Get-Content -LiteralPath .\package.json -Raw | ConvertFrom-Json
   $pwManifest | Select-Object version, publisher, repository
   Get-Item -LiteralPath .\portwise-0.1.0.vsix | Select-Object Name, Length, LastWriteTime
   Get-FileHash -LiteralPath .\portwise-0.1.0.vsix -Algorithm SHA256
   ```

6. **Create the tag only after tag approval.** Proposed tag: `v0.1.0`. Review the SHA from step 5 first. These are future commands, not executed by this task:

   ```powershell
   git tag -a v0.1.0 $pwReleaseCommit -m 'Portwise 0.1.0'
   ```

   ```powershell
   git push origin refs/tags/v0.1.0
   ```

7. **Prepare a GitHub release only after release-creation approval.** Attach that exact VSIX and use the finalized notes; `--verify-tag` prevents silently creating a missing tag. Inspect the draft and independently compare the downloaded attachment's SHA256 before publishing. [GitHub CLI reference](https://cli.github.com/manual/gh_release_create).

   ```powershell
   gh release create v0.1.0 .\portwise-0.1.0.vsix --repo GitHubsantu/portwise --verify-tag --draft --title 'Portwise 0.1.0' --notes-file .\docs\RELEASE_NOTES.md
   ```

8. **Publish only after publication approval.** Dispatch the separately reviewed protected publishing workflow for the approved SHA/VSIX. Publish the GitHub draft after final review; verify Marketplace identity/version/install and the released attachment checksum. Update the README's unpublished status only after the listing exists. The workflow, Marketplace publication and GitHub release publication have not been authorized or executed here.

Sources checked 2026-11-23: the official links above, the installed vsce CLI options and the CI/manual publication workflows. This checklist grants no authorization to publish, tag or create a release.
