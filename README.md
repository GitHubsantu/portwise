<p align="center"><img src="images/icon.png" width="96" alt="Portwise icon"></p>

# Portwise: Codex Account & Provider Switcher

**Switch Codex accounts and providers. Always on the right port.**

Portwise is a VS Code extension that manages Codex account and provider profiles and runs a small, loopback-only local gateway, so Codex keeps talking to the right endpoint with the right credential, even after VS Code restarts.

> **Status: project kit.** This repository is a verified scaffold plus a complete planning kit. The features below are specified in `docs/SPEC.md` and built phase by phase from `docs/PLAN.md`.

## Planned features

- Save, list, switch and remove provider profiles and account profiles
- Local gateway on a **stable port** with a **stable token** that survives restarts
- Explicitly confirmed, verified, reversible config sync: confirmation before every config/.env write operation
- One-command diagnostics that names the failing hop (extension, gateway, or upstream)
- No telemetry. Secrets live in VS Code `SecretStorage`, never in plaintext logs

## Build it with an AI coding agent

1. Run `npm run personalize -- --publisher <id> --github <user> --author "<Your Name>"`
2. Open this folder in VS Code and start your coding agent (Codex, Claude Code, …)
3. Paste the master prompt from [`docs/PROMPT.md`](docs/PROMPT.md)
4. Approve one phase at a time; each ends with `npm run verify` passing

## Develop

Requires Node.js 20.19+ (22 recommended, see `.nvmrc`).

```shell
npm ci
npm run check      # typecheck + lint + tests
npm run verify     # check + production build + VSIX package
npm run watch      # dev build; press F5 to launch the Extension Development Host
```

Install the built package:

```shell
code --install-extension ./portwise-0.1.0.vsix --force
```

## Project map

| Path | Purpose |
|---|---|
| `src/` | extension, core utilities, webview shell |
| `test/` | unit and contract tests |
| `docs/PROMPT.md` | master prompt plus resume, security-review and bug-report prompts |
| `docs/CONTEXT.md` | why this exists, known failure modes, environment facts |
| `docs/SPEC.md` | requirements with stable IDs and acceptance scenarios |
| `docs/ARCHITECTURE.md` | modules, storage map, daemon lifecycle, error taxonomy |
| `docs/SECURITY.md` | threat model T1–T15 and the secure-coding checklist |
| `docs/RULES.md` | engineering rules |
| `docs/PLAN.md` | phases 0–8 with acceptance criteria |
| `docs/DECISIONS.md` | sourced decisions and dependency log |
| `docs/BRANDING.md` | name, colours, assets, voice |
| `AGENTS.md`, `CLAUDE.md` | instructions picked up automatically by coding agents |

## Disclaimer

Portwise is an independent community extension. It is not affiliated with, endorsed by, or sponsored by OpenAI or Microsoft. "Codex" is used only to describe compatibility. Portwise is for managing your own accounts and providers within their terms of use.

## License

MIT © Dharanidhar Mahata (imdevops). See [LICENSE](LICENSE).
