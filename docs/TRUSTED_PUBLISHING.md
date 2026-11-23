# Trusted Publishing setup — browser steps only

The workflow is prepared, **not dispatched**. No publication, tag or release is authorized by this setup. **T9 browser gates are closed pending the second-PC recheck**, based on the owner's browser confirmation below; actual OIDC exchange remains untested.

## Owner-confirmed browser evidence — 2026-11-23

| Gate | Owner-reported result |
|---|---|
| Marketplace publisher | `santu-dev`; owner is Owner; MFA on |
| GitHub environment | `marketplace-production`; required reviewer `GitHubsantu` |
| Review protections | Prevent self-review off (sole owner); admin bypass OFF |
| Deployment scope | Branches limited to `main`; no environment secrets or variables |
| Marketplace Trusted Publishing | Policy **Portwise release**, **Active**, `GitHubsantu/portwise`, `publish.yml`, `marketplace-production` |
| Policy use | Last used: **never**; no publishing dispatch or OIDC exchange claimed |
| Dev-PC artifact check | CI run `45112267614`, artifact `portwise-vsix`, commit `e579bfe384f0fa787c5d6750a3d3dbe05ec975ba`; downloaded VSIX hash verified by owner |

Approved artifact: `portwise-0.1.0.vsix`, **82556 bytes**, SHA256 `A3E5D5CC70703B9B236917A984E11277948AA4594D02863B74276E0B18A2B9ED`. **Second-PC recheck remains pending on this exact artifact.** Approval of these bytes does not authorize publication. This record lives only in excluded docs files; README and CHANGELOG are intentionally unchanged. Verification/CI repackaging may change ZIP metadata/checksums even with identical payloads; those rebuilt files are not automatic replacements. Selecting any different bytes requires fresh approval.

## Reference steps (1–3 completed by owner)

1. In [repository environments](https://github.com/GitHubsantu/portwise/settings/environments), inspect the existing `marketplace-production` configuration recorded above. Required reviewer is `GitHubsantu`; prevent self-review is off for the sole owner, admin bypass is OFF, and deployments are limited to `main`. The validation job refuses a missing environment or one without required reviewers; it does not create or weaken protection rules.
2. Open [Marketplace Manage publishers](https://marketplace.visualstudio.com/manage), select `santu-dev`, then **Trusted Publishing** and inspect the owner-confirmed Active policy **Portwise release**: organization/owner **GitHubsantu**, repository **portwise**, workflow filename **publish.yml** (not its directory path), and environment **marketplace-production**. No replacement policy or PAT is needed for this record.
3. Check spelling in both browser pages before approving a release. GitHub supplies the federated identity, including the environment subject `repo:GitHubsantu/portwise:environment:marketplace-production`; vsce requests the Marketplace audience. Do not customize claims or enter credential values. The policy is restricted to this workflow and environment; merely creating an environment without required reviewers is insufficient.
4. After separate release approval, obtain the completed **CI** run for the approved full main commit SHA. Both `verify (ubuntu-latest)` and `verify (windows-latest)` must succeed. Download its **portwise-vsix** artifact, inspect the contained `portwise-0.1.0.vsix`, and approve that file's SHA256. CI also records that VSIX checksum in its job summary. The artifact ZIP's digest is a different checksum. Artifacts expire after 30 days; do not substitute a local rebuild.
5. Only after explicit publication authorization, open **Actions → Publish approved VSIX → Run workflow**, select `main`, and enter the approved full `commit_sha`, numeric `ci_run_id`, exact `artifact_name` (`portwise-vsix`) and 64-character `vsix_sha256`. Validation checks dispatch context, CI workflow identity, repository, main-push event, exact SHA, both platform jobs, artifact identity/provenance/expiry, checksum, package identity and VSIX XML identity. Review the candidate summary and approve the `marketplace-production` deployment only if all four inputs match the release approval. **This step has not been executed.**

## What the workflow can publish

Only the downloaded, checksum-verified CI artifact. The trusted dispatch commit supplies the validation scripts, lockfile and expected identity/version (`santu-dev.portwise`, currently `0.1.0`); candidate code is never checked out or executed. Both jobs install the exact lockfile using `npm ci --ignore-scripts`, without running a build or packaging command. Both independently download the same immutable artifact ID and check the VSIX again. A maximum 25 MiB artifact/VSIX and exactly one ordinary expected VSIX file are required.

The publish job alone has `id-token: write`, behind the environment gate. It uses exact-pinned development tool `@vscode/vsce@4.1.0` on Node 22 and runs `vsce publish --oidc --packagePath <verified file>`, with no version argument and no PAT fallback. No OIDC credential is requested by the validation job; the ephemeral GitHub token there is only for read-only repository/actions metadata and downloads. There are no stored publishing secrets, debug token dumps or automatic dispatches.

Action pins: checkout **v7.0.1** `3d3c42e5aac5ba805825da76410c181273ba90b1`; setup-node **v7.1.0** `949feb2413d6458794dcd2491c4babbbce0c15c1`; github-script **v9.0.0** `3a2844b7e9c422d3c10d287c895573f7108da1b3`; download-artifact **v8.0.2** `9000827ccba6bdab643e8b6fd33ac0654aef8333`. CI's existing upload-artifact **v7.0.2** pin remains `cf430e030ddbb5b0abf93d22962f4752f3646cd9`. All action runtimes use Node 24; development/packaging remains Node 22.

## Evidence and remaining gate

Unit regressions use fake metadata and temporary ZIP fixtures: wrong/fork/PR/incomplete runs; missing/failed/skipped platform jobs; missing, duplicate, expired or substituted artifacts; malformed inputs/checksums; byte mismatch; package/XML identity mismatch; malformed archives; and an absent/unprotected environment. Static workflow checks enforce full SHA pins, dispatch-only operation, protected publish-only OIDC permission and no rebuild/PAT fallback. The owner confirmed the required-reviewer UI and Active Marketplace policy above. Actual OIDC exchange/publication remains untested and needs separate authorization after the second-PC recheck; tests, browser configuration and green CI do not prove publication.

Official sources checked 2026-11-23: [VS Code publishing guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension), [vsce Trusted Publishing](https://github.com/microsoft/vscode-vsce#trusted-publishing), [deployment environments API](https://docs.github.com/en/rest/deployments/environments#get-an-environment), [GitHub OIDC claims](https://docs.github.com/en/actions/reference/security/oidc#example-subject-claims), [artifact download inputs](https://github.com/actions/download-artifact/tree/v8.0.2).
