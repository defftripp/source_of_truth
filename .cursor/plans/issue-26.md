# Issue #26 implementation plan

Baseline: `dc97cc0e9ae9147ebcf30ac228beda052dfd1565`

Scope: GitHub Issue #26 only; extend the existing STANDARD lifecycle from one
ticket to a durable blockers-first graph. No push, merge, issue closure, FAST,
DEEP, or remote checkpoint sync work.

Write Lease:

- `.cursor/plans/issue-26.md`
- `skills/engineering-loop/runtime/engine.mjs`
- `skills/engineering-loop/runtime/methodology.md`
- `test/unit/standard-run.test.mjs`
- `test/fixtures/standard-run/*.json`
- `test/fixtures/standard-run/scripts/*.mjs`
- `test/fixtures/standard-run/src/*.mjs`
- `test/fixtures/standard-run/test/*.mjs`
- `README.md`
- `CHANGELOG.md`

Testing seams:

1. Black-box invocation of the installed Project Runtime against a prepared
   multi-ticket STANDARD fixture.
2. Durable graph, per-ticket Context Packet/Write Lease, verification evidence,
   and checkpoint commits observable through `.engineering/runs/<run-id>/` and
   Git history.
3. Process restart through a second black-box invocation that discovers and
   resumes the non-terminal run without chat or in-memory state.

Implementation sequence:

1. [x] RED: specify deterministic blockers-first traversal, ticket-specific
   packets/leases, fresh verification per checkpoint, and automatic completion.
2. [x] GREEN: implement validated graph planning and sequential frontier
   execution with one Root-owned checkpoint per ticket.
3. [x] RED/GREEN: specify and implement mid-graph restart/resume from durable
   state and existing Run Branch/worktree.
4. [x] Update methodology, README, and changelog contracts.
5. [x] Run focused tests/typecheck, then parallel Standards + Spec review and
   fix all actionable findings.
6. [x] Run final `npm run verify` and create exactly one local commit.
