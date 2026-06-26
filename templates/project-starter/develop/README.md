# Development Playbook

This directory defines how implementation work is planned, executed, verified, and handed off.

Product truth lives in `docs/**`.
Session memory lives in `memory/**`.
Short-lived tool plans may live in tool-specific folders, but durable checkpoint specs and evidence live here.

## Structure

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

## Reading Order Before Stage Work

1. `AGENTS.md`
2. `memory/MEMORY.md`
3. `memory/SESSION-HANDOFF.md`
4. relevant product docs under `docs/**`
5. `develop/README.md`
6. `develop/IMPLEMENTATION_PLAN.md`
7. `develop/TODO.md`
8. `develop/CHECKPOINT.md`
9. `develop/LOCAL_RUNBOOK.md`
10. active stage/checkpoint spec
11. relevant prior artifacts
12. relevant decisions

## Agent Operating Model

One main agent owns final edits. Subagents are read-only by default.

| Role | Task | May edit files |
| --- | --- | --- |
| `explorer` | Find affected files, local patterns and risks. | No |
| `docs-researcher` | Verify official docs or version-sensitive facts. | No |
| `reviewer` | Find bugs, scope drift, secret leaks and missing gates. | No |
| `test-auditor` | Find missing or weak acceptance coverage. | No |
| `browser-debug` | Run UI checks, screenshots, traces and visual evidence. | No |
| `worker` | Implement a narrow disjoint scope. | Yes, only when assigned |

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

Each completed checkpoint should write a markdown artifact with:

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
