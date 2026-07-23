# Issue #29 — guarded DEEP parallelism

Baseline: `6b3c02bb91b5995d49cf9ababbeb166029aaef48` (`dev` and
`origin/dev`). Scope is GitHub Issue #29 only under parent contract #16.

## Worktree and overlap audit

- Branch: `codex/issue-29-guarded-deep-parallelism`.
- Worktree: `C:\WORK\source_of_truth\source_of_truth-issue-29`.
- The baseline repository worktree is clean on `dev`.
- No other implementation worktrees were active before this worktree was
  created.
- `main` is not an implementation baseline and will not be changed.

## Exact Write Lease

- `.cursor/plans/issue-29-guarded-deep-parallelism.md`
- `skills/engineering-loop/runtime/parallel-eligibility.mjs`
- `skills/engineering-loop/runtime/engine.mjs`
- `skills/engineering-loop/runtime/methodology.md`
- `skills/engineering-loop/scripts/shell.mjs`
- `test/unit/parallel-eligibility.test.mjs`
- `test/unit/deep-parallel-run.test.mjs`
- `test/unit/onboarding.test.mjs`
- `test/fixtures/deep-parallel-run/**`
- `README.md`
- `CHANGELOG.md`

No FAST behavior, STANDARD execution behavior, normalization implementation,
Remote Checkpoint Sync policy, launcher contract, package contract, or existing
fixture is leased.

## Confirmed testing seams

1. Public deterministic eligibility validator:
   `runtime/parallel-eligibility.mjs` receives frontier ticket claims and
   distinct Worker worktree roots, and permits parallel execution only when
   every Write Lease and declared contract set is pairwise disjoint.
2. Black-box Project Runtime invocation against
   `test/fixtures/deep-parallel-run/**`, observing Worker start/end timeline,
   distinct worktree roots, Root-owned integration/checkpoint order, durable
   verification evidence, corrective work, protected refs, and terminal state.
3. Git history and durable run artifacts under
   `.engineering/runs/<run-id>/` prove that Workers neither commit nor
   integrate, Root runs targeted checks before each checkpoint, and full
   relevant verification runs only after the final accepted result.
4. A test-only post-commit fault seam proves that a DEEP checkpoint containing
   provisional integration evidence is reconciled to the exact committed HEAD
   on resume before terminal success.

## Vertical TDD cycles

- [x] RED/GREEN: validator permits only unique worktrees with pairwise-disjoint
  Write Leases and declared contract IDs; every missing proof or overlap
  selects sequential execution.
- [x] RED/GREEN: disjoint DEEP frontier launches real concurrent Workers in
  separate worktrees and records overlapping execution intervals.
- [x] RED/GREEN: overlapping Write Leases serialize Workers with no concurrent
  writer interval.
- [x] RED/GREEN: overlapping contract IDs serialize Workers even when Write
  Leases are disjoint.
- [x] RED/GREEN: a Worker commit or integration attempt produces `BLOCKED`
  without an accepted Root integration.
- [x] RED/GREEN: divergent/conflicting Worker output produces durable
  corrective work, does not silently merge, and leaves accepted integration
  state unchanged.
- [x] RED/GREEN: Root sequentially accepts results, reruns targeted verification
  before each checkpoint, and runs full relevant verification after the last
  integration.
- [x] Update methodology, README, changelog, and this version log.
- [x] Run focused tests/typecheck, then independent Standards and Spec reviews
  from the fixed baseline; fix every actionable finding.
- [x] Run final `npm.cmd run verify` and create exactly one local commit.

## Out of scope

- Push, merge, Issue #29 closure, automatic acceptance, deployment, changes to
  `develop` or `main`, parallel STANDARD Workers, remote DEEP resume, or any
  ticket other than #29.

## Version log

- 2026-07-23: revalidated #16/#29 and blockers #26/#28, confirmed the exact
  baseline and absence of other active implementation worktrees, traced the
  shared DEEP/graph/checkpoint/Git safety machinery, and fixed the Write Lease,
  testing seams, and TDD sequence before production edits.
- 2026-07-23: completed the validator and seven black-box RED/GREEN cycles.
  Disjoint Workers overlap in distinct worktrees; lease/contract overlap is
  sequential; nested Git authority attempts and conflicting output create
  corrective BLOCKED state; targeted checkpoints and final verification order
  are durable evidence. Focused typecheck, validator, new DEEP fixtures,
  inherited one-ticket DEEP, onboarding, and core STANDARD graph/resume tests
  pass.
- 2026-07-23: first Standards review found portable case-alias leases,
  untracked-path recovery, batch preflight, and stale interrupted Worker
  worktrees. Lease/contract identities are now conservatively case-folded,
  tracked and new paths recover separately, every result is preflighted against
  the accepted Root state before the first integration and again while pending,
  and runtime-owned stale Worker worktrees are removed and verified before
  relaunch. New adversarial black-box coverage passes for each correction.
- 2026-07-23: repeat Standards review found a post-checkpoint crash window in
  durable parallel integration evidence. Each DEEP checkpoint now commits a
  ticket-bound provisional integration record; resume verifies that record
  against the committed HEAD and current artifact before finalizing it. The
  exact crash-resume black-box fixture and the full guarded-parallel fixture
  suite pass.
- 2026-07-23: follow-up Standards review required fail-closed comparison of the
  whole parallel artifact during reconciliation. Resume now accepts only the
  committed artifact or its exact single-field-state transition for the current
  integration; altered Worker, eligibility, or integration evidence is rejected.
  The crash-resume fixture includes an adversarial drift rejection.
- 2026-07-23: final Spec review exposed the complementary interruption window
  after a bounded checkpoint index was validated but before commit. Resume now
  proves that the index contains one verified in-progress ticket, only its
  Write Lease plus allowlisted Run Artifacts, and no unstaged/untracked drift;
  it then resets the isolated Run worktree to durable HEAD and replays the
  ticket. A pre-commit fault/replay black-box fixture passes.
- 2026-07-23: an additional Spec review required explicit zero-checkpoint
  coverage. A first-ticket pre-commit fixture now proves that recovery returns
  through the durable DEEP approval checkpoint, reinitializes parallel evidence,
  and completes both tickets without relying on an uncommitted artifact.
