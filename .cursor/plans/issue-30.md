# Issue #30 implementation plan

Baseline: `f8dc9bbef05b115d27d7518fbf07bc6fb5bce7a3`

Scope: GitHub Issue #30 only; add opt-in Remote Checkpoint Sync for STANDARD
runs, safe divergence handling, and cross-clone durable resume. No merge,
acceptance, issue closure, force-push, or direct pushes to `develop`/`main`.

Write Lease:

- `.cursor/plans/issue-30.md`
- `skills/engineering-loop/runtime/engine.mjs`
- `skills/engineering-loop/runtime/methodology.md`
- `test/unit/standard-run.test.mjs`
- `test/fixtures/standard-run/*.json`
- `test/fixtures/standard-run/scripts/worker.mjs`
- `README.md`
- `CHANGELOG.md`

Confirmed testing seams from issue #30 and parent #16:

1. Black-box Project Runtime invocation against prepared Git repositories,
   observing remote refs and durable Run Artifacts.
2. Public run-request setting for opt-in sync; omission performs no push.
3. Git command/policy boundary that permits only fast-forward publication of
   the current Run Branch and rejects protected branches, merge, and force.
4. Two-clone restart from the remote Run Branch and Run State Store without
   chat or local worktree history.

Vertical TDD slices:

1. [x] RED/GREEN: default-off setting and current-Run-Branch-only sync evidence.
2. [x] RED/GREEN: divergence produces a Human Gate while preserving both local
   and remote histories.
3. [x] RED/GREEN: a second clone fetches and resumes the same deterministic
   frontier from durable state.
4. [x] Update methodology, README, and changelog contracts.
5. [x] Run focused checks/typecheck, then Standards + Spec review from baseline
   and fix every actionable finding.
6. [x] Run final `npm run verify` and create exactly one local commit.

Version log:

- 2026-07-22: created from issue #30 acceptance criteria and parent #16 Git
  safety/testing contracts.
- 2026-07-22: implemented opt-in safe publication, divergence Human Gate,
  durable sync evidence, and cross-clone STANDARD resume.
- 2026-07-22: closed all Standards/Spec findings; final typecheck, 91 unit
  tests, install smoke, and Windows platform smoke passed.
