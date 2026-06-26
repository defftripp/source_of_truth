# Source-of-truth onboarding skill design

Prompt: пользователь хочет уйти от блогового слоя к skill-driven автоматизации: агенту показывают сырой или пустой проект, он изучает репозиторий, ставит operating skeleton, проводит интервью, создает rules/skills/docs/hooks и допускает разработку только после строгого readiness gate.

Started: 2026-06-26 14:10 +03:00

## Plan

- [x] Inspect repository conventions, starter template, playbooks, agents and bootstrap script.
- [x] Confirm target shape: Codex skill as brain, scripts/templates as hands.
- [x] Confirm v1 host: Codex only.
- [x] Confirm self-install/update policy from repo.
- [x] Confirm strict `READY_FOR_IMPLEMENTATION` gate.
- [x] Write approved design spec in `docs/superpowers/specs/`.
- [x] Self-review spec for placeholders, contradictions and scope gaps.
- [ ] Ask user to review the written spec before implementation planning.

## Version Log

- 2026-06-26 14:10 +03:00 - Created plan from brainstorming outcome.
- 2026-06-26 14:12 +03:00 - User clarified that readiness must include rules, skills, agent communication contracts and hooks, not only documents.
- 2026-06-26 14:18 +03:00 - Added design spec and self-reviewed for placeholders, contradictions and missing operating layers.
