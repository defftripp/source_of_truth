# Plugin Cache And Upstream Links

Status: active
Date: 2026-06-27

## Problem

`superpowers@openai-curated` was treated as available because `~/.codex/config.toml` had an enabled plugin section. The actual plugin cache does not contain Superpowers, so audit produced a false PASS.

## Outcome

- Superpowers source points to `https://github.com/obra/Superpowers`.
- Plugin availability checks require a plugin cache `.codex-plugin/plugin.json`.
- `superpowers@openai-curated` config without cache is reported as unavailable.
- Known plugin/source links are recorded where available.
- Unknown local skill snapshots remain explicit source debt, not install sources.

## Verification

- `npm run audit:capabilities` should report `superpowers` as `BLOCKED` until the plugin is actually installed/cached.
- `npm run audit:readiness`
- `npm run check`
- `git diff --check`
