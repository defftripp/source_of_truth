# Agent Roles

Project-local specialist role contracts live here.

## Default Model

- One main agent owns final edits and evidence.
- Specialist agents are read-only unless a checkpoint grants narrow disjoint write scope.
- Findings are input, not proof of completion.

## Suggested Roles

- `product`: clarify users, scope, anti-scope and success criteria.
- `architect`: check boundaries, tradeoffs and migration risk.
- `qa`: find missing checks and edge cases.
- `security`: inspect secrets, auth, permissions and external action risk.
- `researcher`: verify docs, references and version-sensitive facts.
- `ux`: inspect product flows and user-facing clarity.

Add concrete role files only when the project actually uses them.
