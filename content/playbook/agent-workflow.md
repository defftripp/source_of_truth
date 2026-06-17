---
title: "Vibe coding workflow"
date: 2026-06-16
description: "Мой подход к вайбкодингу: от идеи или ссылки до PRD, project overlay, rules, skills, MCP, agents, stage plan и реализации."
tags: ["vibe-coding", "agents", "req-docs", "mcp", "skills", "workflow"]
---

Вайбкодинг для меня - это не "накидал промпт, получил код, помолился". Такой подход быстро упирается в хаос: агент что-то понял по-своему, документация живет в чате, правила размазаны по инструментам, новая хайповая ссылка превращается в случайную переделку продукта.

Я хочу другой формат.

Идеальный сценарий выглядит так: я скидываю агенту идею, статью, репозиторий, видео, тред или набор ссылок. Агент не бросается сразу писать код. Сначала он понимает, что это за материал, какую структуру проекта нужно поднять, какие rules нужны, какие skills применимы, какие MCP/tools можно подключить, каких subagents стоит вызвать, какой документ нужен первым, и только после этого начинает превращать идею в PRD, stage plan, checkpoints и реализацию.

То есть вайб остается. Скорость остается. Но появляется операционная система.

```text
idea / link / repo / article
  -> intake
  -> research note
  -> pattern extraction
  -> core playbook check
  -> project overlay
  -> req-docs
  -> PRD / FRD / TRD / QRD
  -> stage plan
  -> checkpoint prompts
  -> implementation
  -> review
  -> evidence
  -> promoted rule / skill / hook
```

Это и есть мой Personal AI Engineering Playbook.

## Главная мысль

Мне не нужен один огромный `AGENTS.md` на все случаи жизни. Он быстро станет мусорным контейнером: туда попадут правила Canvas, платежей, frontend, research, deployment, prompts, личные привычки, временные решения и выводы из чужих репозиториев.

Нужна двухслойная система.

**Core Playbook** описывает мой общий способ думать и работать:

- как я превращаю идею в требования;
- как изучаю чужие продукты и репозитории;
- как решаю, какой документ нужен;
- как работаю с агентами;
- как подключаю tools, MCP и skills;
- как режу работу на stages/checkpoints;
- как проверяю результат;
- как фиксирую evidence;
- как обновляю свои правила после новых AI features.

**Project Overlay** описывает правду конкретного продукта:

- что мы строим;
- кто пользователь;
- какие продуктовые инварианты нельзя ломать;
- какие команды запускают проект;
- какие env vars нужны;
- какие provider/payment/security boundaries есть;
- какие stage plans активны;
- какие acceptance gates доказывают готовность.

Коротко:

```text
Core Playbook = как я работаю.
Project Overlay = что правда в этом проекте.
```

Если эти слои смешать, агент будет путать личный процесс с требованиями продукта. Если разделить, можно переносить workflow из проекта в проект без копирования продуктового мусора.

## Как выглядит Core Playbook

Я бы держал его не как один документ, а как набор коротких страниц.

```text
ai-engineering-playbook/
  00-principles.md
  01-documentation-system.md
  02-vibe-coding-workflow.md
  03-research-intake.md
  04-checkpoint-execution.md
  05-review-and-regression.md
  06-evidence-artifacts.md
  07-tool-mcp-and-skill-policy.md
  08-security-and-secrets.md
  09-adopting-new-ai-features.md
  templates/
    idea-intake-template.md
    research-report-template.md
    req-docs-routing-template.md
    prd-to-stage-template.md
    checkpoint-prompt-template.md
    evidence-template.md
    project-bootstrap-checklist.md
  CHANGELOG.md
```

Это не должно быть академической документацией. Это должна быть рабочая папка, которую агент понимает как boot sequence.

Когда начинается новый проект, агент должен уметь сказать:

```text
Я вижу идею.
Сначала нужен lightweight PRD.
Потом нужно создать project overlay.
Для research нужен service-analysis report.
Для реализации нужен stage plan.
Для качества нужны reviewer и test-auditor gates.
MCP пока не подключаем, потому что нет доказанного workflow.
```

Или наоборот:

```text
Это не идея продукта, а новый AI tool.
Пишу research note.
Не обновляю project requirements.
Проверяю, меняет ли он мой playbook.
Если да - предлагаю rule/skill/hook update.
```

## Что лежит в Project Overlay

