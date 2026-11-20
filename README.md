# ctx-l10n

Context-aware, self-validating localization engine powered by project documentation, OpenAI-compatible LLMs, CLI, MCP, and GitHub Actions.

## Features
- **Docs-driven glossary:** Reads `README.md` / `docs/**` to build and maintain an editable `.ctx-l10n.glossary.json`.
- **Delta-only translation:** Tracks source hashes in `.ctx-l10n.state.json` and translates only missing or changed keys.
- **Strict validation + self-repair:** Verifies placeholders (`%1$s`, `%d`, `{{user}}`), XML/HTML tags, CLDR plural quantities (`one`/`few`/`many`/`other`), and foreign/CJK script leaks; retries failing entries with exact error feedback before flagging them in `.ctx-l10n.report.md`.
- **Android XML adapter:** Supports modular `values/*.xml` layouts (including `plurals`, `translatable="false"`, `formatted="false"`, `values-in` for `id`, and `values-b+zh+Hans` BCP-47 folders).
- **Multiple entrypoints over one core:** CLI (`ctx-l10n`), MCP server over stdio (`ctx-l10n-mcp`), and composite GitHub Action (`action.yml`).

## Quick Start

```bash
npm install
npm run build
node dist/src/entrypoints/cli.js init --repo /path/to/repo --locales uk
node dist/src/entrypoints/cli.js check --repo /path/to/repo
```

Set `CTX_L10N_API_KEY` (and optionally `CTX_L10N_BASE_URL`, `CTX_L10N_MODEL`) to run `glossary` or `translate`:

```bash
node dist/src/entrypoints/cli.js glossary --repo /path/to/repo
node dist/src/entrypoints/cli.js translate --repo /path/to/repo
```

## MCP Server (stdio)

Exposes three tools over the same core:
- `ctx_l10n_check`
- `ctx_l10n_glossary`
- `ctx_l10n_translate`

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
