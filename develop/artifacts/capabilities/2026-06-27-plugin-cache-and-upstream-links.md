# Plugin Cache And Upstream Links Evidence

Status: DONE_WITH_BLOCKER
Date: 2026-06-27

## Trigger

User pointed out that skills such as Superpowers need concrete Git/upstream links, for example `https://github.com/obra/Superpowers`, and that config intent must not be treated as installed plugin availability.

## Findings

- `~/.codex/config.toml` contains `[plugins."superpowers@openai-curated"] enabled = true`.
- `~/.codex/plugins/cache/openai-curated/` does not contain `superpowers`.
- Superpowers upstream repo exists and was verified:
  - url: `https://github.com/obra/Superpowers`
  - HEAD: `896224c4b1879920ab573417e68fd51d2ccc9072`
  - local audit clone: `output/source-audit/superpowers`
  - source contains `.codex-plugin/plugin.json` and `skills/`.

## Changes

- Updated `registries/capabilities.json`:
  - Superpowers source now points to `https://github.com/obra/Superpowers`.
  - Superpowers has `plugin_cache` check in addition to `plugin_config`.
  - Browser and Chrome plugin checks now also require plugin cache.
  - Known Git/source links were added where verified or present in plugin metadata.
- Updated `scripts/audit_codex_capabilities.ps1` with `plugin_cache` check.
- Updated `registries/capability-sources.md`, `registries/capabilities.md`, `registries/codex-global.json`, README, docs and rules.
- Updated onboarding skill and starter template to require plugin cache evidence.

## Result

Capability audit now correctly reports:

```text
BLOCKED required superpowers active plugin_cache:openai-curated/superpowers
Summary: PASS=8 WARN=3 BLOCKED=1
```

This is expected until Superpowers is actually installed/cached or removed from required runtime intent.

## Global Config Proposal

No global write was performed.

If the desired state is "Superpowers not installed yet", remove this stale/optimistic section after explicit approval:

```toml
[plugins."superpowers@openai-curated"]
enabled = true
```

If the desired state is "Superpowers required", install it through Codex plugin UI/marketplace from the verified upstream source and then rerun `npm run audit:capabilities`.

## Verification

- `registries/capabilities.json` parses successfully.
- `registries/codex-global.json` parses successfully.
- `npm run audit:capabilities` - expected FAIL/BLOCKED for missing Superpowers plugin cache.
- `npm run audit:readiness` - PASS, `READY_FOR_IMPLEMENTATION`, warning only for generated `public/`.
- `npm run check` - PASS, Hugo built 54 pages.
- `git diff --check` - PASS, only Windows LF-to-CRLF normalization warnings.
