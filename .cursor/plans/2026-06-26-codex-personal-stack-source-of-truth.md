# Codex personal stack source-of-truth note

Prompt: записать в `source_of_truth` решение по lean Codex setup: compact global rules, live skill registry, selective MCP, no overcoding.

Started: 2026-06-26 13:40 +03:00

## Plan

- [x] Inspect repository conventions and existing playbook/content structure.
- [x] Pick the right location for the Codex personal stack note.
- [x] Add concise source-of-truth content without touching unrelated dirty files.
- [x] Verify formatting and git status.
- [x] Update root README so the new Codex stack rule is visible from the project entrypoint.

## Version log

- 2026-06-26 13:40 +03:00 - Created plan from user prompt.
- 2026-06-26 13:45 +03:00 - Added `content/playbook/personal-codex-stack.md` as the canonical playbook note.
- 2026-06-26 13:48 +03:00 - Added accepted decision to `docs/DECISIONS.md`.
- 2026-06-26 13:50 +03:00 - Ran `npm run check`; Hugo build passed.
- 2026-06-26 13:52 +03:00 - Verified playbook index is generated from pages and UTF-8 content is intact.
- 2026-06-26 13:55 +03:00 - Reopened scope after README gap was found.
- 2026-06-26 14:00 +03:00 - Updated root `README.md`; reran `npm run check` and `git diff --check`.
