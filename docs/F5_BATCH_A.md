# Batch A: combined F5 check

Pending user execution. Use fake accounts only; disable the Codex panel on the test CODEX_HOME. Do not sign in with a real account. Keep existing test providers until these checks finish. Commands never display auth.json or .env contents; sensitive-file comparisons use only hashes, Length and LastWriteTime. No cleanup command is provided: keep the isolated copies for diagnosis.

1. **Prepare an isolated copy and baseline (#1–#3).** In PowerShell, copy the existing FAKE test home to a fresh sibling under the temporary directory. These commands do not copy from the real home. Stop if `E:\portwise-test-codex3` contains real credentials.

   ```powershell
   $batchAA = 'E:\portwise-test-codex3'
   $batchARoot = Join-Path ([IO.Path]::GetTempPath()) ('portwise-f5-a-' + [guid]::NewGuid().ToString('N'))
   New-Item -ItemType Directory -Path $batchARoot | Out-Null
   $batchAB = Join-Path $batchARoot 'home-b'
   Copy-Item -LiteralPath $batchAA -Destination $batchAB -Recurse
   function Get-BatchAFileState([string]$Directory) {
     foreach ($name in @('config.toml', '.env', 'auth.json', 'history.jsonl')) {
       $file = Join-Path $Directory $name
       if (Test-Path -LiteralPath $file -PathType Leaf) {
         $item = Get-Item -LiteralPath $file
         [pscustomobject]@{ Name=$name; Length=$item.Length; LastWriteTime=$item.LastWriteTime; SHA256=(Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash }
       }
     }
   }
   $batchAAStart = Get-BatchAFileState $batchAA
   $batchABStart = Get-BatchAFileState $batchAB
   $batchAReal = Join-Path ([Environment]::GetFolderPath('UserProfile')) '.codex'
   $batchARealStart = Get-BatchAFileState $batchAReal
   $batchAB
   ```

2. **Current settings and consent (#1).** In the F5 host, start the gateway and set User setting `portwise.codexHome` to A. Configure only if desired; then take A's baseline again. Change the setting to the printed B path WITHOUT Reload Window. Tooltip must show B. Configure must name B; Cancel leaves both homes unchanged. Configure again and approve: only B's managed config/.env may change. Switch/Restore must also name B. If you change the setting while a confirmation is open, the operation must abort rather than writing the old target.

   ```powershell
   Compare-Object $batchAAStart (Get-BatchAFileState $batchAA) -Property Name,Length,LastWriteTime,SHA256
   Compare-Object $batchABStart (Get-BatchAFileState $batchAB) -Property Name,Length,LastWriteTime,SHA256
   ```

   Expected after Cancel: no output. After approved Configure: only intended B config/.env changes; A remains unchanged. Reset a baseline after each intentional write, rather than treating it as a failure.

3. **Login target (#2).** With B selected, run Add Account via Codex Login. First Cancel the new exact-B-path dialog: no terminal and no permit. For a positive check, approve the dialog with a debugger breakpoint on `createTerminal` in `startCodexLogin`: inspect only `home` and the terminal options' `env.CODEX_HOME`, both B; `shellPath` is `codex` and `shellArgs` contains only `login`. Continue, then close the terminal/browser without completing real login. Codex itself may change fake credentials during launch; those changes are confined to B and are not proof of a Portwise file write. Save Current remains single-use and requires a fresh launch. Do not expand credential or SecretStorage values in the debugger.

4. **Linked home/target refusal (#3).** This junction points only to B:

   ```powershell
   $batchALink = Join-Path $batchARoot 'linked-home'
   New-Item -ItemType Junction -Path $batchALink -Target $batchAB | Out-Null
   ```

   Set codexHome to the junction and try Configure and Save Current: both must refuse the linked home. To test a linked file without replacing an existing file, copy B to another fresh directory, rename that copy's config.toml in Explorer, and create a symbolic link at config.toml to that renamed FAKE file (Windows Developer Mode/admin may be needed). Configure must refuse it. Repeat with auth.json for Save/Switch. Restore the setting to B. Automated path tests cover file symlinks, junctions, last-moment replacements and outside-file preservation if file-link creation is unavailable locally; report a manual skip honestly.

5. **Running daemon follows provider changes (#4).** Start a harmless fake upstream in a separate visible PowerShell terminal:

   ```powershell
   @'
   const http = require('node:http');
   const server = http.createServer((request, response) => {
     const accepted = request.headers.authorization === 'Bearer test-token-0000';
     response.writeHead(accepted ? 200 : 401, {'content-type':'application/json'});
     response.end(accepted ? '{"data":[]}' : '{"error":"fake token rejected"}');
   });
   server.listen(0, '127.0.0.1', () => console.log('http://127.0.0.1:' + server.address().port + '/v1'));
   '@ | node
   ```

   Add a fake provider with the printed URL and obvious fake token `test-token-0000`; disable other FAKE providers so this one is selected. Keep the gateway running. After Configure B, use this probe in the original PowerShell. It reads B's local gateway-token line in memory solely to authenticate a harmless loopback GET models; it outputs only the HTTP status, never a credential/header/body. Do not enable verbose/debug HTTP tracing.

   ```powershell
   $batchAGatewayPort = 47831 # use your configured Portwise port
   function Test-BatchAGateway {
     $line = [IO.File]::ReadLines((Join-Path $batchAB '.env')) | Where-Object { $_.StartsWith('PORTWISE_GATEWAY_TOKEN=') } | Select-Object -First 1
     if (-not $line) { throw 'Configure the isolated B home first.' }
     $localCredential = $line.Substring('PORTWISE_GATEWAY_TOKEN='.Length)
     try {
       (Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$batchAGatewayPort/v1/models" -Headers @{ Authorization=('Bearer ' + $localCredential) }).StatusCode
     } catch {
       if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 'Gateway unreachable' }
     } finally { $localCredential = $null; $line = $null }
   }
   Test-BatchAGateway
   ```

   Expected sequence without restarting the gateway: enabled fake provider → 200; Edit token to another obvious fake → 401; Edit back → 200; Disable → 503; Enable → 200; Delete with confirmation → 503. If others are enabled, the first remaining enabled provider is selected instead. URL edits are covered by changing the fake provider to another port-0 fake upstream. Synchronization failures must explicitly say the gateway may still use its previous provider and instruct Stop/Start, not show a successful provider-application status. Auth-failure/PUT-failure cases are covered by automated fake-upstream regressions; do not corrupt live state or expose tokens to manufacture them manually.

6. **Guard recovery (#14).** With no Portwise operation in progress and B selected, create a blank guard only if absent:

   ```powershell
   $batchAGuard = Join-Path $batchAB '.portwise-auth.lock.guard'
   if (Test-Path -LiteralPath $batchAGuard) { throw 'A guard already exists; inspect ownership before proceeding.' }
   New-Item -ItemType File -Path $batchAGuard | Out-Null
   ```

   Run Switch with a fake snapshot. Recovery must name the full `.guard` path. Cancel/Escape must leave the file/auth unchanged and show no error toast. Repeat and Confirm: recovery proceeds, and the guard is removed after the operation. Repeat the blank-guard test for Save Current (after a fresh login launch) and Remove (fake snapshot, confirmed deletion). Automated tests additionally verify a terminated owner, a live owner, concurrent recovery, identity changes and interrupted recovery claims. Do not remove a live guard by hand.

7. **Final invariants.** Hash/metadata checks only; no credential contents:

   ```powershell
   Compare-Object $batchARealStart (Get-BatchAFileState $batchAReal) -Property Name,Length,LastWriteTime,SHA256
   Get-BatchAFileState $batchAA
   Get-BatchAFileState $batchAB
   Get-ChildItem -LiteralPath $batchAB -Force -Filter '.portwise-auth.lock*' | Select-Object Name,Length,LastWriteTime
   ```

   Real-home comparison must produce no output. A must retain its baseline after operations targeted at B. B history must remain unchanged; only explicitly requested config/.env/account operations (or the official login process itself) may change corresponding B files. After completed operations, no lock/guard/claim should remain. Restore user's test-home setting when finished; keep real-account login as the separate pre-release check.
