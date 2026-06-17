# Decisions

## 2026-06-16 - Source of Truth becomes a public playbook site

Decision:

- Keep the existing starter kit (`agents/`, `playbooks/`, `rules/`, `hooks/`, `memory/`, `templates/`) as the reusable project setup layer.
- Add a Hugo-based public site layer under `content/`, `layouts/`, `static/`, and `hugo.toml`.
- Move general AI engineering research out of product repositories and into this repository.

Rationale:

- Product repositories should hold product truth.
- Cross-project agent workflow, research notes, prompts, and operating principles belong in one personal Source of Truth.
- New links should become research notes first, then playbook changes only when they produce reusable patterns.

Immediate migration:

- ECC research was moved from the AI Canvas research tree into `content/research/ecc.md`.
- The first public manifesto was added at `content/blog/source-of-truth-manifest.md`.
- Initial playbook pages were added for documentation pipeline and agent workflow.

Status: accepted.
