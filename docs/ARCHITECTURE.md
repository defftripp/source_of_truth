# Architecture

Status: active
Last updated: 2026-06-26

## Layers

```text
source_of_truth
  -> skills/        process brain for agents
  -> scripts/       deterministic install/audit/bootstrap actions
  -> templates/     files copied into target projects
  -> registries/    required/recommended capabilities and global Codex policy
  -> rules/         concise reusable rules
  -> hooks/         prompt/checklist hooks
  -> playbooks/     reusable human-readable workflows
  -> content/       public explanation site
  -> develop/       current repo execution layer
  -> memory/        current state and handoff
```

## Runtime Flow

```text
target repo
  -> source-of-truth-onboarding skill
  -> inspect existing files
  -> bootstrap missing skeleton from templates
  -> interview only unsafe unknowns
  -> write product/architecture/workflow docs
  -> run readiness audit
  -> write evidence
```

## Boundaries

- `content/` is publishing material, not the operational source for agents.
- `templates/project-starter/` is the default copied skeleton.
- `scripts/` may perform deterministic file operations, but global writes stay gated.
- `registries/` defines external capabilities; global `AGENTS.md` remains lean.
- `develop/` tracks this repo's own active implementation work.

## Global Codex Safety

The repo may audit `~/.codex` read-only. It may write global Codex files only after the approval phrase:

```text
разрешаю обновить глобалку Codex
```

All global writes require backup, narrow target, verification and evidence.
