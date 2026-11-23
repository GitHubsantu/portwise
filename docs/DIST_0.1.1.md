# 0.1.1 packaged runtime comparison

Status: **PASS** for the local 0.1.1 VSIX comparison performed during candidate preparation on 2026-11-23. The final CI artifact is checked separately and its immutable commit/run/artifact/SHA256 is reported in the PHASE REPORT; no 0.1.1 release action is authorized by this evidence.

Baseline: [published v0.1.0 VSIX](https://github.com/GitHubsantu/portwise/releases/download/v0.1.0/portwise-0.1.0.vsix), 82556 bytes, SHA256 **A3E5D5CC70703B9B236917A984E11277948AA4594D02863B74276E0B18A2B9ED**. The published release asset's digest was checked through GitHub and matches the approved CI artifact verified on both PCs.

Method: read both actual VSIX archives using the exact-pinned vsce ZIP reader. Require the same entry set, compare every packaged dist Buffer byte-for-byte, then calculate SHA256 of each entry independently. Comparing source files alone is not the evidence.

| Packaged file | SHA256 in both 0.1.0 and 0.1.1 | Equality |
|---|---|---|
| `extension/dist/extension.js` | `cc76612c5fe37f0425fd465770168cdc9f0044c7e103ac9c35f0120364763adf` | byte-identical |
| `extension/dist/gateway.js` | `8652d62cf531cb08cfde577ca4d4fde464211a990ad079d313db33bfec4f8a2f` | byte-identical |
| `extension/dist/webview/main.css` | `a9b070757eca677062b8dbc416f74e5255b77ba0e79bc6a98f0aa09066dc1b69` | byte-identical |
| `extension/dist/webview/main.js` | `9bfd26f4b358b8060cab855e5926211eceeefae3c5d3fd18c5b6c05c65aee3b1` | byte-identical |

Both archives contain **17 files**; none added or removed. Exactly four payload files change:

- `extension.vsixmanifest` — version metadata 0.1.0 → 0.1.1.
- `extension/package.json` — root extension version only.
- `extension/readme.md` — tone, published installation links, live badges and current roadmap.
- `extension/changelog.md` — 0.1.1 docs/metadata entry and published 0.1.0 history boundary.

The other 13 payload files are byte-identical, including all runtime output, original artwork, walkthrough media and licence. Runtime sources/build settings/workflows/dependency entries are unchanged. Separate text comparisons retain the exact README disclaimer, restart/file-store alerts, security table and known-limit bodies, settings table, and release-note boundaries; only the known-limit headings lose the old release-specific suffix.

Full VSIX checksums differ because documentation/version metadata changes, and ZIP timestamps can also differ between builds. The 0.1.0 package checksum must never be used to approve 0.1.1. Approval must name the exact new CI-built VSIX, not the locally rebuilt archive.

[Release notes](RELEASE_NOTES.md) · [Pre-publish review](PRE_PUBLISH_CHECKLIST.md)
