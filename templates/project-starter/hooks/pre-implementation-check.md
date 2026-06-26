# Pre-Implementation Check Hook

Run before implementation starts.

## Checklist

1. Product direction or PRD exists.
2. Architecture boundaries exist.
3. Active checkpoint exists.
4. Scope, anti-scope, verification, evidence path and stop condition are explicit.
5. Blocking questions are closed or status is `NEEDS_CONTEXT` / `BLOCKED`.
6. Required capabilities are available or degraded mode is explicit.
7. External writes, secrets, payments and deploys are outside scope unless approved.

If any item fails, repair the source-of-truth layer before coding.
