# Issue #33 — Capability qualification after a proven gap

Baseline: `34782b5958db2e907e12dfa9b3722543c101b151`

## Routing

- Setup: the GitHub ticket is agent-ready and blocker #21 is closed.
- Task class: one ready blocker-first implementation ticket.
- Flow: `start-work` -> `ask-matt` -> `implement` -> `tdd` ->
  `code-review`.
- Context: fresh Issue #33 worktree only; qualification #36 remains blocked
  until this ticket is accepted.
- Primary seam: black-box Project Runtime invocation plus deterministic
  capability-policy contracts and project-tree snapshots.

## Contract

1. Capability discovery is absent unless a structured gap proves missing
   behavior and exhaustion of existing project/runtime capabilities.
2. Every external Skill, MCP, or CLI candidate is pinned and evaluated for
   provenance, source, license, permissions, scripts, maintenance, conflicts,
   and task fit before any installation.
3. Unknown source, conflicting instructions, unsafe scripts, or excessive
   permissions are rejected before install.
4. Automatic installation is restricted to an isolated project-local target,
   followed by a registered smoke check; any failure restores both the project
   tree and capability registry exactly.
5. Global writes, credentials, write-enabled MCP, and paid probes produce a
   durable Human Gate and never perform the external action without exact
   approval.

## Vertical TDD slices

1. [x] Ordinary FAST run has no capability discovery/install stages or
   artifacts.
2. [x] Gap schema rejects fashionable, vague, or unjustified discovery.
3. [x] Candidate qualification requires the full supply-chain evidence set.
4. [x] Adversarial candidates are rejected before filesystem mutation.
5. [x] Pinned project-local success and failing-smoke rollback are proven by
   black-box tree and registry snapshots.
6. [x] Trust/cost expansion produces a durable Human Gate without action.
7. [x] Runtime ownership, Doctor compatibility, documentation, and version log
   are updated.
8. [x] Independent Standards and Spec reviews plus full `npm.cmd run verify`
   pass.
9. [x] Create exactly one local commit.

## Initial Write Lease

- `.cursor/plans/issue-33.md`
- `CHANGELOG.md`
- `README.md`
- `skills/engineering-loop/SKILL.md`
- `skills/engineering-loop/runtime/capability-contracts.mjs`
- `skills/engineering-loop/runtime/doctor-contracts.mjs`
- `skills/engineering-loop/runtime/engine.mjs`
- `skills/engineering-loop/runtime/methodology.md`
- `skills/engineering-loop/runtime/upgrade-contracts.mjs`
- `skills/engineering-loop/scripts/shell.mjs`
- `test/fixtures/fast-run/`
- `test/smoke/install.test.mjs`
- `test/unit/capability-contracts.test.mjs`
- `test/unit/capability-qualification.test.mjs`
- `test/unit/fast-run.test.mjs`
- `test/unit/onboarding.test.mjs`
- `test/unit/runtime-doctor.test.mjs`
- `test/unit/runtime-upgrade.test.mjs`

Any expansion must be recorded here before editing the new path.

## Version log

- 2026-07-24: created the Issue #33 boundary from clean `dev`
  `34782b5958db2e907e12dfa9b3722543c101b151`; blocker #21 is closed and no
  concurrent Issue #33 Write Lease or worktree existed.
- 2026-07-28: implemented runtime 1.2.0 gap/candidate contracts, an explicit
  installed-runtime qualification command, checksum-pinned project-local
  installation, exact smoke rollback, bounded durable Human Gates, symlink
  confinement, runtime-owned non-executing smoke, and crash-recoverable
  publication journals.
- 2026-07-28: focused capability, FAST, onboarding, Doctor, and upgrade
  coverage passed (72 tests) before review hardening.
- 2026-07-28: first Standards/Spec review found executable-smoke network
  authority, pre-smoke publication, incomplete Human Gate hashing, Node 20
  incompatibility, portable-path aliases, and an under-structured gap proof.
  Hardening replaced executable smoke with a runtime-owned assertion, moved it
  before publication, added atomic journal recovery, hashes the canonical full
  trust request, rejects portable aliases, and binds the gap to a failed
  required-behavior contract.
- 2026-07-28: second Standards/Spec hardening added a crash-safe exclusive
  qualification lock, pre-temporary journals with exact recovery authority,
  copy-time checksum verification, canonical lowercase identities, bounded
  installed-file manifests, Doctor drift/link detection, and verification-bound
  non-executing package-content inspection.
- 2026-07-28: final review hardening made stale-lock takeover atomic, recovers
  bounded atomic-write remnants, resolves content assertions from the project
  verification registry, and makes Doctor enforce the full aggregate checksum,
  credential-free source, and exact permission contract.
- 2026-07-28: final Standards follow-up unified strict existing-registry and
  recovery validation, added coordinated-tamper rejection, bounded candidate
  workloads, and preserves every lock whose owner PID is still alive.
- 2026-07-28: recovery now validates both pre- and post-publication registries
  before mutation, forged current-registry evidence has no deletion authority,
  and copy-time buffer sizes re-enforce the bounded workload after validation.
- 2026-07-28: final Standards review PASS; final Spec review PASS; full
  `npm.cmd run verify` PASS (typecheck, 235 unit tests, install smoke, and
  platform smoke).
