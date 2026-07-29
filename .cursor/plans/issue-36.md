# Issue #36 — Reproducible V1 qualification suite

## Boundary

- Baseline: clean `dev` at `6bfd8eaa3424883bb9053e835566a1ad1ce16592`.
- Ticket: GitHub Issue #36 only; every declared blocker is closed.
- Public seam: one Node CLI command that runs black-box fixture evidence and
  writes a bounded qualification report.
- Test seams are pre-agreed by #16/#36: CLI exit/report behavior, scenario
  coverage validation, mandatory-failure aggregation, and deny-list scanning.
- `main`, deployment, release, Issue #37, and automatic acceptance are out of
  scope.

## Acceptance map

| Contract | Implementation seam | Verification |
| --- | --- | --- |
| Required project-state fixtures | Pinned scenario manifest | Coverage validator rejects any omission |
| Required adversarial scenarios | Pinned scenario manifest | Exact named PASS evidence is required |
| Black-box Engineering Loop | Existing launcher/runtime tests invoked as child processes | Report records public test seam, exit status, and bounded evidence only |
| Deterministic component coverage | Pinned component manifest plus full component test batch | Component coverage report lists every required contract |
| Windows plus additional-platform statement | Platform evidence | Windows is mandatory; additional platform is explicit V1 limitation |
| No secrets/raw logs/chat | Bounded report schema and deny-list scan | Injected forbidden content blocks qualification |
| Mandatory failure dominates reviewers | Aggregate evaluator | Injected failed scenario returns `BLOCKED` and non-zero |

## Vertical TDD slices

1. [x] RED/GREEN: pinned manifest must cover every required fixture, scenario,
   and component contract.
2. [x] RED/GREEN: aggregate report is `PASS` only when every mandatory scenario,
   component batch, platform requirement, and deny-list scan passes.
3. [x] RED/GREEN: CLI runs exact black-box tests, rejects missing named PASS
   evidence, and never persists raw child output.
4. [x] RED/GREEN: output report is bounded, redacted, reproducible, and records
   explicit additional-platform limitation.
5. [x] Documentation/version log and reproducible package command.
6. [x] Independent Standards + Spec reviews and full `npm.cmd run verify`.
7. [x] Exactly one local commit.

## Initial Write Lease

- `.cursor/plans/issue-36.md`
- `.engineering/qualification/v1-report.json`
- `CHANGELOG.md`
- `README.md`
- `package.json`
- `skills/engineering-loop/SKILL.md`
- `skills/engineering-loop/runtime/methodology.md`
- `skills/engineering-loop/scripts/qualify.mjs`
- `test/support/process.mjs`
- `test/unit/qualification.test.mjs`

The test process helper was added after Spec Review identified that fixture
repositories were removed before the qualification process could scan their
tracked Run Artifacts and checkpoint history. Any further expansion must be
recorded here before editing a new path.

## Version log

- 2026-07-28: created from accepted Issue #33 `dev`; all blockers #22, #24,
  #25, #27, #29, #32, #33, and #35 are closed; no Issue #36 worktree or branch
  existed.
- 2026-07-28: implemented the pinned suite manifest, strict aggregate evaluator,
  bounded child-process runner, report deny-list, safe atomic output, package
  command, and documentation through four RED/GREEN public-seam tests.
- 2026-07-28: real `npm.cmd run qualify` PASS: 7 fixtures, 10 adversarial
  scenarios, 8 deterministic components, Windows platform smoke, and deny-list
  scan; bounded report size 12,848 bytes with no failed mandatory IDs.
- 2026-07-29: hardened qualification rerun PASS after independent review
  remediation: suite hash
  `26de612dd877e2ceeb0411a8883bd95cc801eb2f7f708f2104df59bc097e5b86`,
  source fingerprint
  `7a8caad7859edb532d7e7669bb243811a9a23d15081d49a3213890ba3e7ca980`,
  bounded report size 45,768 bytes, with 7 fixtures, 10 scenarios, 8
  components, and no failed mandatory IDs.
- 2026-07-29: final review remediation pins the canonical hash independently,
  scans staged blobs plus checkpoint history, fingerprints the full test
  boundary, and captures bounded artifact scans from every temporary black-box
  repository before cleanup. Final qualification PASS: source fingerprint
  `2fe2e34a7d48e3e23adce04ebf377159a540857a704ee41d7341de24508975d0`,
  report size 52,669 bytes, 16 fixture targets, 14 tracked artifact paths, 33
  artifact revisions, and no failed mandatory IDs.
- 2026-07-29: deduplication follow-up preserves the strongest black-box seam
  and maps shared test evidence back to every mandatory manifest identity;
  bootstrap `NOT_APPLICABLE` now requires working Git plus positively absent
  `.git` metadata. Requalification PASS: source fingerprint
  `72581854300ae4662dbfb9dc36cac31dff93239e78bbe055fe9f7d40e1601704`,
  report size 53,004 bytes, and the exact 17 required fixture/scenario scan
  identities including `remote-divergence`.
- 2026-07-29: final independent Standards Review PASS and Spec Review PASS.
  Full `npm.cmd run verify` PASS: typecheck, 241/241 unit tests, 1/1 install
  smoke, and 1/1 Windows platform smoke.
