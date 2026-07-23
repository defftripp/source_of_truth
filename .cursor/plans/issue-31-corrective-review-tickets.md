# Issue #31 — corrective review tickets

Baseline: `a548ca6d66ff081d988a3c499c859e66fdd94fd0` (`dev` and
`origin/dev`). Scope is GitHub Issue #31 only under parent contract #16.

## Worktree and overlap audit

- Branch: `codex/issue-31-corrective-review-tickets`.
- Worktree: `C:\WORK\source_of_truth\source_of_truth-issue-31`.
- The baseline repository worktree is clean on `dev`.
- The retained Issue #29 worktree is clean at the accepted baseline and has no
  uncommitted or staged paths. It is not touched by this implementation.
- `main` is not an implementation baseline and will not be changed.
- No artifact or packet from the obsolete `f8dc9bb` baseline is reused.

## Exact Write Lease

- `.cursor/plans/issue-31-corrective-review-tickets.md`
- `skills/engineering-loop/runtime/review-contracts.mjs`
- `skills/engineering-loop/runtime/engine.mjs`
- `skills/engineering-loop/runtime/methodology.md`
- `skills/engineering-loop/scripts/shell.mjs`
- `test/unit/review-contracts.test.mjs`
- `test/unit/standard-run.test.mjs`
- `test/unit/onboarding.test.mjs`
- `test/fixtures/standard-run/**`
- `test/fixtures/deep-run/scripts/spec-review.mjs`
- `test/fixtures/deep-run/scripts/quality-review.mjs`
- `test/fixtures/deep-parallel-run/scripts/review.mjs`
- `README.md`
- `CHANGELOG.md`

No FAST lifecycle, mode policy, normalization implementation, Remote
Checkpoint Sync policy, parallel-eligibility policy, dependency package, or
Issue #32 work is leased.

## Confirmed testing seams

1. Public deterministic review contracts in
   `runtime/review-contracts.mjs`: evidence-bearing review validation,
   finding-to-ticket mapping, blocker graph validation, immutable review
   history, and release freshness.
2. Black-box Project Runtime invocation against the prepared STANDARD fixture,
   observing independent role packets, immutable review artifacts,
   `ticket-graph.json`, corrective Worker attempts, targeted verification,
   Root checkpoints, instrumental priority, and terminal state.
3. Existing ticket graph and durable resume seam: corrective tickets are
   appended to the same graph and selected by the same deterministic frontier.
4. Existing DEEP guarded-parallel seam: corrective tickets carry no parallel
   contract proof by default, so #29 eligibility serializes them; no separate
   executor or unguarded concurrent writer is introduced.

## Vertical TDD cycles

- [x] RED/GREEN: reject generic or empty PASS; retain distinct fresh read-only
  Spec and Quality role contracts with evidence, coverage, and unverified
  areas.
- [x] RED/GREEN: false-green PASS cannot override a failing instrumental test.
- [x] RED/GREEN: one blocking finding creates exactly one bounded corrective
  ticket containing its source finding, blockers, Write Lease, context, and
  verification contract.
- [x] RED/GREEN: multiple dependent findings execute blockers-first through the
  existing Worker/Root checkpoint loop.
- [x] RED/GREEN: original review artifacts remain byte-identical and graph
  history links each original finding to its corrective ticket.
- [x] RED/GREEN: correction without repeated reviews remains BLOCKED.
- [x] RED/GREEN: reviews or full verification predating the last code change
  remain stale and BLOCKED.
- [x] RED/GREEN: fresh repeated Spec/Quality reviews plus full relevant
  verification after the last correction reach `READY_FOR_HUMAN` with
  `accepted: false`.
- [x] Update runtime packaging, methodology, README, changelog, and this version
  log.
- [x] Run focused tests and typecheck, then independent Standards and Spec
  reviews from `a548ca6`; fix every actionable finding.
- [x] Run final `npm.cmd run verify` and create exactly one local commit.

## Out of scope

- A corrective-specific executor, automatic `ACCEPTED`, merge, push, issue
  closure, deployment, Issue #32, unconditional parallel corrections, or
  changes to `dev`/`main`.

## Version log

- 2026-07-23: read #16/#31 and blockers #26/#28/#29 in full, revalidated the
  accepted baseline, traced graph/checkpoint/resume, review, verification, and
  guarded-parallel contracts, audited active worktrees, and fixed the exact
  Write Lease and TDD seams before production edits.
- 2026-07-23: completed the deterministic review contract and black-box
  corrective lifecycle. Required generic-PASS, false-green, one-to-one mapping,
  dependency order, immutability, missing-rerun, stale-evidence, and fresh
  READY_FOR_HUMAN fixtures pass; focused STANDARD, DEEP, guarded-parallel,
  onboarding, and typecheck regressions are green.
- 2026-07-23: Standards review found that resume accepted validly named review
  artifacts not linked from graph history. Local and remote resume now derive
  the exact review set from `ticketGraph.reviewRounds`, verify every recorded
  SHA-256 before execution, and admit `corrective-work.json` only when its exact
  finding links match the graph. The adversarial remote-resume fixture passes.
- 2026-07-23: post-fix Standards and Spec reviews passed with no remaining
  actionable findings. Final `npm.cmd run verify` passed 148 unit tests,
  install smoke, and Windows platform smoke after the last Application Core
  change.
