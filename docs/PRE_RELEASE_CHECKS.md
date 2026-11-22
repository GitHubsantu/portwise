# Phase 8 — user-run Windows checks

**Dev-PC reload status recheck (2026-11-23), user-reported PASS:** `be64c4a363485e53bb947bc03b747717d1fec30d`, hash-verified VSIX SHA256 `DF5859E00091C28C1BC22543D560AD7D72692871373708F35369ADFC18050C4E`, isolated profile and port 47834. With owned daemon running and autoStartGateway off, Reload Window showed Running on port 47834 in both panel and status bar without Start. Stop showed Stopped on both and freed the port. Earlier ebb0220/8369843 lifecycle, adoption, orphan refusal and Configure/Restore results remain accepted for those builds. T9 remains open; no new second-PC acceptance is claimed.

**Dev-PC final VSIX recheck (2026-11-22), user-reported PASS:** `ebb0220`, SHA256 `16FCE98763C481820CA5D5D154F1B8CF3BD3A0E5A1D139BE000C928B0275D411` verified, isolated profile, fresh empty Codex home and port 47833. Start/Stop/Start/Restart caused no Codex-file changes. Reload adopted one listener; Diagnostics health/daemon/local-token passed and Stop freed the port. A second isolated profile could not Start/Stop/Restart or send configuration; the original PID stayed running. Configure Cancel/Approve and repeat no-op passed; external edits survived Configure, oldest backup Restore and undo passed, and no .tmp/.bak/lock files remained. Diagnostics and Copy redacted report contained no credentials. The previous Extension Host first-start failure was resolved in this test. This does not claim a new second-PC recheck or T9 clearance.

**Acceptance status (2026-11-22): Part A, steps 1–5, PASS; Part B, steps 6–10, PASS (user-reported).** The second PC used standard installed VS Code, an isolated profile, local account Admin, an i3 sixth-generation CPU and 4 GB RAM. Part A passed on `fab0415`; Part B passed on `83d1ffb` with Codex CLI 0.171.0. The earlier CLI-unavailable and Switch-timeout statuses are superseded. These manual gates are accepted; final Phase 8 release approval remains open.

Validated artifact: commit `fab0415`, VSIX SHA256 `1B70C3F5E9CA139218910FA307B4659965227543923D0D64106899B3A5FD917C`, hash verified by the user on both PCs. Configure succeeded: config.toml grew from 36 to 298 bytes; .env was created at 67 bytes. Repeat Configure preserved bytes/timestamps; Start/Stop and Cancel wrote nothing. Diagnostics reported PASS for health, daemon, local-token, credential-delivery and permissions; config, provider, codex-home and restart reported the expected WARN states. The Command Palette showed 15 Portwise commands plus VS Code's own **View: Show Portwise** entry. The earlier `349e5d7` backup/icacls exit 3 failure was resolved by `fab0415` in this setup; long-path compatibility remains the likely explanation, not a separately proven native cause.

**Part B accepted artifact:** `83d1ffb`, VSIX Length 75,152 bytes, SHA256 `7AB11D5E9CA20647AD559E66DF7726AB1A090D9E92028227AD81016B0BF193EA`, verified by the user on both PCs. Official login showed the exact-path dialog and created auth.json (Length 4484 bytes). Save Current succeeded once; a second Save was refused with one toast. Switch succeeded after the read-only ACL inspection deadline fix; Remove changed no files and left no stale lock. The real Codex home was not used on this PC.

**Observed notes:** Save did not automatically refresh the panel; the existing **Refresh** action showed the saved account. The official CLI printed "could not create PATH aliases" for the TEMP home; it did not prevent the reported successful login. Neither note is a claim that Portwise changed credentials unexpectedly. No panel-refresh fix is included in this acceptance record.

The following procedure remains for reproducing the checks. Run one numbered step at a time in the SAME PowerShell window. Stop at the first unexpected result. These commands never read or write your real Codex home. They create a new isolated VS Code profile/extensions directory and Codex home under TEMP. Do not substitute an existing test home or copy real credentials into it.

