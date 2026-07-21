# Issue #23 implementation plan

Baseline: `3f8dfc55263aa485d00adcc3a20b975ca9680837`

Write Lease:

- `.cursor/plans/issue-23.md`
- `skills/engineering-loop/runtime/engine.mjs`
- `skills/engineering-loop/runtime/methodology.md`
- `test/unit/standard-run.test.mjs`
- `test/fixtures/standard-run/package.json`
- `test/fixtures/standard-run/standard-request.json`
- `test/fixtures/standard-run/stale-evidence-request.json`
- `test/fixtures/standard-run/verification-registry.json`
- `test/fixtures/standard-run/scripts/research.mjs`
- `test/fixtures/standard-run/scripts/planner.mjs`
- `test/fixtures/standard-run/scripts/advisor.mjs`
- `test/fixtures/standard-run/scripts/worker.mjs`
- `test/fixtures/standard-run/scripts/ticket-verification.mjs`
- `test/fixtures/standard-run/scripts/spec-review.mjs`
- `test/fixtures/standard-run/scripts/quality-review.mjs`
- `test/fixtures/standard-run/scripts/stale-mutation.mjs`
- `test/fixtures/standard-run/scripts/build.mjs`
- `test/fixtures/standard-run/scripts/observe.mjs`
- `test/fixtures/standard-run/src/message.mjs`
- `test/fixtures/standard-run/test/message.test.mjs`
- `README.md`
- `CHANGELOG.md`

Testing seams:

1. Black-box invocation of the installed `.engineering/runtime/engine.mjs` against a prepared one-ticket STANDARD fixture.
2. Durable run artifacts and event order for evidence-backed research, spec-lite, complete AC coverage, Advisor approval, bounded Worker context, and independent reviews.
3. Git-visible Worker/Root boundaries and verification freshness: Worker cannot create the real Run Branch commit, and Root checkpoints only the exact tree observed by fresh ticket verification.

Implementation sequence:

1. [x] Add the successful STANDARD lifecycle test and fixture; observe RED.
2. [x] Implement the minimal research, spec-lite, Planner, Advisor, Worker, verification, dual-review, checkpoint, and READY_FOR_HUMAN lifecycle; observe GREEN.
3. [x] Add the stale-verification rejection test and verify the freshness guard.
4. [x] Update runtime methodology, README, and changelog.
5. [x] Run focused checks, Standards review, Spec review, and corrections.
6. [ ] Run final `npm run verify` and create exactly one local commit.
