# Project Memory

## Project

- name: Source of Truth
- goal: личный AI engineering playbook, starter kit, Codex onboarding pack, research notes, prompts и публичный сайт.
- owner: defftripp

## Current State

- В репозитории есть Hugo public site layer под `content/`, `layouts/`, `static/` и `hugo.toml`.
- Reusable starter kit живет под `templates/project-starter/`.
- Core operating files живут в `AGENTS.md`, `playbooks/`, `rules/`, `hooks/`, `memory/`, `agents/` и `docs/DECISIONS.md`.
- С 2026-06-26 starter template включает default `develop/` execution layer, вдохновленный рабочими patterns из `D:\WORK\db` и `D:\WORK\canvas`.
- С 2026-06-26 root `README.md` является GitHub landing page для operating system, но default task queue остается local-first через `develop/TODO.md` и `develop/CHECKPOINT.md`.
- С 2026-06-26 канон, starter, playbooks, memory templates и workflow-документы пишутся на русском. Английскими остаются команды, пути, status values и code/tool identifiers.
- С 2026-06-26 внешний capability layer живет в `registries/`: required/recommended skills, MCP, plugins и безопасный global Codex contour проверяются через read-only audit.
- С 2026-06-27 capability layer включает обязательный `sources[]` provenance: missing source блокирует install proposal вместо ad-hoc clone/npm/PowerShell импровизации.
- С 2026-06-27 plugin availability требует cache artifact `.codex-plugin/plugin.json`; config section без cache считается intent/stale state, не installed capability.
- С 2026-06-27 все ранее unresolved local skill/template sources из capability registry получили verified upstream links: OpenAI skills, Open Design и OpenAI plugins.
- С 2026-06-26 repo-owned onboarding skill живет в `skills/source-of-truth-onboarding/`; scripts `install_codex_skill.ps1` и `audit_project_readiness.ps1` являются deterministic hands.
- С 2026-06-26 `source-of-truth-onboarding` установлен в `C:\Users\deff3\.codex\skills\source-of-truth-onboarding`.
- С 2026-06-26 сам repo получил root `docs/PRODUCT_DIRECTION.md`, `docs/ARCHITECTURE.md`, `docs/SKILLS.md`, `develop/`, `memory/QUESTIONS.md` и `memory/LESSONS.md`.

## Active Checkpoint

- stage: plugin cache and upstream links
- checkpoint: add Git/upstream links and require plugin cache evidence
- status: DONE_WITH_RUNTIME_BLOCKER
- spec: `develop/stages/2026-06-27-plugin-cache-and-upstream-links.md`
- evidence: `develop/artifacts/capabilities/2026-06-27-user-supplied-source-links.md`

## Constraints

- Stable canon держать отдельно от volatile working context.
- Новые external links сначала становятся research, а не rules.
- Не публиковать secrets, private customer/project data, provider internals или payment details.
- Tool-specific wrappers не должны создавать второй source of truth.
- Default workflow не зависит от GitHub Issues/Projects.

## Important Decisions

- 2026-06-16: Source of Truth стал публичным playbook-сайтом плюс reusable starter kit.
- 2026-06-26: Starter projects используют `develop/` stage/checkpoint execution по умолчанию.
- 2026-06-26: Task tracking остается local-first через `develop/TODO.md` и `develop/CHECKPOINT.md`.
- 2026-06-26: Рабочий язык канона и starter-шаблона - русский.
- 2026-06-26: Не дублировать полный installed skill catalog в глобальном `AGENTS.md`; must-have слой фиксировать в `registries/capabilities.json`.
- 2026-06-26: Запись в `~/.codex` разрешать только после явной фразы `разрешаю обновить глобалку Codex`, с backup и evidence.
- 2026-06-26: `source-of-truth-onboarding` source skill является active repo capability; installed global copy поставлена после явного approval phrase.
- 2026-06-27: Каждая capability должна иметь declared source/provenance в `sources[]`; если source неизвестен, install/update запрещен до registry fix.
- 2026-06-27: Superpowers upstream source is `https://github.com/obra/Superpowers`; current machine is blocked because config enables it but plugin cache is absent.
- 2026-06-27: OpenAI curated skills source is `https://github.com/openai/skills`, Open Design source is `https://github.com/nexu-io/open-design`, document plugin skill source is `https://github.com/openai/plugins`.

## Open Questions

- Нужно ли позже добавить hard hook enforcement для checkpoint checklist completion, или пока оставить pack text-first?
- Нужно ли позже добавить installer scripts/commands для verified sources, или пока достаточно source provenance plus explicit approval gate?

## Next Steps

- Forward-test `source-of-truth-onboarding` в fresh session или subagent-capable environment.
- При следующем global Codex cleanup проверить local skill snapshots и добавить реальные upstream sources там, где skills должны быть воспроизводимо устанавливаемыми.
- После approval phrase либо установить Superpowers через Codex plugin UI/marketplace, либо удалить stale `[plugins."superpowers@openai-curated"]` из global config.
- Держать GitHub Issues/Projects вне default flow, если пользователь явно не попросил.

## Useful Commands

```powershell
npm run check
npm run audit:capabilities
npm run audit:readiness
scripts\bootstrap_project.ps1 -TargetPath <path>
```
