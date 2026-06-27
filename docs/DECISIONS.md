# Decisions

## 2026-06-16 - Source of Truth становится публичным playbook-сайтом

Decision:

- Оставить существующий starter kit (`agents/`, `playbooks/`, `rules/`, `hooks/`, `memory/`, `templates/`) как переиспользуемый слой запуска проектов.
- Добавить публичный Hugo-сайт под `content/`, `layouts/`, `static/` и `hugo.toml`.
- Перенести общие AI engineering research notes из продуктовых репозиториев в этот репозиторий.

Rationale:

- Продуктовые репозитории должны держать правду продукта.
- Cross-project agent workflow, research notes, prompts и operating principles должны жить в одном личном Source of Truth.
- Новые ссылки сначала становятся research notes, а playbook меняется только когда появляется переиспользуемый pattern.

Immediate migration:

- ECC research перенесен из research tree AI Canvas в `content/research/ecc.md`.
- Первый публичный manifesto добавлен в `content/blog/source-of-truth-manifest.md`.
- Добавлены начальные playbook-страницы для documentation pipeline и agent workflow.

Status: accepted.

## 2026-06-27 - Capability sources становятся обязательной частью registry

Decision:

- Добавить `sources[]` в `registries/capabilities.json` для каждой required/recommended/task-required capability.
- Добавить `registries/capability-sources.md` как human-readable карту источников и install policy.
- Считать missing source/provenance отдельной registry ошибкой, даже если capability уже установлена на текущей машине.
- Запретить ad-hoc установку skills, MCP servers и plugins из guessed GitHub repos, random npm packages, PowerShell snippets или reconstructed installed snapshots.
- Научить `scripts/audit_codex_capabilities.ps1` проверять наличие source metadata вместе с runtime availability.

Rationale:

- Installed `~/.codex/skills/**` и plugin cache показывают текущее состояние машины, но не отвечают на вопрос, откуда воспроизводимо взять capability.
- Без declared source следующий агент вынужден импровизировать, что ломает безопасность и воспроизводимость.
- Registry должен быть не только списком желаемых tools, но и контрактом поставки: source, allowed install mode, global write gate и degraded behavior.

Status: accepted.

## 2026-06-27 - Plugin config не считается доказательством установки

Decision:

- Для installable skills/plugins фиксировать конкретный upstream Git/source link, когда он известен.
- Для Superpowers использовать `https://github.com/obra/Superpowers` как canonical upstream source.
- Считать `[plugins."..."] enabled = true` только intent в `~/.codex/config.toml`, а не proof of availability.
- Для plugin availability требовать cache artifact `~/.codex/plugins/cache/<marketplace>/<plugin>/<version>/.codex-plugin/plugin.json`.
- Если installed local skill snapshot не имеет real upstream source, оставлять его `source_required_before_update`, а не придумывать ссылку.

Rationale:

- Config может содержать stale или manually-added plugin section.
- Без plugin cache Codex не имеет plugin skills/tools, даже если config выглядит включенным.
- Git/source links нужны для воспроизводимости; unknown source должен быть видимым долгом, а не замаскированным install path.

Status: accepted.

## 2026-06-26 - Onboarding skill становится исполняемым мозгом процесса

Decision:

- Добавить repo-owned skill `skills/source-of-truth-onboarding/SKILL.md`.
- Держать deterministic actions в scripts: `install_codex_skill.ps1` и `audit_project_readiness.ps1`.
- Расширить starter template до полного readiness layer: product direction, architecture, skills registry, rules, hooks, agents README, questions и lessons.
- Сделать source skill active capability, а глобальную installed copy оставить user-gated recommended capability.
- Синхронизировать сам `source_of_truth` с этим каноном через root `docs/`, `develop/`, `memory/`, rules и hooks.

Rationale:

- Пользователь хочет не блог, а автоматизируемый процесс: skill как мозг, scripts/templates как руки.
- Глобальная установка полезна, но запись в `~/.codex` остается high-trust operation и требует explicit approval.
- Readiness gate должен проверять не только PRD, но и правила общения, skills, hooks, memory и первый checkpoint.

Status: accepted.

## 2026-06-26 - External capabilities живут в registry, а не в глобальном AGENTS

Decision:

