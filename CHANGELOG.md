# Changelog

## Unreleased

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
