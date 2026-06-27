# Project Starter

Этот template копируется в новый или недоструктурированный проект.

## Что Входит

- `AGENTS.md`
- `CLAUDE.md`
- `.cursor/rules/project-canon.mdc`
- `.claude/rules/project-checklist.md`
- `memory/`
- `docs/DECISIONS.md`
- `docs/PRODUCT_DIRECTION.md`
- `docs/ARCHITECTURE.md`
- `docs/SKILLS.md`
- `rules/`
- `hooks/`
- `agents/README.md`
- `develop/README.md`
- `develop/IMPLEMENTATION_PLAN.md`
- `develop/LOCAL_RUNBOOK.md`
- `develop/TODO.md`
- `develop/CHECKPOINT.md`
- `develop/stages/`
- `develop/artifacts/`
- `develop/decisions/`
- `work/`
- `archive/`

## Первый Setup

1. Заполнить `memory/MEMORY.md`.
2. Заполнить `docs/PRODUCT_DIRECTION.md` и `docs/ARCHITECTURE.md`.
3. Заполнить `docs/SKILLS.md`, включая sources/provenance для внешних skills/MCP/plugins, `memory/QUESTIONS.md` и `memory/LESSONS.md`.
4. Заполнить `develop/IMPLEMENTATION_PLAN.md`: первый milestone и active checkpoint.
5. Заполнить `develop/TODO.md` и `develop/CHECKPOINT.md`.
6. Добавить первый checkpoint spec под `develop/stages/`.
7. Запускать работу через `/goal`, используя шаблон в `develop/README.md`.
8. Писать checkpoint evidence под `develop/artifacts/`.

## Правило

GitHub Issues не нужны для default workflow. Локальная очередь живет в `develop/TODO.md`, активный срез - в `develop/CHECKPOINT.md`.

Implementation не начинается, пока `hooks/pre-implementation-check.md` не проходит или blocker не записан явно.
