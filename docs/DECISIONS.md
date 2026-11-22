# Decision Log

One entry per decision. Never leave a claim about Codex or VS Code without a source and date. Status: `UNVERIFIED` until Phase 0 fills it in.

## Template

```
### D-<n>: <title>
Status: UNVERIFIED | DECIDED | SUPERSEDED
Date: YYYY-MM-DD
Question: ...
Sources: <official URLs>
Decision: ...
Alternatives rejected: ...
Fallback if the source changes: ...
```

## Phase 8 decisions

### D-48: Shared verified gateway display after reload
Status: DECIDED
Date: 2026-11-23
Sources: User-reported dev-PC reload on 8369843; temporary loopback tests of activation and panel/status-bar rendering.
Decision: Start both displays at Checking. With auto-start disabled, queue a read-only status refresh using only the existing SecretStorage token; do not generate one. Use R1 proof and same-socket status with the existing R3 bounds. A free port displays Stopped; an occupied unverified port displays Unavailable. The panel and accessible status bar consume the same projected state; explicit Refresh and relevant settings changes recheck it. No daemon start, stop, provider sync or credential transmission before proof is permitted during refresh. Manual F5 acceptance remains pending.

### D-47: Child-owned startup lease and evidence-gated single respawn
Status: DECIDED
Date: 2026-11-22
Sources: Approved Commit 2 following Commit 1 dca63e1 and green Ubuntu/Windows CI; real delayed-child and private-channel fault tests.
Decision: New detached children use a private Node IPC channel alongside the closed stdin bootstrap. IPC contains only bounded lifecycle enums, public instanceId and a listened boolean; never tokens/configuration. A child requests permission before binding, holds a 120-second startup lease, and confirms only after the parent verifies R1 ownership/R3 status and safely writes state with unchanged settings. The lease spans the 20-second cold readiness window and slow private-state ACL work; IPC confirmation and cleanup each have 20-second bounds. Cancellation or parent disconnect before confirmation closes only that child's own server, including a server finishing a delayed bind. Confirmed daemons survive normal parent disconnect/reload. No process is killed and no ownership check is relaxed.
Retry: At most one respawn, only for fixed transient spawn/pipe/exit errors after that exact child has terminated, its private channel explicitly reported never listened, no listening message was observed, and the configured port is free. A timeout/disconnect alone is not proof; already-listened, unverified, foreign, bind-invalid and settings/state-write failures never authorize a retry. Immediate cancellation blocks permission even if ready arrives late. Windows IPC termination waits accept proven process exit as well as aggregate stdio close; the latter was delayed in a local regression. Unknown/unresponsive OS cleanup is reported as failure, never success or permission to respawn.
Validation: Real delayed child, successful single retry, exhaustion without an orphan, parent loss before confirmation, failure after listening without retry, settings cancellation and actual Extension Host command lifecycle. Unit negatives cover malformed/foreign/credential-bearing IPC messages, confirmation timeout, lease expiry, close failure, and exact closure/never-listened evidence. Prior fault reproduction now asserts listener absence and child termination. Existing R1/R3, consent, ACLs, dependencies and no-write lifecycle assertions remain required. New final-VSIX/second-PC acceptance remains user-run.

### D-46: Serialized gateway startup and effective configuration evidence
Status: DECIDED
Date: 2026-11-22
Sources: User-approved second-PC df9baaf investigation and two-commit plan; temporary real-child delay/pipe regressions.
Decision: Queue extension Start/Stop/Restart/auto-start together, and serialize direct controller lifecycle calls too. Snapshot effective port/auto-start and source enums at queue execution; skip auto-start when false. Re-read through startup and reject changed values or a configuration epoch change. Log only trigger, bounded port/boolean and source enums. Separate stdin/stderr/bootstrap-invalid/bind/child-start failures. Allow the same child a monotonic 20-second readiness window while retaining individual HTTP deadlines, proof and 4 KiB caps.
Evidence/remaining work: Delaying the real entry by 1.5 seconds passed with one child, including overlapping Start and queued Restart/Stop. A controlled stderr-pipe failure still allowed that real child to bind later without persisted state. Commit 2 is therefore required for child-owned lease cleanup; Commit 1 alone must not be described as orphan prevention. No blind PID kill, foreign adoption, dependency or permission change is authorized.

### D-45: Native loopback transport in the real Extension Host
Status: DECIDED
Date: 2026-11-22
Sources: User-approved ce02369 startup investigation; local installed Extension Host reproductions with fake stdin bootstrap, temporary empty home/storage and ephemeral loopback ports; gatewayTransport.test.ts and test/integration/gateway.cjs.
Decision: Construct native http.ClientRequest directly for ownership/control requests to fixed 127.0.0.1. VS Code's patched http.request factory replaced the requested keep-alive agent with a different non-keep-alive agent: valid 107-byte health/proof replies closed their socket, and R1 correctly rejected the replacement status socket. Direct construction preserves the dedicated agent and exact-socket guard; no credential is queued on a replacement. Keep HMAC/nonce/port binding, 500/1000 ms transport deadlines, 4096-byte response cap, consent and ACL policy. No proxy settings are changed and no dependency is added.
Diagnostics: Startup reports one fixed message with step spawn/health/proof/status and an allow-listed reason. Raw responses, exception messages/stacks, stderr and credentials are never formatted. Failed startup does not persist state or adopt/kill an unverified listener. Existing ownership and response-unavailable error codes remain for non-startup operations.
Validation: Retain existing genuine-daemon/hostile-proof/size tests; add substituted-factory and no-credential replacement-socket tests, classified startup/response failures and a single-toast command test. The separate integration runner now prepares explicit temporary CODEX_HOME, user data, extension storage and disabled auto-start before activation, bundles only the controller fixture, and exercises production dist/gateway.js inside a real Extension Host. First Start/status/reuse/Restart/Stop/port refusal and unchanged empty home run in both Ubuntu (xvfb) and Windows CI. The installed development-PC host also passed this lifecycle locally. No real home, account or provider is used.

### D-44: Verified delivery/Restore and prepared private recovery
Status: DECIDED
Date: 2026-11-22
Sources: User-approved R2; SECURITY_REVIEW.md; native/private-file and fault-injection evidence in verifiedUpdate.test.ts, accountPrompts.test.ts and existing delivery/Restore/backup/consent suites.
Decision: Share a verified-update helper only between .env delivery and config Restore. Keep the pre-write extension-storage backup; read/compare its exact original bytes before use. For an existing target, prepare a same-directory private rollback copy before publication. Secure every empty stage before private bytes, verify candidate bytes/ACL (and Restore TOML) before rename, then re-read/reparse and verify private permissions on the final target. Track the staged file by device/inode and expected bytes, including a rename that succeeded before reporting an error. Recovery rechecks canonical paths, identities and bytes immediately before renaming prepared verified original bytes back; restore absence for an originally missing .env. Verify the recovered target too. Never roll back over an external edit/replacement/link. Native ACL policy, command/read deadlines, operation locks, consent and R1/R3 are unchanged.
Failure policy: Post-write verification failures emit one fixed file_update_verification_failed message naming existing recovery commands, without raw bytes/errors/paths. Pre-publication ACL/apply errors retain their existing bounded diagnostics. Cleanup cannot mask an earlier failure. All published Portwise bytes have already passed content/private-stage verification; if the OS subsequently denies recovery or the target cannot be safely identified, report failure and keep private recovery data plus the retained backup. Do not claim automatic rollback can override OS denial, a persistent I/O failure or an external edit. Original absence/external files are preserved without unsafe deletion. No success notification is sent after failed verification.
Private temporaries: Recovery names are .env.<random UUID>.bak, shorter than the preflighted atomic stage for either target. Existing .env.* Git ignores cover them; .vscodeignore explicitly excludes them, with a real Git/VSIX packaging regression. Successful recovery/completion removes only the helper's own temporary file; interrupted/blocked recovery may retain a private copy for manual repair. The permanent timestamped backup layout/combined last-ten retention and selected-backup-before-pruning rule are unchanged.
Test budgets: A concurrent native run exposed two old 5000 ms .env functional timeouts after adding staged/recovery/final ACL reads. Use the existing platform-scoped PERMISSION_IO_TEST_MS (Windows 30000 ms, POSIX 5000 ms) for those two scenarios, retaining every assertion and all product deadlines. No global timeout, ACL relaxation, dependency or retry-policy change. Fault-matrix ACL commands are simulated with real parser checks; native positive and actual permission-drift cases separately exercise the OS.

