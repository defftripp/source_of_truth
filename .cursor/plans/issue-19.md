# Issue #19 — Propose legacy-project normalization

## Scope

Implement only the proposal phase of the Project Normalizer for an existing
Target Project. The result is a complete, deterministic Migration Manifest
returned before the Human Gate. Applying the manifest, modifying the Target
Project, task-mode routing, and all later lifecycle tickets are out of scope.

Fixed review point: `a8acdade42640e2172e4e598416c56d7edbe4552`.

## Confirmed test seams

- Primary seam: black-box `--normalize` invocation of the `$engineering-loop`
  launcher against temporary legacy repositories, observing exit status, the
  JSON proposal, and an unchanged recursive tree/content snapshot.
- Supporting seam: public Migration Manifest validation and deterministic hash
  verification using known-good manifests and deliberate path/action changes.

These seams are specified by parent issue #16 and issue #19 acceptance criteria.

## Contract

- Normalization is explicit and proposal-only. It returns
  `NORMALIZATION_PROPOSED`; it does not create `.engineering`, move application
  files, or persist the proposal inside the Target Project.
- Inventory covers repository files outside `.git/`, records detected
  conventions, and identifies Application Core without imposing a universal
  framework layout.
- Every proposed action is one of `KEEP`, `CREATE`, `MOVE`, `REWRITE`, `DELETE`,
  or `PROTECT`, and includes ownership, rationale, risk, and rollback.
- Ambiguous, sensitive, and deliberate local files default to `PROTECT` and
  never receive a destructive action.
- The canonical manifest order and hash are deterministic. The hash binds every
  destructive path/action pair, so either field changing invalidates it.
- The proposal describes the canonical control-plane additions needed for a
  later approved migration while preserving useful project conventions and the
  Application Core.

## Acceptance mapping

| Acceptance criterion | Verification |
| --- | --- |
| Inventory across different layouts | Legacy fixture matrix; application structure and detected conventions assertions |
| Complete manifest actions | Schema/completeness contract tests for every required action field and action kind |
| Safe default for ambiguous/sensitive/local files | Adversarial fixture asserts `PROTECT` and absence of destructive actions |
| No mutation before Human Gate | Recursive tree and SHA-256 snapshot equality before/after CLI invocation |
| Hash binds destructive scope | Repeat-run equality plus known path/action mutations changing the hash |

## Verification

1. Run the focused test file after each red/green slice.
2. Run `npm run typecheck` regularly.
3. Run `npm run verify` once after implementation.
4. Run two-axis review from fixed point `a8acdad`: repository standards and
   issue #19 / parent #16 contract.
5. Resolve actionable findings, rerun final verification, and create one local
   commit. Do not push, merge, or start another ticket.
