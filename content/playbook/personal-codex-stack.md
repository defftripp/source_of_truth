---
title: "Personal Codex stack"
date: 2026-06-26
description: "Как держать Codex быстрым, точным и похожим на мой стиль: короткие глобальные правила, live skill registry, выборочные MCP и никакого оверкода."
tags: ["codex", "skills", "mcp", "workflow", "agents"]
---

Цель personal Codex stack - не поставить все модные tools. Цель - сделать так,
чтобы агент быстро входил в мой стиль работы, не тащил мусорный контекст и
использовал внешние возможности только там, где они реально сокращают путь до
проверенного результата.

## Главный принцип

```text
Global rules = короткий стиль и границы.
Skill registry = актуальная карта процедур.
SKILL.md = подробный workflow по требованию.
MCP = внешний инструмент, а не постоянный контекст.
Project AGENTS.md = правда конкретного проекта.
```

Если эти слои смешать, Codex начинает плохо ориентироваться:

- огромный `AGENTS.md` устаревает;
- удаленные skills остаются в ручной карте;
- личный стиль тонет в каталоге команд;
- MCP подключаются "потому что модно";
- агент начинает оверкодить вместо прямого решения.

## Правильная структура

### 1. `AGENTS.override.md`

Это самый компактный слой личного стиля.

Там должны жить:

- русский язык по умолчанию;
- прямой, плотный тон;
- запрет на корпоративную воду;
- KISS и no overcoding;
- "сначала самый прямой полезный фикс";
- safety rules: не тереть чужую работу, не светить секреты;
- несколько evergreen routing rules.

Там не должно быть:

- полного списка skills;
- длинных описаний MCP;
- проектных деталей;
- временных выводов из одного репозитория.

### 2. Глобальный `AGENTS.md`

Это общий operating guide, но тоже короткий.

Хороший `AGENTS.md` говорит:

- как читать project rules;
- когда использовать skills;
- как вести план и evidence;
- какие skill families предпочитать;
- какие actions требуют approval.

Плохой `AGENTS.md` превращается в ручной `Installed Skill Map`.

Ручной skill map - антипаттерн. Codex уже видит live skill registry при старте.
Если продублировать его в `AGENTS.md`, файл быстро станет ложной картой.

Минимальный routing block лучше:

```markdown
## Skill Routing Preferences

- Use Lazyweb before product UI work.
- Use Context7 when current library/framework docs matter.
- Use project-specific skills before generic skills.
- Use browser/playwright tools for UI verification.
- Use security skills only for explicit security work.
- Read the selected SKILL.md before acting.
- Keep global instructions lean.
```

### 3. `skills/`

Skills - это место для подробных процедур.

Skill нужен, когда есть повторяемая операция:

- UI/design research;
- PDF work;
- project audit;
- frontend review;
- import/export audit;
- security threat model;
- deck generation;
- reusable artifact workflow.

Skill не нужен, если это просто одна фраза правила. Тогда это rule, not skill.

## Skill hygiene

Периодически нужно чистить skill discovery.

Удалять или отключать стоит:

- deprecated shims;
- эстетические варианты, которые редко вызываются явно;
- demo skills без реального workflow;
- Orbit/digest skills, если digest не настроен;
- медиа/generation skills без credentials и повторяемой задачи;
- дубликаты одного и того же workflow.

Оставлять стоит:

- project-specific skills;
- skills, которые закрывают реальную recurring job;
- skills с проверяемым output contract;
- skills, которые лучше, чем один prompt;
- skills, которые хранят сложные инструкции вне глобального контекста.

Удаление папки skill нормально, если:

- skill не системный;
- есть manifest удаленных папок;
- его можно переустановить;
- глобальные правила не ссылаются на него вручную.

## MCP policy

MCP - это capability boundary. Он добавляет силу, но также добавляет риск,
шум, latency и иногда секреты.

Базовое правило:

```text
Добавлять MCP только если он меняет повторяемый workflow.
Не добавлять MCP просто потому, что он популярен.
```

## Минимальный must-have stack

### Lazyweb

Для product UI work.

Использовать перед:

- product screens;
- onboarding;
- paywalls;
- pricing;
- checkout;
- dashboards;
- settings;
- landing pages.

Зачем: меньше generic UI, больше реальных паттернов и evidence.

### Context7

Для актуальных docs по библиотекам, SDK, frameworks и cloud APIs.

Зачем: меньше устаревшей памяти модели и меньше выдуманных API.

### Browser / Playwright / Chrome tooling

Для UI verification, screenshots, real browser flows.

Не обязательно ставить отдельный Playwright MCP, если текущий host уже дает
browser tooling и Playwright skills.

### GitHub MCP

Опционально.

Включать, если Codex реально должен читать или вести issues, PR, actions и repo
metadata из чата.

По умолчанию лучше начать read-only или с ограниченным toolset. Write actions
требуют явного approval.

### Serena или semantic repo search

Опционально для больших repos.

Подключать только после trial на реальном проекте. Для маленьких репозиториев
`rg`, project docs и нормальные plans часто быстрее и надежнее.

## Что не ставить по умолчанию

- Sequential thinking MCP: чаще process theater, чем реальная польза.
- Несколько memory MCP одновременно.
- Random servers из awesome lists.
- Database/payment/deploy MCP без project boundary.
- Web scraping MCP без регулярной research-задачи.
- Write-capable external tools без approval policy.

## Tool adoption checklist

Перед добавлением нового MCP, skill или plugin агент должен ответить:

1. Что это реально меняет в workflow?
2. Какой риск добавляет?
3. Где boundary: personal tooling, project tooling или product runtime?
4. Как проверить, что стало лучше?
5. Как откатить, если стало хуже?

Если ответов нет, это research note, а не новая настройка.

## Секреты

Секреты не должны жить в `config.toml`, `AGENTS.md`, reports или git.

Лучше:

- env var;
- локальный token file под home directory;
- credential store;
- scoped token с минимальными правами.

Пример нормального паттерна:

```text
config.toml -> command reads token from env or local file
token file -> outside repo
report/chat -> no raw token
```

## Практический cleanup loop

Когда Codex начинает ощущаться как свалка:

1. Посчитать размеры и hot spots.
2. Разделить runtime/cache от реальной настройки.
3. Найти раздутые global instructions.
4. Убрать ручные skill maps.
5. Оставить короткий routing preference.
6. Проверить live skill registry после restart.
7. Удалить или отключить noise skills.
8. Проверить MCP allow-list.
9. Вынести secrets из config.
10. Записать решение в Source of Truth.

## Пример хорошего результата

```text
AGENTS.override.md
  -> личный стиль, anti-overcoding, safety, Lazyweb router

AGENTS.md
  -> compact global workflow + routing preferences

skills/
  -> только полезные recurring workflows

config.toml
  -> маленький MCP/plugin config без raw secrets

MCP
  -> Lazyweb, Context7, internal browser/runtime tools, optional GitHub/Serena
```

Это делает Codex более предсказуемым:

- он быстрее понимает стиль;
- меньше тонет в контексте;
- меньше выдумывает docs;
- меньше оверкодит;
- легче откатывать tools;
- проще переносить setup между машинами.

## Decision rule

Если новая настройка не делает один из пунктов ниже, она не нужна:

- ускоряет повторяемый workflow;
- снижает hallucination risk;
- улучшает verification;
- уменьшает ручной контекст;
- делает rollback проще;
- защищает secret/trust boundary.

Все остальное - хайповый шум.
