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
- `work/` for volatile working artifacts
- `archive/` for closed artifacts that should not stay in the hot path

## Default Working Protocol

1. Read the project goal, `AGENTS.md`, and current memory before doing work.
2. Choose the matching playbook from `playbooks/`.
3. Make the smallest useful change that moves the project forward.
4. Update memory when assumptions, decisions, or next steps change.
5. When a bug reveals a pattern, promote that lesson into a rule or checklist.

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
4. Prepare memory and issue tracking before parallel work begins.

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

