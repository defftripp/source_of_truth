---
title: "Documentation pipeline"
date: 2026-06-16
description: "Как переводить идею в требования, research, stage plan, checkpoint и evidence."
tags: ["documentation", "req-docs", "stage-plan", "evidence"]
---

Цель pipeline - не написать много документов. Цель - сделать так, чтобы каждый агент и человек понимал, что является правдой, что является reference, что сейчас делаем и как доказываем завершение.

## Базовая цепочка

```text
idea
  -> req-docs
  -> product docs
  -> research/service-analysis
  -> stage plan
  -> checkpoint prompt
  -> implementation
  -> review
  -> evidence
  -> promoted rule
```

## 1. Req-docs

`req-docs` отвечает на вопрос: какой документ нужен сейчас.

Варианты:

- PRD - что строим и зачем;
- FRD - какие функции нужны;
- SRD - системные требования;
- TRD - техническая платформа;
- QRD - качество, надежность, acceptance gates;
- BRD/MRD - бизнес и рынок, если нужно.

Правило: если проект ранний, начинать с легкого MVP PRD. Не писать SRD/TRD просто ради ощущения взрослости.

## 2. Product docs

Product docs - источник правды для продукта. Они отвечают на вопросы:

- кто пользователь;
- какой первый полезный сценарий;
- что входит в scope;
- что явно out of scope;
- какие инварианты нельзя нарушать;
- какие launch criteria.

## 3. Research

Research - reference, не requirement.

Новая ссылка или репозиторий проходят через короткую схему:

1. Что это реально делает.
2. Почему это стало заметным.
3. Что можно перенести как pattern.
4. Что нельзя переносить.
5. Какие security/legal risks.
6. Как это меняет playbook.

Если research не меняет workflow, он остается заметкой. Если меняет - обновляется playbook.

## 4. Stage plan

Stage plan дробит продукт на shippable increments.

Хороший stage:

- имеет один видимый outcome;
- содержит checkpoints;
- имеет exit gate;
- знает, какие документы нужно обновить;
- требует evidence artifacts.

## 5. Checkpoint prompt

Checkpoint prompt должен быть узким:

```text
/goal Implement only Checkpoint X.Y.
Scope...
Do not...
Use reviewer...
Write evidence under...
Stop when...
```

Чем уже checkpoint, тем меньше агент будет придумывать лишнее.

## 6. Review

Минимальный review слой:

- scope/security reviewer;
- test-auditor;
- product/docs alignment check.

Review не должен просто говорить "looks good". Он должен искать:

- out-of-scope changes;
- missing regression checks;
- unsafe external actions;
- stale docs;
- unrecorded decisions.

## 7. Evidence

Каждый checkpoint оставляет след.

Минимальный evidence report:

- what changed;
- commands/checks run;
- screenshots or smoke output, если UI/flow;
- scope guard;
- not touched;
- known risks;
- next checkpoint.

## 8. Promoted rule

Если одна и та же ошибка повторилась дважды, она становится правилом, шаблоном или hook/check.

```text
bug -> fix -> regression check -> rule/template
```

Именно так личный workflow становится сильнее после каждого проекта.

