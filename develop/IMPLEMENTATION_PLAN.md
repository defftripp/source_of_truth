# Implementation Plan

Status: done_with_concerns
Last updated: 2026-06-26

## Project Goal

Turn `source_of_truth` into an executable Codex-first onboarding pack for AI engineering projects.

## Active Checkpoint

- stage: source-of-truth onboarding automation
- checkpoint: implement repo skill, safe install script, readiness audit and expanded starter template
- status: DONE_WITH_CONCERNS
- spec: `docs/superpowers/specs/2026-06-26-source-of-truth-onboarding-skill-design.md`
- plan: `docs/superpowers/plans/2026-06-26-onboarding-skill-implementation.md`
- evidence: `develop/artifacts/onboarding/source-of-truth-onboarding.md`

## Stages

| Stage | Goal | Status | Spec | Evidence |
| --- | --- | --- | --- | --- |
| 1 | Create executable onboarding pack. | DONE_WITH_CONCERNS | `develop/stages/source-of-truth-onboarding/STAGE_1_ONBOARDING_SKILL.md` | `develop/artifacts/onboarding/source-of-truth-onboarding.md` |

## Backlog

| Item | Outcome | Status | Notes |
| --- | --- | --- | --- |
| Forward-test skill with independent agent | Validate skill behavior beyond smoke scripts. | LATER | Needs available subagent runner or separate session. |
| Executable hook enforcement | Convert prompt hooks into scripts if repeated use proves value. | LATER | Keep text-first for now. |
| Real global Codex install | Install repo skill into real `~/.codex`. | WAITING | Requires explicit approval phrase. |
