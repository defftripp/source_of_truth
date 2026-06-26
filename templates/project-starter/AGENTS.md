# AGENTS.md

Локальный operating canon проекта.

Этот файл определяет, как в проекте ведется работа: язык документации, порядок чтения контекста, checkpoint execution, review gates, evidence и границы инструментов. Tool-specific файлы вроде `.cursor/rules`, `.claude/rules` или Codex skills могут адаптировать эти правила, но не должны создавать второй source of truth.

## Язык Документации

- Рабочая документация, планы, evidence и agent rules пишутся на русском, если проект явно не решил иначе.
- Product names, UI labels, API paths, entity names, model IDs, commands и code identifiers остаются на английском.
- Future user-facing English copy нужно явно помечать как English UI copy.

## Порядок Чтения Source Of Truth

Перед крупной работой читать проектный контекст в таком порядке:

1. `AGENTS.md`
2. `memory/MEMORY.md`
3. `memory/SESSION-HANDOFF.md`
4. `docs/PRODUCT_DIRECTION.md` или аналог product direction
5. `docs/ARCHITECTURE.md`
6. `docs/SKILLS.md`
7. активные PRD/FRD/SRD/TRD/QRD документы
8. relevant `rules/**`
9. relevant `hooks/**`
10. `agents/README.md`
11. `develop/README.md`
12. `develop/IMPLEMENTATION_PLAN.md`
13. `develop/TODO.md`
14. `develop/CHECKPOINT.md`
15. active stage/checkpoint plan под `develop/stages/**`
16. `develop/LOCAL_RUNBOOK.md`
17. relevant prior artifacts под `develop/artifacts/**`
18. relevant `research/**` notes

Если файл из списка отсутствует, отметить это и продолжить по лучшему доступному local canon.

## Стиль Документации

- Stable truth держать в `docs/`.
- Execution plans держать в `develop/stages/`.
- Checkpoint evidence держать в `develop/artifacts/`.
- Skills/capability routing держать в `docs/SKILLS.md`.
- Open questions держать в `memory/QUESTIONS.md`.
- Reusable lessons держать в `memory/LESSONS.md`.
- Volatile work держать в `work/`.
- Closed or stale artifacts переносить в `archive/`.
- Durable decisions записывать в `docs/DECISIONS.md`.
- Research остается reference material, пока PRD или stage plan явно не поднимет его в requirements.

## Правила Stages И Checkpoints

- Делить работу на stages с видимыми outcomes.
- Делить stages на узкие checkpoints.
- Каждый checkpoint должен назвать scope, anti-scope, verification, evidence path и stop condition.
- Каждый executable checkpoint prompt должен включать `/goal`.
- Не смешивать unrelated cleanup, refactor, feature work и documentation migration в одном checkpoint.
- Не удалять compatibility paths, пока tests не докажут, что они obsolete, или explicit decision не зафиксирует removal.

## Роутинг Задач

- Product idea или vague request: сначала создать самый маленький useful PRD или SPEC.
- Feature/enhancement: создать bounded checkpoint со scope, anti-scope, checks, evidence path и stop condition.
- Bug: воспроизвести или описать expected vs actual behavior, добавить или назвать regression barrier, потом patch.
- Research link или tool reference: сначала research, потом reusable patterns, потом изменение rules.
- Public content: не выносить наружу private product, customer, provider, payment и secret data.
- Local files - default task tracker. Не требовать GitHub Issues или Projects, если пользователь явно не попросил.

## Agent Workflow

1. Восстановить контекст из файлов, не из chat memory.
2. Определить active goal и touched paths.
3. Создать или обновить active plan/checkpoint spec для нетривиальной работы.
4. Пройти `hooks/pre-implementation-check.md`.
5. Сделать smallest useful change.
6. Запустить relevant checks.
7. Использовать `reviewer` для scope/correctness/security review, если риск нетривиальный.
8. Использовать `test-auditor`, чтобы найти missing regression checks.
9. Написать evidence до того, как считать задачу done.
10. Обновить memory/handoff, если изменились project state, assumptions или next steps.
11. Поднять повторяющиеся lessons в rules, templates, hooks или skills.

## Agent Operating Model

- Один main agent владеет итоговыми правками.
- Subagents read-only по умолчанию.
- Рекомендуемые subagents: `explorer`, `reviewer`, `test-auditor`, `docs-researcher`, `browser-debug`.
- `worker` может редактировать только если checkpoint явно дал narrow disjoint write scope.
- Subagent findings - полезный input, но не completion evidence.

## Evidence Rules

Каждый значимый checkpoint должен оставить evidence:

- input или checkpoint prompt;
- scope и anti-scope;
- changed files или behavior;
- verification commands и results;
- reviewer notes;
- missing regression checks;
- not-touched areas;
- next step;
- promoted lessons, если есть.

Status values использовать последовательно:

- `DONE`: принято и проверено.
- `DONE_WITH_CONCERNS`: usable, но есть named gaps.
- `BLOCKED`: остановлено explicit external blocker.
- `NEEDS_CONTEXT`: нужен user/product decision перед безопасным execution.

## Границы Tools И External Actions

- Local file edits внутри repo разрешены, если они соответствуют scope задачи.
- External write actions требуют explicit approval, если project policy не говорит иначе.
- Secrets, credentials, payment data, provider payloads, signed URLs и private customer/project data нельзя логировать или публиковать.
- Paid provider calls, deploys, releases, merges, remote agent runs и destructive data actions требуют explicit boundaries.

## Halt Gates

Остановиться и записать blocker, если:

- не хватает required secrets, provider credentials, deploy access, payment access или cost approval;
- tests/build/browser checks нельзя запустить и нет валидного более узкого proof;
- implementation нарушит PRD, ADR, product invariants или anti-scope;
- evidence раскроет secrets, signed URLs, payment data, raw provider payloads или private customer/project data;
- checkpoint требует broad unrelated rewrites, чтобы пройти.

## Update Protocol

Обновлять project docs, когда меняются commands, ports, env vars, product scope, stage status или acceptance gates.

Обновлять personal Source of Truth только когда lesson переиспользуем между проектами.

## Done Criteria

- Target task закрыта в scope.
- Relevant checks pass или blocker explicit.
- Documentation/runbook обновлены, если устарели.
- Evidence написано, если задача checkpoint-weight.
- Next step понятен.
