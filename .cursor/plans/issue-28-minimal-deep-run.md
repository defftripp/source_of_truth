# Issue #28 — minimal DEEP lifecycle

Baseline: `b8da2500c0b7a3da7fc1105e289c3dfada32e5af` (`dev` and
`origin/dev`). Scope is GitHub Issue #28 only under parent contract #16.

## Worktree and overlap audit

- Branch: `codex/issue-28-minimal-deep-run`.
- Worktree: `node_modules/.worktrees/issue-28-minimal-deep-run`.
- Existing #24 worktree points at the baseline and is not touched.
- Existing #26 worktree is stale at `f8dc9bb`; no packet or unmerged file from
  it is reused. The accepted #26 graph contract is read from the baseline.

## Write Lease

- `.cursor/plans/issue-28-minimal-deep-run.md`
- `skills/engineering-loop/runtime/deep-contracts.mjs`
- `skills/engineering-loop/runtime/mode-policy.mjs`
- `skills/engineering-loop/runtime/engine.mjs`
- `skills/engineering-loop/runtime/methodology.md`
- `skills/engineering-loop/scripts/shell.mjs`
- `test/unit/deep-contracts.test.mjs`
- `test/unit/deep-run.test.mjs`
- `test/unit/mode-policy.test.mjs`
- `test/unit/onboarding.test.mjs`
- `test/fixtures/deep-run/**`
- `README.md`
- `CHANGELOG.md`

No STANDARD fixture, STANDARD test, normalization implementation, sync
implementation, launcher, or package contract is leased.

## Confirmed testing seams

1. Public deterministic functions in `runtime/deep-contracts.mjs`: DEEP risk
   profiles, domain/decision evidence, migration and rollback contracts,
   Advisor prerequisites, and exact manifest approval binding.
2. Public Task Profile classifier: table-driven security, payments,
   destructive migration, and other hard-to-reverse profiles establish a DEEP
   floor even when generic evidence is otherwise low.
3. Black-box Project Runtime invocation against `test/fixtures/deep-run/**`,
   observing common state history, durable artifacts, Worker boundary,
   independent reviews, instrumental evidence, Git refs, and terminal status.

## Vertical TDD cycles

- [x] RED/GREEN: named hard-to-reverse profiles deterministically select DEEP
  and cannot be downgraded.
- [x] RED/GREEN: pure DEEP contracts reject missing domain evidence,
  CONTEXT/ADR decisions, dependency graph, migration contract, rollback plan,
  or exact hash-bound approval before Advisor/Worker.
- [x] RED/GREEN: changed destructive scope and missing high-risk evidence stop
  before Worker with `BLOCKED`, never DEGRADED success.
- [x] RED/GREEN: one-ticket DEEP uses the shared planned-run state machine,
  inherited checkpoint/resume/Git safety, independent Spec/Quality reviews,
  final instrumental verification, and reaches `READY_FOR_HUMAN` with
  `accepted: false`.
- [x] Update methodology, README, changelog, and this version log.
- [x] Run focused tests/typecheck, then independent Standards and Spec reviews
  from `b8da250`; fix every actionable finding.
- [ ] Run `npm.cmd run verify` and create exactly one local commit.

## Out of scope

- ACCEPTED, merge, push, issue closure, deployment, #29, parallel DEEP Workers,
  new remote-sync behavior, or a copied STANDARD executor.

## Version log

- 2026-07-22: revalidated #16/#28, baseline, accepted #24/#26/#30 contracts,
  existing worktrees, exact Write Lease, seams, and TDD sequence.
- 2026-07-22: expanded the lease only for `scripts/shell.mjs` and its onboarding
  test after confirming every imported runtime module must be manifest-owned and
  checksummed in prepared projects.
- 2026-07-22: first Standards/Spec review found durable-resume subject matching,
  manifest shape/lease binding, canonical CONTEXT/ADR persistence, and domain
  reference gaps. Added adversarial and crash-resume coverage; focused typecheck
  and 39 tests pass after the fixes.
- 2026-07-22: second review found that exact manifest approval bypassed the
  accepted durable Human Gate and exposed an uncommitted pre-checkpoint decision
  window. The DEEP manifest gate now commits the proposed scope and canonical
  decisions, resumes only for an exact hash answer, then admits Advisor/Worker.
- 2026-07-22: follow-up review found mutable gate-worktree trust and incomplete
  MOVE display. Resume now rejects worktree drift, the visible scope includes
  MOVE destinations, and the gate offers only its executable exact-hash answer.
- 2026-07-22: final Standards pass found a crash window immediately after the
  ANSWERED approval commit. Resume now validates the committed WAITING/ANSWERED
  pair, reconciles `decisionCommit`, and continues from that exact checkpoint;
  black-box reset coverage passes before Advisor and the first ticket.
- 2026-07-22: ancestry re-review required the WAITING gate to be a direct child
  of the integration baseline. Approval recovery now enforces that invariant;
  an adversarial clean rewritten-chain test is rejected.
- 2026-07-22: independent Standards and Spec re-reviews pass with no remaining
  actionable findings.
