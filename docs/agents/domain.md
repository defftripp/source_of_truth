# Domain docs

This repository uses a single-context domain documentation layout.

## Before exploring

Read these files when they exist and are relevant:

- `CONTEXT.md` at the repository root.
- ADRs under `docs/adr/`.

If they do not exist, proceed silently. Domain documentation is created lazily
when terminology or a durable decision actually needs to be recorded.

## Layout

```text
/
|-- CONTEXT.md
|-- docs/
|   `-- adr/
`-- skills/
```

## Vocabulary

Use domain terms as defined in `CONTEXT.md`. Do not drift to synonyms the
glossary explicitly avoids. A missing concept may indicate either unsuitable
new terminology or a real modeling gap.

## ADR conflicts

If proposed work contradicts an existing ADR, identify the conflict explicitly
instead of silently overriding the decision.
