# User-Supplied Capability Source Links Evidence

Status: DONE_WITH_RUNTIME_BLOCKER
Date: 2026-06-27

## Trigger

User supplied missing upstream links for OpenAI curated skills, Open Design templates and OpenAI plugin document skills.

## Verified Repositories

- `https://github.com/openai/skills`
  - HEAD: `49f948faa9258a0c61caceaf225e179651397431`
  - local audit clone: `output/source-audit/openai-skills`
- `https://github.com/nexu-io/open-design`
  - HEAD: `b784c86507449d057ba50058f70cc9af27c5d026`
  - local audit clone: `output/source-audit/open-design`
- `https://github.com/openai/plugins`
  - HEAD: `3fdeeb4970a1fa176ccabf873ae64fd6053cb2b0`
  - local audit clone: `output/source-audit/openai-plugins`

## Verified Paths

- `skills/.curated/playwright`
- `skills/.curated/playwright-interactive`
- `skills/.curated/security-best-practices`
- `skills/.curated/security-threat-model`
- `skills/.curated/security-ownership-map`
- `skills/.curated/pdf`
- `skills/design-brief`
- `design-templates/pm-spec`
- `design-templates/html-ppt`
- `design-templates/web-prototype`
- `design-templates/dashboard`
- `design-templates/mobile-app`
- `design-templates/image-poster`
- `design-templates/video-shortform`
- `design-templates/audio-jingle`
- `plugins/sharepoint/skills/sharepoint-word-docs`
- `plugins/sharepoint/skills/sharepoint-spreadsheets`
- `plugins/sharepoint/skills/sharepoint-powerpoint`

Every verified path exists and contains `SKILL.md`.

## Changes

- Updated `registries/capabilities.json` sources for:
  - `browser-chrome-playwright`
  - `security-baseline`
  - `project-spec-docs`
  - `documents-and-pdfs`
  - `creative-artifacts`
- Updated `registries/capability-sources.md`.
- Updated `registries/capabilities.md`.

## Result

No `local_skill` or `source_required_before_update` sources remain in `registries/capabilities.json`.

Runtime availability is still separate from source provenance:

- `superpowers` remains `BLOCKED` because plugin cache is missing.
- optional/task-required runtime warnings remain for missing installed skills/plugins.

## Verification

- `registries/capabilities.json` parses successfully.
- unresolved source query returned: `No unresolved source_required/local_skill sources remain in registry.`
- `npm run audit:capabilities` - expected `BLOCKED` for missing `plugin_cache:openai-curated/superpowers`.
- `npm run audit:readiness` - PASS, `READY_FOR_IMPLEMENTATION`, warning only for generated `public/`.
- `npm run check` - PASS, Hugo built 54 pages.
