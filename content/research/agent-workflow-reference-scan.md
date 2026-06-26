---
title: "Reference scan по agent workflow"
date: 2026-06-26
description: "Внешние референсы для переиспользуемого project operating flow: goal control, wakeups, read coverage, harness gates, skills, memory и workspace patterns."
tags: ["agents", "workflow", "research", "codex", "skills"]
---

Это reference scan, а не product requirement. Ссылки становятся rules только после того, как переиспользуемый pattern понятен.

## Проверенные Источники

- `ustas-eth/ferrumctl`: маленькие Unix-style tools для Codex workflows. Полезный pattern - composable control plane: goal control, wake/scheduled messages и read coverage.
- `affaan-m/ECC`: крупная harness system вокруг skills, memory, security, research-first development и hooks. Полезный pattern - относиться к harness как к durable operating system, а не как к набору prompts.
- `svishniakov/agent-flow`: framework для Codex orchestration и verification с project memory, scoped lanes, gates, traces, QA и handoffs. Полезный pattern - bounded work с evidence-backed gates.
- `serejaris/personal-corp-skills`: публичные Claude/Codex skills и plugin manifests. Полезный pattern - упаковывать repeatable SOPs как skills и держать plugin manifests public/syncable.
- `sereja.tech/aicorp`: personal corporation model. Полезный pattern - общее operating space с rules, tasks, skills и history. В этом pack pattern адаптирован под локальные `develop/TODO.md` и `develop/CHECKPOINT.md` вместо GitHub Issues.

## Извлеченные Patterns

1. Отделять control plane от implementation.
   Goal state, wakeups, read coverage, queue status и progress ledgers должны жить вне памяти модели.

2. Работать по одному bounded checkpoint.
   У задачи должны быть scope, anti-scope, checks, evidence path и stop condition до изменения кода.

3. Держать одного patch owner.
   Subagents уменьшают слепые зоны, но один агент должен владеть final edits, если stage явно не выдал disjoint write scopes.

4. Делать verification видимой.
   Tests, lint, build, browser screenshots, traces и review notes должны попадать в durable artifacts, а не только в финальный ответ в чате.

5. Поднимать lessons медленно.
   Сначала research note, потом extracted pattern, потом playbook/rule/hook/skill, только если pattern reusable.

6. Считать project files рабочим пространством.
   Rules, local TODOs, checkpoints, stage plans, evidence, decisions и memory должны делать progress понятным и человеку, и агенту.

## Последствия Для Source Of Truth

- Starter projects должны получать `develop/` по умолчанию, а не только `AGENTS.md` и memory templates.
- Local `develop/TODO.md` и `develop/CHECKPOINT.md` должны держать goal, scope, anti-scope, verification и evidence path. GitHub Issues остаются optional только для public collaboration.
- Playbooks должны явно описывать subagent roles и write boundaries.
- Evidence templates должны иметь status values и ссылки на heavy artifacts.
- Hooks/scripts могут позже enforce checklist completion, но правила должны быть ясными до enforcement.

## References

- https://github.com/ustas-eth/ferrumctl
- https://github.com/affaan-m/ECC
- https://github.com/svishniakov/agent-flow
- https://github.com/serejaris/personal-corp-skills
- https://sereja.tech/aicorp/
