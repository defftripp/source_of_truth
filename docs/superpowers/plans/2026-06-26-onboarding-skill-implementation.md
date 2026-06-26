# Source-of-Truth Onboarding Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first executable source-of-truth onboarding pack: repo skill, safe Codex install script, project readiness audit, and starter-template operating layer.

**Architecture:** `skills/source-of-truth-onboarding/SKILL.md` is the process brain. PowerShell scripts are deterministic hands for install/audit. `templates/project-starter/**` is the project skeleton copied into target repos. Registries and docs define capability policy and safety gates.

**Tech Stack:** Markdown skills/rules/templates, PowerShell scripts, Hugo docs, npm script verification.

---

## File Structure

- Create `skills/source-of-truth-onboarding/SKILL.md`: Codex skill workflow for project inspection, interview, docs/rules setup, readiness gate and evidence.
- Create `skills/source-of-truth-onboarding/references/readiness-checklist.md`: compact checklist loaded only during onboarding/audit.
- Create `scripts/install_codex_skill.ps1`: installs or updates a repo-owned skill into Codex home with backup and evidence.
- Create `scripts/audit_project_readiness.ps1`: read-only target project readiness audit.
- Modify `package.json`: add scripts for install/readiness audit smoke usage.
- Modify `registries/capabilities.json` and `registries/capabilities.md`: move onboarding skill source lifecycle from planned toward active source, while installed copy remains user-controlled.
- Modify starter template under `templates/project-starter/**`: add product/architecture/skills docs, memory additions, rules, hooks and agents README.
- Modify root `rules/**` and `hooks/**`: add missing reusable rules and pre-implementation hook.
- Modify `README.md`, `AGENTS.md`, `docs/DECISIONS.md`, memory files: document current implementation state and next use.

## Tasks

### Task 1: RED Smoke Checks

**Files:**
- No edits.

- [ ] Run a PowerShell assertion that currently fails because the repo skill, install script, readiness script and expanded starter files do not exist.
- [ ] Record expected missing paths in command output.

### Task 2: Repo Skill

**Files:**
- Create `skills/source-of-truth-onboarding/SKILL.md`
- Create `skills/source-of-truth-onboarding/references/readiness-checklist.md`

- [ ] Write frontmatter with name `source-of-truth-onboarding`.
- [ ] Keep description trigger-focused: raw/empty project, missing project canon, PRD/architecture/rules/skills/readiness gate.
- [ ] Include mandatory read order, audit flow, interview flow, file outputs, install/update policy, readiness statuses and evidence contract.
- [ ] Link readiness checklist as a conditional reference.

### Task 3: Scripts

**Files:**
- Create `scripts/install_codex_skill.ps1`
- Create `scripts/audit_project_readiness.ps1`
- Modify `package.json`

- [ ] Implement install script with `-SkillName`, `-CodexHome`, `-Force`, `-WhatIfOnly` and backup before overwrite.
- [ ] Implement readiness script with `-TargetPath`, required file checks, optional warnings and exit codes: `0` ready, `1` needs context, `2` blocked.
- [ ] Add npm scripts for capability audit and readiness audit convenience.

### Task 4: Starter Expansion

**Files:**
- Modify `templates/project-starter/**`

- [ ] Add product docs: `docs/PRODUCT_DIRECTION.md`, `docs/ARCHITECTURE.md`, `docs/SKILLS.md`.
- [ ] Add memory docs: `memory/QUESTIONS.md`, `memory/LESSONS.md`.
- [ ] Add project rules: `rules/agent-workflow.mdc`, `rules/project-structure.mdc`, `rules/testing-and-evidence.mdc`, `rules/skill-installation.mdc`, `rules/no-overcoding.mdc`.
- [ ] Add hooks: `hooks/README.md`, `hooks/session-start.md`, `hooks/pre-implementation-check.md`, `hooks/fix-to-rule.md`.
- [ ] Add `agents/README.md`.
- [ ] Update template README and AGENTS read order.

### Task 5: Root Canon Sync

**Files:**
- Create root missing rules/hooks.
- Modify `README.md`, `AGENTS.md`, `docs/DECISIONS.md`, `registries/**`, `memory/**`.

- [ ] Document onboarding skill invocation.
- [ ] Record decision that repo skill is canonical source and install is explicit/safe.
- [ ] Update memory active checkpoint to this implementation, not the older Russian localization checkpoint.

### Task 6: GREEN Verification

**Files:**
- No edits unless checks reveal issues.

- [ ] Run install script smoke into a temporary Codex home.
- [ ] Run readiness audit against an empty temporary project and expect not ready.
- [ ] Run bootstrap into a temporary project, then readiness audit and expect ready or named non-blocking warnings.
- [ ] Run `npm run audit:capabilities`.
- [ ] Run `npm run check`.
- [ ] Run `git diff --check`.

## Self-Review

- Spec coverage: skill source, install/update script, readiness audit, starter expansion, capability registry, evidence and docs are covered.
- Placeholder scan: this plan intentionally names exact target files and commands.
- Risk: global Codex writes stay gated. Smoke tests use a temporary Codex home unless user explicitly approves global update.
