# Codex Engineering Loop

This repository currently contains the ticket #17 Global Launcher: one
explicitly invoked Agent Skill and its read-only Project Runtime readiness
probe. It does not onboard or normalize projects.

## Install

From a checkout of this implementation branch, install the launcher through the
open `npx skills` ecosystem:

```text
npx skills add . --skill engineering-loop --agent codex --global --copy --yes
```

The installed user-facing entrypoint is `$engineering-loop`. Its metadata
disables model invocation, so ordinary engineering prompts must not start it.

## Readiness evidence

The launcher checks, without mutation:

1. the Target Project is an accessible directory;
2. `.engineering/` exists as a directory;
3. `.engineering/runtime/manifest.json` is valid JSON declaring
   `schemaVersion: 1` and a non-empty pinned `runtimeVersion`.

An empty project returns `ONBOARDING_REQUIRED` with exit code `0` and stops.
Onboarding and normalization are intentionally outside this ticket.

## Verify

```text
npm install
npm run verify
```

The verification suite includes metadata and negative-invocation tests,
black-box immutability checks, an isolated real `npx skills` global-install
smoke, and a platform smoke. Windows is the mandatory platform for ticket #17.
