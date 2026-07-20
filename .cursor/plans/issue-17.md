# Issue #17 — Global Launcher readiness

## Scope

Implement only the thin, explicitly invoked `$engineering-loop` Agent Skill and
its read-only readiness probe. Project onboarding, normalization, runtime
installation, task routing, and every later ticket are out of scope.

## Contract

- Distribution: `skills/engineering-loop/SKILL.md`, discoverable by `npx skills`.
- Invocation: metadata sets `disable-model-invocation: true`; the deterministic
  launcher also requires `--explicit` before probing a target.
- Empty target: return `ONBOARDING_REQUIRED` with exit code `0`, structured
  readiness checks, `mutated: false`, and an explicit next action.
- Safety: readiness inspects only; it creates, edits, moves, or deletes nothing
  in the Target Project.
- Tooling: Node.js ESM using cross-platform filesystem and process APIs.

## Acceptance mapping

| Acceptance criterion | Implementation | Verification |
| --- | --- | --- |
| Installable Global Launcher | One public `engineering-loop` skill | Real `npx skills add` smoke in an isolated temporary home |
| No implicit invocation | Frontmatter plus deterministic explicit guard | Metadata test and negative invocation fixture |
| Empty target needs onboarding | Read-only readiness CLI | Black-box process test for status and diagnostics |
| Probe does not mutate target | No write operations in probe | Tree and SHA-256 snapshot equality before/after |
| Cross-platform, Windows required | Node.js path/fs/process APIs | Platform smoke; this ticket is verified on Windows |

## Verification

1. `npm run typecheck`
2. `npm test`
3. `npm run test:install-smoke`
4. `npm run test:platform-smoke`
5. `npm run verify`
6. Review the final diff from commit `40ab802` with `$code-review`.