### D-43: Fixed-size gateway response reads
Status: DECIDED
Date: 2026-11-22
Sources: User-approved R3; SECURITY_REVIEW.md; gateway server response shapes in src/gateway/daemon/server.ts; byte-boundary, malformed-data, cancellation and port-0 fake-server regressions in test/gatewayResponse.test.ts.
Decision: One shared reader caps public health, challenged health and authenticated status replies at 4096 actual body bytes before retaining/decoding JSON. Reject invalid UTF-8, syntax, non-object/array/null payloads, invalid instanceId (empty/non-string/over 200 characters), non-200 replies and status without running=true. Allow additional fields within the cap for compatible responses. Cancellation closes rejected bodies; no body/error/tool output is included in messages. The fixed typed failure is gateway_response_unavailable with hop gateway and owner-controlled Stop/Start/Diagnostics or explicit port/manual-owner guidance. Lifecycle status returns unavailable rather than adopting; Start/Stop refuse invalid responses, and provider sync reports its existing context-specific failure without sending configuration.
Compatibility: Keep all R1 proof checks, nonce/port binding and socket continuity. Shared JSON validation precedes the existing HMAC verifier, never substitutes for it. Retain native health/status 500 ms and control 1000 ms deadlines, public diagnostic fetch 1000 ms and explicit diagnostic overrides; the reader adds no new timeout or retry. Diagnostics reports failed/unavailable status rather than a prematurely optimistic daemon PASS. Invalid ownership JSON now has the explicit unavailable classification; a bad MAC/connection/upgrade still fails R1 ownership. R2, ACLs, consent, dependencies, bootstrap and daemon routes are unchanged. No real-home access, tag or publication.

### D-42: Prove daemon ownership before credential delivery
Status: DECIDED
Date: 2026-11-22
Sources: User-approved R1 fix; SECURITY_REVIEW.md; Node built-in APIs https://nodejs.org/api/crypto.html#cryptocreatehmacalgorithm-key-options and https://nodejs.org/api/http.html#event-socket (checked 2026-11-22); port-0 fake-data regression tests.
Decision: Generate a fresh random 32-byte nonce for each ownership connection. A challenged health reply proves knowledge of the existing shared local token with domain-separated HMAC-SHA256 over fixed loopback host, actual bound port, instanceId and nonce. Check the 32-byte proof in constant time before sending any local credential or provider body. Bind authenticated status/provider updates/shutdown to the exact proven TCP socket; reject replacement sockets before setting credential headers or ending a request with a private body. This prevents public-id echo, stale proof replay, cross-port proof relay and proof-to-control port handoff. No new dependency, token, disk secret or Codex key is introduced.
Failure policy: Preserve/report existing unverified listeners and state; no adoption, shutdown, kill, configuration or automatic retry through another connection. A TCP probe treats unknown/timeouts as occupied and only ECONNREFUSED as free. Orphans without saved state and older daemons without proof support need a manually identified owner/old profile to stop them, or an explicit port setting change. Never add a public-id-only compatibility fallback. Read-only diagnostics shares the proof/socket check and sends no bearer token on verification failure. State remains secret-free/private; bootstrap still uses closed stdin, not argv/env.
Scope: This commit fixes R1 only. The proof reader is bounded to 4 KiB; existing authenticated lifecycle status.json remains R3 work, and delivery/Restore R2 remains separate. Preserve five-second identity/apply and 20-second ACL-read policies, consent and all existing security checks. No publication/tag or real-home access. Tests replace the old fetch-only startup/rejection seams with valid ephemeral-port/native HTTP fixtures, retaining the original failure assertions.

### D-41: Completed threat assessment is not an all-PASS release approval
Status: DECIDED
Date: 2026-11-22
Sources: SECURITY_REVIEW.md code/test/F5 mapping against 24269b2; temporary port-0 impostor and 32 KiB health probes; user authorization to report new findings without fixing them; https://code.visualstudio.com/api/working-with-extensions/publishing-extension and https://cli.github.com/manual/gh_release_create (checked 2026-11-22).
Decision: Close the assessment task with explicit PASS/WEAK results, retaining R1 HIGH and R2/R3 MEDIUM as unfixed pending approval. The existing public instanceId plus bearer acceptance is not server proof; green honest-daemon tests do not clear that gap. Do not mark all threats PASS or claim release approval. Preserve earlier accepted fixes/F5, the D-10 connect-deadline limitation and dev-only dependency exceptions. Screenshots are deferred for 0.1.0 unless real captures are supplied. Finalize the notes as prepared release documentation while keeping the release hold explicit.
Publication: Supply copy-only steps, not a new workflow or dependency. Current CI is verify-only. SECURITY.md requires protected CI publication. Official guidance recommends federated publishing and retires global Azure DevOps PATs on 2026-12-01; any short-lived PAT path before that date needs Marketplace Manage scope, a protected CI secret and maintainer-controlled revocation. The installed vsce CLI does not advertise --oidc, so a trusted-publishing setup/tool change needs separate approval. Publisher ownership/MFA and release-channel approval are external gates, not inferred from package.json. No tag, release creation, publication, real-home access or runtime fix is authorized by this record.

### D-40: Slow-PC ACL read deadline and closure-gated retry
Status: DECIDED
Date: 2026-11-22
Sources: User-approved second-PC evidence (i3 sixth generation, 4 GB RAM; empty PowerShell startup 2.2–3.3 seconds; Switch failed at ACL read timeout while real login/Save/Configure/apply worked); https://nodejs.org/api/child_process.html#event-close (checked 2026-11-22).
Decision: Only the fixed read-only PowerShell ACL inspection uses a 20-second execution deadline. Keep whoami, icacls apply and unrelated command deadlines at five seconds; no matching cold-start evidence justifies changing those. On the first inspection timeout, request termination and wait for Node's close event before allowing one fresh read. Never accept partial output or exit success after the deadline. A separate bounded five-second termination wait releases host pipes/process references and fails closed if close cannot be confirmed; no retry is then allowed. At most two inspection attempts, each bounded at 20 seconds plus up to five seconds to confirm termination. There is no write/apply retry, automatic deadline growth or machine-policy change. This supersedes D-38's unimplemented 15-second proposal with the user's approved 20 seconds.
Cost/safety: The normal path already uses one PowerShell inspection per file; retain it and -NoProfile -NonInteractive. Resolve SID once for the file operation and reuse it for inspection retry; do not rerun whoami or icacls, cache an ACL result, or reuse one file's permissions for another. Before retry, recheck regular-file identity and size. Validate the fresh response under the unchanged protected-DACL/current-user FullControl/principal allow-list rules. Timeout twice, unsafe ACLs, malformed responses, spawn/nonzero/output failures, changed files and unconfirmed close preserve originals and never authorize content writes.
Diagnostics: Add only phase=apply|verify|preflight|cleanup and retry=none|used to the existing bounded error fields. A second failed read or validation carries retry=used. A child whose close could not be confirmed reports the fixed reason command did not close. No raw tool output, target path, SID, account/credential data or new protocol is exposed.
Validation: Controlled timers/process events prove the 20-second inspection budget, unchanged five-second defaults (even a mis-tagged icacls), close-before-retry ordering and the bounded no-close refusal. Temporary fake-file tests prove slow-first-read recovery, two-timeout failure, SID/apply single use, no unsafe-result retries, retry-result validation, changed-file rejection and read-only diagnostics with unchanged bytes/timestamps. No dependency, Node-policy, global test-timeout or ACL-rule changes. Part B second-PC Switch/restart/removal acceptance remains open.

