# Project Memory

## Project

- name: Source of Truth
- goal: личный AI engineering playbook, starter kit, research notes, prompts и публичный сайт.
- owner: defftripp

## Current State

- В репозитории есть Hugo public site layer под `content/`, `layouts/`, `static/` и `hugo.toml`.
- Reusable starter kit живет под `templates/project-starter/`.
- Core operating files живут в `AGENTS.md`, `playbooks/`, `rules/`, `hooks/`, `memory/`, `agents/` и `docs/DECISIONS.md`.
- С 2026-06-26 starter template включает default `develop/` execution layer, вдохновленный рабочими patterns из `D:\WORK\db` и `D:\WORK\canvas`.
- С 2026-06-26 root `README.md` является GitHub landing page для operating system, но default task queue остается local-first через `develop/TODO.md` и `develop/CHECKPOINT.md`.
- С 2026-06-26 канон, starter, playbooks, memory templates и workflow-документы пишутся на русском. Английскими остаются команды, пути, status values и code/tool identifiers.

## Active Checkpoint

- stage: русификация local-first workflow presentation
- checkpoint: сделать репозиторий понятным с GitHub и из starter-шаблона на русском языке
- status: DONE
- spec: user request from 2026-06-26: "я же русский зачем ты все на английском то написал"
- evidence: rewritten `README.md`, `AGENTS.md`, `playbooks/**`, `rules/agent-workflow.mdc`, `templates/project-starter/**`, `memory/**`, `docs/DECISIONS.md`; `npm run check`, `git diff --check`, bootstrap smoke

## Constraints

- Stable canon держать отдельно от volatile working context.
- Новые external links сначала становятся research, а не rules.
- Не публиковать secrets, private customer/project data, provider internals или payment details.
- Tool-specific wrappers не должны создавать второй source of truth.
- Default workflow не зависит от GitHub Issues/Projects.

## Important Decisions

- 2026-06-16: Source of Truth стал публичным playbook-сайтом плюс reusable starter kit.
- 2026-06-26: Starter projects используют `develop/` stage/checkpoint execution по умолчанию.
- 2026-06-26: Task tracking остается local-first через `develop/TODO.md` и `develop/CHECKPOINT.md`.
- 2026-06-26: Рабочий язык канона и starter-шаблона - русский.

## Open Questions

- Нужно ли позже добавить hard hook enforcement для checkpoint checklist completion, или пока оставить pack text-first?

## Next Steps

- После стабилизации textual flow решить, нужны ли hook scripts.
- Держать GitHub Issues/Projects вне default flow, если пользователь явно не попросил.

## Useful Commands

```powershell
npm run check
scripts\bootstrap_project.ps1 -TargetPath <path>
```