- Добавить `registries/capabilities.json`, `registries/capabilities.md` и `registries/codex-global.json`.
- Считать Superpowers, Lazyweb, Context7, Browser/Chrome/Playwright, system skills, personal helper skills и security baseline частью Codex operating layer.
- Не вставлять полный installed skill catalog в глобальный `AGENTS.md` или `AGENTS.override.md`.
- Проверять skills/MCP/plugins read-only audit script перед предложением global changes.
- Разрешать запись в `~/.codex` только после явной фразы пользователя `разрешаю обновить глобалку Codex`, с backup и evidence.

Rationale:

- Глобальные правила должны оставаться компактными.
- Must-have capabilities нужны агенту для зрелого flow, но их список должен быть проверяемым и машинно-читаемым.
- Global Codex setup содержит runtime state и потенциально чувствительные данные, поэтому default mode должен быть audit/proposed diff, а не silent write.

Status: accepted.

## 2026-06-26 - Personal Codex stack остается lean и registry-driven

Decision:

- Держать личную настройку Codex как слоеную систему, а не как один большой файл правил.
- Использовать `AGENTS.override.md` для короткого глобального стиля: русский язык, прямой тон, KISS, no overcoding, безопасность и базовый workflow.
- Держать глобальный `AGENTS.md` тонким routing layer, без Installed Skill Map и без длинных каталогов skills.
- Считать live skill registry Codex актуальной картой доступных skills; подробный workflow должен жить в конкретном `SKILL.md` и читаться только при применении skill.
- Держать MCP как малый allow-list внешних инструментов: Lazyweb для product UI, Context7 для актуальных docs, browser/runtime tooling для проверки. GitHub MCP, Serena и другие серверы добавлять только после явной пользы.
- Удалять или отключать шумные skills, если они дублируют registry, протухли или провоцируют overcoding.

Rationale:

- Большой глобальный `AGENTS.md` быстро превращается в мусорный контекст и конкурирует с живым registry.
- Codex лучше работает, когда стиль и границы короткие, а тяжелые процедуры подгружаются по требованию.
- Малый MCP-слой проще отлаживать, безопаснее для секретов и меньше раздувает стартовый контекст.
- Личный workflow должен быть воспроизводимым: backup перед правками, секреты вне shared config, периодический audit skills/config.

Status: accepted.

## 2026-06-26 - Starter projects получают checkpoint operating flow

Decision:

- Сделать `develop/` обязательной частью reusable project skeleton.
- Считать `develop/IMPLEMENTATION_PLAN.md`, `develop/LOCAL_RUNBOOK.md`, `develop/stages/**` и `develop/artifacts/**` стандартным execution layer для всех проектов.
- Оставить `AGENTS.md` project-local canon, а tool-specific файлы держать thin wrappers.
- Использовать одного main patch owner; subagents read-only, если checkpoint явно не выдал narrow disjoint write scope.
- Требовать scope, anti-scope, verification, evidence path и stop condition для checkpoint-weight work.

Rationale:

- Проекты `db` и `canvas` уже показывают, что stage plans плюс durable evidence делают длинные agent runs возобновляемыми.
- Внешние референсы вроде ferrumctl, AgentFlow, ECC и Personal Corp сходятся в одном pattern: explicit goals, durable state, orchestration boundaries, verification gates и reusable skills.
- Новые проекты должны наследовать workflow по умолчанию, а не изобретать его после первого грязного запуска.

Status: accepted.

## 2026-06-26 - Task tracking остается local-first

Decision:

- Не делать GitHub Issues, GitHub Projects или PR templates частью default workflow.
- Использовать `develop/TODO.md` как local backlog и `develop/CHECKPOINT.md` как active task surface.
- Держать GitHub как понятную витрину репозитория через `README.md`, а не как обязательный task manager.
- Разрешать GitHub Issues только когда явно нужна публичная совместная работа.

Rationale:

- Предпочтительный стиль работы локальный, файловый и низкофрикционный.
- Workflow уже опирается на durable local files: `AGENTS.md`, `memory/**`, `develop/**`, artifacts и decisions.
- GitHub Issues по умолчанию добавляют overhead и не улучшают solo/local execution.

Status: accepted.

## 2026-06-26 - Канон и starter пишутся на русском

Decision:

- Основные README, AGENTS, playbooks, rules, memory templates и starter docs писать на русском.
- Оставлять на английском только команды, пути, code identifiers, status values и tool/API labels.
- В новых проектах по умолчанию использовать русский для plans, evidence, memory и agent rules.

Rationale:

- Рабочий язык владельца проектов - русский.
- Канон должен читаться как личный operating style, а не как чужой англоязычный boilerplate.
- Технические идентификаторы остаются на английском, чтобы инструменты, scripts и агенты не теряли точность.

Status: accepted.
