#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { loadConfig, renderDefaultConfig } from '../core/config.js';
import { OpenAiCompatibleClient } from '../core/openaiClient.js';
import { checkLocales, syncGlossary, translateLocales } from '../core/translator.js';
import { AdapterType } from '../core/types.js';

function getFlag(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  return undefined;
}

function hasFlag(args: string[], name: string): boolean {
  return args.includes(name);
}

async function main(): Promise<void> {
  const [, , command = 'help', ...rest] = process.argv;
  const repoRoot = path.resolve(getFlag(rest, '--repo') ?? process.cwd());
  const configPath = getFlag(rest, '--config');

  if (command === 'init') {
    const projectName = getFlag(rest, '--name') ?? path.basename(repoRoot);
    const adapter = (getFlag(rest, '--adapter') ?? 'android-xml') as AdapterType;
    const sourceLocale = getFlag(rest, '--source') ?? 'en';
    const targetLocales = (getFlag(rest, '--locales') ?? 'uk')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const outPath = path.resolve(repoRoot, configPath ?? '.ctx-l10n.yml');
    await fs.writeFile(
      outPath,
      renderDefaultConfig(projectName, { adapter, sourceLocale, targetLocales }),
      'utf8',
    );
    console.log(`Created ${outPath}`);
    return;
  }

  const config = await loadConfig(repoRoot, configPath);

  if (command === 'check') {
    const reports = await checkLocales(repoRoot, config);
    let totalIssues = 0;
    for (const r of reports) {
      totalIssues += r.issues.length;
      console.log(`[${r.locale}] keys=${r.reusedKeys}/${r.totalSourceKeys} issues=${r.issues.length}`);
      for (const issue of r.issues.slice(0, 15)) {
        console.log(`  - ${issue.file}/${issue.key} (${issue.code}): ${issue.message}`);
      }
    }
    process.exitCode = totalIssues > 0 ? 1 : 0;
    return;
  }

  if (command === 'glossary' || command === 'translate') {
    const apiKey = process.env[config.llm.apiKeyEnv] ?? process.env.OPENAI_API_KEY ?? '';
    if (!apiKey) {
      throw new Error(`Missing API key in env var ${config.llm.apiKeyEnv} (or OPENAI_API_KEY)`);
    }
    const llm = new OpenAiCompatibleClient({
      baseUrl: config.llm.baseUrl,
      apiKey,
      defaultModel: config.llm.model,
      temperature: config.llm.temperature,
    });

    if (command === 'glossary') {
      const res = await syncGlossary(repoRoot, config, llm);
      console.log(`Glossary saved to ${res.glossaryPath} (${res.glossary.terms.length} terms)`);
      return;
    }

    const dryRun = hasFlag(rest, '--dry-run');
    const locales = getFlag(rest, '--locales')
      ?.split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const report = await translateLocales(repoRoot, config, llm, { dryRun, locales });
    for (const r of report.locales) {
      console.log(
        `[${r.locale}] total=${r.totalSourceKeys} reused=${r.reusedKeys} translated=${r.translatedKeys} repaired=${r.repairedKeys} flagged=${r.flaggedItems.length} issues=${r.issues.length}`,
      );
    }
    return;
  }

  console.log(
    'Usage: ctx-l10n <init|glossary|check|translate> [--repo <dir>] [--config <file>] [--adapter android-xml|json|markdown] [--source en] [--locales uk,pl] [--dry-run]',
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