### D-39: Compact backup keys, legacy retention and Windows path preflight
Status: DECIDED
Date: 2026-11-22
Sources: Approved follow-up to second-PC exit 3; https://learn.microsoft.com/en-us/windows/win32/fileio/maximum-file-path-limitation ; https://learn.microsoft.com/en-us/windows/win32/debug/system-error-codes--0-499- ; Node crypto createHash documentation (checked 2026-11-22).
Decision: New backup directories use the 43-character Base64url SHA256 of the canonical home path, using Node's built-in crypto. Only the home path is hashed, never credentials. Existing Base64url(UTF8(home)) directories remain in place, read alongside the current layout; no rename, copy migration, settings rewrite or background pruning. Restore validates the selected file in its actual allowed directory and reads/parses its bytes before creating its safety backup. After a verified new backup, retain the newest ten snapshots per target across both layouts. Avoid same-timestamp/name collisions with legacy entries; reject linked backup directories/selections before restoring or pruning. An unrepresentably long legacy component is treated as absent only after its filesystem ENAMETOOLONG result; unrelated errors propagate.
Path policy: On Windows, reject actual private-file paths of 260 or more UTF-16 code units before exclusive creation/content writes, independent of machine long-path policy. Preflight the fixed-length UUID staging name before an atomic operation or config/.env safety backup, so a later replacement cannot first write a backup then discover its own overlong staging path. No extended-path fallback, policy edit, unsafe alternate storage or permission write retry. The fixed message says step=path length and asks for shorter isolated VS Code user-data/Codex-home locations. This is a conservative supported-path bound, not a claim that every Windows API fails at 260.
Safe observations: Add last-observed directory/file existence (true/false/unavailable) and fixed length buckets (0-259, 260-511, 512-1023, 1024+). Refresh observations immediately before icacls. Add a static Windows error-name lookup for the process exit code; this is not captured GetLastError. principal=not-reached until principal normalization is attempted; unresolved is reserved for actual normalization failure. Preserve primary errors and existing cleanup markers. Never include path text, identity names/SIDs, raw output or ACL/credential content.
Evidence boundary: Calculated isolated-profile config backup lengths fall from 326/335 to 238/242 with 32/36-character GUIDs. A local empty-file probe accepted both ordinary and extended 326-character paths, so length remains a compatibility hazard rather than a universally reproduced second-PC root cause. Regressions model a length-limited icacls, real temporary file/backup flows, Unicode/spaces/brackets, legacy Restore/retention and boundary/error states. User-run second-PC validation remains required. Runtime dependencies, command deadline, Node policy and ACL requirements are unchanged.

### D-38: Portable Windows ACL inspection and credential-safe failure stages
Status: DECIDED
Date: 2026-11-22
Sources: Approved second-PC follow-up; https://learn.microsoft.com/en-us/dotnet/api/system.io.file.getaccesscontrol?view=netframework-4.8 ; https://learn.microsoft.com/en-us/dotnet/api/system.security.accesscontrol.rawsecuritydescriptor ; https://learn.microsoft.com/en-us/dotnet/api/system.security.accesscontrol.commonace ; https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/icacls (checked 2026-11-22).
Decision: Retain numeric current-user SID lookup and the single icacls inheritance-removal/grant operation. Replace saved-SDDL text/LA alias handling with a fixed Windows PowerShell/.NET read-only binary-DACL reader. File.GetAccessControl requests Access only; RawSecurityDescriptor/CommonAce exposes numeric SecurityIdentifier.Value, ACE kind/flags and access mask. No display-name comparison or guessed RID. Paths travel as JSON on stdin, never interpolated into PowerShell code. Require a present protected DACL, explicit ordinary allow ACEs only, current-user FullControl, and the existing current-user/System/Administrators allow-list. Reject inherited, callback/object/deny/unknown/broad or unresolved entries, malformed/oversized responses and missing user access. Secure the empty staging/backup file before private bytes; no permission write is retried.
Diagnostics: Permission failures expose only fixed target roles (backup, config staging, .env staging, private file), stage, command basename, category, bounded numeric exit code, fixed verification reason/principal kind and cleanup status. Do not expose account names, target paths, SID values, argv, raw stdout/stderr, ACL dumps or credentials. Preserve the original failure when close/removal also fails; cleanup-only failure states that earlier steps may have completed. Configure can fail while securing an extension-storage backup before staging the home file; the role distinguishes these cases. No claim is made that the second-PC root cause is established or fixed without its next result.
Deadline assessment: No second-PC command timing is available. The five-second per-command deadline remains unchanged and is covered by a deterministic timeout regression. Do not conflate it with Vitest's whole-scenario timeout. Cold PowerShell/antivirus delays can exceed a fixed deadline, but that has not been demonstrated on the second PC. If its new message reports a command timeout, propose 15 seconds per command and at most one retry of the read-only ACL inspection after the old process closes (at most 30 seconds for inspection); never retry the grant/write, invalid identity or a failed ACL validation. This proposal is not implemented by this commit.
Test harness: The initial full Windows run exposed functional-scenario timeouts from repeated native-reader startup, not failed ACL assertions or per-command timeouts. Use scoped 30-second Windows functional I/O budgets and 90-second retention-loop budgets, retaining POSIX/default budgets, every assertion and real file/ACL operations. No global timeout, product deadline, lint rule, dependency or Node-policy change. The reader uses File.GetAccessControl rather than loading the Get-Acl cmdlet to reduce startup overhead.

### D-36: Vitest report-only evaluation and isolated manual acceptance
Status: DECIDED (evaluation only; no dependency upgrade approved)
Date: 2026-11-21
Sources: docs/VITEST_EVALUATION.md links exact npm registry metadata, the v4 migration guide and current advisory evidence. Manual sources: https://code.visualstudio.com/docs/configure/command-line ; https://developers.openai.com/codex/auth/ ; https://developers.openai.com/codex/config-advanced/ (checked 2026-11-21; OpenAI docs redirect to learn.chatgpt.com).
Decision: After README CI/rendering passes, evaluate 4.x as the final maintenance item without installing it. Recommend an approval-gated exact 4.1.12 trial: its engines preserve the Node 20 branch and it removes tinypool/pins patched mocker. npm suggests 5.1.1, whose Node 22.12+ requirement conflicts with Node 20 support. Candidate-pair Bulk Advisory output is empty, not a full candidate-tree audit. Keep all dependency/policy files unchanged and preserve accepted dev-only risk until an approved trial proves its result; retain vsce.
Manual gates: Supply numbered copy-only Windows steps in PRE_RELEASE_CHECKS.md, using new TEMP Codex/VS Code data/extensions directories, no real-home reads/writes, and metadata-only output. Refuse Portable Mode because it can override CLI isolation. Use the existing Portwise launcher (exact codex login, explicit confirmed-home terminal env); never automate real login or read/paste credentials. Verify browser/terminal completion before file metadata and snapshot actions; do not treat a browser opening as success. Manual passes remain user-reported.
### D-35: Evidence-backed README and real-capture placeholders
Status: DECIDED
Date: 2026-11-21
Sources: User-approved README requirements; package.json command/settings/defaults; src/extension.ts, sync/backups.ts, core/privateFile.ts, accounts/accountStore.ts, diagnostics/checks.ts, gateway/daemon/server.ts and shared/protocol.ts. Rendering references: https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/creating-diagrams ; https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax ; https://code.visualstudio.com/api/working-with-extensions/publishing-extension (checked 2026-11-21).
Decision: Replace the scaffold README with documentation of current behavior, original artwork and a near-top independent/not-a-fork disclaimer. Use exactly three real flat-square Shields badges; Marketplace status is plain unpublished text. Match all 15 registered command titles/IDs and four machine-scoped settings/defaults. Copy redacted report is a notification action, not a new command. Describe private file handling and its limits without absolute security claims; distinguish account snapshots from Codex's active auth.json and local .env delivery.
Captures: Link actual Markdown placeholder files under docs/images, with future PNG paths shown as code only. This creates no fake image or dangling image URL. GitHub supports the requested alerts/Mermaid; the architecture paragraph remains readable where rich diagram rendering is unavailable. vsce rewrites repository-relative links for the Marketplace package; inspect the built README rather than assuming excluded docs are bundled.
Validation: scripts/checkReadme.mjs uses the already-installed VSIX Markdown toolchain to validate local links/anchors and manifest tables; optional --online checks only the three badge URLs. GitHub's Markdown API confirmed the three alert containers, details/summary markup and Mermaid enrichment markup. Full verify/VSIX inspection and final GitHub browser verification are tracked in PLAN.md. No dependency or extension behavior changes; real captures, manual release checks and publication remain unfinished.
### D-34: Validate provider state and measure diagnostics on demand
Status: DECIDED
Date: 2026-11-21
Sources: Approved review findings #16/#17; SPEC GW-10/GW-11, SECURITY T3/T5/T6/T13; temporary-home and fake-upstream regressions. Existing Codex config keys and /v1/models follow D-1/D-5; no new Codex interface is introduced.
Provider boundary: Project outgoing providers to exactly id/name/baseUrl/enabled/tokenMask, then validate the complete host message. The receiving guard validates each provider's field types, rejects extra provider fields and accepts only masked token text. Malformed state is withheld with a fixed log message, and the receiver keeps the last valid render. Existing textContent/CSP, commands and valid payloads remain unchanged.
Diagnostics: The explicit Run Diagnostics command resolves current settings and reads the existing gateway token without creating or storing one. Read config.toml and .env through canonical/link/identity/content checks; never read auth.json or account snapshots. Compare delivered token in host memory with timingSafeEqual on equal-length bytes. Verify existing .env ACL/mode without applying chmod/grants. Do not trust cached permissions. Validate saved instance and configured port against bounded health JSON before sending a local token to authenticated status. Probe only loopback plus the configured provider's models URL, with redirects refused, bounded deadlines, response cancellation and no prompts/code. No repair, daemon adoption, profile synchronization or Codex-home write occurs.
Report: Build only fixed check names/statuses/hints; omit all file contents, credentials, snapshots and response bodies/errors, then pass through redaction. Add an explicit Copy redacted report action to the existing notification. Report non-selected Portwise as WARN; config drift, token mismatch and auth failures are FAIL with the hop and fix. Windows directory write access remains WARN because a read-only access check cannot prove a successful write. Matching .env bytes cannot prove the environment of an already-running Codex process; keep the restart Codex/VS Code warning. Identity/config/token/provider checks are point-in-time observations, not continuous monitoring.
Validation: Negative provider shapes/raw token fields, real outgoing provider projection and renderer rejection; current-setting command wiring/copy/no-token-creation; actual fake gateway/provider health/auth/GET-models, stopped/foreign instances, stale/duplicate delivery, config drift, unexpected auth overrides, missing/invalid/linked inputs, bounded bad/slow health responses, read-only ACL rejection and secret hygiene. Tests use temporary homes and port 0 only; no dependencies changed. README rewrite remains explicitly on hold.