Report only PASS/FAIL and hashes/Length/LastWriteTime. Do not paste auth.json, .env, terminal login output, browser codes, URLs containing login state, process arguments or logs. Sign in only in the official browser flow. The login check uses a real account solely in this new isolated home; the agent does not run it.

## A. Fresh Windows VSIX installation

### 1. Select the locally built VSIX and create a new test root

Open a standalone PowerShell from the Start menu at the Portwise repository root, rather than an integrated terminal in an existing editor. This chooses test port **47832** deliberately; if it is occupied, choose another port explicitly in the isolated profile before Start Gateway. Never stop an unidentified process.

```powershell
$pwVsix = (Resolve-Path -LiteralPath '.\portwise-0.1.0.vsix' -ErrorAction Stop).Path
Get-Item -LiteralPath $pwVsix | Select-Object Name, Length, LastWriteTime
Get-FileHash -LiteralPath $pwVsix -Algorithm SHA256 | Select-Object Hash
$pwRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('portwise-pre-release-' + [guid]::NewGuid().ToString('N'))
$null = New-Item -ItemType Directory -Path $pwRoot -ErrorAction Stop
$pwCodexHome = Join-Path $pwRoot 'codex-home'
$pwData = Join-Path $pwRoot 'vscode-data'
$pwExtensions = Join-Path $pwRoot 'extensions'
$pwWorkspace = Join-Path $pwRoot 'workspace'
foreach ($pwDirectory in @($pwCodexHome, $pwData, $pwExtensions, $pwWorkspace)) {
    $null = New-Item -ItemType Directory -Path $pwDirectory -ErrorAction Stop
}
$pwUtf8 = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllText((Join-Path $pwCodexHome 'config.toml'), "cli_auth_credentials_store = `"file`"`n", $pwUtf8)
$null = New-Item -ItemType Directory -Path (Join-Path $pwData 'User') -ErrorAction Stop
$pwSettings = @{
    'portwise.codexHome' = $pwCodexHome
    'portwise.autoStartGateway' = $false
    'portwise.gatewayPort' = 47832
    'portwise.logLevel' = 'info'
    'telemetry.telemetryLevel' = 'off'
} | ConvertTo-Json
[System.IO.File]::WriteAllText((Join-Path $pwData 'User\settings.json'), $pwSettings, $pwUtf8)
```

Expected: a unique new test root; no auth.json yet. Paths stay in these session variables—no credential is placed in argv or an environment variable. The only environment value set below is the non-secret CODEX_HOME path.

### 2. Define a metadata-only baseline helper

```powershell
function Get-PortwiseTestMetadata {
    foreach ($pwName in @('config.toml', '.env', 'history.jsonl', 'auth.json')) {
        $pwFile = Join-Path $pwCodexHome $pwName
        if (Test-Path -LiteralPath $pwFile -PathType Leaf) {
            $pwItem = Get-Item -LiteralPath $pwFile
            $pwHash = $null
            if ($pwName -ne 'auth.json') { $pwHash = (Get-FileHash -LiteralPath $pwFile -Algorithm SHA256).Hash }
            [pscustomobject]@{ Name=$pwName; Hash=$pwHash; Length=$pwItem.Length; LastWriteTime=$pwItem.LastWriteTime }
        } else {
            [pscustomobject]@{ Name=$pwName; Hash=$null; Length=$null; LastWriteTime=$null }
        }
    }
}
$pwBaseline = @(Get-PortwiseTestMetadata)
$pwBaseline | Format-Table Name, Hash, Length, LastWriteTime
```

This intentionally never hashes or prints account credential contents. Missing files appear with blank metadata.

### 3. Install and launch the isolated profile

Use a standard installed VS Code, not Portable Mode: its data folder overrides these isolation flags. This preflight stops on a portable environment or sibling data folder, before starting Code. A custom code alias/wrapper is not accepted for this checklist.

