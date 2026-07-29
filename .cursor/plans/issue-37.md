# Issue #37 — Real acceptance lifecycle

## Boundary

- Baseline: clean `dev` at `f762638168145ac079d51405407edf30bf48528f`.
- Ticket: GitHub Issue #37 only; blocker #36 is closed.
- Public seams: `npm run accept`, its bounded redacted JSON report, and the
  actual project-local Engineering Loop runtime invoked in a temporary Git
  target with a bare remote.
- Protected refs in the source repository, `main`, deployment, release,
  automatic `ACCEPTED`, and parent Issue #16 closure are out of scope.

## Pre-agreed testing seams

1. Acceptance report validator: exact lifecycle stages, correction freshness,
   resume evidence, weighted scorecard, terminal state, and protected refs.
2. Black-box command: project preparation through `READY_FOR_HUMAN`, including
   a forced interruption, durable resume, one review-driven correction, fresh
   reviews/checks, and Remote Checkpoint Sync.
3. Redaction boundary: bounded report plus automated deny-list scan; no raw
   stdout/stderr, provider payload, signed URL, secret, private data, or chat.

These seams are specified directly by Issue #37 and parent Issue #16.

## Vertical TDD slices

1. [x] RED/GREEN: exact scorecard weights sum to 100 and every score cites
   evidence.
2. [x] RED/GREEN: incomplete chronology, stale post-correction reviews/checks,
   or a non-`READY_FOR_HUMAN` terminal state is rejected.
3. [x] RED/GREEN: real interrupted lifecycle resumes, corrects, re-reviews,
   re-verifies, syncs only its Run Branch, and preserves protected refs.
4. [x] RED/GREEN: automated deny-list and manual redaction evidence pass.
5. [x] Independent Standards + Spec reviews, full `npm.cmd run verify`, and
   exactly one local commit.

## Initial Write Lease

- `.cursor/plans/issue-37.md`
- `.engineering/acceptance/v1-run-report.json`
- `CHANGELOG.md`
- `README.md`
- `package.json`
- `skills/engineering-loop/SKILL.md`
- `skills/engineering-loop/runtime/methodology.md`
- `skills/engineering-loop/scripts/accept.mjs`
- `test/fixtures/standard-run/acceptance-request.json`
- `test/unit/acceptance-lifecycle.test.mjs`

Any expansion must be recorded before editing a new path.

## Version log

- 2026-07-29: created from accepted Issue #36 plus the one-time repository
  Agent skills setup; Issue #37 has no open blocker.
- 2026-07-29: real acceptance command reached `READY_FOR_HUMAN` with a fresh
  clone resume, one corrective ticket, review round 2, four post-execution
  verification slices, Run Branch-only sync, protected refs unchanged, exact
  100% scorecard weights, automated deny-list PASS, and manual redaction PASS.
- 2026-07-29: independent review remediation added catalog-bound artifact
  evidence, descendant-commit bindings for fresh reviews/checks, bounded process
  tree termination, expanded source identity, atomic publication rechecks, and
  a separate hash-bound maintainer redaction gate.
- 2026-07-29: final bounded report is 21,534 bytes, validates against all 14
  chronological stages and 35 catalog entries, keeps `accepted: false`,
  confirms parent #16 remains open, and binds 64 tested source files with
  fingerprint
  `1cf37c9a5bfd3421a870b75ca4c3943387b7989ea7a4cd22033df97663ce874a`.
  Manual review is bound to pending report hash
  `f7afc9b1c5cab68c11bc7b10eb88dc1670d323d081a8afe55770937d8726c6a7`.
- 2026-07-29: independent Standards and Spec reviews PASS with no remaining
  findings. Full `npm.cmd run verify` PASS: typecheck, 243 unit tests, install
  smoke, and Windows platform smoke.
