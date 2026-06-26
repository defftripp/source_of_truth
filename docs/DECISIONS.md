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
