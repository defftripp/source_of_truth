---
title: "Project overlay"
date: 2026-06-16
description: "Как применять универсальный Source of Truth к конкретному проекту, не смешивая общий canon и product truth."
tags: ["project-overlay", "agents", "documentation", "canon"]
---

Source of Truth хранит общий способ работы. Конкретный проект хранит свою продуктовую правду.

Project overlay - это тонкий слой, который соединяет общий playbook с реальностью проекта.

## Что живет в Source of Truth

- общие workflow;
- reviewer/test-auditor roles;
- templates;
- prompts;
- tool policy;
- research patterns;
- evidence contract;
- project bootstrap skeleton.

## Что живет в проекте

- product direction;
- PRD/FRD/SRD/TRD/QRD;
- stage plans;
- local runbook;
- env examples;
- product-specific AGENTS.md;
- checkpoint artifacts;
- deployment notes;
- decisions about product architecture.

## Минимальная структура проекта

```text
project/
  AGENTS.md
  docs/
  develop/
    stages/
    artifacts/
    LOCAL_RUNBOOK.md
  research/
  memory/
  archive/
```

Структура может отличаться, но роли файлов должны быть ясны.

## AGENTS.md overlay

Project `AGENTS.md` должен отвечать:

- какой продукт строится;
- какие docs читать первыми;
- какие инварианты нельзя нарушать;
- какой implementation order;
- какие actions требуют approval;
- где писать evidence;
- какие команды запуска/проверки актуальны.

Он не должен дублировать весь общий playbook. Лучше ссылаться на Source of Truth как на общий процесс.

## Когда обновлять overlay

Обновлять project overlay, если:

- изменился product scope;
- изменились env/ports/commands;
- появился новый provider/payment/security boundary;
- stage plan поменял implementation order;
- research стал active requirement;
- review нашел повторяющуюся ошибку именно этого проекта.

## Когда не обновлять overlay

Не обновлять project overlay, если:

- появилась новая общая идея для всех проектов;
- найден новый prompt;
- изменился личный workflow;
- research относится к agent tooling, а не продукту.

Это идет в Source of Truth.

## Миграция lessons

```text
project evidence -> repeated lesson -> Source of Truth playbook
Source of Truth playbook -> project overlay only if project needs it
```

Так общий canon растет от практики, но не загрязняет продуктовые документы.

