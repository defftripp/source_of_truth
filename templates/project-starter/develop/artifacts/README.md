# Checkpoint Artifacts

Здесь хранится durable evidence. Тяжелые файлы линковать из `output/**` или `work/**`.

## Artifact Template

```markdown
# Evidence: Checkpoint X.Y

Status: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
Date: YYYY-MM-DD

## Inputs Read

- ...

## Scope

- ...

## Anti-Scope

- ...

## Changes

- ...

## Verification

| Check | Result | Notes |
| --- | --- | --- |
|  | PASS/FAIL/BLOCKED |  |

## Artifacts

- screenshots:
- traces:
- logs:

## Scope Guard

Touched:
- ...

Not touched:
- ...

## Reviewer Notes

- ...

## Missing Regression Checks

- None, or explain the gap.

## Risks

- ...

## Next

- ...
```
