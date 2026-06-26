# Pre-Implementation Check Hook

Run before implementation starts in a governed project.

## Checklist

1. `AGENTS.md` and current memory were read.
2. Product direction or PRD exists.
3. Architecture boundaries exist.
4. Active checkpoint exists in `develop/CHECKPOINT.md`.
5. Scope, anti-scope, verification, evidence path and stop condition are explicit.
6. Blocking questions are closed or the task is marked `NEEDS_CONTEXT` / `BLOCKED`.
7. Required skills, MCP servers or plugins are available, or degraded mode is explicit.
8. Secrets and external write actions are outside scope unless explicitly approved.

If any item fails, stop implementation and repair the source-of-truth layer first.
