# Issue #34 implementation plan

Baseline: `35691efddbeebe4bb93b5aedd4132ca8d391f8e4`

Scope: GitHub Issue #34 only; add a read-only Runtime Doctor and an explicit,
policy-validated repair operation for Prepared Projects. Reuse the Prepared
Project contract from #18 and the durable checkpoint/frontier/remote-sync
contracts from #30. Do not upgrade runtimes, merge, push, close the issue, or
start another ticket.

## Write Lease

- `.cursor/plans/issue-34.md`
- `CHANGELOG.md`
- `README.md`
- `skills/engineering-loop/SKILL.md`
- `skills/engineering-loop/runtime/contracts.mjs`
- `skills/engineering-loop/runtime/doctor-contracts.mjs`
- `skills/engineering-loop/runtime/methodology.md`
- `skills/engineering-loop/scripts/readiness.mjs`
- `skills/engineering-loop/scripts/shell.mjs`
- `test/smoke/install.test.mjs`
- `test/unit/contracts.test.mjs`
- `test/unit/onboarding.test.mjs`
- `test/unit/runtime-doctor.test.mjs`

No file outside this list may be changed.

## Confirmed testing seams

These public seams are fixed by #16 and #34 and require no additional product
decision:

1. Black-box Global Launcher invocation with `--doctor`, explicit `--repair`,
   and `--repair --dry-run`, observing JSON, exit status, and before/after tree
   hashes.
2. Public deterministic doctor/repair module, observing diagnoses, ownership,
   allowed repair actions, READY/DEGRADED/BLOCKED outcome, and evidence.
3. Runtime manifest entries as the ownership policy boundary. Automatic repair
   requires `PROJECT_RUNTIME`, `generated: true`, and a declared Git blob repair
   source whose bytes independently match the manifest checksum.
4. Durable Run State Store (`state.json` plus `ticket-graph.json`) as the
   unfinished-run/frontier boundary.
5. Durable `remote-sync.json` as the separate remote-sync-problem boundary.
6. Existing Project Runtime invocation as the repair-plus-resume boundary; the
   repaired Doctor does not invent or advance run state itself.

## Vertical TDD slices

1. [x] RED/GREEN: healthy Prepared Project returns READY with complete manifest,
   project-state, verification, and checksum evidence and does not mutate.
2. [x] RED/GREEN: missing and drifted manifest-owned generated runtime files
   return deterministic repairable diagnoses; dry-run remains byte-identical.
3. [x] RED/GREEN: explicit repair validates policy and the trusted Git blob,
   restores the exact checksum, and recomputes verification after mutation.
4. [x] RED/GREEN: protected, USER_OWNED, and LOCAL_OVERRIDE drift preserve their
   original content hashes and return Human Gate/BLOCKED without mutation.
5. [x] RED/GREEN: non-terminal durable run state reports the deterministic
   resumable frontier without changing checkpoint evidence.
6. [x] RED/GREEN: durable remote sync failure is reported as its own diagnosis.
7. [x] RED/GREEN: missing/invalid required evidence never returns READY.
8. [x] RED/GREEN: repair of a runtime file followed by normal runtime invocation
   resumes the existing frontier without chat history.
9. [x] Update launcher/runtime documentation and the version log.
10. [x] Run focused tests and typecheck, then full `npm.cmd run verify`.
11. [x] Run independent Standards and Spec reviews from the fixed baseline,
    resolve every actionable finding, and rerun final verification.
12. [x] Create exactly one local commit.

## Version log

- 2026-07-24: created from the complete #16/#34 contracts at baseline
  `35691ef`; confirmed #18 Prepared Project and #30 sync/resume seams; recorded
  the exact Write Lease and TDD plan before production edits.
- 2026-07-24: completed the Issue #34 fixture matrix through the public launcher
  and project-local contract seams. The first Standards/Spec review found
  bootstrap trust, path confinement, resumability, sync-proof, and duplicate-run
  gaps; each finding received a failing regression test and a focused correction.
  Focused Doctor/contracts/onboarding/launcher verification is 35/35 PASS and
  typecheck is PASS.
