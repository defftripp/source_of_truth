# Stage Specs

Create one folder per initiative and one markdown file per stage or checkpoint.

## Checkpoint Spec Template

~~~markdown
# Stage X / Checkpoint X.Y - Name

## Goal

- What outcome should exist after this checkpoint?

## Scope

- Allowed:

## Anti-Scope

- Not allowed:

## Constraints And Invariants

- Must preserve:

## Inputs To Read

- `AGENTS.md`
- `memory/MEMORY.md`
- `develop/IMPLEMENTATION_PLAN.md`
- relevant docs/artifacts:

## Suggested Subagents

- `explorer`:
- `reviewer`:
- `test-auditor`:
- `browser-debug`:

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
/goal Implement Checkpoint X.Y from develop/stages/<initiative>/<file>.md.
Read required inputs first. Work only on this checkpoint.
Use subagents read-only unless this spec grants a disjoint write scope.
Write evidence under develop/artifacts/<initiative>/.
Stop only when verification passes or an explicit blocker is recorded.
```
~~~
