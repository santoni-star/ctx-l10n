# Architecture

`ctx-l10n` separates **localization orchestration & validation** (`src/core/`) from **file formats** (`src/adapters/`) and **invocation surfaces** (`src/entrypoints/`).

## Pipeline

1. **Documentation & Glossary (`src/core/docsContext.ts`)**
   - Reads `README.md` / `docs/**` (capped to avoid token bloat).
   - Generates or updates `.ctx-l10n.glossary.json` while preserving human-edited terms.
2. **Delta Detection (`src/core/diff.ts`)**
   - Reads `sourceLocale` and each `targetLocale` through the active `FormatAdapter`.
   - Computes SHA-256 content hashes in `.ctx-l10n.state.json` so only missing keys or entries whose source text actually changed are sent to the LLM.
3. **Context-Aware Batch Translation (`src/core/translator.ts`)**
   - Sends batches per file with file name, `sourceLocale` → `targetLocale`, glossary rules, and CLDR plural requirements from `Intl.PluralRules`.
4. **Validation & Self-Repair (`src/core/validator.ts`)**
   - Checks placeholders (`%1$s`, `%d`, `{{var}}`, `{var}`, `${var}`), non-positional specifier order, HTML/XML tags, CLDR plural quantities, and script leaks.
   - Retries failing entries up to `maxRepairAttempts` with exact error diagnostics.
   - Any entry still failing after retries is logged in `.ctx-l10n.report.md` for human review.
5. **Post-Translate Hooks**
   - For `android-xml`, `afterTranslate` optionally writes `res/xml/locales_config.xml` (`android.syncLocaleConfig: true`) so Android 13+ automatically detects device language and exposes the app language list in system settings.

## Extending with New Platform Adapters

Every adapter implements `FormatAdapter` (`src/adapters/adapter.ts`):

- `readLocale(repoRoot, config, locale)` → `Map<fileName, ResourceEntry[]>`
- `writeLocaleFile(repoRoot, config, locale, fileName, sourceOrder, translatedMap)` → written file path
- `afterTranslate?(repoRoot, config, locales)` → optional platform manifest sync

Planned adapters following the same interface:
- Windows: `.resx` (XML)
- macOS / iOS: `.xcstrings` (JSON) and `.strings`
- Linux / gettext: `.po` / `.pot`
