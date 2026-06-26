# Active Checkpoint

Status: TODO
Last updated: YYYY-MM-DD

## Goal

- What should be true after this checkpoint?

## Scope

- Allowed:

## Anti-Scope

- Not allowed:

## Inputs To Read

- `AGENTS.md`
- `memory/MEMORY.md`
- `memory/SESSION-HANDOFF.md`
- `develop/IMPLEMENTATION_PLAN.md`
- relevant docs/artifacts:

## Verification

- command/check:
- expected result:

## Evidence

- summary path:
- bulky artifact path:

## Stop Condition

- stop when:

## Goal Prompt

```text
/goal Implement the active checkpoint from develop/CHECKPOINT.md.
Read AGENTS.md, memory/MEMORY.md, memory/SESSION-HANDOFF.md, develop/README.md, develop/IMPLEMENTATION_PLAN.md, develop/TODO.md, develop/CHECKPOINT.md, develop/LOCAL_RUNBOOK.md and relevant prior artifacts first.
Work only on this checkpoint.
Use subagents read-only unless this checkpoint grants a disjoint write scope.
Write evidence under develop/artifacts/.
Stop only when verification passes or an explicit blocker is recorded.
```

