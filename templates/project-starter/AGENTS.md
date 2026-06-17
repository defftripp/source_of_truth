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
2. `docs/PRODUCT_DIRECTION.md` or equivalent product direction
3. active PRD/FRD/SRD/TRD/QRD documents
4. active stage/checkpoint plan
5. `develop/LOCAL_RUNBOOK.md` or local setup/runbook
6. relevant `research/**` notes
7. `memory/MEMORY.md` and `memory/SESSION-HANDOFF.md`, if present

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
- Do not mix unrelated cleanup, refactor, feature work, and documentation migration in one checkpoint.
- Do not remove compatibility paths unless tests prove they are obsolete or an explicit decision records removal.

## Agent Workflow

1. Reconstruct context from files, not chat memory.
2. Identify the active goal and touched paths.
3. Make the smallest useful change.
4. Run relevant checks.
5. Use reviewer for scope/correctness/security review when risk is non-trivial.
6. Use test-auditor to identify missing regression checks.
7. Write evidence before considering the task done.
8. Promote repeated lessons into rules, templates, hooks, or skills.

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

## Tool And External Action Boundaries

- Local file edits inside the repo are allowed when they match the task scope.
- External write actions require explicit approval unless project policy says otherwise.
- Secrets, credentials, payment data, provider payloads, signed URLs, and private customer/project data must not be logged or published.
- Paid provider calls, deploys, releases, merges, remote agent runs, and destructive data actions require explicit boundaries.

## Update Protocol

Update project docs when commands, ports, env vars, product scope, stage status, or acceptance gates change.

Update the personal Source of Truth only when a lesson is reusable across projects.

## Done Criteria

- Target task handled within scope.
- Relevant checks pass or blocker is explicit.
- Documentation/runbook updated if stale.
- Evidence written when the task has checkpoint weight.
- Next step is clear.

