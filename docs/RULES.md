# Engineering Rules

## Code
1. TypeScript strict mode. No `any`, no `@ts-ignore`, no non-null `!` without a comment proving it.
2. `core/` and `gateway/daemon/` import nothing from `vscode`.
3. Functions do one thing; files stay under ~300 lines; prefer pure functions and explicit dependencies (pass `fs`, `clock`, `homedir` in) so tests need no mocks of the real machine.
4. No default exports except where a tool requires them. No circular imports.
5. No hidden global state. Anything stateful is a class with a `dispose()`.
6. Async: always handle rejections; no floating promises; no `setTimeout` without cleanup on dispose.
7. Comments explain **why**. Names explain **what**.

## Errors
1. Throw typed errors (`class XError extends Error`) from `core/errors.ts`; never throw strings.
2. Catch at boundaries (commands, HTTP handlers, webview handlers), convert to the user-facing shape (what failed, which hop, fix action), log the redacted detail.
3. Never swallow an error silently. If ignoring is correct, say why in a comment.

## Logging
1. Everything goes through `Logger`, which redacts.
2. Levels: `error` (action failed), `warn` (degraded, recoverable), `info` (lifecycle), `debug` (details; still redacted).
3. Never log request bodies, headers wholesale, or file contents.

## Testing
1. Unit tests for all `core/` logic. Integration tests for the daemon against a **fake upstream** server and a **temporary** Codex home.
2. Tests never touch the real `~/.codex`, the real network, or real tokens.
3. Every bug fix ships with a regression test. Every security rule ships with a negative test.
4. Tests must be deterministic: inject clocks and ports (use port `0` and read the assigned port).
5. Do not mock what you can run: prefer real `http` servers on loopback over mocking `http`.

## Dependencies
1. Default answer is no. Use Node and VS Code built-ins first.
2. A new dependency needs an entry in `docs/DECISIONS.md`: purpose, alternatives considered, maintenance status, size, install scripts, licence, and why it is safe. Runtime dependencies must have no installation hooks and use MIT/BSD/ISC/Apache-2.0 licences. Development tools may declare installation hooks only when installation uses `npm ci --ignore-scripts`; hooks must never be executed. Reviewed development-only licence exceptions are listed in `docs/DEPENDENCY_AUDIT.md`; those packages must not ship in the VSIX. New exceptions still require approval.
3. Pin with the lockfile. Updates arrive through Dependabot PRs and CI.

## Git
1. Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`, `refactor:`, `security:`).
2. One logical change per commit; CI green before merge.
3. Never commit `.env`, tokens, `auth.json`, `daemon.json`, or real logs.

## UI
1. Colours only from `--vscode-*` variables. Support light, dark, high contrast.
2. Every interactive element is keyboard reachable with a visible focus state and an accessible name.
3. Copy is short, specific, and states the next step. No exclamation marks, no blame.

## Docs
1. Update `docs/PLAN.md` status, `CHANGELOG.md` and `docs/DECISIONS.md` in the same PR as the change.
2. If you change behaviour covered by `docs/SPEC.md`, change the spec in the same PR.
