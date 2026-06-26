# Local Runbook

Status: active
Last updated: 2026-06-26

## Setup

```powershell
npm install
```

## Site Checks

```powershell
npm run check
```

## Capability Audit

```powershell
npm run audit:capabilities
```

## Readiness Audit

```powershell
npm run audit:readiness
```

## Bootstrap Smoke

```powershell
powershell -ExecutionPolicy Bypass -File scripts\bootstrap_project.ps1 -TargetPath output\bootstrap-smoke -Force
```

## Skill Install Smoke

Use a temporary Codex home unless the user explicitly approves real global Codex writes.

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install_codex_skill.ps1 -CodexHome output\codex-home-smoke -Force
```

## Safety

- Do not write real `~/.codex` without the approval phrase.
- Keep smoke output under `output/`.
- Do not commit generated Hugo `public/`.
