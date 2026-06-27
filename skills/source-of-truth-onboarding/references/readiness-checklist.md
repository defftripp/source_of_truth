# Readiness Checklist

Load this checklist before granting `READY_FOR_IMPLEMENTATION`.

## Structure

- `AGENTS.md` exists and defines read order, communication rules, halt gates, evidence and memory update policy.
- Product direction exists: `docs/PRODUCT_DIRECTION.md` or `docs/PRD.md`.
- Architecture exists: `docs/ARCHITECTURE.md`.
- Decisions log exists: `docs/DECISIONS.md`.
- Skill registry exists: `docs/SKILLS.md` or `develop/SKILL_REGISTRY.md`.
- Memory exists: `memory/MEMORY.md`, `memory/SESSION-HANDOFF.md`, `memory/QUESTIONS.md`, `memory/LESSONS.md`.
- Execution layer exists: `develop/README.md`, `develop/IMPLEMENTATION_PLAN.md`, `develop/LOCAL_RUNBOOK.md`, `develop/TODO.md`, `develop/CHECKPOINT.md`, `develop/stages/`, `develop/artifacts/`.
- Rules/hooks/agents docs exist or missing pieces are explicitly justified.

## Content

- Product goal, users, scope and anti-scope are written.
- Stack constraints and local commands are written.
- First milestone has a bounded checkpoint.
- Checkpoint names goal, scope, anti-scope, touched areas, verification, evidence path and stop condition.
- Blocking questions are closed or marked `BLOCKED`.
- Non-blocking questions are recorded as assumptions.
- External capabilities are checked or degraded mode is explicit.
- External capability sources are declared in `registries/capabilities.json sources[]` before any install/update proposal.
- Plugin availability is proven by plugin cache, not only enabled config.

## Safety

- Secrets are not written into docs, evidence, rules or chat output.
- Generated folders are not treated as source of truth.
- Existing project files are preserved unless explicit overwrite was approved.
- Global Codex writes are not performed without the approval phrase.
- Missing skill/MCP/plugin sources are treated as blockers or degraded mode, not solved by guessed clones or package names.

## Final Status

- `READY_FOR_IMPLEMENTATION`: all required structure and blocking decisions are present.
- `NEEDS_CONTEXT`: structure can be created, but important product/architecture/workflow answers are missing.
- `BLOCKED`: external access, secrets, provider approval, payments, deploy access or destructive action approval is required.
