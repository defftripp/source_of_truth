# Issue #20 — Apply a hash-bound Migration Manifest

## Scope

Implement only the approved application and rollback phase for the Migration
Manifest introduced by issue #19. Task classification, later Engineering Run
lifecycle tickets, remote actions, merge, and deployment are out of scope.

Fixed review point: `a7b809a6d9fd572b88b6a946b6ffc3fee1da1289`.

## Confirmed test seams

- Primary seam: black-box `$engineering-loop` launcher invocation against
  temporary legacy repositories, observing exit status, JSON reports, resulting
  trees/content hashes, readiness validation, and rollback behavior.
- Supporting seam: public manifest apply/rollback functions for deterministic
  preflight rejection and exact one-time override authorization.

These seams are specified by parent issue #16 and issue #20 acceptance criteria.

## Contract

- Apply receives a saved Migration Manifest and an approval for that manifest's
  exact canonical SHA-256 hash. Invalid, modified, stale, or target-drifted
  manifests fail during preflight before any mutation.
- A one-time override file names exact existing manifest paths and replacement
  actions. It cannot introduce a neighboring path or authorize any other action.
- Execution touches only effective manifest actions. `KEEP` and `PROTECT` are
  invariants; their source hashes must remain unchanged.
- A transaction journal outside the Target Project records reversible mutations.
  Failures after mutation trigger automatic rollback; successful application
  returns a token for an explicit later rollback.
- Successful application reruns readiness and project-runtime smoke and returns
  `PREPARED_PROJECT` only when both succeed.

## Acceptance mapping

| Acceptance criterion | Verification |
| --- | --- |
| Exact hash only; stale/modified rejection before mutation | Correct-hash black-box fixture plus hash and source-drift cases with unchanged snapshots |
| Exact one-time override scope | Override one protected path and assert its neighbor remains byte-identical; reject unknown override paths |
| Only listed actions execute | Compare resulting tree against the manifest action set |
| PROTECT/local overrides remain unchanged | Compare protected content hashes before and after application |
| Partial and full rollback | Force post-apply readiness failure for automatic partial rollback; explicitly roll back a successful full application and compare full snapshots |
| Revalidation reaches Prepared Project | Legacy black-box apply returns `PREPARED_PROJECT` with passing runtime smoke |

## Verification

1. Add one failing behavioral test, implement the minimal vertical slice, and
   rerun `test/unit/normalization.test.mjs` plus typecheck after each slice.
2. Run `npm run verify` once after implementation.
3. Run two-axis review from fixed point `a7b809a`: repository standards and
   issue #20 / parent #16 contract. Resolve actionable findings.
4. Rerun final verification and create one local commit. Do not push, merge, or
   start another ticket.
