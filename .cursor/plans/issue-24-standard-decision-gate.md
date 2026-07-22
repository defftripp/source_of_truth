# Issue #24 — STANDARD decision gate

Baseline: `834abe1e79103a0541a588d8435a67035ec87ad4`

Scope: GitHub Issue #24 only, under parent contract #16 and the accepted #30
Human Gate/request-binding/cross-clone resume contract.

## Write Lease

- `.cursor/plans/issue-24-standard-decision-gate.md`
- `skills/engineering-loop/runtime/engine.mjs`
- `skills/engineering-loop/runtime/methodology.md`
- `test/unit/standard-run.test.mjs`
- `test/fixtures/standard-run/decision-request.json`
- `test/fixtures/standard-run/hard-decision-request.json`
- `test/fixtures/standard-run/scripts/research.mjs` (Spec review correction:
  exhaustive repository-fact question audit contract)
- `README.md`
- `CHANGELOG.md`

## TDD seams

1. Black-box STANDARD invocation: emitted report, durable Run Artifacts, Git
   history, CONTEXT/ADR changes, Worker count, and same-run resume.
2. Deterministic request-binding policy: human answers are mutable resume input;
   repository, task, contract, commands, Write Lease, and remote sync settings
   remain immutable.

## Vertical cycles

- [x] RED/GREEN: research precedes one durable decision Human Gate; no Worker or
  planning runs before an answer; repository-resolved questions are rejected.
- [x] RED/GREEN: a valid answer resumes the same run without repeating the gate
  and preserves request identity.
- [x] RED/GREEN: CONTEXT updates are idempotent and ADR creation is limited to a
  hard-to-reverse surprising decision.
- [x] RED/GREEN: remote divergence uses the same Human Gate artifact/report
  contract without weakening #30 sync behavior.
- [x] Standards review and Spec review; resolve findings.
- [x] `npm.cmd run verify`.
- [x] Review final diff and create one local commit.

## Out of scope

- DEEP decision workflow.
- Multiple simultaneous questions.
- Automatic merge, push, issue closure, or acceptance.
