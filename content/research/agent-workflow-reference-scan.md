---
title: "Agent workflow reference scan"
date: 2026-06-26
description: "External references for a reusable project operating flow: goal control, wakeups, read coverage, harness gates, skills, memory and GitHub-as-workspace patterns."
tags: ["agents", "workflow", "research", "codex", "skills"]
---

This is a reference scan, not a product requirement. Links become rules only after the reusable pattern is clear.

## Sources Checked

- `ustas-eth/ferrumctl`: small Unix-style tools for Codex workflows. The useful pattern is a composable control plane: goal control, wake/scheduled messages, and read coverage.
- `affaan-m/ECC`: a large harness system around skills, memory, security, research-first development and hooks. The useful pattern is treating the harness as a durable operating system, not a prompt bag.
- `svishniakov/agent-flow`: a Codex orchestration and verification framework with project memory, scoped lanes, gates, traces, QA and handoffs. The useful pattern is bounded work with evidence-backed gates.
- `serejaris/personal-corp-skills`: public Claude/Codex skills and plugin manifests. The useful pattern is packaging repeatable SOPs as skills and keeping plugin manifests public/syncable.
- `sereja.tech/aicorp`: personal corporation model. The useful pattern is a shared operating space with rules, tasks, skills and history. In this pack, that pattern is adapted to local `develop/TODO.md` and `develop/CHECKPOINT.md` instead of GitHub Issues.

## Extracted Patterns

1. Separate control plane from implementation.
   Goal state, wakeups, read coverage, queue status and progress ledgers should be outside the model's memory.

2. Use one bounded checkpoint at a time.
   A task should have scope, anti-scope, checks, evidence path and stop condition before code changes begin.

3. Keep the patch owner single.
   Subagents reduce blind spots, but one agent should own final edits unless a stage explicitly grants disjoint write scopes.

4. Make verification visible.
   Tests, lint, build, browser screenshots, traces and review notes should land in durable artifacts, not just final chat prose.

5. Promote lessons slowly.
   Research note first, extracted pattern second, playbook/rule/hook/skill only after the pattern is reusable.

6. Treat project files as the workspace.
   Rules, local TODOs, checkpoints, stage plans, evidence, decisions and memory should make progress legible to both humans and agents.

## Source-of-Truth Implications

- Starter projects need `develop/` by default, not only `AGENTS.md` and memory templates.
- Local `develop/TODO.md` and `develop/CHECKPOINT.md` should carry goal, scope, anti-scope, verification and evidence path. GitHub Issues remain optional for public collaboration only.
- Playbooks need explicit subagent roles and write boundaries.
- Evidence templates need status values and linked heavy artifacts.
- Hooks/scripts can later enforce checklist completion, but rules should be clear before enforcement.

## References

- https://github.com/ustas-eth/ferrumctl
- https://github.com/affaan-m/ECC
- https://github.com/svishniakov/agent-flow
- https://github.com/serejaris/personal-corp-skills
- https://sereja.tech/aicorp/
