# Issue #32 — Solution Fitness Check

## Fixed point

- Issue: `#32`, parent contract `#16`, corrective-review dependency `#31`.
- Baseline: `abf73c05b6d3fa48876e9cdedb0ddf7b54b0c3b3`.
- Branch: `codex/issue-32-solution-fitness-check`.
- Worktree: `C:/WORK/source_of_truth/source_of_truth-issue-32`.
- `main` is not an implementation baseline.

## Scope

Add an evidence-bearing Solution Fitness Check to planned STANDARD/DEEP runs.
The check is absent without a repository-precedent, dependency-API, or
substantial-complexity trigger. When present, Root invokes registered,
read-only providers in the enforced order version detection → primary
documentation → comparison → verdict, validates a compact artifact through a
deterministic contract, routes supported blocking findings through the #31
corrective-ticket loop, reruns fresh fitness/reviews/verification after a
correction, and stops at `READY_FOR_HUMAN`.

Live Context7/network behavior belongs to provider commands, never to the
deterministic contract. Raw provider payloads, prompts, credentials, and large
logs are not durable artifacts.

## Exact Write Lease

- `.cursor/plans/issue-32-solution-fitness-check.md`
- `CHANGELOG.md`
- `README.md`
- `skills/engineering-loop/runtime/engine.mjs`
- `skills/engineering-loop/runtime/fitness-contracts.mjs`
- `skills/engineering-loop/runtime/methodology.md`
- `skills/engineering-loop/runtime/review-contracts.mjs`
- `skills/engineering-loop/scripts/shell.mjs`
- `test/fixtures/standard-run/fitness-request.json`
- `test/fixtures/standard-run/scripts/fitness-comparison.mjs`
- `test/fixtures/standard-run/scripts/fitness-documentation.mjs`
- `test/fixtures/standard-run/scripts/fitness-version.mjs`
- `test/fixtures/standard-run/scripts/ticket-verification.mjs`
- `test/fixtures/standard-run/scripts/worker.mjs`
- `test/fixtures/standard-run/verification-registry.json`
- `test/unit/fitness-contracts.test.mjs`
- `test/unit/onboarding.test.mjs`
- `test/unit/review-contracts.test.mjs`
- `test/unit/standard-run.test.mjs`

No other production, fixture, or generated path is authorized.

## Confirmed testing seams

1. Pure public contract seam exported by
   `runtime/fitness-contracts.mjs`: trigger selection, evidence ordering,
   artifact schema, deterministic outcome selection, version matching, and
   unsupported-verdict rejection.
2. Registered-command seam in `runtime/engine.mjs`: separate read-only version,
   documentation, and comparison providers; only validated compact evidence is
   persisted.
3. Existing black-box `$engineering-loop` STANDARD seam: observe Run Artifacts,
   linked corrective tickets, fresh review rounds, full verification, and the
   terminal release state.
4. Existing onboarding seam: the pinned Project Runtime owns and checksums the
   new contract module.

These seams are pre-agreed by #16/#32 and the explicit required fixture list.
Tests assert public behavior and durable artifacts, not internal helpers or
provider implementation details.

## Vertical TDD plan

1. RED: add the ten deterministic contract fixtures:
   no trigger, each trigger, version mismatch, custom-vs-built-in block,
   no-viable-built-in pass, Context7 fallback degradation, high-risk missing
   primary evidence block, and unsupported reviewer opinion.
   GREEN: implement only the pure trigger/evidence/artifact/outcome contract.
2. RED: assert onboarding installs and checksums the contract module.
   GREEN: add the runtime-owned file to the Canonical Project Shell manifest.
3. RED: add a black-box STANDARD fixture whose first fitness result blocks an
   absurd custom solution and whose corrective Worker replaces it with the
   documented built-in; assert a fresh second fitness artifact, fresh Spec and
   Quality reviews, full verification, and `READY_FOR_HUMAN`.
   GREEN: add conditional request/registry resolution, ordered read-only
   provider invocation, compact artifact persistence, corrective mapping,
   immutable history, resume/checkpoint allowlisting, and release freshness.
4. Run focused tests and typecheck after each slice. Update methodology,
   README, and changelog only after behavior is green.
5. Review the three-dot diff from `abf73c05...HEAD` independently for repository
   standards and #16/#32 compliance. Resolve every actionable finding.
6. Run `npm.cmd run verify`, inspect the final diff/status, and create exactly
   one local commit. Do not push, merge, close #32, or start another ticket.

## Acceptance mapping

- Trigger matrix and ordinary-local exclusion: contract fixtures 1–4.
- Version-first primary documentation and version match: contract fixtures 3
  and 5 plus registered-provider lifecycle assertions.
- Evidence categories and no abstract best-practice verdict: artifact-schema
  and unsupported-opinion fixtures.
- Absurd custom solution and viable-alternative behavior: fixtures 6–7.
- Context7 fallback and high-risk fail-closed behavior: fixtures 8–9.
- Corrective loop and fresh terminal evidence: black-box fixtures 11–12.

## Out of scope

- Live Context7 or network clients in deterministic runtime code.
- Provider payload retention.
- Automatic `ACCEPTED`, push, merge, deployment, or Issue closure.