- 2026-07-24: the repeated reviews found remaining bootstrap import, Run Artifact,
  DEEP gate, repair staging, and Remote Sync blocker proof gaps. Corrections now
  execute the launcher-owned Doctor snapshot, validate artifact contracts/review
  hashes, model DEEP waiting and approval checkpoints, stage replacement bytes
  outside the destination tree with pre/post checks, and bind sync blockers to a
  real durable HEAD. The expanded Doctor matrix is 14/14 PASS; related contract,
  onboarding, and launcher tests are 22/22 PASS; typecheck is PASS.
- 2026-07-24: later fixed-point reviews expanded durable gate validation across
  graphless, DEEP, checkpoint, readiness, and terminal Remote Sync states and
  tightened automatic repair to a trusted Windows exact-handle transaction.
  The renamed source handle remains pinned through post-repair path/checksum
  verification; unsupported platforms fail closed. The expanded Doctor matrix
  is 17/17 PASS; focused contracts/onboarding tests are 19/19 PASS; typecheck and
  `git diff --check` are PASS. Final independent reviews and full verify remain.
- 2026-07-24: final review rounds closed missing graph-frontier Remote Sync
  evidence, unmerged-index acceptance, and staging-source reparse gaps.
  Deletion regressions now cover checkpoint and Remote Sync Human Gate
  frontiers; the Windows helper proves the exact non-reparse source handle.
  Standards review and #16/#34 Spec review both reached fixed point with no
  actionable findings. Full repository verification remains.
- 2026-07-24: resumed the saved in-scope draft and isolated the apparent hang.
  The matrix completed in about three minutes; one deterministic-repair case
  was RED because the native rename signalled completion before the pinned
  source handle proved its final destination. Added an exact final-path query
  and equality check before `REPLACED`; the focused repair case is GREEN, the
  Doctor matrix is 17/17 PASS, related contracts/onboarding/launcher tests are
  22/22 PASS, typecheck and `git diff --check` are PASS. Fresh reviews and full
  verification remain.
- 2026-07-24: fresh review findings now require the registered Prepared Project
  smoke to execute before READY and convert repair exceptions into structured
  BLOCKED evidence without stack traces. The Windows pinned rename buffer now
  includes the required terminal UTF-16 NUL while keeping the declared byte
  length exact; the explicit repair regression passed five consecutive runs.
  Focused Doctor/contracts/onboarding verification is 41/41 PASS; typecheck and
  `git diff --check` are PASS. Fresh fixed-point reviews and full repository
  verification remain.
- 2026-07-24: full verification exposed one stale install-smoke expectation
  after the runtime contract advanced from 1.0.0 to 1.1.0, so the Write Lease
  was minimally expanded to that existing public smoke test. A fresh Standards
  review also found that the registered smoke executable itself needed manifest
  ownership proof; a RED fixture demonstrated execution of an unlisted engine,
  and the correction now requires its unique pinned manifest entry and PASS
  checksum evidence before spawn.
- 2026-07-24: final verification is PASS: typecheck, 189 unit tests, install
  smoke, and Windows platform smoke. Spec review is PASS. The remaining
  Standards objection to executing a schema-1 engine was rejected because #18
  defines that committed path/checksum manifest as the legacy pinning contract
  and requires its smoke run; schema 1 still receives no automatic repair
  authority, while unlisted or checksum-invalid engines cannot execute.
- 2026-07-24: a repeated Standards review found Windows executable shadowing
  because the verified smoke used bare `node` from the Target Project working
  directory. A RED fixture placed a shadow `node.exe` in the target; the
  correction preserves logical registry validation but spawns the trusted
  launcher `process.execPath`. The shadow, unowned-engine, failing-smoke, and
  explicit-repair focused regressions are 4/4 PASS; fixed-point reviews and
  final full verification must rerun after this correction.
- 2026-07-24: final fixed-point Standards and #16/#34 Spec reviews are PASS
  with no actionable findings. Final `npm.cmd run verify` is PASS: typecheck,
  190 unit tests, install smoke, and Windows platform smoke.
