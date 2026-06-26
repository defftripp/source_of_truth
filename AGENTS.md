# AGENTS.md

Canonical operating guide for projects that use this source-of-truth pack.

## Goals

- reduce startup entropy
- keep important context outside chat
- make project progress legible to humans and agents
- turn repeated fixes into reusable rules
- keep stable canon separate from volatile working context
- publish reusable AI engineering lessons as blog, playbook, research, and prompts

## Instruction Order

1. User request
2. Project-local `AGENTS.md`
3. Relevant files in `rules/`
4. Relevant files in `playbooks/`
5. Relevant project memory files

## Required Project Artifacts

- `AGENTS.md`
- `content/` for public site material
- `memory/MEMORY.md`
- `memory/SESSION-HANDOFF.md`
- `docs/DECISIONS.md` or equivalent ADR file
- `develop/README.md`
- `develop/IMPLEMENTATION_PLAN.md`
- `develop/LOCAL_RUNBOOK.md`
- `develop/TODO.md` for local task queue
- `develop/CHECKPOINT.md` for the active local checkpoint
- `develop/stages/` for durable stage and checkpoint specs
- `develop/artifacts/` for checkpoint evidence, findings, handoffs, and links to heavy artifacts
- `work/` for volatile working artifacts
- `archive/` for closed artifacts that should not stay in the hot path

## Canonical Project Flow

Every project should follow the same operating spine:

```text
local intake
  -> source-of-truth read
  -> develop/TODO.md item
  -> develop/CHECKPOINT.md active slice
  -> PLAN.md or stage/checkpoint spec
  -> /goal for one bounded checkpoint
  -> read-only exploration/review/test/browser subagents when useful
  -> one main patch owner
  -> tests/lint/build/browser or explicit blocker
  -> evidence artifact
  -> memory/handoff update
  -> promoted rule/playbook/hook only when reusable
```

Use this spine for Codex, Claude, Cursor, or any other agent host. Tool-specific files are thin wrappers around the same canon.

## Task Routing

- Product idea or vague request: write the smallest useful PRD or SPEC before implementation.
- Feature/enhancement: define user-visible outcome, scope, anti-scope, checks, stop condition, and checkpoint evidence path.
- Bug: reproduce or describe expected vs actual behavior, add or name the regression barrier, then patch.
- Research/tool/reference link: start as `content/research/`; extract reusable patterns before changing rules or playbooks.
- Blog/public content: keep private project data out unless it is explicitly framed as a safe case study.
- Local queue is the default. Do not require GitHub Issues or Projects unless the user explicitly asks for them.

## Agent Operating Model

- One main agent owns the final patch.
- Subagents are read-only by default: `explorer`, `reviewer`, `test-auditor`, `docs-researcher`, and `browser-debug`.
- A worker may edit only when the stage explicitly grants a narrow disjoint write scope.
- Subagent findings are inputs, not proof of completion. Completion still requires local evidence.
- For long or risky work, create checkpoint artifacts outside chat so state survives thread loss.

## Halt Gates

Stop and record a blocker instead of improvising when:

- required secrets, provider credentials, payments, deploy access, or cost approval are missing;
- checks cannot be run in the local environment and no narrower proof is valid;
- implementation would violate PRD, ADR, product invariants, or explicit anti-scope;
- evidence would expose secrets, private customer data, signed URLs, payment data, or raw provider payloads;
- the change requires rewriting unrelated areas to make the checkpoint pass.

## Default Working Protocol

1. Read the project goal, `AGENTS.md`, and current memory before doing work.
2. Choose the matching playbook from `playbooks/`.
3. Create or update the active plan/checkpoint spec when the work is non-trivial.
4. Make the smallest useful change that moves the project forward.
5. Run the relevant verification gate or record the explicit blocker.
6. Write evidence for checkpoint-weight work.
7. Update memory when assumptions, decisions, or next steps change.
8. When a bug reveals a pattern, promote that lesson into a rule or checklist.

## Publishing Protocol

1. New links start as research, not rules.
2. Extract reusable patterns before updating playbook pages.
3. Write public blog posts only when there is a clear personal lesson or repeatable method.
4. Keep product-specific context out of this repository unless it is explicitly framed as a case study.
5. Do not publish secrets, private customer/project data, or provider/payment internals.

## Project Start Protocol

1. Clarify scope, constraints, and definition of done.
2. Establish canon files before large implementation starts.
3. Create a first milestone with a narrow, testable outcome.
4. Prepare memory and local task tracking before parallel work begins.

## Maintenance Protocol

1. Reconstruct context from files, not from vague recollection.
2. Prefer backlog items with explicit outcomes and touched areas.
3. Keep handoff notes fresh enough that another agent can continue the work.
4. Archive stale experiments out of the hot path.

## Done Criteria

- code or docs changed for the target task
- verification is recorded
- next steps are clear
- memory is updated if project context changed
- new reusable lessons are promoted into `rules/`, `hooks/`, or `playbooks/`
- public site content is placed under the correct `content/*` section when the task is publishable

