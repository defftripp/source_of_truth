# Skills Registry

Status: draft
Last updated: YYYY-MM-DD

Track only project-relevant skills and their canonical sources. Do not paste the full installed skill catalog here.

## Required Skills

| Skill | Why | Source | Installed path | Status | Update rule |
| --- | --- | --- | --- | --- | --- |
| `source-of-truth-onboarding` | Prepare project canon before implementation. | source_of_truth repo | `~/.codex/skills/source-of-truth-onboarding/SKILL.md` when installed | required | Update from source repo after approval for global writes. |

## Recommended Skills

| Skill | Why | Status |
| --- | --- | --- |
| `superpowers:*` | Planning, TDD, debugging and verification workflows. | check current Codex registry |
| `lazyweb` | Product UI evidence before UI work. | task-required for product UI |
| `context7` | Current library/framework docs. | task-required for version-sensitive technical work |

## Source Policy

- Every required or task-required external capability must have a source: repo path, upstream repo, package, Codex plugin catalog entry, or runtime-provided system bundle.
- Installed `~/.codex/skills/**` folders are runtime snapshots, not install sources by themselves.
- Enabled plugin config is intent, not proof. Plugin availability needs cache evidence.
- If the source is unknown, mark the capability `DEGRADED` or `BLOCKED`; do not invent a clone/install command.

## Project-Local Skills

- none yet

## Missing Or Degraded

- item:
- impact:
- source status:
- next:
