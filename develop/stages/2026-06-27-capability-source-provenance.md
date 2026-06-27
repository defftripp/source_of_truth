# Capability Source Provenance

Status: active
Date: 2026-06-27

## Problem

The capability registry names required skills, MCP servers and plugins, but it does not consistently say where each capability should come from or how it may be installed. That gap pushes agents toward improvising with ad-hoc clones or shell commands.

## Outcome

Agents can answer these questions from repo files before touching global Codex state:

- what capability is missing;
- canonical source or provider;
- allowed install/update mode;
- whether global write approval is required;
- what to do when source metadata is missing.

## Touched Areas

- `registries/capabilities.json`
- `registries/capabilities.md`
- `registries/capability-sources.md`
- `registries/codex-global.json`
- `rules/skill-installation.mdc`
- `skills/source-of-truth-onboarding/**`
- `scripts/audit_codex_capabilities.ps1`
- `templates/project-starter/**`
- `docs/`
- `develop/artifacts/capabilities/**`

## Verification

- `npm run audit:capabilities`
- `npm run audit:readiness`
- `npm run check`
- `git diff --check`

## Stop Condition

Done when missing source metadata would be reported by audit and the human docs prohibit installing external capabilities from undeclared sources.
