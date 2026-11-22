# Architecture

## 1. Overview

```
 VS Code window
 ┌─────────────────────────────────────────────┐
 │ Extension host (src/extension.ts)           │
 │  ├─ ProfileStore ── SecretStorage           │
 │  ├─ ConfigSync ──── <codexHome>/config.toml │
 │  ├─ GatewayController ──┐                   │
 │  ├─ Diagnostics         │ spawn / control   │
 │  └─ PanelProvider ◄─► Webview (CSP, no eval)│
 └─────────────────────────┼───────────────────┘
                           ▼
            Detached daemon (dist/gateway.js)
            127.0.0.1:<stable port>
                           │
 Codex ──► /v1/* ──────────┤  validate Host/Origin → check local token
                           │  swap Authorization → stream to upstream
                           ▼
                  Upstream provider (HTTPS)
```

## 2. Modules (target layout)

```
src/
  extension.ts            activation, wiring only (no logic)
  core/                   pure, vscode-free, unit-tested
    redact.ts  paths.ts  nonce.ts  atomicWrite.ts  fileLock.ts  tomlEdit.ts  urlValidate.ts  errors.ts
  profiles/               ProfileStore, provider + account models, SecretStorage wrapper
  gateway/
    daemon/               standalone entry (built to dist/gateway.js), http server, proxy, auth, limits
    controller.ts         spawn, health-check, stop, state-file handling (extension side)
    protocol.ts           control API types shared by both sides
  sync/                   ConfigSync, credential delivery, backups/restore
  diagnostics/            checks, report builder
  ui/                     panelProvider, statusBar, notifications, strings.ts
  shared/                 protocol.ts (webview messages), guards
  webview-ui/             vanilla TS UI, CSS from VS Code theme variables
test/                     unit + integration (fake upstream, temp codex-home)
```

Rule: anything that touches `vscode` lives outside `core/`. Everything in `core/` and `gateway/daemon/` must run under plain Node so it can be tested without VS Code.

## 3. Storage map

| Data | Where | Why / protection |
|---|---|---|
| Provider tokens | `SecretStorage` | OS-backed, never on disk in plaintext |
| Account credential snapshots | `SecretStorage` | same |
| Local gateway token | `SecretStorage` (source of truth). Delivered to Codex by the Phase 0 method | stable, rotatable |
| Profile metadata (names, URLs, ids, flags) | `globalState` | no secrets |
| Gateway state (`pid`, `port`, `instanceId`, `startedAt`, `version`) | `<extension globalStorage>/gateway.json`, mode 0600 | **no secrets**; stale-safe |
| Gateway runtime secrets | daemon memory only, passed on stdin at spawn and via the authenticated control endpoint | nothing on disk |
| `config.toml` backups | `<extension globalStorage>/backups/`, last N | restorable |
| Active Codex credential file | where Codex requires it | unavoidable; mode 0600, atomic writes, lock |

## 4. Daemon lifecycle

```
              ┌──────────┐ start ┌──────────┐ health ok ┌─────────┐
   (none) ───►│ STARTING │──────►│ VERIFYING│──────────►│ RUNNING │
              └──────────┘       └────┬─────┘           └────┬────┘
                                      │ timeout/bind error   │ health fails
                                      ▼                      ▼
                                 ┌─────────┐  auto-restart ┌──────────┐
                                 │ FAILED  │◄──────────────│ DEGRADED │
                                 └─────────┘  (max N, backoff)└────────┘
```

- On activation: read state file → if present, `GET /healthz` and compare `instanceId`. Match → adopt. Mismatch or no answer → delete state, start fresh.
- Starting: spawn detached Node with the bundled `dist/gateway.js`, secrets on stdin, wait for `/healthz`, then write the state file. Config/.env changes require a separate command and fresh exact-path confirmation for each operation.
- Stopping: authenticated `POST /_portwise/shutdown`, then verify the port is free.
- Single instance: bind failure with `EADDRINUSE` + healthy foreign instance of ours → adopt; foreign non-Portwise owner → report.

## 5. Control API (daemon, authenticated with the local token)

`GET /_portwise/status` · `PUT /_portwise/providers` (replace active provider set, secrets in body, never logged) · `POST /_portwise/shutdown`. Paths under `/_portwise/` are never proxied upstream.

The provider replacement payload is the current enabled provider object, or JSON `null` to clear it. The controller authenticates daemon identity before updating it; profile mutations and adoption synchronize this state. Synchronization failure is actionable and never reported as successful application to the daemon.

Control JSON and stdin bootstrap are capped at 64 KiB. Provider URLs are validated at these boundaries, independently of profile validation. Slow request bodies share the total request deadline. Native HTTP(S) relay preserves compressed bytes and honors downstream backpressure; a failure after response headers closes the stream. Health still requires a valid Host and absence of Origin. Response CORS and hop-by-hop headers are removed, including Connection-nominated headers; provider response bodies/status remain unchanged. Fixed startup errors are consumed through bounded stderr, never forwarded verbatim.

## 6. Request pipeline (daemon)

