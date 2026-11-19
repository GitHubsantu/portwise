# AGENTS.md — instructions for AI coding agents

Project: **Portwise**, a VS Code extension (TypeScript) that manages Codex account/provider profiles and runs a local, loopback-only gateway.

## Read before doing anything
1. `docs/PROMPT.md` — the master prompt (your operating rules)
2. `docs/CONTEXT.md`, `docs/SPEC.md`, `docs/ARCHITECTURE.md`
3. `docs/SECURITY.md` and `docs/RULES.md` — binding
4. `docs/PLAN.md` — work one phase at a time

## Commands
- `npm ci` — install exactly from the lockfile
- `npm run check` — typecheck + lint + tests (must pass before you say "done")
- `npm run verify` — check + production build + VSIX package (must pass at the end of every phase)
- `npm run watch` — dev build; press F5 in VS Code to launch the Extension Development Host

## Hard rules (short form)
- **Original code only.** Never copy from or imitate `GooseG4G/goosenest-codex-profiles` (no license = all rights reserved). Implement from `docs/SPEC.md`.
- **Never print, log, commit or paste secrets.** Use obvious fakes in tests (`test-token-0000`).
- **No `any`, no `eval`, no `innerHTML`.** Lint enforces it. Do not disable lint rules to get green.
- **Do not weaken or delete tests** to make a build pass. Fix the cause.
- **Do not invent Codex config keys or endpoints.** Verify against official OpenAI Codex docs and record the result in `docs/DECISIONS.md`.
- **Register only commands that work.** No stubs that throw at runtime.
- Ask before adding any dependency (see `docs/RULES.md`).
