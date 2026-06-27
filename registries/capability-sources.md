# Capability Sources

Status: active
Last updated: 2026-06-27

Этот файл отвечает на отдельный вопрос: откуда агенту брать skills, MCP servers и plugins, если они отсутствуют.

`registries/capabilities.json` остается machine-readable source of truth. Здесь та же политика описана для человека и агента.

## Core Rule

Capability without declared source is not installable.

If a skill, MCP server or plugin is missing and `sources[]` does not say where it comes from, the agent must:

1. mark the branch `BLOCKED` or `DEGRADED`;
2. write the missing source as registry debt;
3. ask for or research the real source;
4. update `registries/capabilities.json` before proposing installation;
5. avoid ad-hoc `git clone`, copied PowerShell snippets, random npm packages or reconstructed installed snapshots.

## Source Types

| Type | Meaning | Install rule |
| --- | --- | --- |
| `repo_path` | Canonical file or folder in this repository. | Use repo script or direct repo path. |
| `upstream_repo` | Public or private upstream repository. | Inspect source first; install only through declared command/script. |
| `upstream_package` | Package registry source such as npm. | Pin command in registry before editing MCP config. |
| `codex_plugin_catalog` | Plugin supplied by Codex/OpenAI catalog. | Use Codex plugin install/discovery, not manual clone. |
| `plugin_cache` | Installed plugin artifact under `~/.codex/plugins/cache/**/.codex-plugin/plugin.json`. | Required evidence for plugin availability. Config alone is only intent. |
| `codex_system` | Built into Codex runtime. | Do not manually install from this repo. |
| `local_skill` | Existing installed skill snapshot. | Usable if present; not reinstallable until upstream source is declared. |

## Known Sources

| Capability | Canonical source | Allowed mode |
| --- | --- | --- |
| `source-of-truth-onboarding` | `skills/source-of-truth-onboarding/` in this repo | `scripts/install_codex_skill.ps1` after global approval |
| `superpowers` | `https://github.com/obra/Superpowers` | Codex plugin UI/marketplace; source repo contains `.codex-plugin/` and `skills/` |
| `lazyweb` | `https://github.com/aboul3ata/lazyweb-skill` and Lazyweb installer | Declared upstream installer |
| `context7` | `https://github.com/upstash/context7`, package `@upstash/context7-mcp` | MCP config with declared package |
| `browser-chrome-playwright` | Browser/Chrome from OpenAI bundled plugin catalog/cache (`https://github.com/openai/openai/tree/master/lib/browser_use/plugin` in plugin metadata); Playwright skills from `https://github.com/openai/skills/tree/main/skills/.curated/` | Plugin cache required for Browser/Chrome; Playwright skills have verified upstream source |
| `system-skills` | Codex system skill bundle | Runtime-provided |
| `personal-style-and-rules` | `https://github.com/defftripp/skills.git` | Declared skill installer or repo script |
| `security-baseline` | `https://github.com/openai/skills/tree/main/skills/.curated/` | Verified upstream for security skills |
| `project-spec-docs` | `https://github.com/nexu-io/open-design` | Verified upstream for `pm-spec` and `design-brief` |
| `documents-and-pdfs` | `https://github.com/openai/skills/tree/main/skills/.curated/pdf` and `https://github.com/openai/plugins/tree/main/plugins/sharepoint/skills/` | Plugin install still requires runtime/plugin availability; source paths are verified |
| `creative-artifacts` | `https://github.com/nexu-io/open-design/tree/main/design-templates/` | Verified upstream for creative artifact templates |

## Verified Skill Paths

### OpenAI Skills

- `https://github.com/openai/skills/tree/main/skills/.curated/playwright`
- `https://github.com/openai/skills/tree/main/skills/.curated/playwright-interactive`
- `https://github.com/openai/skills/tree/main/skills/.curated/security-best-practices`
- `https://github.com/openai/skills/tree/main/skills/.curated/security-threat-model`
- `https://github.com/openai/skills/tree/main/skills/.curated/security-ownership-map`
- `https://github.com/openai/skills/tree/main/skills/.curated/pdf`

### Open Design

- `https://github.com/nexu-io/open-design/tree/main/skills/design-brief`
- `https://github.com/nexu-io/open-design/tree/main/design-templates/pm-spec`
- `https://github.com/nexu-io/open-design/tree/main/design-templates/html-ppt`
- `https://github.com/nexu-io/open-design/tree/main/design-templates/web-prototype`
- `https://github.com/nexu-io/open-design/tree/main/design-templates/dashboard`
- `https://github.com/nexu-io/open-design/tree/main/design-templates/mobile-app`
- `https://github.com/nexu-io/open-design/tree/main/design-templates/image-poster`
- `https://github.com/nexu-io/open-design/tree/main/design-templates/video-shortform`
- `https://github.com/nexu-io/open-design/tree/main/design-templates/audio-jingle`

### OpenAI Plugins

- `https://github.com/openai/plugins`
- `https://github.com/openai/plugins/tree/main/plugins/sharepoint/skills/sharepoint-word-docs`
- `https://github.com/openai/plugins/tree/main/plugins/sharepoint/skills/sharepoint-spreadsheets`
- `https://github.com/openai/plugins/tree/main/plugins/sharepoint/skills/sharepoint-powerpoint`

## Global Write Gate

Changing `~/.codex/config.toml`, `~/.codex/skills/**`, plugin config or MCP entries requires the approval phrase:

```text
разрешаю обновить глобалку Codex
```

Without that phrase, stop at audit results and a proposed diff/command.

## Audit

Run:

```powershell
npm run audit:capabilities
```

The audit checks both runtime availability and source metadata. A capability can be installed and still be a registry problem if source metadata is missing.

For plugins, `config.toml` is not enough. A plugin is available only when both are true:

1. `~/.codex/config.toml` enables the plugin.
2. `~/.codex/plugins/cache/<marketplace>/<plugin>/<version>/.codex-plugin/plugin.json` exists.
