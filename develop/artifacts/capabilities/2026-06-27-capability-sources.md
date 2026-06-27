# Capability Source Provenance Evidence

Status: DONE
Date: 2026-06-27

## Trigger

User reported a serious install-layer flaw: skills, MCP servers and plugins were listed as desired capabilities, but the project did not reliably say where to get them. That forced agents to invent clone/install commands.

## Change

- Added `sources[]` metadata to every capability in `registries/capabilities.json`.
- Added `registries/capability-sources.md` as the human-readable provenance/install policy.
- Updated `registries/capabilities.md`, `registries/codex-global.json`, `docs/SKILLS.md`, `AGENTS.md`, README and project direction/architecture docs.
- Updated `rules/skill-installation.mdc` so external capability install starts from declared sources, not guessed repos or shell snippets.
- Updated `skills/source-of-truth-onboarding/` and readiness checklist to block install proposals when source metadata is missing.
- Updated starter template `docs/SKILLS.md`, rule and pre-implementation hook so new projects inherit source/provenance policy.
- Updated `scripts/audit_codex_capabilities.ps1` to report missing `sources[]`.
- Updated `scripts/audit_project_readiness.ps1` to require source/provenance language in the skills registry.

## Source Policy

- Known sources are declared for repo-owned skills, OpenAI plugin catalog entries, Lazyweb, Context7, Codex system skills and personal helper repository.
- Local installed skill snapshots remain usable when present, but are not reinstallable elsewhere until a real upstream source is added to the registry.
- Global writes still require `разрешаю обновить глобалку Codex`.

## Verification

- `npm run audit:capabilities` - PASS with `PASS=9 WARN=3 BLOCKED=0`.
- `npm run audit:readiness` - PASS, status `READY_FOR_IMPLEMENTATION`, warning only for generated `public/`.
- `npm run check` - PASS, Hugo built 54 pages.
- `git diff --check` - PASS, only Windows LF-to-CRLF normalization warnings.

## Remaining Warnings

- `project-spec-docs` missing optional `design-brief`.
- `creative-artifacts` missing task-required local skills `html-ppt`, `web-prototype`, `image-poster`.
- `documents-and-pdfs` missing task-required primary runtime plugins `documents@openai-primary-runtime` and `pdf@openai-primary-runtime`.

These are not blockers for this checkpoint.
