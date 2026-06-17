# Source of Truth

Personal AI Engineering playbook and blog.

This repository has two layers:

- public site: blog, playbook, research notes and reusable prompts;
- project starter kit: agents, rules, playbooks, hooks, memory templates and bootstrap scripts.

## Public Site

The site is Hugo-based and Markdown-first.

```powershell
npm install
npm run dev
# http://localhost:1313/
```

Content lives in:

- `content/blog/` - public articles and manifestos;
- `content/playbook/` - stable reusable operating rules;
- `content/research/` - repository/tool/feature analysis;
- `content/prompts/` - reusable prompts.

Production build:

```powershell
npm run build
```

## Starter Kit

The original source-of-truth pack remains available:

- `AGENTS.md`: canonical operating rules for projects that use this pack;
- `agents/`: specialist roles and reusable agent personas;
- `rules/`: coding and process rules;
- `playbooks/`: repeatable workflows for project start, continuation, bugfix, refactor, release, and audit;
- `memory/`: templates for persistent project memory and session handoff;
- `hooks/`: hook prompt templates for session start and maintenance workflows;
- `templates/project-starter/`: files that should land in a fresh project;
- `scripts/bootstrap_project.ps1`: copies the starter template into a target project.
- `archive/legacy-notes/`: old source notes kept out of the hot path until they are reviewed and promoted.

## Operating Pipeline

```text
link
  -> quick note
  -> research summary
  -> extracted pattern
  -> playbook update
  -> optional blog post
```

For product work:

```text
req-docs
  -> product docs
  -> research
  -> stage plan
  -> checkpoint
  -> reviewer
  -> test-auditor
  -> evidence
  -> promoted rule
```

## Design Principles

- Keep one canon and many thin wrappers.
- Push context into files, not chat history.
- Prefer reusable workflows over long prompts.
- Turn fixes into rules and templates.
- Separate stable canon from volatile work artifacts.
- Treat research as reference, not automatic requirement.

