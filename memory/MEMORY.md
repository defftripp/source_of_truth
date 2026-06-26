# Project Memory

## Project

- name: Source of Truth
- goal: reusable personal AI engineering playbook, starter kit, research notes, prompts and public site.
- owner: defftripp

## Current State

- The repository has a Hugo public site layer under `content/`, `layouts/`, `static/` and `hugo.toml`.
- The reusable starter kit lives under `templates/project-starter/`.
- Core operating files live in `AGENTS.md`, `playbooks/`, `rules/`, `hooks/`, `memory/`, `agents/` and `docs/DECISIONS.md`.
- As of 2026-06-26, the starter template includes a default `develop/` execution layer inspired by working patterns from `D:\WORK\db` and `D:\WORK\canvas`.
- As of 2026-06-26, the root `README.md` is the GitHub landing page for the operating system, but the default task queue is local-first via `develop/TODO.md` and `develop/CHECKPOINT.md`.

## Active Checkpoint

- stage: local-first workflow presentation
- checkpoint: make the repository understandable from GitHub while keeping daily work local
- status: DONE
- spec: user request from 2026-06-26 to avoid GitHub Issues and keep work local
- evidence: rewritten `README.md`, local queue templates in starter, `npm run check`, `git diff --check`

## Constraints

- Keep stable canon separate from volatile working context.
- New external links start as research before becoming rules.
- Do not publish secrets, private customer/project data, provider internals or payment details.
- Tool-specific wrappers should not create a second source of truth.

## Important Decisions

- 2026-06-16: Source of Truth became a public playbook site plus reusable starter kit.
- 2026-06-26: Starter projects adopt `develop/` stage/checkpoint execution by default.

## Open Questions

- Should future automation add hard hook enforcement for local checkpoint checklist completion, or keep the current pack text-first?

## Next Steps

- Review whether hook scripts should be added after the textual flow stabilizes.
- Keep GitHub Issues/Projects out of the default flow unless explicitly requested.

## Useful Commands

```powershell
npm run check
scripts\bootstrap_project.ps1 -TargetPath <path>
```
