# Session Handoff

## Session Summary

- Усиливается reusable project operating flow в `source_of_truth`.
- Проверены external references: ferrumctl, ECC, AgentFlow, Personal Corp Skills и sereja.tech/aicorp.
- Рабочие patterns изучены в `D:\WORK\db` и `D:\WORK\canvas`.
- GitHub-facing `README.md` обновлен так, чтобы репозиторий был понятен сразу с GitHub.
- Daily work остается локальным: `develop/TODO.md` для очереди и `develop/CHECKPOINT.md` для active slice.
- После замечания пользователя канон и starter переводятся на русский; английскими остаются только commands, paths, statuses и identifiers.
- Добавлен capability registry слой для required/recommended external skills, MCP и plugins.
- Добавлены правила безопасного global Codex editing: read-only audit first, запись в `~/.codex` только после явной фразы `разрешаю обновить глобалку Codex`.
- Начата реализация executable onboarding pack: repo skill, install script, readiness audit, expanded starter template и root self-canon.
- После explicit approval phrase `source-of-truth-onboarding` установлен в реальный `~/.codex`.
- После замечания пользователя добавлен source/provenance слой для skills, MCP и plugins: каждая capability должна иметь `sources[]`, а missing source блокирует install proposal.
- Capability audit теперь проверяет не только runtime availability, но и source metadata.
- После второго замечания пользователя Superpowers source исправлен на `https://github.com/obra/Superpowers`, а plugin availability теперь требует cache artifact, не только config section.
- После пользовательского списка links добавлены verified upstream sources для OpenAI skills, Open Design templates и OpenAI plugin document skills.

## Active Checkpoint

- stage: plugin cache and upstream links
- checkpoint: add Git/upstream links and require plugin cache evidence
- status: DONE_WITH_RUNTIME_BLOCKER
- evidence: `develop/artifacts/capabilities/2026-06-27-user-supplied-source-links.md`

## Verified

- `npm run check` - PASS, Hugo собрал 49 pages.
- `git diff --check` - PASS, остались только Windows LF-to-CRLF normalization warnings.
- `powershell -ExecutionPolicy Bypass -File scripts\bootstrap_project.ps1 -TargetPath output\bootstrap-smoke-russian -Force` - PASS, starter skeleton копируется с hidden wrappers и `develop/`.
- Поиск очевидного English boilerplate через `rg` - PASS, совпадений нет.
- Root `.github` task/PR templates удалены после local-first decision.
- Pre-install `powershell -ExecutionPolicy Bypass -File scripts\audit_codex_capabilities.ps1` - PASS with WARN for user-gated installed copy `source-of-truth-onboarding-installed`.
- Pre-install `npm run audit:capabilities` - PASS with WARN for user-gated installed copy `source-of-truth-onboarding-installed`.
- `npm run check` - PASS, Hugo собрал 54 pages.
- `git diff --check` - PASS, only Windows LF-to-CRLF normalization warnings.
- RED smoke for onboarding pack missing files - PASS as expected; missing skill/scripts/templates were detected before implementation.
- Temp Codex home install smoke - PASS, real `~/.codex` untouched.
- Empty project readiness audit - PASS, expected `NEEDS_CONTEXT`.
- Bootstrap smoke + readiness audit - PASS, unfilled starter returns expected `NEEDS_CONTEXT`.
- Pre-install `npm run audit:capabilities` - PASS with WARN for user-gated installed copy `source-of-truth-onboarding-installed`.
- `npm run audit:readiness` - PASS with WARN for generated `public/`.
- `npm run check` - PASS, Hugo built 54 pages.
- `git diff --check` - PASS, only LF-to-CRLF normalization warnings.
- Real global install - PASS, target `C:\Users\deff3\.codex\skills\source-of-truth-onboarding`, backup not needed.
- Post-install `npm run audit:capabilities` - PASS=12 WARN=0 BLOCKED=0.
- Post-install `npm run audit:readiness` - READY_FOR_IMPLEMENTATION with generated `public/` warning.
- Capability-source checkpoint `npm run audit:capabilities` - PASS=9 WARN=3 BLOCKED=0.
- Capability-source checkpoint `npm run audit:readiness` - READY_FOR_IMPLEMENTATION with generated `public/` warning.
- Capability-source checkpoint `npm run check` - PASS, Hugo built 54 pages.
- Capability-source checkpoint `git diff --check` - PASS, only LF-to-CRLF normalization warnings.
- Plugin-cache checkpoint `npm run audit:capabilities` - expected BLOCKED: `superpowers` missing `plugin_cache:openai-curated/superpowers`.
- Plugin-cache checkpoint `npm run audit:readiness` - READY_FOR_IMPLEMENTATION with generated `public/` warning.
- Plugin-cache checkpoint `npm run check` - PASS, Hugo built 54 pages.
- Plugin-cache checkpoint `git diff --check` - PASS, only LF-to-CRLF normalization warnings.
- User-supplied source links verified against shallow local clones; every supplied path exists and contains `SKILL.md`.
- User-supplied source link checkpoint `npm run audit:capabilities` - expected BLOCKED: `superpowers` missing `plugin_cache:openai-curated/superpowers`.
- User-supplied source link checkpoint `npm run audit:readiness` - READY_FOR_IMPLEMENTATION with generated `public/` warning.
- User-supplied source link checkpoint `npm run check` - PASS, Hugo built 54 pages.

