# Evidence: Source-of-Truth Onboarding Automation

Status: DONE_WITH_CONCERNS
Date: 2026-06-26

## Input

- User asked to implement the next patch set after a folder-by-folder audit.
- Direction: skill is the process brain; scripts/templates are the hands.

## Scope

- Create repo-owned onboarding skill.
- Add safe install/update script for repo-owned skill.
- Add read-only project readiness audit.
- Expand starter template with docs, skills registry, rules, hooks, agents and memory additions.
- Bring this repo itself closer to its required operating canon.
- Update registries, README, decisions and memory.

## Anti-Scope

- No real writes to `~/.codex`.
- No broad MCP/plugin installation.
- No production app implementation.
- No GitHub Issues/Projects setup.

## Changes

- Added `skills/source-of-truth-onboarding/SKILL.md`.
- Added `skills/source-of-truth-onboarding/references/readiness-checklist.md`.
- Added `scripts/install_codex_skill.ps1`.
- Added `scripts/audit_project_readiness.ps1`.
- Expanded `templates/project-starter/**` with product docs, architecture, skills registry, rules, hooks, agents README, questions and lessons.
- Added root docs: `docs/PRODUCT_DIRECTION.md`, `docs/ARCHITECTURE.md`, `docs/SKILLS.md`.
- Added root execution layer under `develop/**`.
- Added root memory: `memory/QUESTIONS.md`, `memory/LESSONS.md`.
- Added root rules and hook: `project-structure`, `testing-and-evidence`, `no-overcoding`, `pre-implementation-check`.
- Updated capability registry: source skill is active; installed global copy is recommended/user-gated.
- Updated README, AGENTS, decisions and handoff.

## Verification

| Check | Result | Notes |
| --- | --- | --- |
| RED smoke before implementation | PASS | Missing skill/scripts/template files were detected before implementation. |
| Temp Codex home install smoke | PASS | Installed skill to `output/codex-home-smoke-onboarding`; wrote evidence under `output/install-evidence/`. |
| Empty project readiness audit | PASS | Returned expected `NEEDS_CONTEXT` with missing files. |
| Bootstrap smoke + readiness audit | PASS | Expanded starter copied; unfilled template returned expected `NEEDS_CONTEXT`. |
| `npm run install:onboarding-skill:whatif` | PASS | Printed target real `~/.codex` path but wrote no files. |
| Pre-install `npm run audit:capabilities` | PASS_WITH_WARN | PASS=11, WARN=1 for user-gated installed copy, BLOCKED=0. |
| `npm run audit:readiness` | PASS_WITH_WARN | Root repo is `READY_FOR_IMPLEMENTATION`; warning only for generated `public/`. |
| `npm run check` | PASS | Hugo built 54 pages. |
| `git diff --check` | PASS_WITH_WARN | Only LF-to-CRLF normalization warnings. |
| Stale planned-gap scan | PASS | Old planned-missing text removed from active docs/memory. |
| Real Codex global install after approval | PASS | Installed to `C:\Users\deff3\.codex\skills\source-of-truth-onboarding`; backup not needed because target was missing. |
| Post-install `npm run audit:capabilities` | PASS | PASS=12, WARN=0, BLOCKED=0. |
| Post-install `npm run audit:readiness` | PASS_WITH_WARN | Root repo remains `READY_FOR_IMPLEMENTATION`; warning only for generated `public/`. |

## Artifacts

- Temp install: `output/codex-home-smoke-onboarding/`
- Temp install evidence: `output/install-evidence/`
- Real install evidence: `output/install-evidence/20260626-174420-source-of-truth-onboarding.md`
- Empty readiness smoke projects: `output/readiness-empty-*`
- Bootstrap smoke projects: `output/bootstrap-onboarding-*`

## Known Gaps

- Forward-testing the new skill with an independent subagent was not performed in this tool environment.
- Bootstrapped starter projects correctly remain `NEEDS_CONTEXT` until their placeholders and first checkpoint are filled.
- Hook enforcement remains text/checklist based; executable hook scripts are intentionally later.

## Next

- Forward-test `source-of-truth-onboarding` in a fresh session or subagent-capable environment.
- Use the onboarding skill on the first real raw project and promote any repeated gaps back into templates/rules/scripts.
