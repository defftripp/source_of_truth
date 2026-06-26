---
title: "Orchestrator checkpoint workflow"
date: 2026-06-26
description: "Как вести большие agent-задачи без потери контекста: orchestrator, checkpoint registry, bounded subagents, durable summaries и terminal interviews."
tags: ["agents", "checkpoints", "subagents", "context-engineering", "workflow"]
---

Большие задачи нельзя вести так же, как маленький bugfix. Если попросить агента "проверить весь интерфейс для всех ролей", он технически может начать, но быстро появляются три проблемы:

- чат становится единственным хранилищем памяти;
- screenshots, traces и notes забивают context window;
- итоговый stage получается похожим на монолит, который сложно проверить и продолжить.

Мой рабочий ответ на это - orchestrator checkpoint workflow.

```text
orchestrator
  -> inventory
  -> checkpoint registry
  -> role x surface x state checkpoints
  -> bounded subagents
  -> durable evidence
  -> synthesis
  -> implementation stage
```

## Главный Принцип

Один основной чат остается orchestrator-ом. Он держит scope, Browser-сессию, registry, итоговый synthesis и handoff.

Subagents используются только для ограниченных частей: один checkpoint, один audit pass, один research slice. Они не получают весь контекст проекта и не становятся источником финальной истины. Их findings - вход для orchestrator-а, а не proof of completion.

## Когда Это Нужно

Этот режим нужен, когда работа распадается на много независимых поверхностей:

- UX audit по ролям и вкладкам;
- проверка permission-heavy экранов;
- большой frontend consistency pass;
- миграция через несколько модулей;
- skeptical product audit;
- комплексный refactor plan;
- stage, где evidence больше самого diff-а.

Если задача маленькая, лучше не усложнять. Обычный checkpoint flow быстрее.

## Единица Работы

Для UI audit хорошая единица:

```text
role x tab x important state
```

Например:

```text
admin x users tab x permission denied state
partner operator x marketplace products x validation error state
support manager x requests tab x slow loading state
```

Такой checkpoint можно реально посмотреть в браузере, приложить evidence, оценить кликабельность, визуальные проблемы, network/console, RBAC и accessibility notes.

## Registry

Перед аудитом нужен checkpoint registry:

```markdown
| ID | Role | Surface | States | Evidence | Reviewers | Status | Follow-up |
| --- | --- | --- | --- | --- | --- | --- | --- |
| CP-01 | admin | users tab | default, empty, permission | screenshots + console/network | UX, QA, Security | PENDING | - |
```

Registry важнее длинного плана в чате. Он показывает, что уже просмотрено, что осталось, где есть blocker и какие checkpoint-ы можно вынести в отдельный substage.

## Durable Summaries

После каждых 2-3 checkpoint-ов надо обновлять durable artifact:

- что просмотрено;
- какие роли и sessions использовались;
- какие screenshots/traces лежат в `output/**` или `work/**`;
- что уже нормально;
- что критично;
- что повторяется между вкладками;
- что требует interview;
- какой следующий batch.

Это защищает работу от потери context window. Новый агент должен продолжить по файлам, а не по памяти чата.

## Subagents

Subagent получает короткий self-contained prompt:

```text
Review CP-03 only.
Read <checkpoint spec> and <evidence links>.
Do not edit files.
Return status, top findings, missing evidence, remediation order and open questions.
```

Правило простое: один subagent - один bounded question. Если нужно дать ему весь проект, значит checkpoint плохо нарезан.

## Terminal Interviews

Если после checkpoint-а остается спорное решение, orchestrator не должен молча выбирать дизайн или архитектуру. Он готовит interview:

```text
Option A - recommended
Option B - compromise
Option C - defer/split/stop
```

У каждого варианта должен быть короткий expert context: Product/domain, UX/UI, Frontend QA, Security/RBAC, если применимо. Это помогает принять решение, а не просто спорить с самим собой.

## Итог

Финальный результат такого workflow - не папка разрозненных screenshots. Итогом должен быть один implementation-ready stage:

- remediation order;
- internal checkpoints;
- statuses;
- verification gates;
- links to evidence;
- follow-up substages, если основной stage стал слишком большим;
- interviews по unresolved risks.

Так agent workflow остается быстрым, но перестает зависеть от удачи и размера context window.

## Sources

- [OpenAI Codex best practices](https://developers.openai.com/codex/learn/best-practices)
- [OpenAI Agents orchestration](https://developers.openai.com/api/docs/guides/agents/orchestration)
- [OpenAI Agents handoffs](https://openai.github.io/openai-agents-python/multi_agent/)
- [Anthropic multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system)
- [Anthropic effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [NN/g cognitive walkthroughs](https://www.nngroup.com/articles/cognitive-walkthroughs/)
- [NN/g usability testing](https://www.nngroup.com/articles/usability-testing-101/)
