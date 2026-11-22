# Security

This document is binding. If code and this file disagree, the code is wrong.

## 1. Assets

Provider tokens · account credentials · the local gateway token · `config.toml` integrity · the user's prompts and code in transit through the gateway.

## 2. Trust boundaries

Extension host ⇄ webview · extension host ⇄ daemon · daemon ⇄ Codex (local) · daemon ⇄ upstream provider (network) · workspace files (untrusted input) · other local processes and browser tabs (untrusted).

Out of scope: malware already running as the same OS user (it can read the Codex credential file anyway), and a compromised OS.

## 3. Threat model

| ID | Threat | Required mitigation | Proof (test or check) |
|---|---|---|---|
| T1 | A malicious workspace sets `portwise.*` settings (for example `codexHome`) to redirect reads and writes | Every security-relevant setting has `"scope": "machine"`. Resolve and validate paths (absolute, no null bytes). | Manifest test asserts machine scope; `paths.test.ts` negative cases |
| T2 | A web page or local process calls the gateway (CSRF, DNS rebinding) | Loopback bind only. Validate `Host`. Reject any request with an `Origin` header. No CORS headers, ever. Require the local token on everything except `/healthz`. | Integration tests for 421, 403, 401 |
| T3 | Secrets leak into logs, notifications or diagnostics | All output passes `redactSecrets()`. Tokens are never interpolated into messages. Diagnostics build from an allow-list of fields. | Redaction tests; end-to-end "secret hygiene" scenario |
| T4 | Upstream token reaches Codex, the webview, or disk | Stored in `SecretStorage`; sent to the daemon over stdin or the authenticated control API; masked in UI; never echoed in responses. | Test that responses and logs never contain the fake upstream token |
| T5 | XSS or message spoofing in the webview | CSP with nonce, `default-src 'none'`; no inline script; build DOM with `textContent`; ESLint bans `innerHTML`; validate every message with a guard; `localResourceRoots` limited to `dist/webview`. | Lint rule; protocol guard tests; CSP string test |
| T6 | Path traversal or symlink tricks on credential/config files | Resolve real paths; refuse to follow symlinks for credential files (`lstat`); confirm target stays inside Codex home. | Temp-dir tests with symlinks and `..` |
| T7 | Torn or corrupt writes lose credentials or config | Lock → backup → temp file in the same directory → fsync → rename → verify. On failure, restore. | Fault-injection tests (throw between steps) |
| T8 | Gateway becomes an open proxy or SSRF primitive | Forward only to the configured provider origin. Ignore absolute-URI request lines and client-supplied `Host`. Do not follow redirects to a different origin. Allow-list forwarded headers; strip hop-by-hop headers. | Tests with absolute URIs and redirects |
| T9 | Supply-chain compromise | Lockfile committed; `npm ci --ignore-scripts` in CI; runtime dependencies minimal and justified; Dependabot; `npm audit` gate; CI actions pinned (move to full commit SHAs before first release); publisher account with 2FA; scoped, expiring publish token. | CI config; `docs/DECISIONS.md` dependency log |
| T10 | Token exposure via clipboard or screen | "Copy token" is explicit; clipboard cleared after 30 s if still ours; tokens masked everywhere else. | Manual checklist |
| T11 | Cleartext credentials over the network | `https` required for non-loopback providers (PRV-2). | `urlValidate.test.ts` |
| T12 | Resource exhaustion of the daemon | Body limit, connection cap, connect/total timeouts, header size limit, graceful handling of slow clients. | Load and slow-loris style tests |
| T13 | State-file or daemon hijack (stale PID reuse, fake daemon on our port) | State file holds no secrets and is mode 0600. A fresh health challenge must prove the shared secret, bound to instanceId and actual loopback port, before credentials are sent. Authenticated status/control must stay on that exact verified TCP connection; no reconnection fallback. Unverified/orphan listeners are reported, never adopted or stopped. | Ownership, replay, relay, connection-loss, stale-state and impostor tests |
| T14 | Theft of account credential snapshots | Snapshots only in `SecretStorage`; never in settings, `globalState`, logs or backups. | Storage audit test |
| T15 | Misuse (account sharing, evading limits) | Out of scope by design; no feature may exist whose purpose is to share an account or rotate accounts to bypass limits. State this in the README. | Review checklist |

## 4. Secure coding checklist (apply to every change)

- [ ] No `eval`, `new Function`, `child_process` with string commands, or shell interpolation. Use `spawn` with an argument array.
- [ ] No `innerHTML`, `outerHTML`, `insertAdjacentHTML`. DOM via `textContent` and element APIs.
- [ ] All external input validated at the boundary (webview messages, HTTP headers, settings, files). Parse, don't trust.
- [ ] Comparisons of secrets use `crypto.timingSafeEqual` on equal-length buffers.
- [ ] Randomness from `crypto.randomBytes`, never `Math.random`.
- [ ] Errors surfaced to users contain no secrets and no raw stack traces.
- [ ] File writes use the atomic helper. Files holding secrets are created with mode `0o600`.
- [ ] No network call outside the allowed destinations (PROMPT constraint 5).
- [ ] New dependency? Fill the dependency log entry first.

## 5. Webview CSP (exact policy)

Batch B implementation evidence (2026-11-21): `privateFile.test.ts` rejects unknown/broad/inherited ACLs and failed identity/apply/save/verify commands before private bytes are written. `fileTransactions.test.ts` covers exclusive temporary files, linked-file rejection, serialized config operations, external edits and parser-output hygiene; `storageConcurrency.test.ts` covers paired provider URL/token reads, mutation serialization and retained failed-cleanup references. `gatewayRobustness.test.ts` covers health Host/empty Origin rejection, CORS/hop headers, compressed relay, malformed/header-limited input, bounded control uploads, streaming deadlines/backpressure and connection caps. `gatewayStartup.test.ts` covers spawn/stdin failures and real-child invalid/oversized bootstrap/bind failures. `accountPrompts.test.ts` checks unknown credential-bearing exceptions never reach notifications, logs or panel messages. These automated checks do not replace the remaining user-run release checks or close Batch C.

```
default-src 'none'; style-src ${cspSource}; script-src 'nonce-<random>'; img-src ${cspSource} data:; font-src ${cspSource}
```

No `unsafe-inline`, no `unsafe-eval`, no remote origins. A test asserts the string.

## 6. Release hardening

- Build only from a clean checkout in CI with `npm ci --ignore-scripts`.
- Publish from CI with a scoped token; enable provenance where the registry supports it.
- Inspect the VSIX file list (`vsce ls`) before every release: no source maps with secrets, no `.env`, no docs with prompts.
- Tag releases; keep `CHANGELOG.md` current; attach the VSIX to the GitHub release.

## 7. If a token leaks

1. Rotate the local gateway token (command: "Portwise: Rotate Gateway Token"), which re-syncs delivery.
2. Revoke the upstream provider token at the provider and update the profile.
3. Review `config.toml` backups and logs for the leaked value and delete them.

## 8. Reporting vulnerabilities

Open a private security advisory on the GitHub repository (Security → Report a vulnerability). Do not post secrets or exploit details in public issues.
