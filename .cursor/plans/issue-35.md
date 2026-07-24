# Issue #35 — Managed Project Runtime upgrade

Baseline: `024bd375b291a8d978de1de8d96dec149005d30e`

## Routing

- Setup: ready through this repository's established GitHub issue tracker and
  `.cursor/plans/` implementation contract. Adding the generic `docs/agents/`
  bootstrap is outside this ticket.
- Task class: one ready, multi-session implementation ticket.
- Flow: `start-work` -> `ask-matt` -> `implement` -> `tdd` -> `code-review`.
- Context: this fresh Issue #35 worktree only.
- Next gate: every acceptance criterion in #35 has black-box evidence, both
  fixed-point reviews pass, and full repository verification passes before the
  single local commit.

## Contract decisions fixed by #16/#18/#34/#35

1. Upgrade is an explicit Global Launcher operation. It consumes only the
   candidate runtime shipped beside that launcher; it does not accept arbitrary
   provider code, install anything globally, or start a feature run.
2. The current installed runtime remains the accepted state until candidate
   provenance and compatibility checks pass. Candidate validation occurs in an
   isolated temporary Target Project before target mutation.
3. A non-terminal Engineering Run is a hard pre-mutation blocker. The existing
   Doctor durable-run diagnosis is the source of truth.
4. The candidate runtime manifest and Upstream Adoption Matrix are pinned,
   schema-valid, checksummed, and diffed against the installed contracts.
5. Removing a runtime path or crossing an ownership/protection boundary creates
   a hash-bound upgrade Migration Manifest and Human Gate. Only the exact hash
   may authorize that scope.
6. Successful application is transactional across runtime-owned files,
   manifest, adoption matrix, and project runtime state. Post-apply Doctor and
   registered smoke must both be healthy; otherwise the transaction rolls back.
7. The returned rollback token restores the exact previous runtime version,
   state, and runtime bytes. Application Core hashes are never part of the write
   set and must remain identical.

## Confirmed public testing seams

The GitHub ticket already fixes these seams; no additional user decision is
required:

1. Black-box `readiness.mjs --explicit --upgrade --target <project>` and
   `--upgrade-rollback <token>` invocation, observing JSON, exit status,
   Git/tree snapshots, and the installed runtime version.
2. Launcher-owned deterministic upgrade contract module for candidate
   provenance, compatibility, conflict manifest hashing, transaction planning,
   and rollback reports.
3. Existing Doctor/registered-smoke boundary for preflight and post-apply
   health.
4. Upstream Adoption Matrix and runtime manifest validators as the provenance
   and ownership boundary.

## Vertical TDD slices

1. [x] RED/GREEN: an active non-terminal Engineering Run returns BLOCKED before
   any target byte or ref changes.
2. [x] RED/GREEN: the proposal reports the exact installed-to-candidate runtime
   and upstream revision/checksum/license/adoption/local-delta diff.
3. [x] RED/GREEN: failing isolated compatibility leaves installed version,
   checksums, refs, and tree unchanged.
4. [x] RED/GREEN: conflicting/removal scope returns a hash-bound Human Gate;
   missing or wrong approval cannot mutate the target.
5. [x] RED/GREEN: a compatible non-conflicting candidate applies transactionally
   and post-upgrade Doctor plus registered smoke report a healthy Prepared
   Project.
6. [x] RED/GREEN: explicit rollback restores prior runtime/state hashes and
   preserves Application Core plus application-test behavior.
7. [x] RED/GREEN: permission/event evidence proves no global installation,
   feature execution, force push, merge, or deployment.
8. [x] Update launcher/runtime documentation and version log.
9. [x] Run focused tests and typecheck, independent Standards+Spec reviews, then
   final `npm.cmd run verify`.
10. [ ] Create exactly one local commit.

## Initial Write Lease

- `.cursor/plans/issue-35.md`
- `CHANGELOG.md`
- `README.md`
- `skills/engineering-loop/SKILL.md`
- `skills/engineering-loop/runtime/contracts.mjs`
- `skills/engineering-loop/runtime/upgrade-contracts.mjs`
- `skills/engineering-loop/runtime/methodology.md`
- `skills/engineering-loop/scripts/readiness.mjs`
- `skills/engineering-loop/scripts/shell.mjs`
- `test/smoke/install.test.mjs`
- `test/unit/contracts.test.mjs`
- `test/unit/metadata.test.mjs`
- `test/unit/runtime-upgrade.test.mjs`

Any necessary expansion must be minimal, recorded here before editing the new
path, and justified by a failing public verification seam.

## Version log

- 2026-07-24: created the Issue #35 implementation boundary at clean baseline
  `024bd37`; blockers #20 and #34 are completed. Routed the ready ticket through
  `start-work`/`ask-matt` to `implement`, fixed the black-box upgrade/rollback
  seams, and recorded the initial Write Lease before production edits.
- 2026-07-24: completed the first three vertical slices. Upgrade now blocks
  before mutation on a durable active run, dry-run reports the exact pinned
  runtime and Upstream Adoption Matrix diff, and launcher-owned candidate bytes
  must pass schema/provenance/checksum validation plus an isolated real smoke
  before target mutation. Focused upgrade tests are 3/3 PASS; typecheck is PASS.
- 2026-07-24: completed the managed transaction, Human Gate, rollback, and
  permission slices. Removal and protected/local rewrites produce a canonical
  exact-hash Migration Manifest; compatible upgrades create a local checkpoint,
  rerun Doctor plus real smoke, and return a bounded external rollback token.
  Rollback restores the prior committed runtime/state while Application Core,
  global home, and feature Run Store snapshots remain unchanged. The
  already-current candidate is read-only. Focused upgrade/metadata tests are
  9/9 PASS; typecheck and `git diff --check` are PASS.
- 2026-07-24: fixed-point review hardened the transaction boundary: the
  launcher owns candidate provenance; exact source hashes gate destructive
  actions; compatibility mirrors the approved target state; rollback journals
  are commit-bound and runtime-only; Git hooks, filters, signing, and executable
  shadowing are excluded; Windows swaps pin exact directory handles and fail
  closed on unsupported platforms. Spec review is PASS; focused tests are
  11/11 PASS; final Standards review and full verify remain.
- 2026-07-24: fixed-point Standards and Spec reviews are PASS with zero
  actionable findings. Final `npm.cmd run verify` is PASS: typecheck, 200 unit
  tests, global-install smoke, and Windows platform smoke.
