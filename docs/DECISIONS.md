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
