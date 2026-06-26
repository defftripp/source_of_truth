# Skills Registry

Status: active
Last updated: 2026-06-26

## Repo-Owned Skills

| Skill | Source | Installed path | Status | Update rule |
| --- | --- | --- | --- | --- |
| `source-of-truth-onboarding` | `skills/source-of-truth-onboarding/SKILL.md` | `~/.codex/skills/source-of-truth-onboarding/SKILL.md` | installed 2026-06-26 17:44 +03:00 | Update with `scripts/install_codex_skill.ps1` after explicit approval for global writes. |

## Required External Capabilities

The canonical list lives in:

- `registries/capabilities.json`
- `registries/capabilities.md`
- `registries/codex-global.json`

Current required capabilities include Superpowers, Lazyweb, Context7, browser/Chrome/Playwright tooling, system skills and personal rule helpers.

## Policy

- Do not paste the full installed skill catalog into global `AGENTS.md`.
- Use live Codex skill registry at session start.
- Use this file only for project-specific skill ownership and update rules.
- Missing required capabilities must be reported as `DEGRADED` or `BLOCKED`.
