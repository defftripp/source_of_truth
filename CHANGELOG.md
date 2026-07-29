# Changelog

## Unreleased

- Add a reproducible V1 qualification command with a pinned black-box fixture,
  adversarial scenario, and component coverage manifest; any mandatory failure,
  missing Windows evidence, or redaction finding blocks the bounded report.
- Add runtime 1.2.0 Capability Qualification behind a concrete evidence-bound
  gap. Reject incomplete or unsafe supply-chain candidates, install only into a
  pinned project-local namespace under a crash-safe lock and pre-publication
  journal, bind non-executing content checks to gap evidence, let Doctor detect
  installed-file drift, roll back failed checks exactly, and persist Human
  Gates before global writes, credentials, write-enabled MCP, or paid probes.
- Reject sequential and parallel Worker contract violations before checkpoint,
  including out-of-lease changes, forbidden commits, explicit subagent attempts,
  partial results, ticket/code conflicts, unrelated dirtiness, and failing or
  stale targeted evidence. Persist only bounded diagnostic evidence, restore the
  accepted state, and require a fresh Context Packet on corrected retry.
- Bound Planner/Advisor plan review to two evidence-bearing rounds, require
  actionable `REVISE` findings for coverage, verification, dependency,
  assumption, and scope defects, and terminate unresolved plans at a durable
  Human Gate with `BLOCKED` state before Worker execution.
- Add an explicit managed Project Runtime upgrade/rollback flow that blocks
  active feature runs, records the full pinned upstream diff, validates
  candidate compatibility before mutation, and reruns Doctor plus smoke after
  a local upgrade checkpoint.
- Require an exact hash-bound Migration Manifest Human Gate for runtime removal
  or protected/local ownership rewrites; preserve the prior runtime and project
  state in a bounded external rollback journal without touching Application
  Core, global installation, feature execution, push, merge, or deployment.
- Add a read-only Runtime Doctor that distinguishes healthy Prepared Projects,
  missing or drifted runtime files, unfinished runs, and Remote Checkpoint Sync
  problems with READY, DEGRADED, or BLOCKED evidence.
- Add explicit repair dry-run and policy-validated repair for unprotected
  manifest-owned generated files using checksum-matched Git blobs; preserve
  protected, user-owned, and local-override contents behind Human Gates.
- Preserve durable checkpoints and deterministic frontiers through repair, then
  resume interrupted STANDARD work without chat history; reject missing
  evidence fail-closed.
- Introduce runtime manifest schema 2 / runtime 1.1.0 for explicit repair
  ownership while retaining read-only Doctor compatibility with complete legacy
  schema 1 / runtime 1.0.0 Prepared Projects.
- Bind automatic ownership to the committed manifest, confine repair paths
  against links and root escape, and require real Git/artifact proof before
  reporting an unfinished run as resumable.
- Execute the launcher-owned Doctor module without importing Target Project code,
  validate Run Artifact contracts/review hashes and DEEP manifest gates, and
  bind Remote Sync blockers to the durable local head.
- Fail closed on malformed graph/state evidence, require semantic and committed
  artifact proof, prove Human Gate remote sync separately, and pin the Target
  root plus same-volume repair ancestors across handle-safe replacement.
- Bind future ticket contracts to the latest durable checkpoint plan, validate
  terminal readiness and terminal Remote Sync gates, reject hidden Run Store
  entries, and bind DEEP manifests to their canonical approved hash.
- Pin repair authorization to one committed HEAD ownership contract and use a
  trusted Windows helper that pins deny-delete directory handles, validates the
  exact regular non-reparse staging handle and final path, and keeps the renamed
  handle pinned through post-repair verification.
- Require current Remote Sync evidence whenever a durable Human Gate,
  checkpoint, readiness, or terminal artifact proves sync was enabled; missing
  evidence remains BLOCKED.
- Run Solution Fitness only for explicit repository-precedent, dependency-API,
  or substantial-complexity triggers; ordinary local work invokes no provider
  and persists no Fitness artifact.
- Enforce registered read-only provider ordering from installed-version
  detection through version-matched primary documentation, evidence-bearing
  comparison, and deterministic verdict validation without embedding network
  calls in policy code.
