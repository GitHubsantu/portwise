# Functional Specification

Requirement IDs are stable. Reference them in commits, tests and phase reports. "MUST" is mandatory, "SHOULD" is the default unless a documented reason exists.

## 1. Profiles

| ID | Requirement |
|---|---|
| PRV-1 | The user MUST be able to add, edit, enable, disable and delete **provider profiles**: display name, base URL, access token. |
| PRV-2 | Base URL MUST be validated: absolute URL, `https` required unless the host is loopback (`127.0.0.1`, `::1`, `localhost`), no credentials in the URL, no fragment. `http` to a non-loopback host MUST be rejected with an explanation. |
| PRV-3 | Provider tokens MUST be stored only in VS Code `SecretStorage`. They MUST NOT appear in settings, `globalState`, logs, the webview DOM (masked to the last 4 characters) or any file. |
| PRV-4 | A **Test connection** action MUST verify reachability and authentication with the smallest harmless request, never sending user code or prompts, and report which hop failed. |
| ACC-1 | The user MUST see saved **account profiles** with a clear active marker. |
| ACC-2 | Adding an account MUST use the official Codex sign-in flow identified in Phase 0. Portwise MUST NOT ask for or handle passwords. |
| ACC-3 | Switching accounts MUST be atomic: take a lock, back up the current credential file, write the new one with a temp-file + rename, verify, then prompt to restart the extension host. On any failure the previous state MUST be restored. |
| ACC-4 | Account credential snapshots MUST be held in `SecretStorage`. Only the active account exists as plaintext in the file Codex itself requires. |
| ACC-5 | Removing a profile MUST require confirmation and MUST NOT delete conversation history. |
| USG-1 | Usage limits MAY be shown **only** if Phase 0 finds a documented or officially supported source. If none exists, the feature is omitted and documented as such. |
| USG-2 | If implemented: fetch lazily on expand, at most once per 24 hours per account unless the reset window expired, fail soft when offline. |

## 2. Gateway

| ID | Requirement |
|---|---|
| GW-1 | Listen on loopback only (`127.0.0.1`, optionally `::1`). Never `0.0.0.0`. |
| GW-2 | Use a **stable, user-configurable port** (default `47831`). If it is taken, report who owns it if known, and offer to pick another. Never silently choose a random port. If the port changes, sync (GW-9) MUST run automatically and be verified. |
| GW-3 | Generate a **stable local token** once (32 random bytes, base64url), keep it in `SecretStorage`, support explicit rotation. |
| GW-4 | Run as a **detached, single-instance daemon** that survives extension-host restarts. A lock/state file holds `pid`, `port`, `instanceId`, `startedAt`, `version` and **no secrets**. Liveness is decided by `GET /healthz` returning the matching `instanceId`, never by PID alone. Stale state MUST be detected and cleaned automatically. |
| GW-5 | Routes: `GET /healthz` (no auth, minimal JSON); every other `/v1/**` path is proxied to the active provider, including `/v1/responses`, `/v1/models` and any compaction path. Optional named routes `/p/<slug>/v1/**` target a specific provider profile. Streaming (SSE) MUST be passed through unbuffered. A WebSocket upgrade MUST either be proxied or refused immediately and cleanly so clients fall back without delay. |
| GW-6 | Request body limit defaults to 64 MiB (configurable). No idle timeout shorter than the configured stream timeout while a response is actively streaming. Connect timeout and total timeout are configurable. Client disconnects abort the upstream request. |
| GW-7 | Errors from the gateway itself MUST be JSON `{ "error": { "type", "code", "message", "hint", "hop" } }` with `hop: "gateway"`. Responses relayed from upstream MUST be unmodified and carry header `x-portwise-hop: upstream`. See the error taxonomy in `docs/ARCHITECTURE.md`. |
| GW-8 | The gateway authenticates the **local** token, then replaces the `Authorization` header with the upstream provider token. The local token is never forwarded; the upstream token is never returned to the client. |
| GW-9 | **Config sync** MUST: back up `config.toml`, change only Portwise's managed provider entry and nothing else (comments, ordering and unrelated tables preserved), write atomically, re-read and verify, be idempotent, and offer one-click restore of the last backup. |
| GW-10 | **Credential delivery to Codex** uses the method chosen in Phase 0 (`docs/DECISIONS.md`). Whatever the method, Diagnostics MUST detect when Codex would send a stale or empty credential. |
| GW-11 | The command **Portwise: Run Diagnostics** runs and reports PASS/FAIL with a fix hint for: daemon alive, port bound by our instance, `/healthz` OK, local token accepted, config in sync, credential delivery OK, upstream reachable and authenticated, Codex home writable. A **Copy redacted report** action MUST exist. |
| GW-12 | Start, Stop, Restart and Show Logs commands MUST exist. Auto-start on activation is a setting, default on. |

## 3. User experience

| ID | Requirement |
|---|---|
| UX-1 | Primary UI is a webview in the secondary sidebar: profile list, active marker, gateway status, and actions. |
| UX-2 | A status-bar item shows gateway state (running, stopped, degraded) and port; clicking it opens the panel or diagnostics. |
| UX-3 | Every error shows: what failed, which hop, and a button that performs the fix when one exists. No bare technical messages. |
| UX-4 | Destructive actions confirm. Secrets are never shown in full; **Copy token** is an explicit action. |
| UX-5 | Fully keyboard operable, correct ARIA roles and labels, colours only from VS Code theme variables, works in light, dark and high-contrast themes. |
| UX-6 | All user-visible strings live in one module so localisation is possible later. |

## 4. Non-functional

| ID | Requirement |
|---|---|
| NFR-1 | Activation is lazy and finishes in under 200 ms; the daemon starts in the background. |
| NFR-2 | Works on Windows, macOS, Linux; Node 20.19+ for builds; VS Code engine as in `package.json`. |
| NFR-3 | No telemetry. Works fully offline except for the configured provider. |
| NFR-4 | Runtime dependencies: as few as possible; target zero beyond Node built-ins (HTTP server and proxy, TOML editing may justify exactly one small, audited library, decided in Phase 0). |
| NFR-5 | The daemon never crashes on malformed input; it returns a gateway error and keeps serving. |
| NFR-6 | Every write to files outside the extension's storage uses temp-file + rename and keeps a backup. |

## 5. Acceptance scenarios (must be automated where feasible)

1. **Restart survival.** Start daemon, restart the extension host, send a request: same port, same token, no config change, request succeeds.
2. **Port conflict.** Occupy the default port, activate: user sees who/what, picks a new port, config syncs, request succeeds.
3. **Stale state.** Kill the daemon process abruptly: next activation detects stale state, cleans it, restarts, and Diagnostics is green.
4. **Hop clarity.** Upstream returns 401: the client sees it unmodified with `x-portwise-hop: upstream`. Wrong local token: client sees `local_token_invalid` with `hop: "gateway"`.
5. **Streaming.** A 10-minute SSE response with sparse chunks is delivered without being cut.
6. **Large body.** A 40 MiB request body is proxied; a 100 MiB body gets `payload_too_large`.
7. **Rebinding.** A request with `Host: evil.example` gets `421`; a request carrying an `Origin` header gets `403`.
8. **Config safety.** Sync on a `config.toml` containing comments, `[projects.*]` tables and unknown keys changes only the managed entry; restore returns the exact original bytes.
9. **Secret hygiene.** Searching all logs, files and the diagnostics report from a full run finds none of the test secrets.
