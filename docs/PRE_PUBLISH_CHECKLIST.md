# 0.1.0 pre-publish checklist — copy only

Browser steps 2–3 and the final slow second-PC recheck were completed by the owner (2026-11-23); the exact artifact below was hash-verified on both PCs. **T9 and manual pre-release checks are CLOSED. Stop before publishing, tagging or creating a release: those actions remain unauthorized.** The four accepted known limits remain. Successful OIDC exchange/publication is not claimed; it will occur only in a separately authorized run.

## Exactly what remains (copy only, not executed)

After explicit release-action approval, perform these in order:

1. Create and push annotated tag **v0.1.0** at **e579bfe384f0fa787c5d6750a3d3dbe05ec975ba**, not the later docs-only commit (commands in step 6 below).
2. Create a **GitHub draft release** for that tag, attach the original approved VSIX and use docs/RELEASE_NOTES.md (step 7). Keep the draft unpublished.
3. Manually dispatch **publish.yml** on **main** with exactly these inputs, then check the validation summary and approve the **marketplace-production** environment job to permit publication (step 8). No rebuild or PAT fallback:

   ```text
   commit_sha: e579bfe384f0fa787c5d6750a3d3dbe05ec975ba
   ci_run_id: 45112267614
   artifact_name: portwise-vsix
   vsix_sha256: A3E5D5CC70703B9B236917A984E11277948AA4594D02863B74276E0B18A2B9ED
   ```

Actual Marketplace publication and later GitHub draft promotion are future release actions, not part of this record. Screenshots and the Vitest upgrade remain deferred, not additional manual pre-publish gates.

## Detailed reference steps

1. **Keep the approved CI-built candidate pinned.** The owner verified these exact bytes on both PCs and reports the final second-PC recheck PASS. This is artifact/manual-check acceptance, not authorization to publish, tag or create a release. Do not substitute a newer docs-commit artifact or a local verify rebuild. All records in this documentation commit are excluded from packaging; README and CHANGELOG remain unchanged. Repackaging alone can still change ZIP metadata/SHA256, and selecting different bytes requires fresh approval. Screenshots remain deferred; retain the Refresh workaround.

   ```text
   commit_sha: e579bfe384f0fa787c5d6750a3d3dbe05ec975ba
   ci_run_id: 45112267614
   artifact_name: portwise-vsix
   vsix_sha256: A3E5D5CC70703B9B236917A984E11277948AA4594D02863B74276E0B18A2B9ED
   VSIX: portwise-0.1.0.vsix
   Length: 82556 bytes
   ```

2. **Marketplace identity — owner-confirmed.** At [Manage publishers](https://marketplace.visualstudio.com/manage), the owner reports publisher `santu-dev` exists, their role is Owner, and MFA is on. Manifest identity remains `santu-dev.portwise`, version `0.1.0`; repository `https://github.com/GitHubsantu/portwise.git`. The agent has not signed into the publisher account; no listing or successful publication is claimed.

3. **OIDC browser configuration — owner-confirmed.** GitHub environment `marketplace-production`: required reviewer `GitHubsantu`, prevent self-review off (sole owner), admin bypass OFF, deployment branches limited to `main`, no secrets/variables. Marketplace policy **Portwise release**: **Active**, repository `GitHubsantu/portwise`, workflow filename `publish.yml`, environment `marketplace-production`, last used **never**. See the [browser evidence record](TRUSTED_PUBLISHING.md). No PAT/stored publishing token. Actual OIDC exchange and publication remain untested and unauthorized. [Official publishing/authentication guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension).

4. **Approve the exact CI artifact separately.** `ci.yml` only verifies and uploads `portwise-vsix` for main pushes, with the contained VSIX SHA256 in its summary. The separate manual-dispatch `publish.yml` validates the approved commit, successful Ubuntu/Windows CI run ID, artifact name and VSIX SHA256. It downloads without rebuilding, checks package/XML identity/version twice and gates publication on `marketplace-production`; only its publish job has OIDC permission. Exact-pinned vsce 4.1.0 uses `--oidc --packagePath` with no version argument or PAT fallback. This workflow has not been run; do not dispatch it without explicit publication approval.

5. **Recheck the original approved source and artifact.** These PowerShell checks are copy-only and read-only. A later docs-only checkout is not the artifact's source commit; inspect the pinned commit's manifest rather than requiring the documentation HEAD to equal it. Use the original CI download at the VSIX path below, not verify's local rebuild. Stop on any identity/Length/checksum mismatch. The second-PC manual gate is already closed; request separate authorization before release actions.

   ```powershell
   $pwReleaseCommit = 'e579bfe384f0fa787c5d6750a3d3dbe05ec975ba'
   $pwApprovedVsixSha = 'A3E5D5CC70703B9B236917A984E11277948AA4594D02863B74276E0B18A2B9ED'
   git cat-file -e ($pwReleaseCommit + '^{commit}')
   if ($LASTEXITCODE -ne 0) { throw 'The approved source commit is not available in this checkout.' }
   git status --short
   $pwSourceManifest = git show ($pwReleaseCommit + ':package.json')
   if ($LASTEXITCODE -ne 0) { throw 'Cannot read the approved source manifest.' }
   $pwManifest = ($pwSourceManifest -join "`n") | ConvertFrom-Json
   $pwManifest | Select-Object version, publisher, repository
   if ($pwManifest.name -ne 'portwise' -or $pwManifest.publisher -ne 'santu-dev' -or $pwManifest.version -ne '0.1.0' -or $pwManifest.repository.url -ne 'https://github.com/GitHubsantu/portwise.git') { throw 'Approved source identity does not match.' }
   $pwVsix = Get-Item -LiteralPath .\portwise-0.1.0.vsix
   $pwVsix | Select-Object Name, Length, LastWriteTime
   $pwVsixHash = Get-FileHash -LiteralPath $pwVsix.FullName -Algorithm SHA256
   $pwVsixHash
   if ($pwVsix.Length -ne 82556 -or $pwVsixHash.Hash -ne $pwApprovedVsixSha) { throw 'Use the original approved CI artifact; a rebuild is not approved.' }
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
