# Batch C manual checks (pending user validation)

Use a disposable fake Codex home only, with the Codex panel disabled. Do not launch login just to prepare fake snapshots: official Codex may remove fake auth.json. Set portwise.codexHome to the intended test copy and use a fake loopback provider if testing upstream authentication. Never select the real home or paste credential contents.

1. With the gateway running, run **Portwise: Run Diagnostics**. Check separate health/daemon/local-token/config/credential-delivery/permissions/provider results. A correctly configured file should pass its measured checks. A non-selected Portwise provider is WARN. Windows home writability is deliberately WARN; no write probe runs. The restart Codex/VS Code warning remains.
2. Choose **Copy redacted report** in the notification. Inspect it locally: statuses and actionable hop/fix hints only, no tokens, auth.json contents, response bodies or parser text. Dismissing the notification must not copy anything.
3. Stop Gateway and run Diagnostics again. Health/daemon should fail with Start Gateway guidance; no repair/start or token creation should occur. Start Gateway afterward if desired.
4. On a separate disposable copy with intentionally stale config or a wrong FAKE local token in .env, Diagnostics must show the corresponding FAIL and leave bytes/timestamps unchanged. A fake upstream 401 must be reported as an upstream authentication failure. Do not alter real credentials or weaken ACLs to trigger a failure.
5. Open/refresh the panel: providers, account names, masked suffixes and existing actions must still work; HTML-like names remain plain text. Malformed provider-state injection and secret-field withholding are automated-only checks.
6. Compare test-home metadata/hashes before and after Diagnostics/Copy/Refresh. No home file should be created/replaced; no lock should remain. Automated tests cover linked targets and malformed/oversized/slow health responses; no manual pass is claimed for those fault cases.

Copy-only TEST-home baseline commands (run before and after, adjusting only to your disposable path):

```powershell
$pwTestHome = 'E:\portwise-test-codex3'
Get-Item -LiteralPath $pwTestHome | Select-Object FullName, Attributes
'config.toml', '.env', 'auth.json', 'history.jsonl' | ForEach-Object {
    $pwTestFile = Join-Path $pwTestHome $_
    if (Test-Path -LiteralPath $pwTestFile -PathType Leaf) {
        Get-Item -LiteralPath $pwTestFile | Select-Object Name, Length, LastWriteTime
        Get-FileHash -LiteralPath $pwTestFile -Algorithm SHA256 | Select-Object Path, Hash
    }
}
Get-ChildItem -LiteralPath $pwTestHome -Force -Filter '.portwise*' | Select-Object Name, Length, LastWriteTime
```

If the user intentionally changes a test file, record that new baseline rather than comparing it to a pre-change hash. Home A's accepted post-Configure baseline is recorded in PLAN.md. Fresh Windows VSIX install, real-account login and README work remain separate and unfinished.
