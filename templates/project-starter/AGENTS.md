# AGENTS.md

Project-local operating canon.

This file defines how work is run in this project: documentation style, planning order, checkpoint execution, review gates, evidence, and tool boundaries. Tool-specific files such as `.cursor/rules`, `.claude/rules`, or Codex skills may adapt these rules, but they must not create a second source of truth.

## Documentation Language

- Working documentation, plans, evidence, and agent rules are written in Russian unless the project explicitly decides otherwise.
- Product names, UI labels, API paths, entity names, model IDs, commands, and code identifiers stay in English.
- Future user-facing English copy must be marked as English UI copy.

## Source of Truth Reading Order

Read project context in this order before major work:

1. `AGENTS.md`
2. `memory/MEMORY.md`
3. `memory/SESSION-HANDOFF.md`
4. `docs/PRODUCT_DIRECTION.md` or equivalent product direction
5. active PRD/FRD/SRD/TRD/QRD documents
6. `develop/README.md`
7. `develop/IMPLEMENTATION_PLAN.md`
8. `develop/TODO.md`
9. `develop/CHECKPOINT.md`
10. active stage/checkpoint plan under `develop/stages/**`
11. `develop/LOCAL_RUNBOOK.md`
12. relevant prior artifacts under `develop/artifacts/**`
13. relevant `research/**` notes

If a listed file is missing, note it and continue with the best available local canon.

## Documentation Style

- Keep stable truth in `docs/`.
- Keep execution plans in `develop/stages/`.
- Keep checkpoint evidence in `develop/artifacts/`.
- Keep volatile work in `work/`.
- Move closed or stale artifacts into `archive/`.
- Record durable decisions in `docs/DECISIONS.md`.
- Research is reference material until a PRD or stage plan explicitly promotes it into requirements.

## Stage And Checkpoint Rules

- Split work into stages with visible outcomes.
- Split stages into narrow checkpoints.
- Every checkpoint must state scope, anti-scope, verification, evidence path, and stop condition.
- Every executable checkpoint prompt should include a `/goal`.
- Do not mix unrelated cleanup, refactor, feature work, and documentation migration in one checkpoint.
- Do not remove compatibility paths unless tests prove they are obsolete or an explicit decision records removal.

## Task Routing

- Product idea or vague request: create the smallest useful PRD or SPEC before implementation.
- Feature/enhancement: create a bounded checkpoint with scope, anti-scope, checks, evidence path, and stop condition.
- Bug: reproduce or describe expected vs actual behavior, add or name a regression barrier, then patch.
- Research link or tool reference: write research first, then extract reusable patterns before changing rules.
- Public content: keep private product, customer, provider, payment, and secret data out.
- Local files are the default task tracker. Do not require GitHub Issues or Projects unless the user explicitly asks for them.

## Agent Workflow

1. Reconstruct context from files, not chat memory.
2. Identify the active goal and touched paths.
3. Create or update the active plan/checkpoint spec for non-trivial work.
4. Make the smallest useful change.
5. Run relevant checks.
6. Use reviewer for scope/correctness/security review when risk is non-trivial.
7. Use test-auditor to identify missing regression checks.
8. Write evidence before considering the task done.
9. Update memory/handoff when project state, assumptions, or next steps change.
10. Promote repeated lessons into rules, templates, hooks, or skills.

## Agent Operating Model

- One main agent owns final edits.
- Subagents are read-only by default.
- Recommended subagents: `explorer`, `reviewer`, `test-auditor`, `docs-researcher`, `browser-debug`.
- A worker can edit only when the checkpoint explicitly grants a narrow disjoint write scope.
- Subagent findings are useful input, not completion evidence.

## Evidence Rules

Each meaningful checkpoint should leave evidence with:

- input or checkpoint prompt;
- scope and anti-scope;
- changed files or behavior;
- verification commands and results;
- reviewer notes;
- missing regression checks;
- not-touched areas;
- next step;
- promoted lessons, if any.

Use status values consistently:

- `DONE`: accepted and verified.
- `DONE_WITH_CONCERNS`: usable, with named gaps.
- `BLOCKED`: stopped by an explicit external blocker.
- `NEEDS_CONTEXT`: user or product decision required before safe execution.

## Tool And External Action Boundaries

- Local file edits inside the repo are allowed when they match the task scope.
- External write actions require explicit approval unless project policy says otherwise.
- Secrets, credentials, payment data, provider payloads, signed URLs, and private customer/project data must not be logged or published.
- Paid provider calls, deploys, releases, merges, remote agent runs, and destructive data actions require explicit boundaries.

## Halt Gates

Stop and record a blocker when:

- required secrets, provider credentials, deploy access, payment access, or cost approval are missing;
- tests/build/browser checks cannot run and no narrower proof is valid;
- implementation would violate PRD, ADR, product invariants, or anti-scope;
- evidence would expose secrets, signed URLs, payment data, raw provider payloads, or private customer/project data;
- a checkpoint requires broad unrelated rewrites to pass.

## Update Protocol

Update project docs when commands, ports, env vars, product scope, stage status, or acceptance gates change.

Update the personal Source of Truth only when a lesson is reusable across projects.

## Done Criteria

- Target task handled within scope.
- Relevant checks pass or blocker is explicit.
- Documentation/runbook updated if stale.
- Evidence written when the task has checkpoint weight.
- Next step is clear.

