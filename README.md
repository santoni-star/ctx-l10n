# ctx-l10n

**Context-aware, self-validating localization engine** that reads your project documentation for domain terminology, translates only changed/missing keys from **any source language** into **any target languages**, verifies placeholders/tags/CLDR plurals automatically, and runs cleanly inside your own stack via **CLI**, **MCP**, or **GitHub Actions**.

Cross-platform on **Linux, macOS, and Windows** (Node.js >= 20).

---

## Why ctx-l10n?

- **Any language → any languages:** Not hardcoded to English. Translate from `en`, `zh-Hans`, `uk`, `de`, `ja`, etc., into any set of target locales. CLDR plural rules for every world language are resolved automatically via `Intl.PluralRules`.
- **Docs-driven context & glossary:** Indexes `README.md` / `docs/**` to build an editable `.ctx-l10n.glossary.json` (domain concepts, tone, do-not-translate terms).
- **Delta-only translation:** Tracks source hashes in `.ctx-l10n.state.json` and translates only new or modified keys without overwriting existing human translations.
- **Strict validation + self-repair:**
  - Placeholders (`%1$s`, `%2$d`, `%d`, `{{var}}`, `{var}`, `${var}`) and non-positional placeholder order
  - HTML/XML tags (`<b>`, `<i>`, `<a ...>`, `<xliff:g>`)
  - CLDR plural quantities (`one`/`few`/`many`/`other`/etc.) and numeric placeholder enforcement
  - Foreign script leak detection (e.g., stray CJK or non-target Cyrillic)
  - Automatic self-repair retries with exact validation errors before flagging remaining items in `.ctx-l10n.report.md`
- **Pluggable format adapters:**
  - **`android-xml`** — modular `values/*.xml`, `<plurals>`, `translatable="false"`, `formatted="false"`, `values-in` (`id`), BCP-47 `values-b+*`, plus optional `locales_config.xml` sync for native Android Per-App Language auto-detection.
  - **`json`** — Web (`i18next`, `react-intl`, Next.js, Vue), Electron, Chrome extensions, and CLI tools (supports both `locales/<lang>/*.json` and `locales/<lang>.json` with nested keys).
  - **`markdown`** — Documentation across all platforms (`README`, `docs/*.md`), preserving YAML frontmatter, fenced code blocks, inline code, and URLs.

---

## Installation & Build

```bash
git clone https://github.com/santoni-star/ctx-l10n.git
cd ctx-l10n
npm install
npm run build
```

---

## Configuration (`.ctx-l10n.yml`)

### Android example (with native system language auto-detection)

```yaml
version: 1
projectName: Eta
adapter: android-xml
sourceDir: app/src/main/res
sourceLocale: en
defaultLocale: en
targetLocales:
  - uk
  - pl
  - de
excludeFiles:
  - colors.xml
  - styles.xml
docs:
  - README.md
android:
  syncLocaleConfig: true
  localeConfigPath: app/src/main/res/xml/locales_config.xml
llm:
  baseUrl: https://api.openai.com/v1
  model: gpt-4o-mini
  apiKeyEnv: CTX_L10N_API_KEY
```

### Web / CLI / Electron JSON example (e.g. `zh-Hans` → `en`, `uk`, `de`)

```yaml
version: 1
projectName: MyWebApp
adapter: json
sourceDir: locales
sourceLocale: zh-Hans
targetLocales:
  - en
  - uk
  - de
docs:
  - README.md
  - docs
```

### Documentation Markdown example

```yaml
version: 1
projectName: MyDocs
adapter: markdown
sourceDir: docs
sourceLocale: en
targetLocales:
  - uk
  - es
```

---

## CLI Usage

```bash
# 1. Initialize config
node dist/src/entrypoints/cli.js init --repo /path/to/repo --adapter android-xml --source en --locales uk,pl

# 2. Validate existing translations (no LLM key required)
node dist/src/entrypoints/cli.js check --repo /path/to/repo

# 3. Generate/update glossary from project docs (requires CTX_L10N_API_KEY)
node dist/src/entrypoints/cli.js glossary --repo /path/to/repo

# 4. Translate only missing or changed keys (supports --dry-run and --locales uk)
node dist/src/entrypoints/cli.js translate --repo /path/to/repo
```

Environment variables:
- `CTX_L10N_API_KEY` (or `OPENAI_API_KEY`)
- `CTX_L10N_BASE_URL` (optional override, e.g. OpenRouter, DeepSeek, or local Ollama/vLLM `http://localhost:11434/v1`)
- `CTX_L10N_MODEL` (optional override)

---

## MCP Server (stdio)

Run `ctx-l10n` directly inside AI coding assistants (Cursor, Claude Desktop, Antigravity, etc.) so agents can check and localize resources as they build features:

```json
{
  "mcpServers": {
    "ctx-l10n": {
      "command": "node",
      "args": ["/path/to/ctx-l10n/dist/src/entrypoints/mcp.js"],
      "env": {
        "CTX_L10N_API_KEY": "...",
        "CTX_L10N_BASE_URL": "https://api.openai.com/v1",
        "CTX_L10N_MODEL": "gpt-4o-mini"
      }
    }
  }
}
```

Exposed MCP tools:
- `ctx_l10n_check` — validate existing resources without calling an LLM
- `ctx_l10n_glossary` — analyze `README`/`docs` and update `.ctx-l10n.glossary.json`
- `ctx_l10n_translate` — translate delta keys with validation, self-repair, and `.ctx-l10n.report.md`

---

## GitHub Actions Usage

```yaml
name: Auto Localize
on:
  workflow_dispatch:
  push:
    branches: [main]
    paths:
      - 'app/src/main/res/values/**'

jobs:
  l10n:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: santoni-star/ctx-l10n@main
        with:
          command: translate
          api-key: ${{ secrets.CTX_L10N_API_KEY }}
          base-url: https://api.openai.com/v1
          model: gpt-4o-mini
```

See [docs/architecture.md](docs/architecture.md) for details on the pipeline and adding new platform adapters (`.resx`, `.xcstrings`, `.po`).
