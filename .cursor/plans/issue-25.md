# Issue #25 — Advisor revision gate

Baseline: `673c0d6a8174137b68d5a3133cce5e1944370cff`

## Routing

- Setup: ready through the repository's established GitHub tracker and
  `.cursor/plans/` contract; generic `docs/agents/` bootstrap remains outside
  this ticket.
- Task class: one ready, bounded implementation ticket; blocker #23 is closed.
- Flow: `start-work` -> `ask-matt` -> `implement` -> `tdd` -> `code-review`.
- Context: this fresh Issue #25 worktree only.
- Pre-agreed public seams: black-box Project Runtime invocation plus durable
  `advisor.json`, revision history, Human Gate, Run State Store, event ordering,
  and absence of Worker execution.

## Contract

1. Planner output is assessed before execution for unmapped acceptance
   criteria, missing verification, unsafe dependencies, unsupported
   assumptions, and scope expansion.
2. Advisor emits only a strict evidence-bound `APPROVED` or actionable `REVISE`
   contract. Generic feedback and fabricated approval are invalid.
3. A STANDARD run permits at most two Planner/Advisor evaluation rounds.
4. The second unresolved `REVISE` records the unresolved findings in a Human
   Gate, then terminates the Run State Store as `BLOCKED`; Worker never starts.
5. A corrected second-round plan may be approved and continue normally.

## Vertical TDD slices

1. [x] Each required negative plan reason produces deterministic Advisor
   `REVISE` findings through the black-box run seam.
2. [x] Generic or malformed Advisor feedback is rejected by the strict schema.
3. [x] A second-round corrected plan reaches normal execution.
4. [x] Two failed rounds create a durable Human Gate plus terminal `BLOCKED`
   state and prove zero Worker executions.
5. [x] Documentation and version log describe the bounded revision gate.
6. [x] Independent Standards and Spec reviews pass; final
   `npm.cmd run verify` passes.
7. [ ] Create exactly one local commit.

## Initial Write Lease

- `.cursor/plans/issue-25.md`
- `CHANGELOG.md`
- `README.md`
- `skills/engineering-loop/SKILL.md`
- `skills/engineering-loop/runtime/engine.mjs`
- `skills/engineering-loop/runtime/doctor-contracts.mjs`
- `skills/engineering-loop/runtime/methodology.md`
- `test/fixtures/standard-run/scripts/advisor.mjs`
- `test/fixtures/standard-run/scripts/planner.mjs`
- `test/unit/advisor-gate.test.mjs`
- `test/unit/runtime-doctor.test.mjs`
- `test/unit/standard-run.test.mjs`

Any expansion must be recorded here before editing the new path.

## Version log

- 2026-07-24: created the Issue #25 implementation boundary from clean `dev`;
  #23 is closed and #25 is the next blocker-first prerequisite for #36.
- 2026-07-24: completed the Advisor revision gate in vertical black-box slices.
  Five negative plan reasons produce actionable `REVISE`; generic feedback is
  rejected; a corrected second round reaches READY_FOR_HUMAN; two unresolved
  rounds persist a Human Gate and terminal BLOCKED state with zero Workers.
  Focused Advisor tests are 7/7 PASS and focused STANDARD regressions are 2/2
  PASS.
- 2026-07-24: independent Standards and Spec reviews are PASS with zero
  actionable findings. Final repository verification is the remaining gate.
- 2026-07-24: full verification exposed resumable STANDARD and runtime-doctor
  regressions because the new durable `advisor-rounds.json` artifact was not
  recognized by every artifact allowlist. The Write Lease now includes
  `doctor-contracts.mjs`; reviews must be repeated after the compatibility fix.
- 2026-07-24: repeat Standards review found legacy-checkpoint compatibility and
  strict Advisor-round audit validation gaps. The lease now includes
  `runtime-doctor.test.mjs` for a tamper regression; `advisor-rounds.json`
  remains optional for pre-#25 checkpoints and strict when present.
- 2026-07-24: final Standards and Spec re-reviews are PASS with zero actionable
  findings. Full `npm.cmd run verify` is PASS: typecheck, 207 unit tests,
  install smoke, and Windows platform smoke.
