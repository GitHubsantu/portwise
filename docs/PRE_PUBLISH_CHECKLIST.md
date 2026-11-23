# 0.1.2 pre-publish checklist — review first

**0.1.0 is published. 0.1.2 is a docs/metadata candidate, not authorized for publication, tagging or release creation.** The previous release's manual/T9 acceptance remains recorded; it is not an all-PASS security guarantee or approval of new package bytes.

## Candidate inputs

The 0.1.2 PHASE REPORT supplies the exact full commit SHA, successful Ubuntu/Windows CI run ID, artifact name and contained VSIX SHA256 after CI completes. Copy those four fields together after the owner approves the candidate. They are not available at the time this source commit is prepared; placeholders below must never be dispatched.

```text
commit_sha: FULL_0_1_2_COMMIT_SHA_FROM_PHASE_REPORT
ci_run_id: SUCCESSFUL_0_1_2_CI_RUN_ID_FROM_PHASE_REPORT
artifact_name: portwise-vsix
vsix_sha256: EXACT_0_1_2_VSIX_SHA256_FROM_PHASE_REPORT
```

## Review before authorizing release actions

1. Read README.md, CHANGELOG.md and RELEASE_NOTES.md. Confirm the package and lockfile both say **0.1.2**, with identity **santu-dev.portwise** and repository **https://github.com/GitHubsantu/portwise.git**. Runtime sources, dependencies, settings and commands must be unchanged.
2. Download **portwise-vsix** from the specific green CI run in the report. Both Ubuntu and Windows must pass, including their real Extension Host integration tests. Inspect the contained **portwise-0.1.2.vsix** and measure its Length/SHA256. Do not substitute a local rebuild or a later docs-commit artifact.
3. Check the report's archive comparison against the exact 0.1.1 baseline below. Every packaged `dist` file must be byte-identical. Only README, changelog, package manifest and VSIX version manifest are expected to change inside the VSIX (the new docs PNGs remain repository-hosted); do not accept an unexplained file, runtime-byte difference or security-text change.
4. Confirm the real panel/Diagnostics PNGs render with matching captions (Running/provider card and 6 PASS / 3 WARN / 0 FAIL). Preserve the original image hashes in DIST_0.1.2.md and the old .md landing-page links. Badge/install checks remain; badges are cached public data, not hard-coded counts.
5. Keep the established **marketplace-production** required-reviewer/main-only protection and Marketplace **Portwise release** trust policy. No PAT, stored publishing token or workflow change is part of 0.1.2. Setup evidence is in TRUSTED_PUBLISHING.md. The owner must explicitly approve the exact candidate and release actions before continuing.

## Only after explicit approval (not executed)

1. Create/push annotated tag **v0.1.2** at the exact candidate source commit from the report.
2. Create a **GitHub draft release** for that tag; attach the original approved CI-built 0.1.2 VSIX and use RELEASE_NOTES.md. Keep the draft unpublished until the publication review is complete.
3. Dispatch **publish.yml** on **main** with the four exact approved inputs. Review the validation summary, then approve **marketplace-production**. The workflow downloads without rebuilding, checks both manifests/version and SHA256 again, and publishes with `vsce publish --oidc --packagePath` with no version argument or PAT fallback.
4. Verify the Marketplace identity/version and the released attachment checksum before promoting the GitHub draft. No 0.1.2 release action is authorized by this checklist.

## 0.1.1 comparison baseline

- Source: **7970d2c28d22207eeec8b7030d2367de7e84d858**; [CI run 45129623148](https://github.com/GitHubsantu/portwise/actions/runs/45129623148), artifact **portwise-vsix**.
- Contained file **portwise-0.1.1.vsix**, **83653 bytes**. The GitHub v0.1.1 asset digest matches; the GitHub release was a draft when inspected, not modified by this task. The owner supplied real captures from the 0.1.1 Marketplace build.
- SHA256: **C15EC56E9DCA6C8EF693B5A9724213BABBC9451D1B7370F86FC17D2E97AFB6AE**.

These 0.1.1 values are comparison evidence, not 0.1.2 publishing inputs. No real Codex home or credential is needed for this documentation/metadata release.
