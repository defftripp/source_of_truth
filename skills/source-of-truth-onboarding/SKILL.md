---
name: source-of-truth-onboarding
description: Use when a raw, empty, under-documented, or newly cloned project needs source-of-truth onboarding before implementation: repo inspection, interview, PRD/product direction, architecture, rules, skills registry, hooks, memory, first checkpoint, readiness audit, or READY_FOR_IMPLEMENTATION gate.
---

# Source-of-Truth Onboarding

## Core Rule

Do not start product implementation until the project has a usable operating layer and passes a readiness gate.

If the user gives an idea before the project is ready, say:

```text
Проект пока не готов к разработке. Сначала закрываю source-of-truth onboarding gate.
```

Small throwaway prototypes are allowed only when explicitly scoped outside production paths.

## Locate The Source Pack

Before writing broad changes, locate the canonical `source_of_truth` repo:

1. Prefer the current workspace if it contains `templates/project-starter/`, `registries/capabilities.json`, and `scripts/audit_project_readiness.ps1`.
2. If this skill is installed globally, read `references/install-state.md` when present for `source_repo`.
3. If the source repo cannot be found, ask for its path and stop before recreating templates by hand.

Use repo scripts and templates as the hands. This skill is the brain.

## Required First Pass

1. Read the target project's nearest `AGENTS.md` and memory/handoff files if they exist.
2. Inspect the target repo before writing: root files, app/source folders, docs, tests, scripts, build config, existing agent rules, memory/plans, generated artifacts, secrets risk, and git state.
3. Run read-only capability audit from the source repo when available:

```powershell
npm run audit:capabilities
```

4. Run read-only project readiness audit when available:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\audit_project_readiness.ps1 -TargetPath <target-project>
```

If required external capabilities are missing, mark the affected branch `DEGRADED` or `BLOCKED`. Do not pretend a missing skill, MCP, plugin, browser, or docs tool was used.

## Modes

### Manual Onboarding

Use when the user wants to prepare a new project or convert a messy repo into a governed project.

Flow:

```text
inspect repo
-> create missing safe skeleton
-> interview only for decisions that cannot be inferred
-> write product direction / PRD
-> write architecture
-> write rules, skills registry, hooks and memory
-> create first checkpoint
-> run readiness audit
-> write evidence
```

### Auto-Detect

Use when the user asks what is missing.

Flow:

```text
inspect -> audit -> gap report -> proposed patch list
```

Do not broad-rewrite an existing repo in auto-detect mode unless the user asks to apply the patch.

## Required Outputs

For a fully onboarded project, create or preserve equivalents for:

- `AGENTS.md`
- `docs/DECISIONS.md`
- `docs/PRODUCT_DIRECTION.md` or `docs/PRD.md`
- `docs/ARCHITECTURE.md`
- `docs/SKILLS.md` or `develop/SKILL_REGISTRY.md`
- `memory/MEMORY.md`
- `memory/SESSION-HANDOFF.md`
- `memory/QUESTIONS.md`
- `memory/LESSONS.md`
- `develop/README.md`
- `develop/IMPLEMENTATION_PLAN.md`
- `develop/LOCAL_RUNBOOK.md`
- `develop/TODO.md`
- `develop/CHECKPOINT.md`
- `develop/stages/**`
- `develop/artifacts/**`
- `rules/**`
- `hooks/**`
- `agents/README.md`
- `work/`
- `archive/`

Use `templates/project-starter/` for missing skeleton files. Preserve existing project files and merge conservatively.

## Interview Rules

Ask only for decisions that cannot be safely inferred from local files.

Capture unanswered items in `memory/QUESTIONS.md`:

- product goal;
- users;
- scope and anti-scope;
- stack constraints;
- data/security constraints;
- external services and credentials;
- preferred agent communication style;
- first milestone;
- definition of done.

Blocking questions prevent `READY_FOR_IMPLEMENTATION`. Non-blocking questions become assumptions in product direction, architecture, or checkpoint specs.

## Readiness Gate

Use these statuses:

- `READY_FOR_IMPLEMENTATION`: required operating files exist, first checkpoint is bounded, verification path is known, and blocking questions are closed.
- `NEEDS_CONTEXT`: structure exists, but product/architecture/workflow decisions are missing.
- `BLOCKED`: secrets, provider access, payments, deploy approval, or hard policy decisions are required.

Before granting `READY_FOR_IMPLEMENTATION`, read `references/readiness-checklist.md`.

## Evidence

Write onboarding evidence under:

```text
develop/artifacts/onboarding/source-of-truth-onboarding.md
```

Include:

- prompt or trigger;
- source pack path;
- installed skill path/version when known;
- target project path;
- files inspected;
- files created or changed;
- interview answers used;
- unresolved questions;
- verification commands and results;
- readiness checklist;
- final status.

Do not include secrets, auth files, raw provider payloads, signed URLs, payment data, or private customer data.

## Install And Update Policy

Repo-owned skills may be installed or updated from this repo when the user asks or when onboarding requires the missing/old skill.

Global Codex writes require the exact approval phrase from the source repo policy:

```text
разрешаю обновить глобалку Codex
```

Without that approval, stop at a proposed command/diff. Use temp Codex homes for smoke tests.

Preferred install command:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install_codex_skill.ps1 -SkillName source-of-truth-onboarding
```

## Common Mistakes

| Mistake | Correct behavior |
| --- | --- |
| Start coding from a product idea in an empty repo | Write the operating layer and first checkpoint first |
| Copy templates over existing files blindly | Merge conservatively and preserve project-local decisions |
| Treat public `content/` pages as executable canon | Use `skills/`, `scripts/`, `templates/`, `rules/`, and `registries/` |
| Paste installed skill catalogs into global `AGENTS.md` | Keep global rules lean and use registries |
| Mark ready with open blocking questions | Use `NEEDS_CONTEXT` or `BLOCKED` |
| Edit `~/.codex` without approval | Stop at proposed change until approval phrase is given |
