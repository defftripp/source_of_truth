# Source-of-Truth Onboarding Skill Design

Date: 2026-06-26
Status: draft for user review

## Goal

Create a Codex-first onboarding skill that turns this repository from a blog/playbook starter into an executable project operating system.

The target behavior:

```text
User opens a raw or empty project and points the agent at source_of_truth.
Agent recognizes the project is not ready for implementation.
Agent installs or updates the onboarding skill from this repo when needed.
Agent audits the whole project.
Agent creates or repairs the operating layer.
Agent interviews the user.
Agent writes intent, PRD, architecture, rules, skills, runbook, backlog, checkpoint and evidence.
Agent blocks production code until READY_FOR_IMPLEMENTATION is true.
```

## Product Shape

Use two layers:

```text
skill = brain
scripts/templates = hands
```

Canonical source lives in this repo. Optional installed runtime copy lives in Codex after explicit approval:

```text
repo:
  skills/source-of-truth-onboarding/SKILL.md
  scripts/install_codex_skill.ps1
  scripts/audit_project_readiness.ps1
  registries/capabilities.json
  registries/codex-global.json
  templates/project-starter/**
  rules/skill-installation.mdc
  rules/codex-global-editing.mdc
  hooks/pre-implementation-check.md

installed after approval:
  ~/.codex/skills/source-of-truth-onboarding/SKILL.md
```

Version 1 supports Codex only. Cursor, Claude and other agent hosts are out of scope for the first implementation, except for thin wrappers already present in the starter template.

## Required External Capabilities

The onboarding skill must use a capability registry instead of hardcoding the full installed skill catalog into global rules.

Canonical files:

```text
registries/capabilities.json
registries/capabilities.md
registries/codex-global.json
```

The first required set:

- Superpowers plugin skills: `brainstorming`, `writing-plans`, `test-driven-development`, `systematic-debugging`, `verification-before-completion`, `requesting-code-review`;
- Lazyweb skills and MCP for product UI evidence;
- Context7 MCP for current library/framework/API docs;
- Browser, Chrome and Playwright for real UI verification;
- system skills: `skill-installer`, `skill-creator`, `openai-docs`, `imagegen`;
- personal helpers: `caveman`, `find-skills`, `load-project-rules`, `zip-context`;
- security baseline skills as recommended capabilities.

Missing required capability behavior:

```text
Capability missing -> record impact -> BLOCKED or DEGRADED -> propose install/update -> no fake usage.
```

Global Codex writes must follow:

```text
audit -> proposed diff -> explicit approval -> backup -> scoped write -> verify -> evidence
```

The approval phrase for writing to `~/.codex` is:

```text
разрешаю обновить глобалку Codex
```

## Install And Update Policy

The repo must contain the rule for installing and updating the skill.

The agent may self-install or self-update the Codex skill from this repo when:

- the user explicitly asks to use the source-of-truth onboarding flow;
- the project is raw and the skill is missing;
- the installed skill version is older than the repo version;
- the installed copy is corrupt or incomplete.

Self-install rules:

- install only from the current repo source;
- target only `~/.codex/skills/source-of-truth-onboarding/`;
- back up an existing installed copy before overwriting it;
- do not edit unrelated skills or global Codex config;
- do not edit global Codex files without the explicit approval phrase;
- write install evidence under the target project or this repo, depending on where the action was requested;
- record version, source path, target path and result.

## Modes

The skill has two modes.

### Manual Onboarding

Manual onboarding is full write mode for the target project.

It may:

- audit the whole repository;
- create missing directories and files from `templates/project-starter/`;
- update project-local `AGENTS.md`;
- create project rules, skills, hooks and docs;
- run interviews;
- write readiness evidence;
- produce the first implementation checkpoint.

### Auto-Detect

Auto-detect is diagnostic mode.

It may:

- detect that a project is raw or missing required operating files;
- list readiness gaps;
- recommend running manual onboarding;
- install or update the skill only if the explicit install/update rule allows it.

It must not perform broad project rewrites without a manual onboarding request.

## Strict Readiness Gate

The skill enforces:

```text
No production implementation before READY_FOR_IMPLEMENTATION.
```

If the user gives a product idea before the operating layer is ready, the agent must first convert the idea into project documentation and readiness artifacts. It should say plainly:

```text
Проект пока не готов к разработке. Сначала закрываю source-of-truth onboarding gate.
```

The gate is strict by default. Small throwaway experiments may be allowed only if the project explicitly marks them as prototype work and keeps them outside production paths.

## Required Operating Layers

`READY_FOR_IMPLEMENTATION` requires more than docs. It requires a full operating contract.

### 1. Project Canon

Required outputs:

- `AGENTS.md`
- `docs/DECISIONS.md`
- `docs/PRD.md` or `docs/PRODUCT_DIRECTION.md`
- `docs/ARCHITECTURE.md`

Purpose:

- define project truth;
- define product direction;
- define architecture boundaries;
- record durable decisions.

### 2. Communication Contract

Required content, usually inside `AGENTS.md` plus supporting rules:

- project read order;
- how the agent asks questions;
- when the agent stops;
- how evidence is written;
- how memory is updated;
- allowed edits and forbidden edits;
- status values;
- language policy;
- implementation ban before readiness;
- handoff protocol.

If the communication contract is unclear before the interview, the skill must create explicit open questions and block readiness until they are answered or safely defaulted.

### 3. Rules

Required baseline:

