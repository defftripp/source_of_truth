# Capability Registry Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a source-of-truth capability registry that records required external skills, MCP servers, plugins, safety rules and local audit commands for Codex.

**Architecture:** Keep the global Codex rules lean. Put heavy capability policy in repo registries, rules and scripts. The audit script is read-only and reports missing required capabilities without editing `~/.codex`.

**Tech Stack:** Markdown, JSON, PowerShell, Hugo docs check.

---

## File Structure

- Create `.cursor/plans/2026-06-26-capability-registry-layer.md`: short working tracker.
- Create `registries/capabilities.json`: machine-readable required/recommended/task-required capabilities.
- Create `registries/capabilities.md`: human explanation of the capability tiers.
- Create `registries/codex-global.json`: expected global Codex files, MCP servers and plugin state.
- Create `rules/codex-global-editing.mdc`: safety policy for reading/proposing/writing `~/.codex`.
- Create `rules/skill-installation.mdc`: policy for required skills and degraded mode.
- Create `scripts/audit_codex_capabilities.ps1`: read-only audit of `~/.codex` against the registry.
- Modify `README.md`: link the capability registry from the project entrypoint.
- Modify `docs/superpowers/specs/2026-06-26-source-of-truth-onboarding-skill-design.md`: add required external capability section.

## Tasks

### Task 1: Plan Artifact

**Files:**
- Create: `.cursor/plans/2026-06-26-capability-registry-layer.md`
- Create: `docs/superpowers/plans/2026-06-26-capability-registry-layer.md`

- [x] **Step 1: Create concise implementation plan files.**

### Task 2: Capability Registries

**Files:**
- Create: `registries/capabilities.json`
- Create: `registries/capabilities.md`
- Create: `registries/codex-global.json`

- [x] **Step 1: Add required capabilities.**

Required capabilities include Superpowers, Lazyweb, Context7, Browser/Chrome/Playwright, system skills, personal style/rules helpers, security baseline and source-of-truth-owned skills.

- [x] **Step 2: Add recommended and task-required capabilities.**

Recommended capabilities can be absent without blocking all work. Task-required capabilities block only matching task families.

### Task 3: Safety Rules

**Files:**
- Create: `rules/codex-global-editing.mdc`
- Create: `rules/skill-installation.mdc`

- [x] **Step 1: Add global Codex editing rule.**

Rule must require explicit user permission, backup, scoped diff and evidence before writing to `~/.codex`.

- [x] **Step 2: Add skill installation rule.**

Rule must define required, recommended and task-required capability tiers plus degraded mode.

### Task 4: Audit Script

**Files:**
- Create: `scripts/audit_codex_capabilities.ps1`

- [x] **Step 1: Add read-only PowerShell audit.**

Script reads `registries/capabilities.json`, checks local Codex skills, `.agents` skills, `config.toml` MCP/plugin entries and reports PASS/WARN/BLOCKED.

- [x] **Step 2: Smoke run script.**

Run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\audit_codex_capabilities.ps1
```

Expected: a readable audit report, no file writes.

### Task 5: Documentation Links

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-06-26-source-of-truth-onboarding-skill-design.md`

- [x] **Step 1: Link capability registry from README.**

- [x] **Step 2: Add required external capability section to onboarding design spec.**

### Task 6: Verification

**Files:**
- No source edits unless checks expose a concrete issue.

- [x] **Step 1: Run repository check.**

Run:

```powershell
npm run check
```

Expected: Hugo build succeeds.

- [x] **Step 2: Run whitespace check.**

Run:

```powershell
git diff --check
```

Expected: no whitespace errors.
