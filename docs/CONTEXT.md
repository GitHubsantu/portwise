# Project Context

## What Portwise is

A VS Code extension for people who use the Codex extension with more than one account or with OpenAI-compatible providers. It does two jobs:

1. **Profiles.** Save, list, switch and remove Codex account profiles and provider profiles, without losing conversation history.
2. **Gateway.** Run a small, loopback-only local gateway so Codex can talk to a provider through one stable local URL and one stable local token, and keep `config.toml` in sync automatically.

Audience: a solo developer on Windows 11 (primary), with macOS and Linux supported. Tone of the product: calm, precise, no jargon in errors.

## Why this project exists: failure modes we must make impossible or self-healing

These came from real use of a comparable tool. Each one is a requirement, traced to `docs/SPEC.md`.

| # | Failure seen in practice | Symptom | Portwise answer |
|---|---|---|---|
| 1 | Gateway picked a new random port on every start while `config.toml` kept the old one | `os error 10061` (connection refused), endless "Reconnecting 5/5" | Stable configurable port; automatic, verified config sync (GW-2, GW-9) |
| 2 | Local token changed or was never visible to the process that launched VS Code | `401 Invalid local gateway token` | Stable token; delivery method chosen in Phase 0; diagnostics detect mismatch (GW-3, GW-10, GW-11) |
| 3 | The daemon lived inside the extension host and died with it, leaving a stale state file with a dead PID | Port in the state file answered nothing | Detached single-instance daemon; liveness by health check, never PID alone (GW-4) |
| 4 | State file stored the token in plaintext next to a stale port | Secret on disk, easy to leak in a paste | No secrets on disk in the gateway state file (SECURITY T13, ARCHITECTURE storage map) |
| 5 | Two different 401s (local gateway vs upstream) looked identical | Hours of debugging the wrong hop | `x-portwise-hop` header plus distinct error codes (GW-7) |
| 6 | Codex tried a WebSocket first, failed, then fell back to HTTP on every turn | Noisy errors, slower turns | Sync sets `supports_websockets = false` unless the gateway implements WebSocket pass-through (GW-5) |
| 7 | A very long thread triggered context compaction through the gateway and timed out | "Compacting context", then "Connection failed" | Pass-through of every `/v1/*` path, large body limit, no idle timeout on live streams (GW-6) |
| 8 | A missing `/v1/models` route made health checks look like failures | `{"detail":"Not found."}` | Proper `/healthz` and proxied `/v1/models` (GW-5) |
| 9 | No single place to see what is wrong | Manual `netstat`, `curl`, PowerShell loops | One command: "Portwise: Run Diagnostics" (GW-11) |

## Environment facts (observed on the author's machine)

- Windows 11, VS Code, PowerShell, official OpenAI Codex extension.
- Codex home is `C:\Users\<user>\.codex` and contains `config.toml`, `auth.json`, and `.env`.
- Provider blocks in `config.toml` use these keys: `model_provider`, `[model_providers.<id>]` with `name`, `base_url`, `env_key`, `wire_api = "responses"`, `requires_openai_auth`, `supports_websockets`.
- Projects are marked trusted via `[projects.'<path>']` tables. Portwise must never rewrite or reorder these.
- Everything not listed here is **UNVERIFIED** until Phase 0 confirms it from official sources.

## Glossary

- **Codex home**: the directory Codex uses for config, auth and history (`~/.codex` by default).
- **Account profile**: a saved Codex sign-in (an OpenAI account).
- **Provider profile**: a saved OpenAI-compatible endpoint (name, base URL, token).
- **Gateway**: the local HTTP server on loopback that forwards Codex requests to the active provider.
- **Daemon**: the gateway running as its own detached process.
- **Sync**: writing the gateway URL (and, if applicable, credential delivery) into Codex's config, safely.
- **Hop**: one leg of the path Codex → gateway → upstream provider.

## Out of scope

- Hosting a gateway for other people, remote access, or any non-loopback listener.
- Sharing one account between several people, or rotating accounts to evade usage limits. Portwise is for managing **your own** accounts and providers within their terms of use.
- Replacing the official Codex extension or its UI.
- Telemetry, accounts, or any Portwise-run cloud service.

## Legal and attribution

- Portwise is an independent community extension, not affiliated with or endorsed by OpenAI or Microsoft. Use the disclaimer in `docs/BRANDING.md`.
- Do not use OpenAI logos or marks in the icon or listing. The word "Codex" appears only descriptively ("for Codex").
- License: MIT, copyright `Dharanidhar Mahata`.
- Clean-room rule: see `docs/PROMPT.md` constraint 1.
