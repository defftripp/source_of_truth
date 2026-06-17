---
title: "ECC: agent harness kit как reference для личного workflow"
date: 2026-06-16
description: "Разбор affaan-m/ECC: что это реально умеет, что можно взять в Source of Truth, и почему не стоит ставить full profile вслепую."
tags: ["ecc", "agent-harness", "codex", "claude-code", "mcp", "research"]
---

ECC - не canvas SDK, не product framework и не dependency для конкретного продукта. Это большой agent-harness kit: skills, agents, hooks, rules, MCP configs, install profiles и CLI вокруг Codex, Claude Code, Cursor, OpenCode, Gemini, Zed и похожих AI coding harness.

Практический вывод для Source of Truth:

- не устанавливать `full` profile в рабочую среду без отдельного review;
- не копировать runtime/hooks/install scripts как готовую зависимость;
- использовать как reference по agent workflows, regression/eval evidence, config doctor/repair, MCP safety и provider/cost guardrails;
- переносить только patterns после адаптации под личный playbook и конкретный project overlay.

## Проверенные факты

Дата первичного анализа: 2026-06-11.  
Репозиторий: https://github.com/affaan-m/ECC  
Проверенный commit: `fec84fcf19d1806232b21e38a80ac9fb595442dc`  
License: MIT.  
npm package: `ecc-universal@2.0.0`.  
Node requirement: `>=18`.  
Bin commands: `ecc`, `ecc-control-pane`, `ecc-install`.

Локальная статистика проверенной копии:

| Метрика | Значение |
| --- | ---: |
| Git-tracked files | `3158` |
| Skills directories | `262` |
| Agent markdown files | `64` |
| Command markdown files | `84` |
| Rule directories | `19` |

Live GitHub metadata на момент анализа через GitHub API:

| Поле | Значение |
| --- | --- |
| Stars | `213146` |
| Forks | `32738` |
| Watchers | `1076` |
| Open issues | `42` |
| Last pushed | `2026-06-11T05:44:59Z` |
| Topics | `ai-agents`, `anthropic`, `claude`, `claude-code`, `developer-tools`, `llm`, `mcp`, `productivity` |

## Что ECC реально умеет

ECC поставляет не один инструмент, а переносимую операционную систему для AI coding sessions:

- `agents/` - роли для review, planning, architecture, build-fix, security, framework-specific review;
- `skills/` - workflow-инструкции для TDD, verification loops, security review, evals, research, frontend/backend patterns, cost-aware LLM pipelines, media, orchestration;
- `commands/` - command docs и legacy shims для Claude/OpenCode-like flows;
- `rules/` - общие и language/framework rules;
- `hooks/` - hook runtime в первую очередь для Claude Code: pre/post tool checks, session lifecycle, quality gates, pattern extraction;
- `.codex/` - Codex baseline: `AGENTS.md`, `config.toml`, agent role TOML configs;
- `mcp-configs/` - template catalog для MCP servers;
- `scripts/` - selective install, doctor, repair, status, session/work-item tools, audits, orchestration helpers.

По README проект позиционирует себя как harness-native operator system for agentic work. Это совпадает с формой репозитория: value не в продуктовой UI-логике, а в операционной дисциплине вокруг AI agents.

## Codex-specific вывод

Проверенный dry-run:

```text
node scripts/install-apply.js --profile minimal --target codex --dry-run
```

Результат:

| Поле | Значение |
| --- | --- |
| Mode | `manifest` |
| Target | `codex` |
| Install root | `C:\Users\User\.codex` |
| Profile | `minimal` |
| Selected modules | `agents-core`, `platform-configs`, `workflow-quality` |
| Skipped modules | `rules-core`, `commands-core` |
| Operations | `179` |

Даже `minimal` для Codex является глобальным изменением пользовательского `~/.codex`, а не локальной dependency проекта. Это полезно для личной настройки harness, но рискованно как часть любого продуктового repo.

Отдельно проверен `consult` для запроса про Codex + React/Vite + security/regression/provider gateway/billing credits. ECC предложил:

- `agent:code-reviewer`;
- `capability:security`;
- `capability:operators`;
- `capability:media`;
- `skill:security-review`;
- related profiles: `security`, `full`, `developer`.

