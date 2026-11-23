# 0.1.2 runtime and screenshot checks

Status: **PASS** for the actual local 0.1.2 VSIX comparison. All four packaged dist files are byte-identical to the exact 0.1.1 baseline. The final PHASE REPORT supplies the independently verified CI commit/run/artifact/SHA256 and repeats the comparison on its downloaded VSIX; this document does not authorize publication, tags or release creation.

Baseline: 0.1.1 CI [45129623148](https://github.com/GitHubsantu/portwise/actions/runs/45129623148), source `7970d2c28d22207eeec8b7030d2367de7e84d858`, artifact `portwise-vsix`, contained VSIX 83653 bytes, SHA256 **C15EC56E9DCA6C8EF693B5A9724213BABBC9451D1B7370F86FC17D2E97AFB6AE**. The GitHub v0.1.1 asset digest matches this baseline; that GitHub release was a draft when inspected, and was not changed. The owner supplied captures from the 0.1.1 Marketplace build.

Method: read both actual VSIX archives and compare every packaged dist Buffer byte-for-byte. Source-only equality is insufficient. The comparison found the same 17 entries, with only README/changelog/package JSON/VSIX version metadata changed and no file added or removed.

## Packaged runtime equality

| Packaged file | SHA256 in both 0.1.1 and 0.1.2 | Result |
|---|---|---|
| `extension/dist/extension.js` | `cc76612c5fe37f0425fd465770168cdc9f0044c7e103ac9c35f0120364763adf` | byte-identical |
| `extension/dist/gateway.js` | `8652d62cf531cb08cfde577ca4d4fde464211a990ad079d313db33bfec4f8a2f` | byte-identical |
| `extension/dist/webview/main.css` | `a9b070757eca677062b8dbc416f74e5255b77ba0e79bc6a98f0aa09066dc1b69` | byte-identical |
| `extension/dist/webview/main.js` | `9bfd26f4b358b8060cab855e5926211eceeefae3c5d3fd18c5b6c05c65aee3b1` | byte-identical |

Only `extension.vsixmanifest`, `extension/package.json`, `extension/readme.md` and `extension/changelog.md` change. The other 13 payload files are unchanged. Packaged README URLs resolve to the repository raw/blob PNG paths under docs/images; the screenshots are repository-hosted documentation, not added runtime/VSIX assets.


## Original screenshot bytes

| Repository file | Dimensions | Length | Original SHA256 |
|---|---|---|---|
| docs/images/panel.png | 386 × 938 | 41370 | de198f7ce606b84fa6df415626cb291ebfa17cd9cf2325e4e5157e96f7be7f2a |
| docs/images/diagnostics.png | 1385 × 401 | 99765 | c680b5e241508f1c0934b5cd500d056b8feb753f868f61d32a892fd0de64856a |

Visually inspected without editing: panel Running on port 8787 with the Enabled Fake Upstream provider; Diagnostics 6 PASS / 3 WARN / 0 FAIL. The images show fake/isolated test data, a masked fake suffix and a redacted label; a generic test-home path is visible in Diagnostics. No email or credential value was visible.

The .md files were placeholder landing pages, not images. They are retained as links/provenance pages for released README compatibility. The new README embeds the two PNGs directly. docs/** remains excluded from the VSIX; packaged README image/link rewriting must point to the repository PNGs, without adding runtime assets or local machine paths.

[Release notes](RELEASE_NOTES.md) · [Pre-publish review](PRE_PUBLISH_CHECKLIST.md)
