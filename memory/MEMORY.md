# Project Memory

## Project

- name: Source of Truth
- goal: личный AI engineering playbook, starter kit, Codex onboarding pack, research notes, prompts и публичный сайт.
- owner: defftripp

## Current State

- В репозитории есть Hugo public site layer под `content/`, `layouts/`, `static/` и `hugo.toml`.
- Reusable starter kit живет под `templates/project-starter/`.
- Core operating files живут в `AGENTS.md`, `playbooks/`, `rules/`, `hooks/`, `memory/`, `agents/` и `docs/DECISIONS.md`.
- С 2026-06-26 starter template включает default `develop/` execution layer, вдохновленный рабочими patterns из `D:\WORK\db` и `D:\WORK\canvas`.
- С 2026-06-26 root `README.md` является GitHub landing page для operating system, но default task queue остается local-first через `develop/TODO.md` и `develop/CHECKPOINT.md`.
- С 2026-06-26 канон, starter, playbooks, memory templates и workflow-документы пишутся на русском. Английскими остаются команды, пути, status values и code/tool identifiers.
- С 2026-06-26 внешний capability layer живет в `registries/`: required/recommended skills, MCP, plugins и безопасный global Codex contour проверяются через read-only audit.
- С 2026-06-26 repo-owned onboarding skill живет в `skills/source-of-truth-onboarding/`; scripts `install_codex_skill.ps1` и `audit_project_readiness.ps1` являются deterministic hands.
- С 2026-06-26 `source-of-truth-onboarding` установлен в `C:\Users\deff3\.codex\skills\source-of-truth-onboarding`.
- С 2026-06-26 сам repo получил root `docs/PRODUCT_DIRECTION.md`, `docs/ARCHITECTURE.md`, `docs/SKILLS.md`, `develop/`, `memory/QUESTIONS.md` и `memory/LESSONS.md`.

## Active Checkpoint

- stage: source-of-truth onboarding automation
- checkpoint: implement repo skill, safe install script, readiness audit and expanded starter template
- status: DONE_WITH_CONCERNS
- spec: `docs/superpowers/specs/2026-06-26-source-of-truth-onboarding-skill-design.md`
- evidence: `develop/artifacts/onboarding/source-of-truth-onboarding.md`

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
- 2026-06-26: Не дублировать полный installed skill catalog в глобальном `AGENTS.md`; must-have слой фиксировать в `registries/capabilities.json`.
- 2026-06-26: Запись в `~/.codex` разрешать только после явной фразы `разрешаю обновить глобалку Codex`, с backup и evidence.
- 2026-06-26: `source-of-truth-onboarding` source skill является active repo capability; installed global copy поставлена после явного approval phrase.

## Open Questions

- Нужно ли позже добавить hard hook enforcement для checkpoint checklist completion, или пока оставить pack text-first?
- Нужно ли позже добавить hard hook enforcement для checkpoint checklist completion, или пока оставить pack text-first?

## Next Steps

- Forward-test `source-of-truth-onboarding` в fresh session или subagent-capable environment.
- Держать GitHub Issues/Projects вне default flow, если пользователь явно не попросил.

## Useful Commands

```powershell
npm run check
npm run audit:capabilities
npm run audit:readiness
scripts\bootstrap_project.ps1 -TargetPath <path>
```