### D-33: Close guards before unlink on Windows
Status: DECIDED
Date: 2026-11-21
Sources: Batch B acceptance verification exposed EPERM in the concurrent ConfigSync regression; real temporary-file lock tests.
Decision: Close the acquired guard handle before its identity-checked removal. Windows can retain a removed guard as delete-pending while a competing reader closes it: either inspection or exclusive creation can return EPERM. Bound retries to this guard-acquisition loop, never removing a file on a permission error. A permanent guard failure remains an error after the existing bounded wait; ordinary file/ACL failures are not retried. Keep live-owner refusal, exact-path legacy confirmation and ownership/identity checks unchanged. Regressions assert close-before-unlink, transient retry and permanent refusal using real filesystem calls and targeted fault injection; do not weaken the concurrency test.

### D-32: Batch B private writes, serialization and bounded gateway failures
Status: DECIDED
Date: 2026-11-21
Sources: User-approved defensive review findings #5/#6/#8/#9/#10/#11/#12/#13/#15; local fault-injection and temporary-home/fake-upstream regression tests.
Decision: Create replacement/backup files exclusively with random temporary names and secure the empty file before writing private bytes. POSIX requires verified mode 0600. Windows resolves the current user's SID with whoami, applies a protected icacls DACL and verifies its saved UTF-16LE representation; only explicit current-user/System/Administrators allow entries are accepted, with current-user full control required. There is no Users fallback. Permission-command errors, timeouts or unverifiable ACLs fail closed before that file is committed. A previous Configure step may already have completed; errors state this rather than promising a two-file rollback.
Concurrency: Serialize config commands within the extension and config-file operations across instances with an ownership-aware per-home file lock. Recheck target identity AND original bytes immediately before rename; rollback must not overwrite an external edit or credential refresh. Store mutations use instance-owned queues, including a combined provider URL/token read. Account-backup retention follows insertion order, not potentially tied/backward wall-clock timestamps. Failed secret deletion retains a cleanup reference for retry.
Gateway: Use native HTTP(S) requests for byte-preserving response relay, including compressed responses. Await downstream backpressure; disconnects and total deadlines abort upstream. Headers-sent failures close the stream instead of leaving readers pending or appending JSON. Bound bootstrap and control JSON to 64 KiB, validate provider URLs at both boundaries, and apply the total deadline to partial uploads as well as responses. Validate Host even on health, reject any Origin presence, strip CORS and Connection-nominated hop headers. No redirect following or automatic retries. The accepted separate-connect-timeout gap remains unchanged; the total deadline bounds connection establishment too.
Errors: Unknown extension/panel exceptions and TOML parser errors are never formatted verbatim. Use fixed actionable messages; known filesystem error codes get fixed access/path guidance. Daemon stdin/JSON/bind failures emit fixed gateway JSON only; the controller consumes bounded stderr, spawn and stdin errors without forwarding process output. Secrets remain stdin/control-body only, never argv.
Validation: Negative ACL/permission-command tests, exclusive-file/symlink/concurrent writes, external-edit preservation, store concurrency/cleanup retries, opaque-error hygiene, slow upload/reader/stream aborts, body/header/connection caps, compressed relay and real-child bootstrap failures. Windows retention tests have explicit 30-second budgets for repeated real ACL application/verification; scenarios and assertions are unchanged. No dependencies changed. Batch C and manual release acceptance remain pending.
Windows portability follow-up: The first Batch B CI passed Ubuntu but failed Windows's strict ACL checks. Windows can serialize the built-in Administrator as LA instead of its full SID ([Microsoft SID strings](https://learn.microsoft.com/en-us/windows/win32/secauthz/sid-strings), verified 2026-11-21). When LA appears, resolve that alias through a fixed, encoded PowerShell/.NET security-descriptor expression; accept it only if the resolved SID equals the actual whoami SID. Never infer ownership from a username or RID suffix. Missing/mismatched resolution still fails closed. Regression tests cover matching, mismatched and unresolved aliases and the resolver wiring.

### D-30: Approved hardening batches and maintenance disposition
Status: DECIDED
Date: 2026-11-21
Sources: User approval of the findings and Batch A/B/C order; local regression tests.
Decision: Batch A addresses current/canonical homes and exact-path consent, explicitly scoped Codex login terminals, symlink/junction rejection and pre-replace identity checks, authenticated running-provider synchronization (null clears the active provider), abandoned guard recovery with identity checks and exact-path approval for unverifiable files, and reading/validating restore bytes before retention. Every batch has its own commit, verify and green Ubuntu/Windows CI gate. Batch B covers ACLs (fail closed), write/storage concurrency, stream/control/header limits, error redaction and process failure handling; Batch C covers provider payload guards and real diagnostics. No release, tag or publication is authorized.
Maintenance: Dev advisories are accepted as non-blocking while runtime audit stays clean. Reviewed dev-only licence and disabled-hook exceptions are recorded in DEPENDENCY_AUDIT.md and RULES.md. Keep dependencies unchanged in the fixes; evaluate Vitest 4.x compatibility LAST in Phase 8 and leave vsce unchanged unless a tested upgrade clears its findings. This supersedes D-29's unresolved exception/release-blocking disposition. README rewrite follows the approved plan after the review-fix gates.
Safety: Tests use fake credentials, temporary homes and port-0 fake upstreams only. Guard recovery never trusts age; recovery claims serialize unlinking and carry non-secret ownership metadata. Interrupted claims use the same owner/identity checks (bounded nesting fails closed). An authenticated control sync failure explicitly warns that the daemon may still use the previous provider and instructs Stop/Start.
User-visible changes: A changed codexHome takes effect for the next operation without reload; in-flight path changes abort. Login confirms its exact canonical home once per path and still launches only codex login. Linked home roots/files and changed replacement targets are rejected. Guard recovery confirmation names the exact lock/guard/claim. Restore rejects malformed/unavailable backups before writing.

### D-28: Node 24 action runtimes and immutable CI pins
Status: DECIDED
Date: 2026-11-21
Question: How should CI resolve the Node 20 action-runtime warning and mutable action tags?
Sources: Official GitHub API tag refs, releases and action.yml files, retrieved 2026-11-21: https://github.com/actions/checkout/releases/tag/v7.0.1 ; https://github.com/actions/setup-node/releases/tag/v7.1.0 ; https://github.com/actions/upload-artifact/releases/tag/v7.0.2 .
Decision: Pin checkout to `3d3c42e5aac5ba805825da76410c181273ba90b1` (v7.0.1), setup-node to `949feb2413d6458794dcd2491c4babbbce0c15c1` (v7.1.0), and upload-artifact to `cf430e030ddbb5b0abf93d22962f4752f3646cd9` (v7.0.2), with version comments. All three exact manifests declare node24. Retain contents:read, Ubuntu/Windows jobs, explicit npm cache, npm ci --ignore-scripts, Ubuntu-only integration tests/artifact upload and the existing runtime audit gate. Node 22 in .nvmrc is the build runtime, not the action runtime; no product engine change is made. Dependabot's existing github-actions entry can propose future pin updates.
Alternatives rejected: Mutable major tags; forcing Node 24 on old Node 20 action bundles; upload-artifact v5 (its exact manifest still declares node20).
Fallback: If the exact pinned release fails on either hosted runner, investigate compatibility before substituting another verified Node 24 pin; do not disable checks.

