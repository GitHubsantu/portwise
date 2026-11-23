# 0.1.1 pre-publish checklist — review first

**0.1.0 is published. 0.1.1 is a docs/metadata candidate, not authorized for publication, tagging or release creation.** The previous release's manual/T9 acceptance remains recorded; it is not an all-PASS security guarantee or approval of new package bytes.

## Candidate inputs

The 0.1.1 PHASE REPORT supplies the exact full commit SHA, successful Ubuntu/Windows CI run ID, artifact name and contained VSIX SHA256 after CI completes. Copy those four fields together after the owner approves the candidate. They are not available at the time this source commit is prepared; placeholders below must never be dispatched.

```text
commit_sha: FULL_0_1_1_COMMIT_SHA_FROM_PHASE_REPORT
ci_run_id: SUCCESSFUL_0_1_1_CI_RUN_ID_FROM_PHASE_REPORT
artifact_name: portwise-vsix
vsix_sha256: EXACT_0_1_1_VSIX_SHA256_FROM_PHASE_REPORT
```

## Review before authorizing release actions

1. Read README.md, CHANGELOG.md and RELEASE_NOTES.md. Confirm the package and lockfile both say **0.1.1**, with identity **santu-dev.portwise** and repository **https://github.com/GitHubsantu/portwise.git**. Runtime sources, dependencies, settings and commands must be unchanged.
2. Download **portwise-vsix** from the specific green CI run in the report. Both Ubuntu and Windows must pass, including their real Extension Host integration tests. Inspect the contained **portwise-0.1.1.vsix** and measure its Length/SHA256. Do not substitute a local rebuild or a later docs-commit artifact.
3. Check the report's archive comparison against the published 0.1.0 baseline below. Every packaged `dist` file must be byte-identical. Only README, changelog, package manifest and VSIX version manifest are expected to change; do not accept an unexplained file, runtime-byte difference or security-text change.
4. Confirm all five badge URLs resolve, the Marketplace links/install command work as documented, and screenshot slots still point to explanatory Markdown until real panel.png/diagnostics.png captures are supplied. Badges are cached public data, not hard-coded counts.
5. Keep the established **marketplace-production** required-reviewer/main-only protection and Marketplace **Portwise release** trust policy. No PAT, stored publishing token or workflow change is part of 0.1.1. Setup evidence is in TRUSTED_PUBLISHING.md. The owner must explicitly approve the exact candidate and release actions before continuing.

## Only after explicit approval (not executed)

1. Create/push annotated tag **v0.1.1** at the exact candidate source commit from the report.
2. Create a **GitHub draft release** for that tag; attach the original approved CI-built 0.1.1 VSIX and use RELEASE_NOTES.md. Keep the draft unpublished until the publication review is complete.
3. Dispatch **publish.yml** on **main** with the four exact approved inputs. Review the validation summary, then approve **marketplace-production**. The workflow downloads without rebuilding, checks both manifests/version and SHA256 again, and publishes with `vsce publish --oidc --packagePath` with no version argument or PAT fallback.
4. Verify the Marketplace identity/version and the released attachment checksum before promoting the GitHub draft. No 0.1.1 release action is authorized by this checklist.

## Published 0.1.0 comparison baseline (historical)

- Source: **e579bfe384f0fa787c5d6750a3d3dbe05ec975ba**; CI run **45112267614**, artifact **portwise-vsix**.
- [Published GitHub release](https://github.com/GitHubsantu/portwise/releases/tag/v0.1.0), asset **portwise-0.1.0.vsix**, **82556 bytes**.
- SHA256: **A3E5D5CC70703B9B236917A984E11277948AA4594D02863B74276E0B18A2B9ED**. GitHub's published asset digest matches the artifact verified on both PCs.

These 0.1.0 values are comparison evidence, not 0.1.1 publishing inputs. No real Codex home or credential is needed for this documentation/metadata release.
