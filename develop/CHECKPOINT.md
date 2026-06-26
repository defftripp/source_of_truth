# Active Checkpoint

Status: DONE_WITH_CONCERNS
Last updated: 2026-06-26

## Goal

`source_of_truth` has a repo-owned onboarding skill, safe install script, readiness audit script, expanded starter template and current evidence.

## Scope

- Create `skills/source-of-truth-onboarding/**`.
- Create install and readiness audit scripts.
- Expand starter template with docs, rules, hooks, agents and memory additions.
- Add missing root rules/hooks/docs/develop/memory files needed by this repo's own canon.
- Update registries, README, decisions and memory.
- Run local verification.

## Anti-Scope

- Do not install into real `~/.codex` without explicit approval phrase.
- Do not add broad MCP/plugin installers.
- Do not generate production app code.
- Do not rewrite public content unrelated to capability/onboarding docs.

## Inputs To Read

- `AGENTS.md`
- `docs/PRODUCT_DIRECTION.md`
- `docs/ARCHITECTURE.md`
- `docs/superpowers/specs/2026-06-26-source-of-truth-onboarding-skill-design.md`
- `registries/capabilities.json`
- `memory/MEMORY.md`
- `memory/SESSION-HANDOFF.md`

## Verification

- RED smoke for missing files before implementation.
- Temp Codex home install smoke.
- Empty project readiness audit.
- Bootstrap project readiness audit.
- `npm run audit:capabilities`
- `npm run audit:readiness`
- `npm run check`
- `git diff --check`

## Evidence

- summary path: `develop/artifacts/onboarding/source-of-truth-onboarding.md`
- bulky artifact path: `output/**`

## Stop Condition

Stopped after verification was recorded and remaining gaps were made explicit in `develop/artifacts/onboarding/source-of-truth-onboarding.md`.