```powershell
$pwCodeCommand = Get-Command code -ErrorAction Stop
if ([string]::IsNullOrEmpty($pwCodeCommand.Source) -or [System.IO.Path]::GetFileName($pwCodeCommand.Source) -ne 'code.cmd') { throw 'Use the standard Windows code.cmd CLI; stop here.' }
$pwCodeRoot = Split-Path (Split-Path $pwCodeCommand.Source -Parent) -Parent
if (-not [string]::IsNullOrEmpty($env:VSCODE_PORTABLE) -or (Test-Path -LiteralPath (Join-Path $pwCodeRoot 'data'))) { throw 'Portable Mode can override isolation flags; stop here.' }
$env:CODEX_HOME = $pwCodexHome
& $pwCodeCommand.Source --user-data-dir $pwData --extensions-dir $pwExtensions --install-extension $pwVsix
if ($LASTEXITCODE -ne 0) { throw 'VSIX installation failed; stop here.' }
& $pwCodeCommand.Source --user-data-dir $pwData --extensions-dir $pwExtensions --new-window $pwWorkspace
```

Expected: a fresh VS Code window with the locally installed Portwise. Do not enable Settings Sync, sign into a VS Code profile or install/enable the Codex panel in this isolated window. The global Codex CLI may already be on PATH; this check installs no new CLI/tool. If local policy blocks installation, record that limit instead of changing machine policy.

### 4. Inspect activation and cancel-only actions

In the NEW window, verify the four Portwise User settings show this test configuration. Open the Activity Bar panel and the three-step walkthrough. Check the 15 Command Palette entries and **Show Logs** for activation errors. Try **Add provider**, then Cancel. The gateway must still be stopped because auto-start was disabled.

```powershell
Compare-Object -ReferenceObject $pwBaseline -DifferenceObject @(Get-PortwiseTestMetadata) -Property Name, Hash, Length, LastWriteTime
```

Expected: no comparison rows, no new .env/auth.json/history file. Do not run Portwise commands from your original VS Code window during these checks.

### 5. Start, cancel Configure, then configure explicitly

Run **Start Gateway**, then **Stop Gateway**. Repeat the metadata comparison from step 4: expect no rows. Start again; run **Configure Codex for Gateway** and Cancel after checking the exact path is `$pwCodexHome`. Compare again: still no rows.

Now Configure again and approve **only if the displayed canonical path matches the new test home**. Config/.env changes and extension-storage backups are expected after approval. Run Configure once more and approve; it should be a no-op. Keep this post-approval baseline:

```powershell
$pwConfigured = @(Get-PortwiseTestMetadata)
$pwConfigured | Format-Table Name, Hash, Length, LastWriteTime
```

After the repeat Configure:

```powershell
Compare-Object -ReferenceObject $pwConfigured -DifferenceObject @(Get-PortwiseTestMetadata) -Property Name, Hash, Length, LastWriteTime
```

Expected: no rows. Run Diagnostics and Copy redacted report; dismiss once to check no copying. Health/daemon/local-token and matching config/delivery/permissions should pass; provider may WARN with no enabled provider, config may WARN because model_provider has not been switched, Windows writability/restart warnings are expected. A port conflict is a stop-and-resolve condition, not permission to kill another process. Stop Gateway before part B.

## B. Real official Codex login in the isolated home

**PASS — user acceptance on `83d1ffb`:** real official login, single-use Save, Switch and Remove passed as recorded above. The previous five-second ACL-read timeout was resolved on this slow PC. D-40 gives read-only inspection 20 seconds with one timeout-only retry after confirmed close, retaining fail-closed ACL checks and five-second identity/apply deadlines. The user performed the real-account checks; the agent has not installed a CLI, run real login or accessed real credentials. Retain the isolation and metadata-only checks below for future reproduction; use Refresh if Save does not update the panel.

### 6. Check the CLI exists without running a login command

```powershell
$null = Get-Command codex -ErrorAction Stop
if ($env:CODEX_HOME -ne $pwCodexHome) { throw 'The test PowerShell CODEX_HOME changed; stop here.' }
if (Test-Path -LiteralPath (Join-Path $pwCodexHome 'auth.json')) { throw 'This new home already has credentials; stop and investigate before login.' }
```

Expected: no output/errors. Do not list environment variables or process arguments. This new test home's config was created with explicit file-store mode. If organizational policy enforces another store, record unsupported/blocked; do not change real policy or the real home.

