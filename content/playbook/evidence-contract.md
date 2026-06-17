---
title: "Evidence contract"
date: 2026-06-16
description: "Минимальный формат доказательства, что checkpoint действительно завершен."
tags: ["evidence", "checkpoint", "verification", "review"]
---

Evidence - это способ продолжать проект без памяти чата. Если другой агент или человек не может понять, что произошло, checkpoint не завершен.

## Когда нужен evidence

Evidence нужен после:

- checkpoint;
- bugfix;
- release;
- migration;
- provider/payment/deploy changes;
- cleanup;
- research, который меняет playbook.

## Минимальный шаблон

```markdown
# Evidence: [checkpoint/task]

Date: YYYY-MM-DD
Scope: [коротко]

## Changes
- ...

## Verification
| Check | Result | Notes |
| --- | --- | --- |
| ... | PASS/FAIL/BLOCKED | ... |

## Scope Guard
Touched:
- ...

Not touched:
- ...

Compatibility retained:
- ...

## Reviewer Notes
- ...

## Missing Regression Checks
- None, or explain explicitly.

## Risks
- ...

## Next
- ...
```

## Что обязательно фиксировать

### Команды

Записывать не весь лог, а точные команды и результат:

```text
npm test -- workspace backend -> PASS
npm run build -> PASS
```

Если команда не запускалась, писать почему.

### Scope guard

Для cleanup/refactor задач обязательно:

- какие paths были проверены;
- какие paths изменены;
- какие paths специально не трогались;
- что не удалено из-за compatibility или отсутствия тестового доказательства.

### Regression gap

Если тест не добавлен, это не стыдно. Стыдно молча оставить дыру.

Формат:

```text
Missing regression check:
- [area] не покрыт, потому что [reason].
- Follow-up: [что нужно сделать].
```

## Что не является evidence

- "Все ок".
- "Проверил глазами".
- Скриншот без объяснения сценария.
- Лог команды без вывода PASS/FAIL.
- Review без списка рисков.

## Evidence promotion

Если один и тот же evidence item повторяется в нескольких проектах, его нужно поднять выше:

```text
evidence note -> checklist -> playbook rule -> script/hook if stable
```

