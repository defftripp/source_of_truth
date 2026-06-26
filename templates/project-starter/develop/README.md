# Development Playbook

Эта директория определяет, как implementation work планируется, выполняется, проверяется и передается дальше.

Product truth живет в `docs/**`.
Session memory живет в `memory/**`.
Короткоживущие tool plans могут жить в tool-specific папках, но durable checkpoint specs и evidence живут здесь.

## Структура

```text
develop/
  README.md
  IMPLEMENTATION_PLAN.md
  LOCAL_RUNBOOK.md
  TODO.md
  CHECKPOINT.md
  stages/
    <initiative>/
      STAGE_1_<name>.md
  artifacts/
    <initiative>/
      checkpoint-1.1.md
      handoff.md
  decisions/
    ADR-0001-<decision>.md
```

## Порядок Чтения Перед Stage Work

1. `AGENTS.md`
2. `memory/MEMORY.md`
3. `memory/SESSION-HANDOFF.md`
4. relevant product docs под `docs/**`
5. `develop/README.md`
6. `develop/IMPLEMENTATION_PLAN.md`
7. `develop/TODO.md`
8. `develop/CHECKPOINT.md`
9. `develop/LOCAL_RUNBOOK.md`
10. active stage/checkpoint spec
11. relevant prior artifacts
12. relevant decisions

## Agent Operating Model

Один main agent владеет итоговыми правками. Subagents read-only по умолчанию.

| Роль | Задача | Может редактировать |
| --- | --- | --- |
| `explorer` | Найти affected files, local patterns и risks. | Нет |
| `docs-researcher` | Проверить official docs или version-sensitive facts. | Нет |
| `reviewer` | Найти bugs, scope drift, secret leaks и missing gates. | Нет |
| `test-auditor` | Найти missing or weak acceptance coverage. | Нет |
| `browser-debug` | Запустить UI checks, screenshots, traces и visual evidence. | Нет |
| `worker` | Реализовать narrow disjoint scope. | Да, только если назначен |

## Goal Prompt Template

```text
/goal Implement <checkpoint id> from develop/stages/<initiative>/<stage file>.md.
Read AGENTS.md, memory/MEMORY.md, memory/SESSION-HANDOFF.md, develop/README.md, develop/IMPLEMENTATION_PLAN.md, develop/TODO.md, develop/CHECKPOINT.md, develop/LOCAL_RUNBOOK.md, the checkpoint spec, relevant prior artifacts and decisions first.
Work only on this checkpoint.
Use subagents only for read-only exploration, test audit, risk review, docs research and browser verification unless the checkpoint grants a disjoint write scope.
The main agent owns final edits.
Write evidence under develop/artifacts/<initiative>/.
Put bulky screenshots, traces, logs and generated files under output/ or work/ and link them from the markdown artifact.
Stop only when the checkpoint is complete with verification evidence, or when blocked by an explicit external blocker.
```

## Evidence Format

Каждый завершенный checkpoint пишет markdown artifact:

```text
Checkpoint:
Status: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
Inputs read:
Scope:
Anti-scope:
Changed files:
Verification:
Artifacts:
Reviewer notes:
Missing regression checks:
Cleanup:
Known gaps:
Next:
```
