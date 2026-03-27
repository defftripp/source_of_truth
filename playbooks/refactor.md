# Refactor

## Goal

Improve structure without changing intended behavior.

## Steps

1. Name the current pain clearly.
2. List invariants that must not change.
3. Break the refactor into small reversible steps.
4. Verify behavior after each step.
5. Stop when the pain is removed; do not turn refactor into a rewrite.

## Checklist

- invariants are explicit
- steps are small
- behavior verification exists
- follow-up cleanup is separated from the core refactor

