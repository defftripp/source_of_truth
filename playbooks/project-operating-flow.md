# Project Operating Flow

## Goal

Make every project feel like the same engineering system: clear scope, one active checkpoint, visible state, review gates, and evidence outside chat.

## When To Use

Use this for any non-trivial feature, bugfix, refactor, research adoption, release, or project continuation.

Skip the full flow only for tiny edits where the relevant check is obvious and no durable context changes.

## Flow

```text
1. Intake
2. Source-of-truth read
3. Plan or checkpoint spec
4. /goal for one bounded checkpoint
5. Read-only subagents where useful
6. Main agent patch
7. Verification gate
8. Evidence artifact
9. Memory and handoff update
10. Lesson promotion
```

## Intake

Classify the input before acting:

| Input | First output | Do not do |
| --- | --- | --- |
| Product idea | lightweight PRD or SPEC | start production code immediately |
| Feature/enhancement | checkpoint plan | expand into adjacent cleanup |
| Bug | repro or expected-vs-actual note | refactor unrelated modules |
| Research link or repo | research note and pattern extraction | turn hype into requirements |
| Tool adoption | capability plan and rollback | install broad write access by default |
| Public article | outline or draft under `content/` | publish private project data |

## Checkpoint Spec

Every checkpoint spec must include:

- goal;
- scope;
- anti-scope;
- constraints and invariants;
- touched areas;
- allowed subagents;
- verification commands or browser checks;
- evidence path;
- stop condition.

## Goal Prompt

Use this shape:

```text
/goal Implement <checkpoint id> from <plan file>.
Read AGENTS.md, memory, develop/README.md, develop/IMPLEMENTATION_PLAN.md, develop/LOCAL_RUNBOOK.md, the checkpoint spec, relevant prior artifacts and ADRs first.
Work only on this checkpoint.
Use subagents for read-only exploration, review, test audit, docs research, or browser verification.
The main agent owns final edits.
Stop only when verification passes with evidence, or when blocked by an explicit external blocker.
Write evidence under <artifact path>.
```

## Subagent Roles

| Role | Purpose | Writes |
| --- | --- | --- |
| `explorer` | affected files, local patterns, likely blast radius | no |
| `reviewer` | bugs, scope drift, security/privacy leaks | no |
| `test-auditor` | missing or weak acceptance coverage | no |
| `docs-researcher` | current official docs and version-sensitive facts | no |
| `browser-debug` | UI repro, screenshots, traces, visual checks | no |
| `worker` | narrow implementation slice | only if explicitly assigned |

## Verification Gate

Pick checks by blast radius:

- backend/API: focused tests first, broader suite when shared contracts changed;
- frontend/UI: focused component tests, lint/build for shared changes, browser screenshots for visible behavior;
- data/schema: migration, schema docs, rollback or compatibility note;
- provider/payment/deploy: dry-run or sandbox proof, redaction scan, explicit cost/access boundary;
- docs-only: link check, build, and consistency with AGENTS/playbooks.

If a check cannot run, record why and what evidence replaced it. Do not silently downgrade broad requirements into narrow checks.

## Evidence

Checkpoint evidence lives under:

```text
develop/artifacts/<initiative>/<checkpoint>.md
```

or, for checkpoint-heavy projects:

```text
develop/artifacts/checkpoints/<stage>/<checkpoint>/summary.md
```

Evidence must say:

- inputs read;
- what changed;
- what was verified;
- artifacts/screenshots/logs;
- scope guard and not-touched areas;
- reviewer or test-auditor findings;
- known gaps;
- next checkpoint;
- final status: `DONE`, `DONE_WITH_CONCERNS`, `BLOCKED`, or `NEEDS_CONTEXT`.

Heavy traces, videos, generated assets, local stores, and bulky logs stay in `output/**` or `work/**` and are linked from the markdown artifact.

## Memory Update

Update `memory/MEMORY.md` when durable project state changes: current milestone, commands, risks, decisions, constraints, or next steps.

Update `memory/SESSION-HANDOFF.md` at the end of meaningful work so another agent can continue without chat history.

## Lesson Promotion

Use this ladder:

```text
evidence note -> checklist -> playbook rule -> hook/script -> skill/plugin
```

Promote only when the lesson is reusable across projects or repeatedly painful inside one project.