### D-29: Dependency audit records unresolved development-tool risk
Status: DECIDED (inventory only; remediation and policy decisions pending)
Date: 2026-11-21
Sources: Committed package-lock.json; installed package manifests and @vscode/vsce-sign/LICENSE.txt; npm advisory service via npm audit; docs/RULES.md. Detailed findings and reproduction are in docs/DEPENDENCY_AUDIT.md.
Decision: Keep the dependency tree unchanged while reporting the audit honestly. The sole runtime dependency toml@5.0.1 is MIT, exact-pinned, dependency-free and has no install hooks; runtime audit is clean. Full audit reports 2 critical and 4 moderate dev package entries, notably tinypool via vitest. Existing dev transitive licences outside the allow-list and declared installation hooks are unresolved policy conflicts. No exception is granted. npm ci --ignore-scripts succeeds without executing hooks; it emitted three documented maintenance warnings. Do not describe the full audit as clean or treat green runtime-only CI as clearing these findings.
Alternatives rejected: npm audit fix --force or changing compiler/test/packaging majors without compatibility and licence review; silently widening RULES.md; executing dependency install scripts.
Next: Include these findings in the findings-only adversarial review and obtain user approval of concrete dependency replacements/upgrades or policy exceptions before applying them. Phase 8 release acceptance stays blocked until resolved.

## Phase 0 decisions

### D-1: Codex custom-provider configuration
Status: DECIDED
Date: 2026-11-19
Question: Which custom-provider settings and credential mechanisms are supported?
Sources: https://developers.openai.com/codex/config-reference/ (accessed 2026-11-19); https://developers.openai.com/codex/auth/ (accessed 2026-11-19)
Decision: Manage a distinct `model_provider` id and its `[model_providers.portwise]` table. The managed table uses `name`, `base_url`, `env_key`, `wire_api = "responses"`, `requires_openai_auth = false`, and `supports_websockets = false`. Officially documented credential mechanisms are: `env_key`; the discouraged plaintext `experimental_bearer_token`; a command-backed bearer token through `auth.command` (with `args`, `cwd`, refresh interval, and timeout); `env_http_headers`; OpenAI authentication through `requires_openai_auth = true`; and gateway OAuth configuration. `auth` cannot be combined with `env_key`, `experimental_bearer_token`, or `requires_openai_auth`.
Alternatives rejected: `experimental_bearer_token`, because it writes a credential into `config.toml`; `requires_openai_auth`, because Portwise's gateway must authenticate with its own local token; command-backed auth and gateway OAuth, because a Codex-launched command cannot safely retrieve Portwise's VS Code SecretStorage value without introducing another persistent credential channel.
Fallback if the source changes: Do not write a provider configuration. Preserve the existing config and show an actionable message that the installed Codex version is unsupported.

### D-2: Codex home `.env` loading
Status: DECIDED
Date: 2026-11-19
Question: Does Codex read `<CODEX_HOME>/.env`, and when?
Sources: https://github.com/openai/codex/blob/main/codex-rs/arg0/src/lib.rs (accessed 2026-11-19); https://learn.chatgpt.com/docs/config-file/environment-variables (accessed 2026-11-19)
Decision: Codex loads `<CODEX_HOME>/.env` into its process environment during early process initialization and rejects `.env` keys beginning with `CODEX_`. Treat the file as process-start-only: Portwise will explicitly request an extension-host/Codex restart after any credential delivery update or rotation.
Alternatives rejected: Assuming a running Codex process rereads `.env`; no official source supports that assumption.
Fallback if the source changes: Diagnostics compares the expected local-token fingerprint with a live gateway request and continues to require a restart whenever delivery cannot be proven current.

### D-3: Official account sign-in and storage
Status: DECIDED
Date: 2026-11-19
Question: What is the supported sign-in flow, where are credentials stored, and how is an account switch applied?
Sources: https://developers.openai.com/codex/auth/ (accessed 2026-11-19); https://developers.openai.com/codex/config-reference/ (accessed 2026-11-19)
Decision: Account addition invokes the official `codex login` browser flow; device-code login is available through `codex login --device-auth`. Codex CLI and IDE extension reuse one cached login. The `cli_auth_credentials_store` modes are `file` (`<CODEX_HOME>/auth.json`), `keyring`, `auto`, and `ephemeral`. Phase 5 account-profile switching supports only the documented file store: snapshots go in VS Code SecretStorage, the active `auth.json` is atomically replaced, verified, and then Portwise prompts for an extension-host restart. Keyring, auto-with-keyring, and ephemeral authentication are detected and not copied or manipulated; Portwise directs the user to the official login flow instead.
Alternatives rejected: Reading or copying an OS keyring, which is neither portable nor authorized by the public Codex interface; handling passwords or browser tokens in Portwise.
Fallback if the source changes: Disable account switching while retaining provider profiles and gateway functions; never modify unknown credential storage.

### D-4: Usage limits source
Status: DECIDED
Date: 2026-11-19
Question: Is there a documented, supported usage-limit source for a Codex account?
Sources: https://developers.openai.com/codex/auth/ (accessed 2026-11-19); https://developers.openai.com/codex/config-reference/ (accessed 2026-11-19)
Decision: No documented public Codex usage-limit endpoint or API was found in the official Codex authentication and configuration references. Omit the usage-limits feature (USG-1 and Phase 6 implementation) and state this in the README in Phase 6.
Alternatives rejected: Calling undocumented ChatGPT or Codex backend endpoints, scraping UI data, or estimating usage from local history.
Fallback if the source changes: Reopen this decision only when OpenAI publishes a supported source with authentication, rate-limit, and privacy semantics.

### D-5: Codex HTTP paths and WebSocket fallback
Status: DECIDED
Date: 2026-11-19
Question: Which routes must the gateway pass through and how should it handle WebSocket refusal?
Sources: https://openai.com/index/unrolling-the-codex-agent-loop/ (accessed 2026-11-19); https://github.com/openai/codex/blob/main/codex-rs/model-provider/src/models_endpoint.rs (accessed 2026-11-19); https://github.com/openai/codex/blob/main/codex-rs/core/src/client.rs (accessed 2026-11-19)
Decision: The gateway proxies every `/v1/**` path unchanged, including `POST /v1/responses`, provider-owned `GET /v1/models`, and `POST /v1/responses/compact`. Codex's documented remote compaction uses `/responses/compact`; the prefix is supplied by the configured provider base URL. Set `supports_websockets = false` so Codex selects HTTP/SSE without attempting a WebSocket. The source also shows session-scoped fallback to HTTP after WebSocket failure, but Portwise does not rely on retry timing.
Alternatives rejected: Route allow-listing, which would break newly introduced Responses paths; WebSocket refusal as the normal path, which causes avoidable reconnect attempts.
Fallback if the source changes: Continue generic `/v1/**` proxying and expose an explicit, tested capability setting only after an official transport change.

### D-6: VS Code platform facts
Status: DECIDED
Date: 2026-11-19
Question: Is `secondarySidebar` available at the target engine version, and what storage survives restart?
Sources: https://code.visualstudio.com/updates/v1_106 (accessed 2026-11-19); https://code.visualstudio.com/api/references/vscode-api#SecretStorage (accessed 2026-11-19)
Decision: `secondarySidebar` is available in VS Code 1.106, which matches the manifest's `^1.106.0` engine. `ExtensionContext.secrets` is encrypted, workspace-independent, platform-specific, and not synchronized across machines. Its stored values survive extension-host restarts; in-memory state does not. Portwise keeps tokens and account snapshots in SecretStorage and reconstructs services after activation.
Alternatives rejected: `globalState` or settings for secrets, because they are not SecretStorage.
Fallback if the source changes: Use a regular sidebar view container only after raising the minimum VS Code engine and documenting the compatibility decision.