В каждом реальном проекте нужен свой слой.

```text
repo/
  AGENTS.md
  .cursor/
    rules/
  .claude/
    rules/
  docs/
    PRODUCT_DIRECTION.md
    PRD_MVP.md
    MODEL_CATALOG.md
    TECHNICAL_PLAN.md
    DECISIONS.md
  develop/
    LOCAL_RUNBOOK.md
    stages/
    artifacts/
  research/
    service-analysis/
  .agents/
    skills/
  scripts/
  tests/
```

Здесь живет не философия, а конкретика:

- как оформляется документация;
- как называются планы, stages, checkpoints и evidence;
- какие файлы читать первыми;
- какие команды запускать;
- где backend, frontend, worker;
- какие порты заняты;
- какие тесты обязательны;
- что считается production data;
- где нельзя делать paid provider calls;
- какие compatibility paths нельзя удалять;
- какие artifacts доказывают checkpoint.

Core Playbook может сказать: "для paid flows нужен security/scope reviewer". Project Overlay должен сказать: "в этом проекте paid provider calls запрещены без beta grant, wallet balance или test mode".

## AGENTS.md как почерк проекта

Важная поправка: `AGENTS.md` - это не просто файл с "не удаляй `.env`" и "запусти тесты". В моем подходе это главный project-local operating canon. Он делает каждый проект похожим на мой проект, даже если стек, домен и интерфейс разные.

Именно здесь фиксируется индивидуальный стиль ведения работы:

- язык рабочей документации;
- порядок чтения source-of-truth docs;
- как оформлять PRD, stage plans, checkpoints, evidence и decision log;
- где лежит volatile work, а где durable artifacts;
- какие действия требуют review;
- какие команды считаются актуальными;
- какие project invariants нельзя нарушать;
- как агент должен завершать задачу;
- когда обновлять docs, runbook, memory и playbook.

То есть `AGENTS.md` отвечает не только на вопрос "как писать код?". Он отвечает на вопрос "как в этом проекте вообще ведется работа?".

Я хочу, чтобы в каждом моем проекте читался один и тот же почерк:

```text
сначала canon
  -> потом docs
  -> потом stage plan
  -> потом checkpoint
  -> потом implementation
  -> потом checks
  -> потом reviewer / test-auditor
  -> потом evidence
  -> потом promoted lesson
```

Поэтому project `AGENTS.md` должен быть довольно структурным. Примерные секции:

```text
# Project Agent Rules

## Documentation Language
## Source of Truth Reading Order
## Product Direction
## Product Invariants
## Documentation Style
## Stage And Checkpoint Rules
## Evidence Rules
## Quality Gates
## Tool And External Action Boundaries
## Update Protocol
## Done Criteria
```

А `.cursor/rules`, `.claude/rules`, Codex skills и другие tool-specific файлы должны быть thin wrappers вокруг этого canon. Они могут адаптировать формат под конкретный инструмент, но не должны создавать вторую правду.

Если `AGENTS.md` говорит одно, `.cursor/rules` второе, а README третье - агент начинает выбирать удобную ему реальность. Мне нужен обратный эффект: любой агент, в любом инструменте, попадает в один и тот же стиль проекта.

## Intake: что делает агент, когда я кидаю ссылку

Самое важное место во всем workflow - первый разбор входа.

Я хочу, чтобы агент не спрашивал меня каждый раз "а что с этим делать?", если это можно вывести из playbook. Он должен классифицировать вход.

| Вход | Что делает агент | Что не делает |
| --- | --- | --- |
| Идея продукта | Запускает req-docs routing и предлагает первый PRD | Не пишет сразу production code |
| Статья или тред | Делает research note и pattern extraction | Не превращает хайп в requirement |
| GitHub repo | Клонирует/читает, смотрит license/security, пишет service-analysis | Не копирует код без проверки |
| Новый AI tool | Оценивает impact на workflow, risks, rollback | Не подключает tool "потому что модно" |
| Ошибка в проекте | Читает overlay, ищет affected paths, предлагает checkpoint | Не рефакторит соседние зоны |
| Большой feature request | Делает scope split, stage plan и acceptance gates | Не берет весь feature одним куском |

Для меня это главный upgrade вайбкодинга. Вход может быть хаотичным, но выход должен становиться структурой.