## Latest Capability Source Checkpoint

- Added `registries/capability-sources.md`.
- Updated `registries/capabilities.json` schema to version 2 with `sources[]` for every capability.
- Updated audit scripts to catch missing source metadata and skills registry source/provenance gaps.
- Updated onboarding skill, readiness checklist, project rules and starter template to forbid guessed installs.
- Recorded decision in `docs/DECISIONS.md` and evidence in `develop/artifacts/capabilities/2026-06-27-capability-sources.md`.

## Latest Plugin Cache Checkpoint

- Verified Superpowers upstream repo `https://github.com/obra/Superpowers` at `896224c4b1879920ab573417e68fd51d2ccc9072`.
- Added `plugin_cache` audit check.
- Current global config has Superpowers enabled, but plugin cache is absent, so capability audit now blocks correctly.
- No global config write was performed; cleanup/install needs explicit approval phrase.

## Latest Source Link Checkpoint

- Verified `https://github.com/openai/skills` at `49f948faa9258a0c61caceaf225e179651397431`.
- Verified `https://github.com/nexu-io/open-design` at `b784c86507449d057ba50058f70cc9af27c5d026`.
- Verified `https://github.com/openai/plugins` at `3fdeeb4970a1fa176ccabf873ae64fd6053cb2b0`.
- Added sources for Playwright, security, PDF, design/spec, creative templates, and SharePoint document/spreadsheet/presentation skills.
- `source_required_before_update` no longer appears in `registries/capabilities.json`.

## Files Touched In Latest Checkpoint

- `AGENTS.md`
- `README.md`
- `docs/DECISIONS.md`
- `docs/superpowers/specs/2026-06-26-source-of-truth-onboarding-skill-design.md`
- `docs/superpowers/plans/2026-06-26-capability-registry-layer.md`
- `.cursor/plans/2026-06-26-capability-registry-layer.md`
- `registries/capabilities.json`
- `registries/capabilities.md`
- `registries/codex-global.json`
- `rules/codex-global-editing.mdc`
- `rules/skill-installation.mdc`
- `rules/project-structure.mdc`
- `rules/testing-and-evidence.mdc`
- `rules/no-overcoding.mdc`
- `hooks/pre-implementation-check.md`
- `agents/README.md`
- `skills/source-of-truth-onboarding/SKILL.md`
- `skills/source-of-truth-onboarding/references/readiness-checklist.md`
- `scripts/install_codex_skill.ps1`
- `scripts/audit_project_readiness.ps1`
- `templates/project-starter/docs/PRODUCT_DIRECTION.md`
- `templates/project-starter/docs/ARCHITECTURE.md`
- `templates/project-starter/docs/SKILLS.md`
- `templates/project-starter/memory/QUESTIONS.md`
- `templates/project-starter/memory/LESSONS.md`
- `templates/project-starter/rules/**`
- `templates/project-starter/hooks/**`
- `templates/project-starter/agents/README.md`
- `docs/PRODUCT_DIRECTION.md`
- `docs/ARCHITECTURE.md`
- `docs/SKILLS.md`
- `develop/**`
- `scripts/audit_codex_capabilities.ps1`
- `content/playbook/personal-codex-stack.md`
- `package.json`
- `memory/MEMORY.md`
- `memory/SESSION-HANDOFF.md`

## Risks Or Unknowns

- Hook enforcement пока описан текстом; executable hook scripts еще не добавлены.
- `source-of-truth-onboarding` source skill создан и installed global copy поставлена после approval.
- Some local skill snapshots are intentionally marked `source_required_before_update`; they are usable when installed, but not reinstallable elsewhere until a real upstream source is declared.
- `superpowers@openai-curated` is currently stale/optimistic global config intent unless the plugin is installed into cache.
- GitHub Issues/Projects намеренно не входят в default workflow.
- Bootstrap script оставлен ASCII-safe: русские сообщения декодируются из UTF-8 base64, чтобы Windows PowerShell не ломал кириллицу без BOM.

## Next Best Action

- Forward-test the updated onboarding skill in a fresh session or subagent-capable environment.
- Later, decide whether local skill snapshots need real upstream sources or should stay machine-local.
- After approval phrase, either install Superpowers through Codex plugin UI/marketplace or remove stale Superpowers config section.

## Notes For The Next Agent

- Продолжать из файлов, не из chat memory.
- Не менять `D:\WORK\db` и `D:\WORK\canvas`; они использовались только как references для этой задачи.
