# Issue #22 implementation plan

Baseline: `fff9f67a5b233db381d70d13d97d178c4739ffb0`

Write Lease:

- `.cursor/plans/issue-22.md`
- `skills/engineering-loop/runtime/mode-policy.mjs`
- `skills/engineering-loop/runtime/engine.mjs`
- `skills/engineering-loop/scripts/shell.mjs`
- `test/unit/mode-policy.test.mjs`
- `test/unit/fast-run.test.mjs`
- `test/unit/onboarding.test.mjs`
- `test/fixtures/fast-run/cross-file-request.json`
- `test/fixtures/fast-run/verification-registry.json`
- `test/fixtures/fast-run/scripts/apply-cross-file-change.mjs`
- `test/fixtures/fast-run/src/suffix.mjs`
- `test/fixtures/fast-run/test/cross-file.test.mjs`
- `README.md`
- `CHANGELOG.md`

Testing seams:

1. Public deterministic Task Profile classifier with table-driven representative and boundary cases.
2. Black-box Project Runtime invocation against a prepared multi-file FAST fixture.
3. Durable Task Profile and invocation output contracts, including evidenced Root escalation and hard-floor enforcement.

Implementation sequence:

1. [x] Add classifier contract tests, then the minimal deterministic policy.
2. [x] Add escalation and downgrade tests, then enforce evidenced upward-only Root routing.
3. [x] Add the cross-file FAST black-box fixture, then integrate classification into the runtime.
4. [x] Update installed-runtime ownership, user documentation, and changelog.
5. Run focused checks, Standards review, Spec review, corrections, and final `npm run verify`.
6. Create exactly one local commit.
