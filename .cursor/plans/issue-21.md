# Issue #21 — FAST run to READY_FOR_HUMAN

## Baseline

- Branch: `dev`
- Starting commit: `bddb35ef896d90b73af905375fc31e49e254a53e`
- Issue #20 implementation commit: `bddb35ef896d90b73af905375fc31e49e254a53e`
- Baseline verification: `npm run verify` passes (39 unit, 1 install smoke, 1 platform smoke).

## Write Lease

- `skills/engineering-loop/runtime/engine.mjs`
- `test/unit/fast-run.test.mjs`
- `test/fixtures/fast-run/**`
- `.cursor/plans/issue-21.md`
- `README.md` (public `--run-request` contract only; explicitly authorized on
  continuation)

The original lease was disjoint from every path changed by issue #20. The user
later authorized the single intentional overlap above for required public
contract documentation.

## Pre-agreed test seams

Issue #16 and issue #21 define the seams:

1. Black-box invocation of the installed project-local runtime against a Git
   fixture, observing mode evidence, artifacts, branch/worktree isolation,
   commits, aggregate diff, and terminal state.
2. Instrumental false-green fixture where Quality Review passes but a relevant
   check fails and therefore cannot reach a release state.

## Vertical slices

1. Add a prepared-project FAST fixture and assert evidence-backed `FAST`
   selection plus skipped-stage absence.
2. Add isolated Run Branch/worktree execution with Root as the only writer.
3. Persist compact state, Quality Review, verification, and result artifacts.
4. Commit the verified checkpoint and terminal evidence, then return
   `READY_FOR_HUMAN` with aggregate diff while keeping `develop` and `main`
   unchanged.
5. Add false-green coverage proving instrumental checks outrank reviewer
   opinion.

## Command and artifact contract

- The request contains task evidence and registry IDs, never shell text.
- Commands must already exist in `.engineering/verification/registry.json`.
- Commands run as argv with `shell: false` and a fixed worktree cwd.
- Durable artifacts contain structured IDs/status/evidence only; no source
  copies, raw logs, secrets, environment dumps, or chat transcripts.

## Version log

- 2026-07-20: scoped #21 to the existing installed runtime engine and new FAST
  fixtures without touching the completed #20 implementation.
- 2026-07-20: expanded the lease to README by explicit user authorization and
  removed duplicated failure-context assembly found by Standards review.
- 2026-07-20: Spec review required repository-owned `requiredForFast`
  completeness, exact Application Core Write Lease enforcement, compact Quality
  Review evidence IDs, and runtime artifact allow/deny validation.
- 2026-07-20: final review added duplicate registry-ID rejection, external HEAD
  immutability checks, base-relative path validation, and exact stage-specific
  artifact set/content verification.
- 2026-07-20: acceptance review removed forbidden extra run artifacts before
  structured BLOCKED evidence, excluded raw diff stat output from durable state,
  and tightened Write Lease paths to canonical POSIX Application Core entries.
- 2026-07-21: release review added a Git read-only command guard, per-command
  protected repository restoration, exact index/commit artifact validation, and
  hook-isolated Root commits.
- 2026-07-21: final Standards/Spec findings replaced the platform-dependent Git
  shim with baseline-seeded shadow Git metadata, made ref/worktree restoration
  total, validated leased staged blobs and complete commit trees, restricted
  durable registry IDs, and guaranteed command-guard cleanup on exceptions.