### D-7: Credential-delivery method (GW-10)
Status: DECIDED
Date: 2026-11-19
Question: How does Codex obtain Portwise's stable local gateway token?
Sources: D-1; D-2
Decision: Portwise's source of truth remains SecretStorage. During config sync it atomically writes a dedicated `PORTWISE_GATEWAY_TOKEN` entry in `<CODEX_HOME>/.env` with restrictive file permissions, then writes `env_key = "PORTWISE_GATEWAY_TOKEN"` in the Portwise-managed provider table. The value is never stored in config, state, profiles, logs, diagnostics, or webview messages. Rotation and repair require a restart prompt because `.env` is loaded at process start.
Alternatives rejected: plaintext `experimental_bearer_token`; command-backed auth; gateway OAuth; injecting the VS Code process environment; and relying on an existing unmanaged environment variable, all of which either expose the secret, are not reliably available to the Codex process, or lack a safe SecretStorage bridge.
Fallback if the source changes: Disable gateway config sync and leave the active provider untouched until a documented secure delivery method exists.

### D-8: Config-sync strategy
Status: DECIDED
Date: 2026-11-20
Question: How can config sync preserve all user TOML, comments, and ordering without adding a dependency?
Sources: docs/ARCHITECTURE.md §9 (accessed 2026-11-20); docs/RULES.md (accessed 2026-11-20); https://www.npmjs.com/package/toml (accessed 2026-11-20)
Decision: Use the exact runtime dependency `toml@5.0.1` only to parse and validate. Phase 4 owns a clearly delimited Portwise-managed block, performs a line-oriented marker scan that rejects duplicate, malformed, or unterminated blocks, and generates only fixed known TOML keys. It does not re-serialize, rewrite, or reorder unrelated TOML. Before every `config.toml` or `.env` write it saves timestamped exact bytes in extension storage, retaining the newest ten backups per target and Codex home. After every config write it parses the result and confirms that every value outside `model_providers.portwise` is deeply equal to the original; it restores the exact backup on a parse or comparison failure. Restore selects a timestamped backup and snapshots the current file first, making restore undoable.
Alternatives rejected: `smol-toml@1.9.1` is BSD-3-Clause (which docs/RULES.md allows), zero-dependency, script-free at installation, TOML 1.0 capable, and actively maintained, but was not selected after the user approved the MIT-licensed `toml@5.0.1`; regex replacement across the whole file, because it is unsafe for comments and unrelated tables; a full handwritten TOML parser, because it broadens risk.
Fallback if the source changes: Abort sync without modifying the file and offer restore of the last backup.

### D-9: Extension Development Host test runner
Status: DECIDED
Date: 2026-11-19
Question: Which test runner can verify command registration in a real Extension Development Host?
Sources: https://code.visualstudio.com/api/working-with-extensions/testing-extension (accessed 2026-11-19); https://www.npmjs.com/package/@vscode/test-electron (accessed 2026-11-19); https://github.com/microsoft/vscode-test (accessed 2026-11-19)
Decision: Add exact development dependency `@vscode/test-electron@2.5.2`. Its Node >=16 engine supports Portwise's Node 20.19+ floor. `npm run test:integration` builds production output, downloads VS Code 1.106.0 when necessary, then asserts that every command contributed by `package.json` is registered after Portwise activates. It is deliberately outside `npm run verify` and runs only in Ubuntu CI under Xvfb.
Alternatives rejected: Unit-level VS Code mocks, which cannot prove Extension Development Host activation; `@vscode/test-cli`, which adds an unnecessary second development dependency; version 3.1.0, which requires Node >=22.
Fallback if the source changes: Retain unit manifest coverage and disable the CI integration job until a Node 20-compatible official replacement is evaluated.

### D-10: Gateway connection-timeout test scope
Status: DECIDED
Date: 2026-11-20
Question: Can a loopback-only integration suite deterministically distinguish TCP connect timeout from other network failures in Node's Fetch API?
Sources: Node 20 built-in Fetch/AbortSignal behavior (tested 2026-11-20); docs/SECURITY.md test isolation rule
Decision: Keep all gateway tests on loopback fake upstreams. A refused loopback connection is deterministically reported as `upstream_unreachable`; a fake loopback upstream that accepts but does not respond deterministically verifies `504 upstream_timeout`. Do not introduce an external or unroutable network target merely to force a distinct connect-timeout branch.
Alternatives rejected: Non-loopback black-hole addresses, because they violate test isolation and are environment-dependent.
Fallback if the runtime later exposes a deterministic connect-timeout error on loopback: add a separate `upstream_timeout` assertion without changing gateway behavior.

### D-11: Dependabot compatibility exceptions
Status: DECIDED
Date: 2026-11-20
Question: Which dependency updates require explicit review rather than automatic Dependabot pull requests?
Sources: package.json engine policy (accessed 2026-11-20); Phase 1 decision D-9 (accessed 2026-11-20)
Decision: Ignore all `@types/vscode` updates because it is pinned to the supported VS Code engine API. Ignore major updates of `@vscode/test-electron` because version 3 requires Node 22 while Portwise supports Node 20.19+. Ignore Vitest major updates because test-runner majors require deliberate compatibility review. Ignore TypeScript and `@types/node` major updates because their compiler/type-system changes can invalidate the extension's Node 20.19+ and VS Code 1.106 compatibility contract; they require an explicit typecheck and CI review. Dependabot continues to propose compatible minor and patch updates where applicable.
Alternatives rejected: Automatically accepting these compatibility-bound updates, which could make builds target unsupported VS Code or Node versions.
Fallback if engine or Node policy changes: Re-evaluate the ignore entries and update the related compatibility decision.

## Dependency log

| Package | Purpose | Alternatives | Maintained | Install scripts | Licence | Approved |
|---|---|---|---|---|---|---|
| @vscode/test-electron@2.5.2 | Extension Development Host integration test runner | VS Code mocks; `@vscode/test-cli` | Microsoft-maintained; version 2.5.2 is Node >=16 compatible | No `install` or `postinstall` lifecycle hook; its `prepare` script is not executed for registry installs; CI uses `npm ci --ignore-scripts` | MIT | User-approved 2026-11-19 |
| toml@5.0.1 | Parse and validate `config.toml` without re-serializing it | smol-toml@1.9.1; handwritten parser | Active release 2026-10-12; TOML v1.1.0 compliant | No install or postinstall hook; only `prepublishOnly` | MIT | User-approved 2026-11-20 |

## Phase 4 decisions

### D-12: Explicit Codex-home write consent
Status: DECIDED
Date: 2026-11-20; updated 2026-11-21 after Batch A F5 review
Question: When may Portwise modify a Codex home's `config.toml` or `.env`?
Sources: User-reported F5 safety finding (2026-11-20); docs/SECURITY.md (accessed 2026-11-20); approved fresh-consent/idempotence follow-up (2026-11-21)
Decision: Require fresh exact-canonical-path confirmation before every config/.env write operation. One Configure approval covers that operation's config.toml and .env changes (and any required rollback); it never authorizes a future invocation. Configure asks again even if the resulting operation is a no-op. Restore asks after selecting a backup, and provider-switch asks in its own exact-path dialog every time. Starting/auto-starting the gateway and changing settings never modify Codex files. The legacy globalState key portwise.codexHomeConsent is ignored, including malformed values; no stored config approval can bypass a dialog. Account/login remembered consent keys and flows remain unchanged.
Alternatives rejected: The earlier once-per-home policy, which allowed later writes without another dialog and made returning from a refused junction confusing; implicit approval through Start Gateway or activation; two dialogs for Configure's two files.
Fallback if the source changes: Keep writes disabled until the user explicitly configures the target Codex home.

### D-31: Byte-idempotent Configure and no-op delivery
Status: DECIDED
Date: 2026-11-21
Sources: User's isolated-home Batch A F5 finding; temporary-fixture reproduction and regression tests.
Decision: Replace an existing validated managed block in place, preserving surrounding bytes, separators and the existing block's line endings. Do not append another separator on each Configure. Preserve non-managed .env lines, their line endings and trailing blank lines; replace only the gateway-token assignment. If candidate bytes equal existing bytes, skip backup, atomic replacement and ACL mutation for that file. No-op delivery makes no new permissions claim; existing diagnostics permission state is retained. A real change still creates an exact pre-write backup in extension storage before replacement. An idempotent Configure still asks for fresh consent under D-12.
Compatibility: Retention tests now produce genuine changes instead of relying on redundant writes to create backups. Existing legacy whitespace is preserved rather than silently trimming user bytes. No dependency, account/login behavior or Batch B fix is introduced.

