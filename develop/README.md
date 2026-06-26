# Development Playbook

This directory tracks implementation work for the `source_of_truth` repo itself.

## Current Operating Rule

Durable implementation work uses:

- `develop/IMPLEMENTATION_PLAN.md` for stage status;
- `develop/CHECKPOINT.md` for the active slice;
- `develop/stages/**` for stage specs;
- `develop/artifacts/**` for evidence;
- `.cursor/plans/**` for short tool-local tracking.

## Evidence Format

Every checkpoint-weight change records:

- input;
- scope and anti-scope;
- changed files;
- verification commands and results;
- known gaps;
- next step.

## Goal Prompt Pattern

```text
/goal Implement the active checkpoint from develop/CHECKPOINT.md.
Read AGENTS.md, memory/MEMORY.md, memory/SESSION-HANDOFF.md, docs/PRODUCT_DIRECTION.md, docs/ARCHITECTURE.md, develop/README.md, develop/IMPLEMENTATION_PLAN.md, develop/TODO.md, develop/CHECKPOINT.md and relevant stage specs first.
Work only on this checkpoint.
Write evidence under develop/artifacts/.
```