- `rules/agent-workflow.mdc`
- `rules/coding-principles.mdc`
- `rules/project-structure.mdc`
- `rules/testing-and-evidence.mdc`
- `rules/skill-installation.mdc`
- `rules/no-overcoding.mdc`

Rules must stay reusable and concise. Heavy workflows belong in `playbooks/` or `skills/`, not in one huge `AGENTS.md`.

If project-specific rules are not known at initial setup, the skill records them as pending decisions, then fills them after the interview.

### 4. Skills

Required baseline:

- `skills/README.md`
- `skills/source-of-truth-onboarding/SKILL.md` in this repo;
- `docs/SKILLS.md` or `develop/SKILL_REGISTRY.md` in target projects.

The skill registry must say:

- which skills the project uses;
- why each skill exists;
- whether it is repo-local, installed, or external;
- source path;
- installed path when relevant;
- version or last sync date;
- owner and update rule.

Project-specific skills are created only when repeated workflow pain exists. If unclear during initial setup, the onboarding skill writes a placeholder decision and revisits it after the interview.

### 5. Agent Roles

Required baseline:

- `agents/README.md`
- specialist profiles when useful: `product`, `architect`, `qa`, `security`, `reviewer`, `researcher`;
- optional VAIB-style staged pipeline when the project needs intent -> analyst -> architect -> spec -> coder -> tester -> skeptic.

Agent role docs must define:

- when to use the role;
- whether the role is read-only;
- allowed files;
- output format;
- escalation rules;
- how findings feed the main patch owner.

### 6. Execution Layer

Required baseline:

- `develop/README.md`
- `develop/IMPLEMENTATION_PLAN.md`
- `develop/LOCAL_RUNBOOK.md`
- `develop/TODO.md`
- `develop/CHECKPOINT.md`
- `develop/stages/**`
- `develop/artifacts/**`

This layer turns product direction into bounded work:

```text
PRD -> architecture -> implementation plan -> stage -> checkpoint -> evidence
```

Every first checkpoint must include:

- goal;
- scope;
- anti-scope;
- touched areas;
- verification;
- evidence path;
- stop condition.

### 7. Automation And Hooks

Required baseline:

- `hooks/README.md`
- `hooks/session-start.md`
- `hooks/pre-implementation-check.md`
- `hooks/fix-to-rule.md`
- `scripts/bootstrap_project.ps1`
- `scripts/install_codex_skill.ps1`
- `scripts/audit_project_readiness.ps1`

Hooks are not a second source of truth. They enforce or remind the canon already written in docs, rules and skills.

### 8. Memory

Required baseline:

- `memory/MEMORY.md`
- `memory/SESSION-HANDOFF.md`
- `memory/QUESTIONS.md`
- `memory/LESSONS.md`

Memory must contain current state, assumptions, open questions, risks, next steps and reusable lessons. It must not contain secrets, private customer data, provider payloads or raw payment data.

## Interview Flow

The skill uses interview only for decisions that cannot be safely inferred.

Order:

```text
1. inspect repo
2. classify project state
3. create missing safe skeleton
4. ask for product intent
5. write intent / PRD
6. ask architecture and constraint questions
7. write architecture
8. ask workflow and communication questions
9. write rules, skills registry, agent roles and hooks
10. create first implementation checkpoint
11. audit readiness
12. write evidence
```

If a rules/skills/communication detail is unclear at the beginning, the skill must not invent a heavy system. It records the gap, asks during the interview, then writes the final rule before readiness is granted.

## Project Audit

The onboarding skill must study the target repo thoroughly before writing broad changes.

Audit areas:

- root files;
- app/source folders;
- docs;
- tests;
- scripts;
- package/build config;
- existing agent rules;
- existing memory or plans;
- existing generated artifacts;
- secrets risk;
- current git state.

The audit output must include:

- repository map;
- detected stack;
- existing conventions;
- missing operating files;
- risks;
- proposed file changes;
- readiness status.

## Readiness Evidence

The onboarding run writes evidence, for example:

```text
develop/artifacts/onboarding/source-of-truth-onboarding.md
```

Evidence must include:

- prompt or trigger;
- source_of_truth repo path;
- installed skill version;
- target project path;
- files inspected;
- files created or changed;
- interview answers used;
- unresolved questions;
- verification commands and results;
- readiness checklist;
- final status: `READY_FOR_IMPLEMENTATION`, `NEEDS_CONTEXT`, or `BLOCKED`.

## Verification

Minimum verification for the skill implementation:

- install script smoke test into a temporary Codex skills directory;
- capability audit script smoke test against the current Codex home;
- bootstrap script smoke test into a temporary project;
- readiness audit against an empty project;
- readiness audit against an already structured project;
- `npm run check` for this repo;
- `git diff --check`.

## Out Of Scope For Version 1

- automatic GitHub Issues or Projects setup;
- Cursor/Claude full skill installation;
- remote deployment;
- paid provider setup;
- automatic production code generation before readiness;
- broad MCP installation.

## Acceptance Criteria

The design is implemented when:

- canonical onboarding skill source exists in this repo;
- capability registry exists and covers required external skills, MCP and plugins;
- Codex install/update script exists and backs up old copies;
- install/update rule exists;
- readiness audit script exists;
- starter template includes rules, skills registry, memory additions, hooks and readiness docs;
- manual onboarding flow can prepare an empty project to `READY_FOR_IMPLEMENTATION`;
- auto-detect mode reports gaps without broad rewrites;
- evidence is written for install and onboarding runs;
- docs explain how to invoke the flow from a raw project.
