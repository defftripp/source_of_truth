# Active Checkpoint

Status: DONE_WITH_RUNTIME_BLOCKER
Last updated: 2026-06-27

## Goal

`source_of_truth` records verified upstream repo links for remaining skills/templates and keeps plugin availability honest.

## Scope

- Add verified upstream Git/source link for Superpowers.
- Add verified upstream Git/source links supplied by the user for OpenAI curated skills, Open Design templates and OpenAI plugin document skills.
- Add plugin cache checks for Codex plugins.
- Keep unresolved local snapshots explicit as `source_required_before_update`.
- Update human-readable capability source docs.
- Record that `superpowers@openai-curated` config without cache is unavailable.
- Write evidence.

## Anti-Scope

- Do not install, update or remove real `~/.codex` skills, MCP servers or plugins.
- Do not add broad automatic MCP/plugin installers.
- Do not clone unknown external repositories as a workaround.
- Do not generate production app code.
- Do not rewrite public content unrelated to capability/source docs.

## Inputs To Read

- `AGENTS.md`
- `docs/PRODUCT_DIRECTION.md`
- `docs/ARCHITECTURE.md`
- `registries/capabilities.json`
- `registries/capabilities.md`
- `registries/capability-sources.md`
- `registries/codex-global.json`
- `rules/skill-installation.mdc`
- `memory/MEMORY.md`
- `memory/SESSION-HANDOFF.md`

## Verification

- `npm run audit:capabilities`
- `npm run audit:readiness`
- `npm run check`
- `git diff --check`

## Evidence

- summary path: `develop/artifacts/capabilities/2026-06-27-plugin-cache-and-upstream-links.md`
- bulky artifact path: `output/**`

## Stop Condition

Stop after audit reports missing Superpowers plugin cache as a real blocker and docs explain that config intent is not proof of availability.

## Result

Completed. Source/provenance links are now filled for the remaining listed skills/templates/plugins. `npm run audit:capabilities` still intentionally reports `superpowers` as `BLOCKED` until the real plugin cache exists or the stale global config section is removed after approval.
