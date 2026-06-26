# Операционный Flow Проекта

## Цель

Сделать так, чтобы каждый проект ощущался одной и той же инженерной системой: понятный scope, один активный checkpoint, видимое состояние, review gates и evidence вне чата.

## Когда Использовать

Использовать для любой нетривиальной feature, bugfix, refactor, research adoption, release или продолжения проекта.

Полный flow можно пропустить только для маленьких правок, где проверка очевидна и durable context не меняется.

## Flow

```text
1. Intake
2. Source-of-truth read
3. Plan or checkpoint spec
4. /goal на один ограниченный checkpoint
5. Read-only subagents, если полезно
6. Main agent patch
7. Verification gate
8. Evidence artifact
9. Memory and handoff update
10. Lesson promotion
```

## Intake

Сначала классифицировать вход, потом действовать:

| Вход | Первый выход | Не делать |
| --- | --- | --- |
| Идея продукта | легкий PRD или SPEC | сразу писать production code |
| Feature/enhancement | checkpoint plan | расширять задачу в соседний cleanup |
| Bug | repro или expected-vs-actual note | рефакторить несвязанные модули |
| Research link или repo | research note и pattern extraction | превращать хайп в требования |
| Tool adoption | capability plan и rollback | сразу давать широкий write access |
| Публичная статья | outline или draft под `content/` | публиковать private project data |

## Checkpoint Spec

Каждый checkpoint spec должен включать:

- goal;
- scope;
- anti-scope;
- constraints and invariants;
- touched areas;
- allowed subagents;
- verification commands или browser checks;
- evidence path;
- stop condition.

## Goal Prompt

Использовать такую форму:

```text
/goal Implement <checkpoint id> from <plan file>.
Read AGENTS.md, memory, develop/README.md, develop/IMPLEMENTATION_PLAN.md, develop/LOCAL_RUNBOOK.md, the checkpoint spec, relevant prior artifacts and ADRs first.
Work only on this checkpoint.
Use subagents for read-only exploration, review, test audit, docs research, or browser verification.
The main agent owns final edits.
Stop only when verification passes with evidence, or when blocked by an explicit external blocker.
Write evidence under <artifact path>.
```

Сама команда остается на английском, потому что ее читает агент. Описание задачи, scope и evidence в проекте пишутся на русском, если проект не решил иначе.

## Роли Subagents

| Роль | Зачем нужна | Пишет файлы |
| --- | --- | --- |
| `explorer` | affected files, локальные patterns, likely blast radius | нет |
| `reviewer` | bugs, scope drift, security/privacy leaks | нет |
| `test-auditor` | missing or weak acceptance coverage | нет |
| `docs-researcher` | свежие official docs и version-sensitive facts | нет |
| `browser-debug` | UI repro, screenshots, traces, visual checks | нет |
| `worker` | узкий implementation slice | только если явно назначен |

## Verification Gate

Выбирать проверки по blast radius:

- backend/API: сначала focused tests, broader suite когда изменены shared contracts;
- frontend/UI: focused component tests, lint/build для shared changes, browser screenshots для видимого поведения;
- data/schema: migration, schema docs, rollback или compatibility note;
- provider/payment/deploy: dry-run или sandbox proof, redaction scan, explicit cost/access boundary;
- docs-only: link check, build и consistency с `AGENTS.md`/playbooks.

Если проверку нельзя запустить, записать почему и какое evidence ее заменило. Нельзя молча подменять широкое требование узкой проверкой.

## Evidence

Checkpoint evidence лежит под:

```text
develop/artifacts/<initiative>/<checkpoint>.md
```

или, для проектов с тяжелыми checkpoint:

```text
develop/artifacts/checkpoints/<stage>/<checkpoint>/summary.md
```

Evidence должно сказать:

- какие inputs прочитаны;
- что изменилось;
- что проверено;
- какие artifacts/screenshots/logs есть;
- какой scope guard и какие зоны не трогались;
- что нашли `reviewer` или `test-auditor`;
- known gaps;
- следующий checkpoint;
- final status: `DONE`, `DONE_WITH_CONCERNS`, `BLOCKED` или `NEEDS_CONTEXT`.

Тяжелые traces, videos, generated assets, local stores и большие logs лежат в `output/**` или `work/**` и только линкуются из markdown artifact.

## Memory Update

Обновлять `memory/MEMORY.md`, когда меняется durable state проекта: milestone, commands, risks, decisions, constraints или next steps.

Обновлять `memory/SESSION-HANDOFF.md` в конце значимой работы, чтобы другой агент мог продолжить без истории чата.

## Lesson Promotion

Лестница такая:

```text
evidence note -> checklist -> playbook rule -> hook/script -> skill/plugin
```

Поднимать lesson только когда он переиспользуем между проектами или повторно болит внутри одного проекта.
