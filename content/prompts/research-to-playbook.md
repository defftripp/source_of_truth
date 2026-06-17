---
title: "Research to playbook prompt"
date: 2026-06-16
description: "Промпт для разбора новой ссылки и решения, нужно ли обновлять Source of Truth."
tags: ["prompt", "research", "playbook"]
---

Использовать, когда появляется новая ссылка на репозиторий, статью, инструмент или AI-фичу.

```text
Изучи ссылку: [URL].

Цель: понять, нужно ли обновить мой Source of Truth.

Сделай:
1. Что это реально делает.
2. Почему вокруг этого появился интерес.
3. Какие claims подтверждаются первичными источниками.
4. Какие идеи можно перенести в мой workflow.
5. Что нельзя переносить или ставить без review.
6. Security/legal/tooling risks.
7. Как это меняет:
   - documentation pipeline;
   - agent workflow;
   - review/regression checks;
   - evidence artifacts;
   - MCP/tool policy.
8. Дай итог:
   - оставить как note;
   - добавить research page;
   - обновить playbook;
   - написать blog post;
   - ничего не делать.

Не превращай hype в requirement. Если польза не доказана, так и напиши.
```

