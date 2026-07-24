# Issue #27 — Worker contract rejection

Baseline: `c1bc4ed1d6c43b3b78080a84b71b9fd84e2476af`

## Routing

- Setup: repository and GitHub tracker are ready; blocker #26 is closed.
- Task class: one ready blocker-first implementation ticket.
- Flow: `start-work` -> `ask-matt` -> `implement` -> `tdd` ->
  `code-review`.
- Context: fresh Issue #27 worktree only; #33 remains sequential and outside
  this Write Lease.
- Primary seam: black-box Project Runtime invocation and durable Run Artifacts,
  Git refs, checkpoint absence, fresh Context Packets, and terminal state.

## Contract

1. Root rejects Worker output that escapes the Write Lease, changes Git HEAD,
   attempts subagent spawning, returns partial work, conflicts with the ticket,
   touches unrelated dirty state, or relies on stale/failing targeted evidence.
2. Rejection preserves the accepted Run Branch without a Checkpoint Commit and
   persists a bounded diagnostic artifact containing no raw tool logs, secrets,
   or Worker transcript.
3. Every rejection is explicit and evidence-bound; optimistic completion is
   impossible.
4. Retrying the same ticket after correction creates a fresh bounded Context
   Packet and reaches a checkpoint only with fresh green evidence.

## Vertical TDD slices

1. [x] Scope expansion, Worker commit, and subagent-spawn attempts are rejected
   before Root integration.
2. [x] Partial work and ticket/code conflict become explicit blocking findings.
3. [x] Unrelated dirtiness and stale/failing targeted evidence prevent a
   Checkpoint Commit.
4. [x] Diagnostic artifact passes allow/deny scanning and excludes raw output,
   secrets, and transcript content.
5. [x] Recovery retries the same ticket with a fresh Context Packet and creates
   a checkpoint only after fresh verification.
6. [x] Documentation and version log describe the rejection/recovery contract.
7. [x] Independent Standards and Spec reviews plus full `npm.cmd run verify`
   pass.
8. [x] Create exactly one local commit.

## Initial Write Lease

- `.cursor/plans/issue-27.md`
- `CHANGELOG.md`
- `README.md`
- `skills/engineering-loop/SKILL.md`
- `skills/engineering-loop/runtime/engine.mjs`
- `skills/engineering-loop/runtime/doctor-contracts.mjs`
- `skills/engineering-loop/runtime/methodology.md`
- `test/fixtures/standard-run/`
- `test/unit/worker-contract-rejection.test.mjs`
- `test/unit/standard-run.test.mjs`
- `test/unit/deep-parallel-run.test.mjs`

Any expansion must be recorded here before editing the new path.

## Version log

- 2026-07-24: created the Issue #27 boundary from clean `dev`; blocker #26 is
  closed, #27 is ready, and no concurrent #33 Write Lease exists.
- 2026-07-24: expanded the lease to `doctor-contracts.mjs` so Runtime Doctor
  recognizes and strictly validates terminal Worker rejection evidence instead
  of misclassifying it as review-correction history.
- 2026-07-24: completed seven black-box rejection/recovery scenarios. Scope,
  commit, subagent-attempt, partial, ticket/code-conflict, and failing targeted
  evidence stop before checkpoint with bounded diagnostics; a corrected retry
  reaches READY_FOR_HUMAN with a fresh Context Packet.
- 2026-07-24: review hardening uses a distinct `worker-rejection.json`, binds
  its accepted HEAD to Doctor's durable Git proof, sanitizes leaked paths, and
  rechecks full-tree scope plus the staged lease after targeted verification.
  Nine focused black-box rejection/recovery scenarios pass, including verifier
  scope leakage, staged stale evidence, and tampered accepted-HEAD evidence.
- 2026-07-24: expanded the test lease to the existing DEEP Worker rejection
  assertions after separating their diagnostic artifact from review corrective
  history. Final hardening also binds targeted verification to the accepted
  pre-verification Worker lease fingerprint.
- 2026-07-24: independent Standards and Spec reviews passed with no actionable
  findings. Full `npm.cmd run verify` passed: typecheck, 217 unit tests,
  install smoke, and platform smoke.
