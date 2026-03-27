# Source of Truth

Shared starter kit for fast project setup and steady project maintenance.

This repository is not just a prompt dump. It is a source-of-truth pack for:

- canonical working rules
- reusable agent prompts
- playbooks for common project workflows
- memory templates
- hook templates
- a starter template that can be copied into new projects

## What Lives Here

- `AGENTS.md`: canonical operating rules for projects that use this pack
- `agents/`: specialist roles and reusable agent personas
- `rules/`: coding and process rules
- `playbooks/`: repeatable workflows for project start, continuation, bugfix, refactor, release, and audit
- `memory/`: templates for persistent project memory and session handoff
- `hooks/`: hook prompt templates for session start and maintenance workflows
- `templates/project-starter/`: files that should land in a fresh project
- `scripts/bootstrap_project.ps1`: copies the starter template into a target project

## Quick Start

1. Review `AGENTS.md`.
2. Run `scripts/bootstrap_project.ps1 -TargetPath <path-to-project>`.
3. Open the target project and fill in `memory/MEMORY.md`.
4. Use the relevant file in `playbooks/` for the current task.
5. When a repeated mistake is found, turn it into a reusable rule.

## Design Principles

- Keep one canon and many thin wrappers.
- Push context into files, not chat history.
- Prefer reusable workflows over long prompts.
- Turn fixes into rules and templates.
- Separate stable canon from volatile work artifacts.

