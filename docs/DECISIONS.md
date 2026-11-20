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
Date: 2026-11-20
Question: When may Portwise modify a Codex home's `config.toml` or `.env`?
Sources: User-reported F5 safety finding (2026-11-20); docs/SECURITY.md (accessed 2026-11-20)
Decision: Starting or auto-starting the gateway never modifies a Codex file. A separate Configure Codex for Gateway action displays the exact resolved Codex-home path and requires explicit confirmation once for that path before any Portwise write. Consent is stored per resolved path in extension global state; a changed path always asks again. Restore and provider-switch writes use the same guard.
Alternatives rejected: Implicit approval through Start Gateway or extension activation, because a default resolved home can be the real `~/.codex`.
Fallback if the source changes: Keep writes disabled until the user explicitly configures the target Codex home.

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
Status: DECIDED
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
Validation: Zero, one, two and three matching snapshots; rendered ambiguity note; protocol acceptance; actual outgoing fake-credential payload hygiene. Manual retest remains pending.

### D-24: Shared account recovery and silent cancellation
Status: DECIDED
Date: 2026-11-21
Sources: User F5 finding on fad5a3c; temporary-home command and real panel-dispatch reproductions.
Findings: Exact zero-byte legacy locks already prompted for Switch, Save with a valid permit and Add Login. Cancelling recovery incorrectly threw lock_unavailable and displayed an error toast. Remove did not take the operation lock. Newline/BOM-only blank files also reproduced the no-prompt busy error because only the literal empty string was recognized as legacy. The precise contents/entry point of the user's original no-prompt occurrence are not inferred.
Decision: Use withAccountOperation for Switch, Save, Add Login and Remove with the same recovery callback and lock path. Treat declined recovery as a typed cancellation handled once at the command boundary without error logging/toast. Recognize whitespace/BOM-only blank legacy files, retain exact-path confirmation and identity rechecks, and never recover live owners by age. Remove retains its existing delete confirmation and never changes auth.json. Save still requires a valid single-use login permit; this fix does not bypass it.
Validation: All four actions via command palette and actual panel dispatch, each with confirmed/cancelled legacy recovery and live lock refusal. Cancellation preserves auth, account count, permit and lock bytes; live refusal emits exactly one toast. Existing identity/race, dead-owner, cleanup and host-termination tests remain enabled. No phase is marked complete.
