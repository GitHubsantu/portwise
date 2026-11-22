# 0.1.0 pre-publish checklist — copy only

Nothing below has been executed. Perform one numbered step at a time, after explicit release approval. **Stop now: SECURITY_REVIEW.md R2/R3, the R1 manual gateway retest and the T9 publishing gate are open.** R1 has an implementation/regressions; a green verification run or a built VSIX does not waive remaining gates.

1. **Approve the candidate.** Resolve or explicitly disposition the review findings, rerun verification/CI on the resulting commit, and approve its SHA and VSIX checksum. Screenshots are deferred for 0.1.0. Confirm the Refresh workaround is acceptable. Do not use a later unreviewed build.

2. **Check Marketplace identity in the browser.** Sign in at [Manage publishers](https://marketplace.visualstudio.com/manage), verify ownership of `santu-dev`, enable MFA, and check name/display-name availability. Manifest identity must remain `santu-dev.portwise`, version `0.1.0`; repository must be `https://github.com/GitHubsantu/portwise.git`. No publisher-account access has been verified by the agent.

3. **Choose publishing authentication.** Official guidance now recommends federated CI identity; global Azure DevOps PATs retire **2026-12-01**. If using a PAT before that cutoff, create a short-expiry token in Azure DevOps with only Marketplace Manage scope (the documented organization selection is All accessible organizations), store it only as a protected CI secret, and revoke it afterward. Never put a token in argv, a file, chat or logs. Do not create a PAT for the agent. [Official publishing/authentication guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension).

4. **Approve protected CI publication separately.** Current `ci.yml` verifies only; there is no publishing job. Follow SECURITY.md's CI-only publication rule. Add an approval-protected workflow for the exact approved commit/artifact, with minimal permissions and pinned actions. A PAT job can consume its protected secret as VSCE_PAT; use no literal credentials. Trusted Publishing needs an approved compatible tool/workflow setup: the currently installed vsce CLI does not advertise `--oidc`. Do not add a tool dependency/update or workflow as part of this checklist. No publish command can run under the existing verification workflow.

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

Sources checked 2026-11-22: the official links above, the installed vsce CLI options and `.github/workflows/ci.yml`. This checklist grants no authorization to perform any remote or release action.