Это подтверждает, что ECC хорошо работает как catalog/recommendation surface для агентских практик, но не заменяет project-local rules, product docs и stage plans.

## Security и legal

Плюсы:

- MIT license позволяет коммерческое использование при сохранении notice.
- `SECURITY.md` описывает official distribution surfaces: GitHub repo, `ecc-universal`, GitHub App, marketplace/plugin slug `ecc@ecc`, website.
- Есть supply-chain discipline: pinned GitHub Actions, избегать shell interpolation untrusted GitHub context, release docs only official packages.
- MCP secrets описаны как template placeholders; реальные ключи должны жить в env-vars или secrets manager.
- Codex guidance вводит external action boundary: networked tools read-only by default, явное approval перед publish/push/merge/paid jobs/remote agents/credentials changes.

Риски:

- Install scripts и profiles мутируют user-level harness configs.
- Hook runtime может блокировать или менять поведение tool calls, особенно в Claude Code.
- MCP catalog включает много внешних servers; включение всех сразу раздувает context и расширяет trust boundary.
- MCP templates содержат `YOUR_*_HERE` placeholders. Нельзя превращать их в committed secrets или project defaults.
- Auto-update, repair, doctor и orchestration scripts полезны, но требуют отдельной threat model.

Юридический статус: прямое копирование отдельных файлов разрешено MIT, но архитектурно лучше не копировать runtime. Безопаснее зафиксировать lessons и реализовать собственные маленькие guardrails.

## 7 идей для Source of Truth

1. **Checkpoint evidence contract.** Каждый checkpoint должен завершаться коротким evidence report: что изменено, какие checks прошли, какие risks остались, какие paths не трогались.

2. **Regression-first review для AI-authored changes.** Для backend, billing, assets, jobs и integrations review должен требовать не только "код выглядит правильно", но и конкретный regression check для найденного класса ошибок.

3. **Cost-aware provider gate.** Перед paid provider call нужен явный budget/reservation check, route selection log и fail-fast на auth/validation errors. Retry только для transient errors.

4. **External actions read-only by default.** GitHub, payment providers, remote agents, MCP servers и provider APIs должны быть read-only без явного approval или server-side policy.

5. **Config doctor/repair для demo contour.** Нужен легкий `doctor`/`repair` подход: проверить env vars, ports, mock mode, storage paths, local database и дать deterministic report, не исправляя молча.

6. **Small specialist reviewers.** Вместо одного общего "review" полезны scoped reviewer prompts: security/scope reviewer, test-auditor, provider-gateway reviewer, billing-safety reviewer.

7. **MCP inventory как opt-in catalog.** MCP servers должны жить как catalog/templates с описанием trust boundary, secrets и cost. Не включать все servers в default config.

## Что не переносить

- `full` или `developer` install profile как часть project setup.
- User-level `~/.codex/config.toml` mutation из project scripts.
- Claude Code hooks runtime без отдельного design/security review.
- Автоматическое continuous-learning/pattern extraction из transcript в project rules.
- Большой MCP catalog как default development surface.
- Orchestration/worktree automation до появления стабильной внутренней need.
- Marketing-style claims про "agentic OS" как product requirement.

## Как это меняет playbook

ECC не становится основой Source of Truth. Он подтверждает направление:

```text
docs -> research -> stage/checkpoint -> implementation -> reviewer -> test-auditor -> evidence -> promoted rule
```

Главная идея: агентский workflow нужно проектировать как production system. У него есть роли, gates, audit trail, rollback и trust boundaries.

## Open decisions

- Нужен ли отдельный project-local `skills/` каталог для reviewer/test-auditor prompts.
- Делать ли lightweight `doctor` command для каждого нового проекта.
- Нужен ли отдельный MCP catalog document для approved tools.
- Какие regression/eval reports считать обязательными для provider gateway и billing checkpoints.

## Источники

- GitHub repository: https://github.com/affaan-m/ECC
- README: https://github.com/affaan-m/ECC/blob/main/README.md
- Package metadata: https://github.com/affaan-m/ECC/blob/main/package.json
- Codex guidance: https://github.com/affaan-m/ECC/blob/main/.codex/AGENTS.md
- Security policy: https://github.com/affaan-m/ECC/blob/main/SECURITY.md
- License: https://github.com/affaan-m/ECC/blob/main/LICENSE

