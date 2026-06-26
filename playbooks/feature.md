# Feature

## Goal

Ship a new capability without accidental scope creep.

## Steps

1. State the user-visible outcome.
2. Write scope, anti-scope, constraints, verification, and stop condition.
3. Name affected modules, files, or boundaries.
4. Define the smallest checkpoint that proves the feature works.
5. Use read-only `explorer`, `reviewer`, `test-auditor`, or `browser-debug` subagents when the blast radius is non-trivial.
6. Implement the checkpoint with one main patch owner.
7. Verify behavior.
8. Write evidence and record follow-up work separately instead of silently expanding scope.

## Checklist

- scope is explicit
- anti-scope is explicit
- success condition is observable
- verification exists
- evidence path exists for checkpoint-weight work
- memory updated if architecture or workflow changed