1. Reject non-loopback peer. 2. Validate `Host` against the allow-list (`127.0.0.1:<port>`, `localhost:<port>`, `[::1]:<port>`) → else `421`. 3. If an `Origin` header is present → `403`. 4. Route `/healthz`. 5. Check local token with constant-time compare → else `401 local_token_invalid`. 6. Enforce body limit. 7. Resolve provider. 8. Build upstream request: allow-listed headers only, strip hop-by-hop headers, replace `Authorization`. 9. Stream both directions; abort on client close. 10. Map failures to the taxonomy below.

## 7. Error taxonomy

| Code | HTTP | Hop | Meaning | Hint shown to the user |
|---|---|---|---|---|
| `local_token_invalid` | 401 | gateway | Codex sent a missing/stale local token | Run Diagnostics → "Repair credential delivery" |
| `host_not_allowed` | 421 | gateway | Unexpected Host header | Do not expose the gateway; check proxies |
| `origin_not_allowed` | 403 | gateway | Browser-originated request | Only Codex should call this |
| `payload_too_large` | 413 | gateway | Body over the limit | Raise `portwise.gateway.maxBodyMiB` |
| `no_active_provider` | 503 | gateway | No provider selected | Pick a provider in the panel |
| `upstream_unreachable` | 502 | upstream | DNS/connect/TLS failure | Check network, base URL, proxy |
| `upstream_timeout` | 504 | upstream | Connect or total timeout | Raise timeout or retry |
| (relayed) | any | upstream | Provider's own response | Header `x-portwise-hop: upstream` |
| `gateway_not_ready` | 503 | gateway | Daemon still starting | Retry in a moment |
| `internal_error` | 500 | gateway | Bug | Copy redacted diagnostics; file an issue |

## 8. Webview protocol

Typed messages in `src/shared/protocol.ts`. Every inbound message is validated with a guard; unknown types are dropped and logged at `warn`. The webview never receives secrets; it receives masked values and ids.

Outgoing providers are projected to id/name/baseUrl/enabled/tokenMask; the entire host message is validated before posting. Provider entries require all five correctly typed fields and masked text, with no extra credential fields. The webview also validates each entry before rendering and keeps the previous valid state on rejection.

## 9. Config sync strategy

Prefer a TOML-aware, comment-preserving edit of only the managed provider table. If a library is not justified, use a clearly delimited managed block (`# >>> portwise managed >>>` … `# <<< portwise managed <<<`) plus a parse-and-verify step. Never regex across the whole file. Record the choice in `docs/DECISIONS.md`.

The managed span is replaced in place without accumulating separators. Byte-identical config/.env candidates cause no backup or file/ACL replacement. A fresh canonical-path confirmation is still required on each Configure invocation; its approval covers that invocation's two-file operation, including rollback, not later commands. Restore and provider-switch have their own fresh exact-path dialogs. Account/login consent is separate.

Config commands are serialized in the extension, with an additional per-home file lock around each file operation across instances. Every replacement uses an exclusive randomly named temporary file; private bytes are written only after its permissions are applied and verified (0600 on POSIX, protected current-user DACL on Windows). Backups use the same permission gate. ACL failure prevents that file's commit; earlier steps in a Configure invocation may already have succeeded. Immediately before replacement, recheck canonical paths, file identity and original bytes. Verification failures preserve external edits instead of rolling back over them. Store queues serialize metadata/SecretStorage mutations and read provider URL/token pairs together.

Windows inspection uses a fixed read-only PowerShell/.NET binary-DACL reader with numeric SID identities. Permission errors include only bounded target roles/stages, command names, categories/exit codes and fixed verification/principal classifications; no paths, account names, raw tool output or ACL dumps. Empty-file restriction/verification still precedes content writes, and cleanup failures cannot mask the primary error. The five-second per-command deadline remains in force; operations are not automatically retried.

Backup storage now uses a 43-character SHA256/Base64url key of the canonical home path. Legacy path-encoding directories stay in place and are included in Restore and the combined ten-backup retention per target; pruning occurs only after securing a new snapshot. Selected legacy bytes are validated/read before safety-backup retention. Windows preflights staging/backup paths against a conservative 259-character maximum before private bytes, with a fixed path-length error rather than a policy change or fallback. Diagnostics add only existence observations, length buckets and static process-exit error names; an ACL principal not yet inspected is reported as not-reached.

## 10. Read-only diagnostics

Only an explicit diagnostics command probes the current configured home, saved daemon identity/port, health, authenticated status, Portwise TOML values, delivered local token and existing .env permissions. It reads no account credentials and makes no Codex-home writes or repairs. The only upstream request is GET models to the configured provider with its own token; redirects are refused and response bodies are discarded. Health JSON is capped at 4 KiB with a deadline, and local authentication is withheld unless health matches saved identity on the configured port. Missing/stale/foreign inputs produce fixed hop-specific hints, never raw input/error text. Reports project allowed fields, pass through redaction and are copied only on the explicit notification action. Windows home writability is WARN without a write probe; a restart warning remains because delivered bytes do not establish a running Codex process's environment.
