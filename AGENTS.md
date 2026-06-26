# AGENTS.md

Канонический operating guide для проектов, которые используют этот source-of-truth pack.

## Цели

- уменьшать startup entropy;
- держать важный контекст вне чата;
- делать progress проекта понятным человеку и агенту;
- превращать повторяемые fixes в reusable rules;
- отделять stable canon от volatile working context;
- публиковать reusable AI engineering lessons как blog, playbook, research и prompts.

## Порядок Инструкций

1. User request.
2. Project-local `AGENTS.md`.
3. Релевантные файлы в `rules/`.
4. Релевантные файлы в `playbooks/`.
5. Релевантные project memory files.

## Обязательные Артефакты Проекта

- `AGENTS.md`
- `content/` для public site material
- `memory/MEMORY.md`
- `memory/SESSION-HANDOFF.md`
- `docs/DECISIONS.md` или эквивалент ADR
- `develop/README.md`
- `develop/IMPLEMENTATION_PLAN.md`
- `develop/LOCAL_RUNBOOK.md`
- `develop/TODO.md` для локальной очереди
- `develop/CHECKPOINT.md` для активного checkpoint
- `develop/stages/` для durable stage/checkpoint specs
- `develop/artifacts/` для evidence, findings, handoffs и ссылок на heavy artifacts
- `work/` для volatile working artifacts
- `archive/` для закрытых artifacts вне hot path

## Канонический Project Flow

Каждый проект идет по одному operating spine:

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

Этот spine одинаковый для Codex, Claude, Cursor и любого другого agent host. Tool-specific файлы - только thin wrappers вокруг того же canon.

## Роутинг Задач

- Product idea или vague request: сначала написать самый маленький useful PRD или SPEC.
- Feature/enhancement: определить user-visible outcome, scope, anti-scope, checks, stop condition и checkpoint evidence path.
- Bug: воспроизвести или описать expected vs actual behavior, добавить или назвать regression barrier, потом patch.
- Research/tool/reference link: сначала `content/research/`, потом extracted patterns, и только после этого rules/playbooks.
- Blog/public content: не переносить private project data, если это явно не safe case study.
- Local queue - default. Не требовать GitHub Issues или Projects, если пользователь явно не попросил.

## Agent Operating Model

- Один main agent владеет итоговым patch.
- Subagents read-only по умолчанию: `explorer`, `reviewer`, `test-auditor`, `docs-researcher`, `browser-debug`.
- `worker` может редактировать только если stage явно выдал narrow disjoint write scope.
- Findings от subagents - входные данные, а не proof of completion. Completion требует local evidence.
- Для длинной или рискованной работы создавать checkpoint artifacts вне чата.

## Halt Gates

Остановиться и записать blocker вместо импровизации, если:

- нужны secrets, provider credentials, payments, deploy access или cost approval;
- checks нельзя запустить локально и нет валидного более узкого proof;
- implementation нарушит PRD, ADR, product invariants или explicit anti-scope;
- evidence раскроет secrets, private customer data, signed URLs, payment data или raw provider payloads;
- change требует переписать unrelated areas, чтобы checkpoint прошел.

## Default Working Protocol

1. Прочитать project goal, `AGENTS.md` и current memory.
2. Выбрать matching playbook из `playbooks/`.
3. Для нетривиальной работы создать или обновить active plan/checkpoint spec.
4. Сделать самый маленький useful change, который двигает проект.
5. Запустить relevant verification gate или записать explicit blocker.
6. Написать evidence для checkpoint-weight work.
7. Обновить memory, если изменились assumptions, decisions или next steps.
8. Если bug выявил pattern, поднять lesson в rule или checklist.

## Publishing Protocol

1. Новые links начинаются как research, не rules.
2. Перед обновлением playbook pages извлечь reusable patterns.
3. Public blog posts писать только когда есть clear personal lesson или repeatable method.
4. Product-specific context не держать в этом repo, если он явно не оформлен как case study.
5. Не публиковать secrets, private customer/project data или provider/payment internals.

## Project Start Protocol

1. Уточнить scope, constraints и definition of done.
2. Создать canon files до большой implementation.
3. Создать первый milestone с narrow, testable outcome.
4. Подготовить memory и local task tracking до parallel work.

## Maintenance Protocol

1. Восстанавливать контекст из файлов, не из vague recollection.
2. Предпочитать backlog items с explicit outcomes и touched areas.
3. Держать handoff notes свежими, чтобы другой агент мог продолжить.
4. Archive stale experiments вне hot path.

## Done Criteria

- code или docs изменены для target task;
- verification записана;
- next steps понятны;
- memory обновлена, если project context изменился;
- новые reusable lessons подняты в `rules/`, `hooks/` или `playbooks/`;
- public site content лежит в правильном `content/*` section, если task publishable.

