---
name: engineering-loop
description: Explicit entrypoint for the Codex Engineering Loop. Probes readiness, proposes safe legacy normalization, prepares a new Target Project when explicitly requested, and delegates Engineering Runs to its pinned project-local Runtime.
disable-model-invocation: true
compatibility: Requires Node.js 20 or newer. Readiness and normalization proposals are read-only; new-project onboarding is explicit and cross-platform.
metadata:
  short-description: Explicit Codex Engineering Loop launcher
---

# Engineering Loop

Run this launcher only when the user explicitly invokes `$engineering-loop`.
Do not infer invocation from a request that merely resembles engineering work.

## Entry flow

1. Treat the current working directory as the Target Project unless the user
   explicitly names another target.
2. Resolve `scripts/readiness.mjs` relative to this `SKILL.md` directory.
3. Run it with the active Node.js executable:

   `node <skill-directory>/scripts/readiness.mjs --explicit --target <absolute-target-project>`

4. Read the JSON report from stdout and preserve its exact status and evidence.
5. If the user explicitly requested a legacy-project normalization proposal,
   rerun with `--normalize`:

   `node <skill-directory>/scripts/readiness.mjs --explicit --normalize --target <absolute-target-project>`

   Stop at `NORMALIZATION_PROPOSED`. Present its complete hash-bound Migration
   Manifest for Human Gate review; do not apply any action in this workflow.
6. If the status is `ONBOARDING_REQUIRED` and the user explicitly requested
   onboarding for a new Target Project, rerun with `--onboard`:

   `node <skill-directory>/scripts/readiness.mjs --explicit --onboard --target <absolute-target-project>`

7. If the status is `READY`, delegate the Engineering Run with `--run`:

   `node <skill-directory>/scripts/readiness.mjs --explicit --run --target <absolute-target-project>`

The delegated executable must be the installed
`.engineering/runtime/engine.mjs`. Never replace it with files from the Global
Launcher. Applying a Migration Manifest, overrides, rollback, and changes to an
existing `.engineering` control plane are outside this workflow.

## Status contract

- `ONBOARDING_REQUIRED` (exit `0`): required Project Runtime evidence is absent
  or invalid; no mutation occurred.
- `READY` (exit `0`): the minimal pinned-runtime evidence is present; this
  launcher can delegate to the project-local Runtime.
- `PREPARED_PROJECT` (exit `0`): onboarding installed the Canonical Project
  Shell and the project-local Runtime passed its registered smoke verification.
- `NORMALIZATION_PROPOSED` (exit `0`): a deterministic Migration Manifest was
  produced without mutation and is waiting at a Human Gate.
- `BLOCKED` (exit `1`): the target cannot be inspected safely.
- `EXPLICIT_INVOCATION_REQUIRED` (exit `64`): the deterministic entrypoint was
  called without its explicit invocation guard; the probe did not run.