```text
Хаотичный вход:
"Смотри, этот репозиторий на хайпе, может нам тоже надо?"

Структурированный выход:
- что это делает;
- почему стало заметным;
- какие паттерны переносимы;
- какие риски;
- что меняется в playbook;
- что не меняется в текущем продукте.
```

## Req-docs как первый фильтр

Перед тем как писать PRD, нужно понять, какой документ вообще нужен.

`req-docs` для меня - это не бюрократия, а роутер. Он отвечает на вопрос: "какая форма мышления сейчас нужна?"

- PRD - если нужно определить продукт, пользователя, scope и MVP;
- FRD - если нужно расписать функции;
- TRD - если нужно выбрать техническую архитектуру;
- SRD - если важны системные требования;
- QRD - если нужно задать quality gates;
- BRD/MRD - если нужно проверять бизнес или рынок.

Для ранней идеи почти всегда достаточно lightweight PRD:

```text
Problem
User
First useful workflow
Scope
Out of scope
Success criteria
Risks
Open decisions
```

Агент не должен начинать с огромного документа. Он должен выбрать минимальный документ, который снимет неопределенность.

## Research layer: хайп не равен requirement

Я хочу следить за ECC, Codex, Claude Code, MCP, GitHub agents, новыми agent harnesses, новыми model workflows и всем, что будет появляться дальше. Но это не значит, что каждая новая штука должна сразу попадать в продукт.

Research - это reference layer.

Схема такая:

```text
new link
  -> research/service-analysis
  -> reusable patterns
  -> playbook update
  -> skill/rule/hook only if repeated
  -> project requirement only if PRD/stage plan accepts it
```

Перед обновлением playbook агент должен ответить на пять вопросов:

1. Что это реально меняет в моем workflow?
2. Какой риск добавляет?
3. Где boundary: personal tooling, project tooling или product runtime?
4. Как проверить, что оно помогает?
5. Как откатить, если стало хуже?

Если ответов нет, это просто заметка. Если ответы есть, это уже материал для системы.

## Rules, skills, MCP и agents

Я не хочу руками каждый раз вспоминать: "а какие rules надо написать, какой skill использовать, какой MCP подключить, какого reviewer вызвать". Это должен делать boot process.

Но порядок важен.

```text
Rule -> когда нужно устойчивое текстовое ограничение.
Skill -> когда есть повторяемая процедура.
Hook -> когда правило лучше enforce, а не помнить.
MCP -> когда нужен controlled bridge к внешней системе.
Subagent -> когда нужен отдельный context или blind-spot review.
Script -> когда операция должна быть deterministic.
```

Пример:

- если проект использует payments, нужен rule про billing safety;
- если часто пишем PRD, нужен `req-docs` skill;
- если агент может случайно прочитать `.env`, нужен security rule/hook;
- если нужен доступ к GitHub issues, лучше scoped MCP/tool, а не широкий shell chaos;
- если implementation сделал AI, reviewer/test-auditor должны думать отдельно;
- если один и тот же smoke повторяется, он должен стать script.

Важно: агент не должен "установить все". Он должен предложить capability plan.

```text
Needed now:
- req-docs skill
- research report template
- reviewer pass
- test-auditor pass

Not needed yet:
- production database MCP
- deploy tool
- payment provider write access
- cloud agent automation
```

Вот здесь появляется зрелость. Современный workflow не в том, чтобы подключить максимум инструментов. Он в том, чтобы подключить минимальный набор, который реально сокращает путь от идеи до проверенного результата.

## Мой идеальный стартовый prompt

Я хочу прийти к такому формату:

```markdown
Вот идея/ссылка/репозиторий:
<input>

Работай по Personal AI Engineering Playbook.

Сначала:
1. Классифицируй вход.
2. Определи, это research, product idea, implementation task или tool adoption.
3. Найди, какие docs нужны через req-docs.
4. Предложи project overlay structure.
5. Определи rules/skills/MCP/subagents, которые нужны сейчас.
6. Скажи, что явно не надо подключать.
7. Напиши первый PRD или research note.
8. Предложи stage plan и первый checkpoint.

Не начинай implementation, пока не будет понятен scope и done criteria.
```

Когда система зрелая, этот prompt можно укоротить до:

```text
Intake this through my playbook and prepare the first executable checkpoint.
```

Но короткая команда работает только потому, что за ней стоит canon.

## От PRD к реализации

После intake начинается execution layer.

