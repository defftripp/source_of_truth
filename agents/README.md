# Agent Roles

Specialist agent files define how to ask for focused help without losing main-agent ownership.

## Default Model

- One main agent owns final edits and evidence.
- Specialist agents are read-only unless a checkpoint grants a narrow disjoint write scope.
- Findings are input, not proof of completion.

## Core Roles

- `product`: clarify users, scope, anti-scope and success criteria.
- `architect`: check structure, boundaries, tradeoffs and migration risk.
- `planner`: turn direction into bounded checkpoints.
- `qa`: find missing checks, edge cases and regression barriers.
- `security`: inspect secrets, auth, permissions and external action risk.
- `researcher`: verify facts, docs and references.
- `ux`: inspect product flows and user-facing clarity.

## VAIB Pipeline

Use the VAIB roles only for larger work that needs staged intent, analysis, architecture, spec, coding, testing and skepticism.

Do not run role loops when a direct patch and one review are enough.
