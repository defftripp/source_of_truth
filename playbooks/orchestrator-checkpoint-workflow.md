# Orchestrator Checkpoint Workflow

## Цель

Этот playbook нужен для больших agent-задач, которые нельзя безопасно вести как один монолитный `/goal`.

Главная идея:

```text
one orchestrator thread
  -> inventory
  -> checkpoint registry
  -> small checkpoint batches
  -> bounded subagents
  -> durable summaries
  -> synthesis stage
  -> terminal interviews for unresolved risk
```

Такой режим держит контекст управляемым: чат не становится единственным носителем памяти, raw evidence не забивает окно, а каждый checkpoint можно проверить и продолжить отдельно.

## Когда Использовать

Использовать, если есть хотя бы один признак:

- задача покрывает 3+ независимых surfaces, ролей, вкладок, модулей или flows;
- нужен skeptical audit, UX walkthrough, security/RBAC pass, migration review или большой refactor plan;
- есть браузерные screenshots, traces, network logs, bulky artifacts или длинные исследовательские заметки;
- результатом должен стать один большой implementation stage, но evidence собирается частями;
- есть риск потерять важные решения в чате из-за размера контекста.

Не использовать для маленького bugfix, одной страницы, одного API contract change или короткого docs patch. Там хватает обычного `project-operating-flow.md`.

## Роли

**Orchestrator** - текущий основной чат. Он владеет scope, registry, финальным synthesis и durable artifacts.

**Checkpoint subagent** - ограниченный исполнитель или reviewer по одному checkpoint. Он получает только нужный локальный контекст и возвращает findings/evidence, а не финальное решение.

**Main patch owner** - агент, который делает итоговые изменения, если stage дошел до implementation. Для audit-only stage patch owner может отсутствовать.

## Базовые Правила

- Не создавать отдельные user-owned чаты на каждую вкладку по умолчанию. Это быстро превращает coordination в отдельный проект.
- Использовать subagents для независимых checkpoint-ов, а отдельный Codex thread - только если пользователь явно хочет долгоживущую ветку работы.
- Максимум 2-3 checkpoint subagents одновременно, если их evidence нужно потом руками синтезировать.
- Browser/Chrome сессию держит orchestrator, если tool singleton или состояние браузера может конфликтовать.
- Subagent не получает весь chat history. Он получает checkpoint spec, relevant files, links to evidence и output format.
- Findings subagent-а - это input. Proof остается за orchestrator через local verification/evidence.
- После каждых 2-3 checkpoint-ов обновлять durable summary, иначе контекст снова начинает жить только в чате.

## Flow

1. Прочитать `AGENTS.md`, project memory, active stage, runbook и предыдущие artifacts.
2. Составить inventory: роли, вкладки, states, permissions, критические actions, expected evidence.
3. Создать checkpoint registry в durable artifact или stage file.
4. Выбрать первый маленький batch: 1-3 checkpoint-а с минимальными зависимостями.
5. Провести Browser/real-system inspection или code/research pass по каждому checkpoint.
6. Записать summary каждого checkpoint в durable artifact, raw screenshots/traces положить в `output/**` или `work/**`.
7. Отметить статус checkpoint: `PENDING`, `IN_PROGRESS`, `DONE`, `DONE_WITH_CONCERNS`, `BLOCKED`, `NEEDS_CONTEXT`.
8. После batch-а синтезировать cross-cutting issues: repeated UX pattern, RBAC risk, backend contract gap, visual system debt, test gap.
9. Если stage становится слишком большим, вынести следующую группу в substages.
10. В финале создать implementation-ready remediation stage с order, gates, statuses и unresolved decisions.

## Checkpoint Registry Template

```markdown
## Checkpoint Registry

| ID | Role | Surface | States | Evidence | Reviewer Cards | Status | Follow-up |
| --- | --- | --- | --- | --- | --- | --- | --- |
| CP-01 | admin | users tab | default, empty, permission, critical action | screenshots + console/network summary | UX, QA, Security/RBAC | PENDING | - |
```