```text
PRD
  -> stage plan
  -> checkpoint prompt
  -> plan
  -> implementation
  -> checks
  -> reviewer
  -> test-auditor
  -> evidence
  -> next checkpoint
```

Checkpoint должен быть узким. Пример:

```text
/goal Implement only Checkpoint X.Y.
Use the active project overlay.
Do not touch payments, provider secrets, deploy config, or compatibility paths.
Use reviewer for scope/security review.
Use test-auditor for missing regression checks.
Write evidence under develop/artifacts/checkpoints/X.Y/.
Stop when checks pass or the blocker is explicit.
```

Это не убивает вайб. Это защищает вайб от расползания. Агент может быстро работать внутри bounded box, а не каждый раз заново решать, где границы мира.

## Evidence как память вайбкодинга

Самая большая проблема быстрой AI-разработки - через день уже непонятно, почему что-то сделано именно так.

Поэтому каждый значимый шаг должен оставлять evidence.

```markdown
# Evidence

## Input
Какая идея, ссылка, issue или checkpoint запустили работу.

## Scope
Что было разрешено.

## Changes
Что изменилось.

## Verification
Какие команды, tests, smoke, screenshots.

## Reviewer Notes
Что проверено на scope, correctness, security.

## Missing Regression Checks
Что еще не покрыто.

## Not Touched
Что явно оставлено как есть.

## Promoted Lessons
Что стало rule, skill, hook или playbook update.
```

Evidence превращает вайбкодинг из "мы вчера что-то нагенерили" в инженерный процесс, который можно продолжить.

## Adoption log: как не отставать от новых фич

Новые AI features будут выходить постоянно: Codex cloud, Claude hooks, MCP security patterns, GitHub agents, browser agents, repo agents, design agents, testing agents.

Мне не нужен страх "я отстал". Мне нужен adoption loop.

```text
Notice
  -> Research
  -> Trial
  -> Risk check
  -> Workflow change
  -> Rule/skill/hook
  -> Changelog
```

В `CHANGELOG.md` playbook можно фиксировать:

- какую фичу посмотрел;
- где попробовал;
- что стало быстрее;
- что стало опаснее;
- какой rule/skill/hook появился;
- что откатил.

Так хайп становится топливом, а не рулем.

## Как я хочу, чтобы агент вел новый проект

Финальная картинка такая.

Я говорю:

```text
Хочу сделать продукт: ...
Вот ссылки: ...
Вот похожие репозитории: ...
Вот мой вкус и ограничения: ...
```

Агент отвечает не кодом, а boot report:

```text
Input type:
- product idea with external references

Recommended first doc:
- lightweight PRD

Research needed:
- service-analysis for linked repos
- market/reference scan if product positioning unclear

Project overlay:
- AGENTS.md
- .cursor/rules or .claude/rules as thin wrappers if the project uses those tools
- docs/PRODUCT_DIRECTION.md
- docs/PRD_MVP.md
- docs/DECISIONS.md
- develop/LOCAL_RUNBOOK.md
- develop/stages/
- develop/artifacts/

Capabilities:
- req-docs skill
- research report template
- reviewer
- test-auditor
- security reviewer only when auth/payments/providers appear
- no write-capable MCP yet

First checkpoint:
- create product direction and MVP PRD
```

Потом он пишет PRD. Потом stage plan. Потом первый checkpoint. Потом implementation. Потом review/evidence. Потом новый урок возвращается в playbook.

Вот это и есть мой подход к вайбкодингу: не отказаться от интуиции, скорости и любопытства, а дать им рельсы.

## Sources

- [OpenAI Codex best practices](https://developers.openai.com/codex/learn/best-practices)
- [OpenAI Codex AGENTS.md guide](https://developers.openai.com/codex/guides/agents-md)
- [OpenAI Codex skills](https://developers.openai.com/codex/skills)
- [OpenAI Agents SDK overview](https://developers.openai.com/api/docs/guides/agents)
- [Claude Code memory](https://docs.anthropic.com/en/docs/claude-code/memory)
- [Claude Code common workflows](https://docs.anthropic.com/en/docs/claude-code/common-workflows)
- [Claude Code subagents](https://docs.anthropic.com/en/docs/claude-code/sub-agents)
- [Claude Code security](https://docs.anthropic.com/en/docs/claude-code/security)
- [Model Context Protocol intro](https://modelcontextprotocol.io/docs/getting-started/intro)
- [GitHub Copilot cloud agent](https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-cloud-agent)
