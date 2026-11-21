# Batch B manual regression checks

Automated verification covers fault injection, ACL rejection, concurrent writes, backup cleanup failure, slow/oversized gateway uploads, backpressure and malformed child bootstrap. These are not claimed as manual passes. Do not weaken folder permissions or break the installed daemon to reproduce faults manually.

Use an existing disposable fake home such as `E:\portwise-test-codex3`. Disable the Codex panel when testing fake credentials. Confirm `portwise.codexHome` names that exact real directory. Never select your real home and never print auth.json, .env or SecretStorage contents. All existing path confirmations and login permits still apply.

1. Start the gateway, Configure and approve the exact test path. Repeat Configure: bytes/timestamps/backups must stay unchanged on a no-op. Start alone must not write Codex files.
2. In the fake file-store home, switch between fake snapshots. Confirm the restart notice and that a subsequent operation works. Config/history/.env must be unchanged by switching. Existing file-store refusal and single-use Save permit must still work.
3. Make a harmless external edit to a COPY of the test config, then Configure and Restore using that copy as the selected test home. The selected backup must restore the expected bytes. Never edit credentials to exercise a race; external-edit and cleanup-failure paths are automated.
4. Exercise provider edit, disable, enable and delete against your fake loopback upstream. The running gateway must reflect changes without restart. Check the Portwise output for actionable messages and no credential values.
5. For permissions, inspect only metadata/ACLs of the disposable target and its extension-storage backups. A changed file must have a protected current-user DACL on Windows. The automated suite verifies failed ACL commands leave the affected original intact; a Configure error may report that an earlier step already completed.
6. If any failure occurs naturally, expect a fixed actionable extension/gateway message, without raw parser input, process stderr or credential values. Do not deliberately alter executables, real-home ACLs or process arguments to force it.

Copy-only metadata/hash commands for the TEST home:

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
```

For extension-storage backup names/Length/LastWriteTime and their exact path format, reuse `docs/F5_BATCH_A.md`. No real credential values need to be pasted. Fresh Windows VSIX installation and real Codex login remain separate pre-release checks.