### 7. Launch only through Portwise and finish the official browser flow

In the isolated VS Code window run **Portwise: Add Account via Codex Login**. Check its exact-path dialog against `$pwCodexHome`, then choose **Start login**. The existing implementation starts exactly `codex login` with terminal env CODEX_HOME set to that confirmed home. No extra login flags are added. Complete the official browser sign-in yourself and wait for the terminal's success indication; do not paste/capture terminal or browser login text.

After successful completion, in the original test PowerShell:

```powershell
$pwAuthPath = Join-Path $pwCodexHome 'auth.json'
if (-not (Test-Path -LiteralPath $pwAuthPath -PathType Leaf)) { throw 'No file-store auth.json in the isolated home; stop here.' }
Get-Item -LiteralPath $pwAuthPath | Select-Object Name, Length, LastWriteTime
$pwAfterLogin = @(Get-PortwiseTestMetadata)
```

Expected: nonzero Length. Official Codex may create logs/caches or update files during login; that is why the Portwise-operation baseline is captured AFTER login. Never open the credential file or paste logs. No completion is inferred from a browser opening alone.

### 8. Save exactly once and verify the permit

Run **Portwise: Save Current Codex Account**, use a generic name such as **Release check**, and confirm its success notice. Run Save again without another login launch: expect the fresh-login refusal once, with no second snapshot.

```powershell
Compare-Object -ReferenceObject $pwAfterLogin -DifferenceObject @(Get-PortwiseTestMetadata) -Property Name, Hash, Length, LastWriteTime
```

Expected: no rows. Save stores a SecretStorage snapshot and does not replace auth.json. Only the generic name/current label should reach the panel.

### 9. Switch the saved account, restart and remove the snapshot

Choose **Portwise: Switch Codex Account**, select **Release check**, and verify the exact-home confirmation. Approve. Expect the restart message and no stale operation lock. This switches to the same newly saved real snapshot; no second real account is needed. Restart/reload ONLY the isolated window. Keep the Codex panel disabled.

```powershell
$pwAfterSwitch = @(Get-PortwiseTestMetadata)
Compare-Object -ReferenceObject @($pwAfterLogin | Where-Object Name -ne 'auth.json') -DifferenceObject @($pwAfterSwitch | Where-Object Name -ne 'auth.json') -Property Name, Hash, Length, LastWriteTime
Get-Item -LiteralPath $pwAuthPath | Select-Object Name, Length, LastWriteTime
Get-ChildItem -LiteralPath $pwCodexHome -Force -Filter '.portwise*' | Select-Object Name, Length, LastWriteTime
```

Expected: no unrelated-file comparison rows and no stale Portwise lock; auth.json LastWriteTime may change on the explicit switch. In the isolated window run **Remove Saved Codex Account**, choose the generic test snapshot and confirm Remove. Compare the complete metadata with `$pwAfterSwitch`: expect no file changes. Snapshot removal does not log Codex out or delete its active credential file.

### 10. Record results and close the isolated session

Report PASS/FAIL per step and metadata only. No prompts/code/provider requests are needed for this login-completion check. Stop any test gateway, close the isolated VS Code window and the test PowerShell session (this also drops its process-only CODEX_HOME override). The isolated root still contains real test-login credentials and private VS Code storage/backups; keep it private and remove ONLY that reviewed new test root when you are ready. No automatic recursive deletion is supplied. Do not remove or change the real Codex home.

## Sources and acceptance

Checked 2026-11-21: [VS Code CLI isolation/install options](https://code.visualstudio.com/docs/configure/command-line), [official Codex authentication](https://developers.openai.com/codex/auth/) and [CODEX_HOME/config locations](https://developers.openai.com/codex/config-advanced/). Portwise launch arguments/path handling are verified by source and regression tests; authentication/network completion is the manual gate. Real-account data is never used by the automated suite.

The user's `fab0415` and `83d1ffb` results close the Part A and Part B manual gates respectively, with the observations above retained. Final Phase 8 release review and explicit release approval remain open. No publication, tag or release is performed by these checks.
