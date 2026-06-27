# Capability Registry

Status: active
Last updated: 2026-06-27

Этот registry отвечает на вопрос: какие внешние skills, MCP и plugins считаются частью нормального `source_of_truth` operating layer.

Полный installed skill catalog не копируется в глобальный `AGENTS.md`. Codex уже получает live registry при старте. Здесь фиксируется только маленький слой must-have capabilities и правила degraded mode.

Отдельный обязательный слой sources/provenance:

- machine-readable: `registries/capabilities.json` поле `sources[]`;
- human-readable: `registries/capability-sources.md`.

Если capability отсутствует и у нее нет declared source, агент не имеет права придумывать install path, `git clone` или PowerShell-команду. Нужно записать `BLOCKED`/`DEGRADED` и сначала добавить реальный source в registry.

## Уровни

| Уровень | Значение |
| --- | --- |
| `required` | Нужен для полного source-of-truth flow. Отсутствие должно явно блокировать или переводить работу в degraded mode. |
| `recommended` | Сильный default. Отсутствие фиксируется как риск, но не блокирует несвязанную работу. |
| `task_required` | Нужно только для задач конкретного типа: PDF, презентации, UI, security и т.д. |

## Required

### `source-of-truth-onboarding`

Собственный skill этого репо. Его задача: взять сырой проект, провести аудит, поднять operating skeleton, провести интервью, создать PRD/architecture/rules/skills/hooks и допустить implementation только после `READY_FOR_IMPLEMENTATION`.

Текущий статус: source active.

Source path:

```text
skills/source-of-truth-onboarding/SKILL.md
```

Global installed copy is user-gated. Пока пользователь не разрешил запись в `~/.codex`, audit может показывать recommended WARN по installed copy, но repo-local onboarding уже доступен.

Install source: this repository, `scripts/install_codex_skill.ps1`.

### Superpowers

Must-have workflow pack:

- `superpowers:brainstorming`
- `superpowers:writing-plans`
- `superpowers:test-driven-development`
- `superpowers:systematic-debugging`
- `superpowers:verification-before-completion`
- `superpowers:requesting-code-review`

Зачем: mature flow от идеи к дизайну, плану, implementation и verification.

Install source: `https://github.com/obra/Superpowers`. В Codex ставить через plugin UI/marketplace; repo нужен как проверяемый upstream source. Config entry `superpowers@openai-curated` без plugin cache не считается availability.

### Lazyweb

Must-have для product UI:

- `lazyweb`
- `lazyweb-design`
- `lazyweb-quick-search`
- `lazyweb-ab-test-research`
- `lazyweb-update`
- MCP `lazyweb`

Правило: product UI нельзя проектировать из головы, если Lazyweb доступен.

Install source: Lazyweb upstream/installer declared in `registries/capabilities.json`.

### Context7

Must-have MCP для свежей документации библиотек, SDK, API, cloud services и CLI.

Правило: version-sensitive technical guidance не давать из памяти, если можно проверить Context7.

Install source: Upstash Context7 package `@upstash/context7-mcp`, declared in MCP config only after approval.

### Browser / Chrome / Playwright

Must-have для UI verification:

- Browser plugin
- Chrome plugin
- `playwright`
- `playwright-interactive`

Правило: если runnable UI существует, нельзя утверждать качество видимого поведения только по коду.

Install source: Browser/Chrome from Codex bundled plugin catalog/cache; plugin metadata points to `https://github.com/openai/openai/tree/master/lib/browser_use/plugin`. Playwright skills are verified in `https://github.com/openai/skills/tree/main/skills/.curated/`.

### System Skills

Must-have system layer:

- `skill-installer`
- `skill-creator`
- `openai-docs`
- `imagegen`

Зачем: установка/создание skills, OpenAI docs и генерация assets.

Install source: Codex system skill bundle. Do not reinstall manually from this repo.

### Personal Style And Rules Helpers

Must-have personal layer:

- `caveman`
- `find-skills`
- `load-project-rules`
- `zip-context`

Зачем: стиль общения, поиск skills, перенос rules и упаковка clean context.

Install source: `https://github.com/defftripp/skills.git` for personal rule/skill helpers where applicable.

## Recommended

### `source-of-truth-onboarding-installed`

Installed Codex copy:

```text
~/.codex/skills/source-of-truth-onboarding/SKILL.md
```

Зачем: чтобы skill был доступен из любого проекта без ручного указания source repo.

Почему не required active: global Codex writes требуют явного разрешения `разрешаю обновить глобалку Codex`.

### Security Baseline

- `security-best-practices`
- `security-threat-model`
- `security-ownership-map`

Рекомендуется держать установленным всегда, но вызывать только когда задача реально security-heavy.

Install source: `https://github.com/openai/skills/tree/main/skills/.curated/`.

### Project Spec Docs

- `pm-spec`
- `design-brief`

Полезно для легких product artifacts. Для development-grade PRD основной поток должен принадлежать `source-of-truth-onboarding`.

Install source: `https://github.com/nexu-io/open-design`.

## Task Required

### Documents And PDFs

Нужно только для Word, sheets, slides и PDF задач:

- `documents:documents`
- `spreadsheets:Spreadsheets`
- `presentations:Presentations`
- `pdf:pdf`

Install/source paths: `https://github.com/openai/skills/tree/main/skills/.curated/pdf` and `https://github.com/openai/plugins/tree/main/plugins/sharepoint/skills/`.

### Creative Artifacts

Нужно только для decks, posters, dashboards, prototypes, media и похожих artifacts:

- `html-ppt`
- `web-prototype`
- `dashboard`
- `mobile-app`
- `image-poster`
- `video-shortform`
- `audio-jingle`

Install source: `https://github.com/nexu-io/open-design/tree/main/design-templates/`.

## Degraded Mode

Если capability отсутствует:

1. Зафиксировать missing capability.
2. Назвать impact.
3. Не делать вид, что capability доступна.
4. Для `required` - остановить matching branch или продолжить только в явно помеченном degraded mode.
5. Для `task_required` - блокировать только соответствующий тип задачи.

Если source metadata отсутствует:

1. Не устанавливать capability.
2. Записать registry debt.
3. Найти или запросить реальный upstream/source.
4. Обновить `sources[]`.
5. Только после этого предлагать global write.

## Проверка

Локальная read-only проверка:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\audit_codex_capabilities.ps1
```

Plugin availability requires both enabled config and plugin cache. Audit must not pass a plugin only because `~/.codex/config.toml` has `[plugins."..."] enabled = true`.