- Reject mismatched documentation and unsupported reviewer opinion, distinguish
  evidence-sufficient Context7 degradation from missing high-risk evidence, and
  route absurd custom solutions through corrective tickets followed by fresh
  Fitness, dual reviews, and full verification.
- Convert every blocking Spec or Quality review finding into one bounded
  corrective Execution Ticket linked in the existing durable graph, then run
  those tickets blockers-first through the shared Worker, targeted
  verification, and Root checkpoint lifecycle.
- Preserve original review artifacts byte-for-byte, publish numbered fresh
  reruns after corrections, reject generic PASS results, and require coverage,
  evidence, unverified areas, and bounded finding contracts from independent
  role contexts.
- Require fresh review and full relevant verification fingerprints after the
  last code change; instrumental failures and stale evidence remain BLOCKED and
  cannot reach READY_FOR_HUMAN.
- Guard DEEP parallelism with a dedicated validator that requires pairwise
  disjoint Write Leases, declared contract IDs, and Worker worktrees; serialize
  any overlapping or unproven frontier.
- Run eligible DEEP Workers concurrently in separate detached worktrees while
  Root accepts results deterministically, targets every integration before its
  checkpoint, and runs full relevant verification after the last result.
- Block nested Worker commit/integration attempts and conflicting or divergent
  results with durable corrective work, no silent merge, and no change to the
  last accepted integration HEAD, `develop`, or `main`.
- Execute a minimal one-ticket DEEP lifecycle through linked domain evidence,
  canonical CONTEXT/ADR decision records, migration and rollback contracts,
  exact hash-bound and Write-Lease-bound durable Human Gate approval,
  independent reviews, final instrumental verification, and READY_FOR_HUMAN.
- Make security, payments, destructive migrations, and other named
  hard-to-reverse profiles deterministic DEEP floors; block missing high-risk
  evidence and changed destructive scope before Worker.
- Stop ambiguous STANDARD runs after repository research at one durable,
  recommendation-bearing Human Gate; resume the same request after an answer,
  update CONTEXT idempotently, and create ADRs only for surprising
  hard-to-reverse decisions.
- Publish an opt-in waiting decision-gate checkpoint so a fresh clone can resume
  before ticket planning, and require exhaustive repository-fact question audit
  metadata from Explorer.
- Bind mutable human answers separately from immutable run inputs, including
  Remote Checkpoint Sync settings, and use one compatible Human Gate artifact
  for decision and remote-divergence pauses.
- Add opt-in, fast-forward-only Remote Checkpoint Sync for the current Run Branch with durable evidence.
- Stop remote divergence at a non-terminal Human Gate and resume matching durable STANDARD runs from a fresh clone.
- Execute multi-ticket STANDARD graphs blockers-first with a deterministic frontier and one fresh Root checkpoint per vertical ticket.
- Persist ticket-specific Context Packets, exclusive Write Leases, graph progress, attempts, and checkpoint evidence so interrupted runs resume without chat history.
- Execute a one-ticket STANDARD lifecycle through repository research, spec-lite, complete Planner coverage, and a strict Advisor Gate.
- Constrain the STANDARD Worker to a bounded Context Packet and Write Lease while Root owns fresh verification and checkpoint commits.
- Run independent Spec and Quality reviews and reject stale ticket evidence before READY_FOR_HUMAN.
- Select FAST, STANDARD, or DEEP from a deterministic evidence-backed Task Profile without using file count.
- Keep small cross-file work on the complete FAST lifecycle and expose mode rationale without routine confirmation.
- Allow only evidenced Root mode escalation and reject routing below the deterministic hard floor.
- Apply Migration Manifests only with exact SHA-256 approval and source preflight.
- Add path-scoped one-time overrides, transactional rollback, and post-apply smoke validation.
- Add read-only legacy-project inventory and hash-bound Migration Manifest proposals.
- Protect sensitive, ambiguous, and deliberate local files before the Human Gate.
- Add explicit onboarding for a new Target Project and its Canonical Project Shell.
- Install a self-contained Project Runtime `1.0.0` with manifest and upstream pins.
- Delegate Engineering Runs to project-owned state and verify launcher/runtime isolation.

## 0.1.0 — 2026-07-20

- Add the explicit `$engineering-loop` Global Launcher skill.
- Add the deterministic, read-only Project Runtime readiness probe.
- Add installation, invocation, immutability, and Windows platform verification.
