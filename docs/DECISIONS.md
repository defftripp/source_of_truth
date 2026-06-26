# Decisions

## 2026-06-16 - Source of Truth becomes a public playbook site

Decision:

- Keep the existing starter kit (`agents/`, `playbooks/`, `rules/`, `hooks/`, `memory/`, `templates/`) as the reusable project setup layer.
- Add a Hugo-based public site layer under `content/`, `layouts/`, `static/`, and `hugo.toml`.
- Move general AI engineering research out of product repositories and into this repository.

Rationale:

- Product repositories should hold product truth.
- Cross-project agent workflow, research notes, prompts, and operating principles belong in one personal Source of Truth.
- New links should become research notes first, then playbook changes only when they produce reusable patterns.

Immediate migration:

- ECC research was moved from the AI Canvas research tree into `content/research/ecc.md`.
- The first public manifesto was added at `content/blog/source-of-truth-manifest.md`.
- Initial playbook pages were added for documentation pipeline and agent workflow.

Status: accepted.

## 2026-06-26 - Starter projects adopt a checkpoint operating flow

Decision:

- Make `develop/` a required part of the reusable project skeleton.
- Treat `develop/IMPLEMENTATION_PLAN.md`, `develop/LOCAL_RUNBOOK.md`, `develop/stages/**`, and `develop/artifacts/**` as the standard execution layer for all projects.
- Keep `AGENTS.md` as the project-local canon and keep tool-specific files as thin wrappers.
- Use one main patch owner; subagents are read-only unless a checkpoint grants a narrow disjoint write scope.
- Require scope, anti-scope, verification, evidence path and stop condition for checkpoint-weight work.

Rationale:

- The `db` and `canvas` projects already show that stage plans plus durable evidence make long agent runs resumable.
- External references such as ferrumctl, AgentFlow, ECC and Personal Corp converge on the same pattern: explicit goals, durable state, orchestration boundaries, verification gates and reusable skills.
- New projects should inherit the workflow by default instead of rediscovering it after the first messy run.

Status: accepted.

## 2026-06-26 - Task tracking stays local-first

Decision:

- Do not make GitHub Issues, GitHub Projects, or PR templates part of the default workflow.
- Use `develop/TODO.md` as the local backlog and `develop/CHECKPOINT.md` as the active task surface.
- Keep GitHub as the readable repository front door through `README.md`, not as the required task manager.
- Allow GitHub Issues only when explicitly needed for public collaboration.

Rationale:

- The preferred work style is local, file-based and low-friction.
- The workflow already depends on durable local files: `AGENTS.md`, `memory/**`, `develop/**`, artifacts and decisions.
- Adding GitHub Issues by default creates process overhead without improving solo/local execution.

Status: accepted.
