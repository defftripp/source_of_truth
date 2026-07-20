# Issue #18 — Prepare a new Target Project

## Scope

Implement only explicit onboarding for a new Target Project, installation of a
version-pinned project-local runtime, launcher delegation to that runtime, and
the verification contracts required by issue #18. Legacy normalization,
migration manifests, task-mode routing, and later lifecycle tickets are out of
scope.

## Confirmed test seams

- Primary seam: black-box invocation of the installed `$engineering-loop`
  launcher against temporary Target Projects, observing exit status, JSON
  reports, the resulting tree, and preserved application files.
- Supporting seams: public manifest and Upstream Adoption Matrix validators,
  exercised with complete and deliberately incomplete fixtures.

These seams come from parent issue #16 and issue #18 acceptance criteria.

## Contract

- `--onboard` prepares only a target without an existing `.engineering`
  control plane; conflicts stop before mutation.
- The Canonical Project Shell lives under `.engineering/` and does not create or
  reorganize an Application Core.
- The installed runtime owns its manifest, adoption matrix, state, verification
  registry, runtime executable, and durable artifact directories.
- Manifest file checksums and every adopted upstream entry's revision/checksum
  and local artifact path are mandatory and recomputable.
- `--run` performs readiness validation and delegates to the installed runtime;
  it never substitutes files from the current Global Launcher.
- Successful onboarding delegates a smoke run and returns
  `PREPARED_PROJECT` with the installed runtime version and project-owned state.

## Acceptance mapping

| Acceptance criterion | Verification |
| --- | --- |
| Complete shell without Application Core layout | New-project black-box fixture plus before/after application snapshot |
| Runtime and upstream pins/checksums | Manifest validator and checksum recomputation tests |
| Complete adoption matrix | Contract test accepts complete data and rejects every missing required field |
| Launcher delegates locally | Black-box `--run` observes installed runtime version and state path |
| Launcher update isolation | Prepared fixture is invoked through a modified launcher copy and retains its pinned version |
| Prepared Project smoke | End-to-end `--onboard` returns `PREPARED_PROJECT` and registered smoke evidence |

## Verification

1. Focused test file after each red/green slice.
2. `npm run typecheck` regularly.
3. `npm run verify` once after implementation.
4. Two-axis review from fixed point `22e2f4c`: repository standards and issue #18 spec.
5. Resolve actionable findings, rerun final verification, and create one local commit.
