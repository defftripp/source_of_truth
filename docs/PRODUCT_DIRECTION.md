# Product Direction

Status: active
Last updated: 2026-06-27

## Product

`source_of_truth` is a personal AI engineering operating system for starting, governing and continuing agent-driven projects.

## Users

- Primary: Defftripp using Codex and adjacent agent hosts.
- Secondary: future agents that must recover context from files instead of chat memory.

## Problem

Raw projects and long chats lose operating context. Agents start coding before product direction, architecture, rules, skills, memory and verification gates are ready.

## Direction

Turn this repo from a public playbook site into an executable onboarding pack:

- skill as process brain;
- scripts as deterministic hands;
- templates as starter skeleton;
- registries as capability truth;
- evidence as durable proof;
- public content as explanation layer, not runtime canon.

## Scope

- Codex-first onboarding flow.
- Local-first planning and evidence.
- Safe install/update of repo-owned skills.
- Explicit source/provenance for external skills, MCP servers and plugins.
- Readiness audit before implementation.
- Starter template for new or under-structured projects.

## Anti-Scope

- Automatic paid provider setup.
- Automatic deploy/release/merge.
- Broad global Codex rewrites without explicit approval.
- GitHub Issues or Projects as default task tracking.
- Production code generation before readiness.

## Success Criteria

- A raw project can be inspected and prepared before implementation.
- Missing docs/rules/memory/skills/checkpoints are created or reported.
- The agent can say `READY_FOR_IMPLEMENTATION`, `NEEDS_CONTEXT` or `BLOCKED` with evidence.
- Required skills/MCP/plugins are audited without copying the full live skill catalog into global rules.
- Missing capability sources are visible as registry debt instead of being solved by guessed install commands.