## Phase 5 decisions

### D-13: Account credential-store scope
Status: DECIDED
Date: 2026-11-20
Question: Which Codex account credential stores may Portwise snapshot and switch?
Sources: D-3; https://developers.openai.com/codex/config-reference/ (accessed 2026-11-20)
Decision: Account operations proceed only when `config.toml` explicitly sets `cli_auth_credentials_store = "file"`; Portwise then reads and parses only `<codexHome>/auth.json`. Snapshots and rollback backups are exact credential bytes held only in VS Code SecretStorage; global state contains only account names, ids, home paths, timestamps, and SecretStorage keys. `keyring`, `auto`, `ephemeral`, missing, malformed, and unknown store modes are rejected with a clear official-login fallback. Every account-file write requires separate path-specific confirmation, an exclusive lock, a SecretStorage rollback backup, atomic mode-0600 replacement, parse/byte verification, and rollback on failure.
Alternatives rejected: Reading OS keyrings, inferring that `auto` uses file storage, copying credentials to extension-storage files, passwords, or automatic account rotation; none is portable, necessary, or consistent with Codex's documented store modes and Portwise's security model.
Fallback if the documented file store changes: Disable account capture and switching; direct users to the official `codex login` flow.

### D-14: Orphaned gateway daemon recovery boundary
Status: DECIDED
Date: 2026-11-20
Question: What happens when a detached daemon holds the configured port but no matching controller state remains?
Sources: docs/ARCHITECTURE.md §4 (accessed 2026-11-20); F5 observation (2026-11-20)
Decision: Do not adopt or kill it. The controller requires both a persisted matching instance id and an authenticated status call before adoption. Without state, it reports a port conflict because ownership cannot be proven; this preserves the rule never to kill a foreign process. A future explicit recovery action may safely inspect and offer a user-confirmed restart, but is out of Phase 5 scope.
Alternatives rejected: Adopting by port, PID, or token alone; killing the listener automatically. Those approaches weaken stale-state and foreign-process protections.
Fallback if this impedes recovery: User can stop the known extension-host process or choose a different configured port; Portwise does not terminate an unverified process.

## Post-Phase 5 decisions

### D-15: Usage limits remain omitted
Status: DECIDED
Date: 2026-11-20
Question: Should Portwise display OpenAI/Codex usage limits without a documented source?
Sources: D-4; user direction (2026-11-20)
Decision: Skip Phase 6. Portwise will not read `auth.json`, scrape pages, or call undocumented endpoints for quota or usage data. Revisit only if OpenAI publishes a supported usage-limit source with suitable authentication and privacy semantics.
Alternatives rejected: Reading local credentials or undocumented service endpoints, because both violate Portwise's security and no-guessing rules.
Fallback if the source changes: Evaluate the published source as a new sourced decision before adding any display.

### D-16: Deferred CI Node-runtime warning
Status: SUPERSEDED by D-28
Date: 2026-11-20
Question: When should the GitHub Actions Node 20-to-24 deprecation warning be addressed?
Sources: CI run #44741534662 annotation (accessed 2026-11-20)
Decision: Defer the action-runtime warning to Phase 8 hardening. It is informational and CI is green on Ubuntu and Windows; Phase 8 will review action versions and runtime policy before release.
Alternatives rejected: Changing CI action/runtime policy during Phase 5 acceptance, which would expand the completed account-profile scope.
Fallback if CI begins failing: Treat it as a release-blocking Phase 8 item immediately.

### D-17: Real Codex login validation
Status: DECIDED
Date: 2026-11-20
Question: Should real-account `codex login` completion be automated?
Sources: D-3; user validation record (2026-11-20)
Decision: No. It is a Phase 8 manual pre-release check with a real account. Automated tests use only fake credentials and verify the launcher is exactly `codex login` with no password prompt, supplied credentials, or extra arguments.
Alternatives rejected: Automated real-account sign-in, which would require real credentials and introduce external account state into tests.
Fallback if the official flow changes: Revalidate manually before release and update the launcher decision.

## Phase 7f decisions

### D-19: Account operation lock lifetime and recovery
Status: DECIDED
Date: 2026-11-21
Sources: User-confirmed F5 root cause; src/accounts/accountSwitcher.ts; src/core/fileLock.ts.
Decision: Release the account lock in finally after verifying the write, before awaiting the restart notification. New locks contain only PID, random ownership id, format version, and creation time. Only a demonstrably absent PID permits automatic recovery; live/reused PIDs and ambiguous ownership fail closed. Empty legacy locks require explicit confirmation naming the exact path, followed by an identity recheck. A short-lived exclusive guard serializes cooperating acquire/release/recovery paths; identity includes file identity and contents. Close and removal failures are surfaced and cleanup can be retried.
Limitations: No age-only recovery. If a host is terminated while holding the brief recovery guard itself, the guard is left in place with an actionable error naming it; never guess that it is safe to remove. A notification failure after the verified write does not roll back a committed switch.
Validation: Temporary-home tests cover cancellation/dismissal before lock acquisition, notification-time reacquisition, dead child-process ownership, legacy confirmation and replacement races, concurrent recoveries, live owners, and injected close/removal failures. User will manually remove the previously orphaned 0-byte E:\portwise-test-codex3\.portwise-auth.lock (2026-11-20 18:20:57), then recreate an empty fixture for F5 recovery validation. No phase completion is recorded.

### D-18: Minimal list panel and latest-message Activity
Status: DECIDED
Date: 2026-11-21
Question: How should the panel be refined without changing commands or its message protocol?
Sources: User-approved Phase 7f Option A and implementation conditions (2026-11-21); docs/SECURITY.md T3–T5; docs/RULES.md UI requirements.
Decision: Use neutral row dividers and compact text-button toolbars on an 8px spacing scale, with minimum 32px button height and an extra gap before destructive actions. Remove every coloured left accent. Gateway state stays in its existing icon/text/colour pill, with visible high-contrast borders. Activity shows only the latest existing non-secret status string using the configured editor font and terminal/editor background; its decorative prompt is aria-hidden and the message has role=status and aria-live=polite. Recognizable existing failure messages receive a presentation-only Error: prefix. No history, persistence, credential access, command, protocol, or dependency changes are introduced.
Alternatives rejected: Compact cards, selected against by the user; optional five-message history, unnecessary for the latest-message requirement. Do not infer a gateway failure from an unrelated provider failure: existing host state has no explicit gateway-error field.
Fallback: Preserve unknown gateway labels as unknown and existing action availability; record unavailable manual error states honestly instead of adding host behavior during a visual pass. Phase 7 and 7b–7f completion await combined F5 confirmation.

### D-20: Single-use login capture handoff
Status: DECIDED
Date: 2026-11-21
Sources: User-approved Finding 1 safety fix; src/accounts/loginPermit.ts.
Decision: Use the same per-home account-operation file lock to serialize launch-marker updates and save-marker consumption. Save checks the marker again under that lock, persists its removal before capture, and never restores it after capture failure. Cancelling the name prompt does not capture anything. The official launcher remains exactly codex login. This is a launch handoff, not proof that browser login completed.
Finding: Runtime inspection found no automatic named-snapshot creation path. The old permit check was not atomic with capture, so concurrent saves or a failure clearing the old marker could have reused a launch. The origin of the existing name dssgsdg cannot be determined from this evidence; no attribution or secret inspection is claimed.
Validation: Temporary-home service and actual command tests cover concurrent saves, refused reuse, failed capture, failed marker persistence and home mismatch. Existing snapshots remain untouched; no phase completion is recorded.

### D-21: Panel discovery without relocating the view
Status: DECIDED
Date: 2026-11-21
Sources: https://code.visualstudio.com/updates/v1_106 ; https://code.visualstudio.com/api/references/contribution-points#contributes.viewsContainers ; https://code.visualstudio.com/api/ux-guidelines/status-bar (verified 2026-11-21).
Decision: Keep the supported secondarySidebar container at engine ^1.106.0. Reuse the single existing status-bar item as a port/state-labelled entry point to portwise.openPanel, with exact-home tooltip and accessible state label. Keep Diagnostics in its existing command. Name the container/view Portwise and remove the repeated visible heading inside the webview, preserving the accessible main name. Keep the existing monochrome currentColor SVG unchanged. No Activity Bar migration is necessary for this low-risk entry point.
Validation: Manifest/icon/status-command contract and rendered accessible-name tests. Phase 7g manual verification remains pending.