Для UI audit лучше считать checkpoint-ом не "весь интерфейс", а:

```text
role x tab x important state
```

Пример:

```text
partner-operator x marketplace-products-tab x validation/error state
```

## Subagent Prompt Template

```text
You are a checkpoint reviewer for <checkpoint id>.

Read only:
- <stage/checkpoint spec>
- <linked evidence>
- <relevant docs/files>

Scope:
- inspect <role/surface/state>
- do not edit files
- do not infer quality from source code alone if browser evidence is required
- report only findings that are visible, reproducible, or contract-backed

Return:
- status: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
- top findings with severity
- evidence links used
- missing evidence
- recommended remediation order
- open questions that require orchestrator/user decision
```

## Evidence Contract

Каждый checkpoint artifact должен позволять продолжить работу без истории чата:

- что инспектировалось;
- какая роль/capability/session использовалась;
- какие states были просмотрены;
- screenshots/traces/log paths;
- console/network summary;
- кликабельность и keyboard/accessibility notes, если это UI;
- permission/RBAC notes, если экран permission-heavy;
- что нормально работает;
- что критично;
- что спорно и требует interview;
- final status.

Raw файлы не вставлять в markdown. Линковать:

```text
output/<initiative>/<stage>/<checkpoint>/
work/<initiative>/<stage>/<checkpoint>/
```

## Terminal Interview

Если checkpoint или stage завершается с `DONE_WITH_CONCERNS`, `BLOCKED` или `NEEDS_CONTEXT`, orchestrator готовит короткое interview:

```markdown
### Decision Needed: <topic>

Context:
<1-3 предложения>

Option A - recommended
<что делаем и почему>

Option B
<компромисс>

Option C
<отложить/сузить/исключить>

Expert notes:
- Product/domain:
- UX/UI:
- Frontend QA:
- Security/RBAC, если применимо:

Recommendation:
<одно конкретное решение>
```

Интервью не должно открывать бесконечную дискуссию. Оно закрывает конкретный unresolved risk и обновляет stage.

## Stage Prompt Skeleton

```text
/goal Run <stage name> from <stage file>.
Use <project context>.
This is an orchestrator checkpoint workflow, not a monolithic pass.

First read:
- AGENTS.md
- project map/docs/runbook
- active stage file
- previous artifacts and handoff

Rules:
- build or update checkpoint registry first;
- inspect one role x tab x state checkpoint at a time;
- use Browser/real system evidence where UI quality is being judged;
- use subagents only for bounded checkpoint review/research;
- keep Browser session owned by orchestrator unless the tool supports parallel isolation;
- after every 2-3 checkpoints, update durable summaries;
- do not implement during audit stage;
- write raw evidence under <output path>;
- write durable findings under <artifact path>;
- update handoff with status and next implementation stage;
- if unresolved risk remains, create terminal interview with 3 options and recommendation.

STATUS: DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED
```

## Done Criteria

- registry covers the intended roles/surfaces/states;
- every completed checkpoint has evidence and status;
- raw artifacts are outside chat and linked from markdown;
- repeated patterns are synthesized, not left as duplicate notes;
- implementation-ready stage exists if remediation is clear;
- unresolved risks have terminal interviews or explicit blockers;
- handoff says exactly where to continue.

## References

- OpenAI Codex best practices: https://developers.openai.com/codex/learn/best-practices
- OpenAI Agents orchestration: https://developers.openai.com/api/docs/guides/agents/orchestration
- OpenAI Agents handoffs: https://openai.github.io/openai-agents-python/multi_agent/
- Anthropic multi-agent research system: https://www.anthropic.com/engineering/multi-agent-research-system
- Anthropic effective context engineering: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- Nielsen Norman Group cognitive walkthroughs: https://www.nngroup.com/articles/cognitive-walkthroughs/
- Nielsen Norman Group usability testing: https://www.nngroup.com/articles/usability-testing-101/
