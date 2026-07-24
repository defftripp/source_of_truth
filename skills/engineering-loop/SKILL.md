---
name: engineering-loop
description: Explicit entrypoint for the Codex Engineering Loop. Probes readiness, diagnoses and safely repairs runtime drift, proposes and applies approved legacy normalization, prepares a new Target Project, and delegates Engineering Runs to its pinned project-local Runtime.
disable-model-invocation: true
compatibility: Requires Node.js 20 or newer. Readiness, Doctor, normalization proposals, and repair dry-runs are read-only. Repair is explicitly invoked and supported by the V1 safe-replacement contract on Windows; unsupported platforms fail closed. Apply, rollback, and onboarding require explicit invocation and are cross-platform.
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

   Stop at `NORMALIZATION_PROPOSED` and present its complete hash-bound Migration
   Manifest for Human Gate review.
6. If the user explicitly approves that exact manifest hash, save the manifest
   outside the Target Project and apply it with:

   `node <skill-directory>/scripts/readiness.mjs --explicit --apply-manifest <manifest.json> --approve-hash <sha256> --target <absolute-target-project>`

   Pass `--overrides <overrides.json>` only when the user explicitly approves
   those exact existing manifest paths and replacement actions. Preserve the
   returned rollback token.
7. If the user explicitly requests rollback, use:

   `node <skill-directory>/scripts/readiness.mjs --explicit --rollback <rollback-token> --target <absolute-target-project>`

8. If the status is `ONBOARDING_REQUIRED` and the user explicitly requested
   onboarding for a new Target Project, rerun with `--onboard`:

   `node <skill-directory>/scripts/readiness.mjs --explicit --onboard --target <absolute-target-project>`

9. If the user explicitly requests Runtime diagnosis, use:

   `node <skill-directory>/scripts/readiness.mjs --explicit --doctor --target <absolute-target-project>`

   Preserve every ownership, repair action, frontier, sync blocker, and evidence
   field. Doctor is read-only.
10. If the user explicitly requests a repair preview, use `--repair --dry-run`.
    If they explicitly authorize the reported automatic repair, rerun with
    `--repair`. Automatic repair also requires committed manifest ownership,
    a checksum-matched Git source, and a link-free path confined to the Target
    Project. Safe replacement pins the destination namespace; unsupported
    platforms fail closed. Never turn a Human Gate into repair authority.
11. If the status is `READY`, delegate the Engineering Run with `--run`:

   `node <skill-directory>/scripts/readiness.mjs --explicit --run --target <absolute-target-project>`

The delegated executable must be the installed
`.engineering/runtime/engine.mjs`. Never replace it with files from the Global
Launcher. Never apply a manifest whose approved hash or current source hashes
fail preflight.

## Status contract

- `ONBOARDING_REQUIRED` (exit `0`): required Project Runtime evidence is absent
  or invalid; no mutation occurred.
- `READY` (exit `0`): the minimal pinned-runtime evidence is present; this
  launcher can delegate to the project-local Runtime.
- `DEGRADED` (exit `0`): Doctor found evidence-backed repairable drift or a
  resumable unfinished run; the report names the allowed next action.
- `PREPARED_PROJECT` (exit `0`): onboarding installed the Canonical Project
  Shell and the project-local Runtime passed its registered smoke verification.
- `NORMALIZATION_PROPOSED` (exit `0`): a deterministic Migration Manifest was
  produced without mutation and is waiting at a Human Gate.
- `NORMALIZATION_ROLLED_BACK` (exit `0`): the transaction token restored the
  pre-normalization project tree.
- `BLOCKED` (exit `1`): the target cannot be inspected safely, required
  evidence is insufficient, Remote Checkpoint Sync needs a Human Gate, or
  ownership forbids automatic repair.
- `EXPLICIT_INVOCATION_REQUIRED` (exit `64`): the deterministic entrypoint was
  called without its explicit invocation guard; the probe did not run.