### D-22: Read-only current-account indication
Status: DECIDED
Date: 2026-11-21
Sources: User-approved Phase 7h; D-3 and D-13 file-store boundary; docs/SECURITY.md T3–T6, T14.
Decision: On existing panel refreshes, check explicit file-store mode before reading auth.json or SecretStorage snapshots. Resolve and validate the auth path, validate the current JSON object, then compare exact UTF-8 bytes in host memory. Equal-length comparisons use timingSafeEqual; different lengths cannot match. Temporary buffers are cleared after comparison; no credential hashes, cache, disk writes, network calls or polling are introduced. Unsupported store modes skip silently with no credential reads. Missing/invalid/unreadable files produce only an unavailable flag; raw exceptions never reach the panel or logs.
Payload: Each account has exactly id, name, isCurrent. A separate accountMatchAvailability enum (available/unsupported/unavailable) controls the no-match/unavailable note. The outgoing panel boundary projects the three allowed fields and the receiving guard rejects extra account fields. Display Current as text; display No saved account matches the current login. only after an available comparison with no matches. Never display a stale Last switched marker.
Limitations: Matching is a point-in-time byte comparison, not verified remote identity. Token refresh or even formatting changes can remove the marker; all exactly matching duplicate snapshots can be Current. No account save/switch/remove semantics are changed by matching.
Validation: Temporary-home matcher, unsupported-store no-read, malformed/missing/symlink, fake-credential payload hygiene, protocol-negative and actual renderer tests. Phase 7h and earlier combined F5 validation remain pending.

### D-23: Ambiguous current-account matches
Status: DECIDED (supersedes D-22 allowing multiple Current labels)
Date: 2026-11-21
Sources: User F5 finding on fad5a3c.
Decision: Zero matches retains the no-match note; exactly one match receives Current. Two or more exact matches set all isCurrent flags false and return only the non-secret ambiguous availability state. The panel shows exactly Current auth.json matches multiple saved accounts, without guessing a name. The renderer also refuses multiple Current labels defensively if an inconsistent available payload is received. Account entries still contain only id/name/isCurrent.
Validation: Zero, one, two and three matching snapshots; rendered ambiguity note; protocol acceptance; actual outgoing fake-credential payload hygiene. User F5 retest on 2e65865 passed 0/1/2+ Current-label cases on 2026-11-21.

### D-24: Shared account recovery and silent cancellation
Status: DECIDED
Date: 2026-11-21
Sources: User F5 finding on fad5a3c; temporary-home command and real panel-dispatch reproductions.
Findings: Exact zero-byte legacy locks already prompted for Switch, Save with a valid permit and Add Login. Cancelling recovery incorrectly threw lock_unavailable and displayed an error toast. Remove did not take the operation lock. Newline/BOM-only blank files also reproduced the no-prompt busy error because only the literal empty string was recognized as legacy. The precise contents/entry point of the user's original no-prompt occurrence are not inferred.
Decision: Use withAccountOperation for Switch, Save, Add Login and Remove with the same recovery callback and lock path. Treat declined recovery as a typed cancellation handled once at the command boundary without error logging/toast. Recognize whitespace/BOM-only blank legacy files, retain exact-path confirmation and identity rechecks, and never recover live owners by age. Remove retains its existing delete confirmation and never changes auth.json. Save still requires a valid single-use login permit; this fix does not bypass it.
Validation: All four actions via command palette and actual panel dispatch, each with confirmed/cancelled legacy recovery and live lock refusal. Cancellation preserves auth, account count, permit and lock bytes; live refusal emits exactly one toast. Existing identity/race, dead-owner, cleanup and host-termination tests remain enabled. User F5 retest on 2e65865 passed legacy recovery on Switch/Save/Remove, restart-notification reload and Escape/Cancel on 2026-11-21. Add Login recovery retains automated coverage without a claimed manual pass.

## Phase 7 acceptance update — 2026-11-21

Source: User F5 retest report on 2e65865, using E:\portwise-test-codex3. The user reports real ~/.codex hashes and auth.json Length/LastWriteTime unchanged. At the user's request, Phase 7 including 7b–7h is marked implementation complete with explicit F5 T6–T10 exceptions in docs/PLAN.md. No unreported manual check is marked passed; these F5 identifiers are not the security threat IDs. This acceptance update supersedes earlier pending-completion statements, without changing security decisions or claiming release readiness. Phase 8 is not started by this update.

### D-25: Preserve original artwork and render a separate extension PNG
Status: DECIDED
Date: 2026-11-21
Sources: User icon request; repository images inventory and manifest; installed @vscode/vsce public listFiles API; local ImageMagick inspection.
Decision: Retain images/activity.svg, images/icon.svg and images/icon.png byte-for-byte. The existing activity.svg is already monochrome currentColor and remains the secondary-sidebar container icon. The fixed-colour icon.svg remains the source for a new images/icon-128.png at the user's requested 128×128 dimensions; package.json references that PNG. No redraw, replacement source artwork, logo, view relocation or status-bar codicon change is needed.
Tool: Already-installed ImageMagick 7.1.2-27, command recorded in docs/BRANDING.md; no project dependency or install step added. Output is an 8-bit RGBA PNG with transparent corners.
Validation: PNG signature/dimensions; all referenced local icon paths exist and survive the real vsce no-dependencies file list and .vscodeignore processing; a temporary-package negative test detects exclusion. Packaging output is checked separately after verify. Phase 7 F5 T6–T10 remain open.

### D-26: Activity Bar container location
Status: DECIDED (supersedes the secondary-sidebar placement in D-21/D-25)
Date: 2026-11-21
Sources: User F5 finding on 6737374; package.json and extension registration; local XML parsing and ImageMagick SVG render; Activity Bar contribution support recorded in D-21.
Finding: The manifest contributed Portwise only to secondarySidebar. The icon path existed and survived packaging; the 24×24 currentColor SVG is valid and renders visible alpha. Container id portwise, views.portwise and registered view id portwise.panel agree. The absent Activity Bar entry is explained by container placement; no artwork repair is indicated by these checks.
Decision: Change only the container contribution location to activitybar, preserving its id, title, icon path, registered view, commands and status-bar codicon. Do not duplicate the container or modify any original image. Update UX-1 to reflect the requested Activity Bar entry. Existing user-customized VS Code layout may retain a prior view placement; fresh/default-layout F5 confirmation remains necessary.
Validation: Manifest/registration regression test enforces exactly one Activity Bar location; existing monochrome/icon-path/VSIX tests remain enabled. This does not claim a manual F5 pass or close T6–T10.

### D-27: Responsive command groups without changing account semantics
Status: DECIDED
Date: 2026-11-21
Sources: User F5 layout report on 462bd96; existing zero-argument account commands and panel protocol.
Finding: Content-sized flex action rows only switched layout below 260px, leaving irregular wrapping around 300–400px. User confirmed the Activity Bar icon is visible after D-26.
Decision: Keep account rows with a right-aligned Current label. Use the expressly approved global-command fallback: full-width Add via Codex Login followed by an equal-width secondary action grid for Save Current/Switch/Remove, separating Remove on narrow widths. Do not add misleading per-account buttons to commands that intentionally ask the user to pick an account. Provider names truncate with ellipsis and retain their full text/title; URL and masked suffix wrap anywhere. Provider Edit/Enable/Disable/Test labels are compact with original full aria-labels, while Delete has a separate destructive slot. All sections share header markup and full-width Add provider does not compete for heading space. Grid tracks have min-width:0 and media queries use actual webview width, regardless of sidebar location.
Validation: DOM/accessible-name, full-name title, text-only XSS-like names, original keyboard order and command payload tests. Optional scripts/checkPanelLayout.mjs bundles the real renderer using existing esbuild and checks 220/300/400/600/900px in an installed headless browser with fake data and a disposable offline profile. It uses synthetic dark/light/high-contrast variables; no dependency, display or browser download is added to npm run verify. No account/gateway behavior, protocol, CSP or credential storage change is introduced. User F5 visual V1–V5 on bce76c7 passed normal/220px width, secondary sidebar 600px+, long/XSS names, keyboard focus, light and High Contrast, with real ~/.codex hashes and auth.json reported unchanged (2026-11-21). The user explicitly authorizes pushing 462bd96 and bce76c7. This supersedes the local-only visual gate; Phase 7 remains "F5 T1/T4/T5 re-confirm and T6-T10 open".
