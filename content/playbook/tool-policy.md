---
title: "Tool and MCP policy"
date: 2026-06-16
description: "Как подключать новые tools, MCP servers, cloud agents и external actions без расширения хаоса."
tags: ["tools", "mcp", "security", "external-actions"]
---

Инструменты усиливают агента, но каждый tool расширяет trust boundary. Поэтому новая интеграция сначала проходит policy check.

## Классы инструментов

| Класс | Примеры | Default |
| --- | --- | --- |
| Read-only local | search, grep, test runner | Разрешено в scope задачи |
| Write local | file edits, formatters, codegen | Разрешено в workspace scope |
| Read-only external | docs search, GitHub read, package metadata | Разрешено при необходимости |
| Write external | GitHub issue/PR write, deploy, payment/provider action | Требует explicit approval |
| Paid operation | model call, provider generation, cloud browser, hosted agent | Требует budget/policy gate |
| Secrets access | env, credentials, payment payloads | Минимальный доступ, не публиковать |

## MCP catalog

MCP servers не должны включаться пачкой.

Для каждого server нужна карточка:

```markdown
## [tool name]

Purpose:
Access:
Secrets:
Read/write:
Cost:
Risks:
Allowed tasks:
Forbidden tasks:
Fallback:
```

## External actions boundary

По умолчанию внешние действия read-only.

Нельзя без явного approval:

- `git push`;
- merge/release/deploy;
- создание или изменение GitHub issues/PRs;
- payment operations;
- paid provider jobs;
- изменение secrets;
- remote agent dispatch;
- write-capable MCP actions;
- удаление remote данных.

## Paid tool gate

Перед paid operation агент должен знать:

- кто платит;
- есть ли test mode;
- есть ли budget;
- можно ли retry;
- как будет записан usage/evidence;
- как остановить операцию.

## New tool adoption

Новая фича или tool проходит 5 вопросов:

1. Что это реально меняет в workflow?
2. Какой риск добавляет?
3. Где boundary: personal tooling, project tooling или product runtime?
4. Как проверить, что стало лучше?
5. Как откатить, если стало хуже?

Если ответа нет - tool остается research note.

## Запреты

- Не хранить real secrets в repository.
- Не публиковать provider payloads, payment payloads, signed URLs.
- Не делать write external action из research-задачи.
- Не подключать MCP server только потому, что он популярен.
- Не смешивать personal tooling и product runtime без design decision.

