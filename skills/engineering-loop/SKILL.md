---
name: engineering-loop
description: Explicit entrypoint for the Codex Engineering Loop. Probes whether the current Target Project has evidence of a pinned Project Runtime and stops at a readiness status.
disable-model-invocation: true
compatibility: Requires Node.js 20 or newer. Readiness probing is read-only and cross-platform.
metadata:
  short-description: Explicit Codex Engineering Loop launcher
---

# Engineering Loop

Run this launcher only when the user explicitly invokes `$engineering-loop`.
Do not infer invocation from a request that merely resembles engineering work.

## Readiness probe

1. Treat the current working directory as the Target Project unless the user
   explicitly names another target.
2. Resolve `scripts/readiness.mjs` relative to this `SKILL.md` directory.
3. Run it with the active Node.js executable:

   `node <skill-directory>/scripts/readiness.mjs --explicit --target <absolute-target-project>`

4. Read the JSON report from stdout and preserve its exact `status`, `checks`,
   and `nextAction` in the response.
5. If the status is `ONBOARDING_REQUIRED`, report the missing readiness
   evidence and stop.

Do not start onboarding or normalization. Do not install a Project Runtime.
Do not create, edit, move, or delete Target Project files. Those operations
require a later explicit workflow and are outside this launcher.

## Status contract

- `ONBOARDING_REQUIRED` (exit `0`): required Project Runtime evidence is absent
  or invalid; no mutation occurred.
- `READY` (exit `0`): the minimal pinned-runtime evidence is present; this
  launcher has completed its readiness-only responsibility.
- `BLOCKED` (exit `1`): the target cannot be inspected safely.
- `EXPLICIT_INVOCATION_REQUIRED` (exit `64`): the deterministic entrypoint was
  called without its explicit invocation guard; the probe did not run.
