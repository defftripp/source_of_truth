# Capability registry layer

Prompt: пользователь подтвердил, что `source_of_truth` должен учитывать обязательные сторонние skills/MCP/plugins: Superpowers, Lazyweb, Context7, Browser/Chrome/Playwright, system skills, personal skills и security baseline. Нужно сначала поправить сам проект.

Started: 2026-06-26 15:35 +03:00

## Plan

- [x] Inspect current repo structure and global Codex setup.
- [x] Write implementation plan artifact.
- [x] Add `registries/` with machine-readable and human-readable capability registry.
- [x] Add rules for safe Codex global edits and skill installation.
- [x] Add local audit script for required capabilities.
- [x] Update README and onboarding design spec.
- [x] Run `npm run check`, `git diff --check`, and script smoke check.

## Version Log

- 2026-06-26 15:35 +03:00 - Created plan from confirmed capability-registry direction.
- 2026-06-26 15:48 +03:00 - Added capability registry, Codex global rules, audit script, npm command and docs links.
- 2026-06-26 15:55 +03:00 - Verified `npm run audit:capabilities`, `npm run check`, and `git diff --check`.
