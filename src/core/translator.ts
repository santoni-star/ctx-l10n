import fs from 'node:fs/promises';
import path from 'node:path';
import {
  readLocaleDirectory,
  serializeAndroidXml,
  writeLocaleFile,
} from '../adapters/androidXml.js';
import { computeDiff, entryId, loadSnapshotState, saveSnapshotState } from './diff.js';
import { buildGlossaryFromDocs, collectDocsText, loadGlossary, saveGlossary } from './docsContext.js';
import {
  CtxL10nConfig,
  DiffItem,
  FlaggedItem,
  LlmClient,
  LocaleRunReport,
  PluralForms,
  ProjectGlossary,
  ResourceEntry,
  TranslateRunReport,
  ValidationIssue,
} from './types.js';
import { requiredPluralQuantities, validateEntry } from './validator.js';

interface TranslationPayload {
  translations: Record<string, string | PluralForms>;
}

function formatSourceEntriesForPrompt(entries: ResourceEntry[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const e of entries) {
    out[e.key] = e.kind === 'string' ? e.value : e.forms;
  }
  return out;
}

function toTranslatedEntry(source: ResourceEntry, raw: string | PluralForms): ResourceEntry {
  if (source.kind === 'string') {
    return {
      kind: 'string',
      file: source.file,
      key: source.key,
      value: typeof raw === 'string' ? raw : String(raw),
      formatted: source.formatted,
    };
  }
  const forms: PluralForms =
    typeof raw === 'object' && raw !== null ? (raw as PluralForms) : { other: String(raw) };
  return {
    kind: 'plurals',
    file: source.file,
    key: source.key,
    forms,
  };
}

function buildTranslationSystemPrompt(
  locale: string,
  glossary: ProjectGlossary | null,
  pluralQuantities: string[],
): string {
  const parts = [
    `You are a senior software localizer translating UI strings into locale "${locale}".`,
    'Rules:',
    '1. Return ONLY a JSON object: { "translations": { "<key>": "<string>" or { "<qty>": "<string>" } } }.',
    '2. Preserve ALL placeholders verbatim (%1$s, %2$d, %d, %s, %%, {{user}}, {{char}}) and HTML/XML tags.',
    `3. For <plurals>, provide ALL required CLDR quantities for "${locale}": ${pluralQuantities.join(', ')}.`,
    '4. If the source plural includes %d or %1$d, include it in EVERY plural quantity form.',
    '5. Keep UI copy concise and natural. Never output Chinese/CJK characters unless the target locale is zh/ja.',
  ];
  if (glossary) {
    parts.push(`Project context (${glossary.projectName}): ${glossary.summary}`);
    parts.push(`Tone: ${glossary.tone}`);
    if (glossary.doNotTranslate.length > 0) {
      parts.push(`Do NOT translate: ${glossary.doNotTranslate.join(', ')}`);
    }
    if (glossary.terms.length > 0) {
      const termLines = glossary.terms
        .slice(0, 40)
        .map((t) => `- ${t.term}${t.keepUntranslated ? ' (keep untranslated)' : ''}${t.note ? `: ${t.note}` : ''}`);
      parts.push(`Glossary:\n${termLines.join('\n')}`);
    }
  }
  return parts.join('\n');
}

async function translateBatchWithRepair(
  llm: LlmClient,
  locale: string,
  fileName: string,
  batch: DiffItem[],
  glossary: ProjectGlossary | null,
  maxRepairAttempts: number,
): Promise<{
  entries: Map<string, ResourceEntry>;
  repairedKeys: number;
  flagged: FlaggedItem[];
}> {
  const pluralQuantities = requiredPluralQuantities(locale);
  const systemPrompt = buildTranslationSystemPrompt(locale, glossary, pluralQuantities);
  const sourceEntries = batch.map((b) => b.entry);

  const initialResp = await llm.chatJson<TranslationPayload>([
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: JSON.stringify({
        file: fileName,
        targetLocale: locale,
        entries: formatSourceEntriesForPrompt(sourceEntries),
      }),
    },
  ]);

  const results = new Map<string, ResourceEntry>();
  const pendingRepair: Array<{ source: ResourceEntry; issues: ValidationIssue[]; current?: ResourceEntry }> = [];

  for (const src of sourceEntries) {
    const raw = initialResp.translations?.[src.key];
    const candidate = raw !== undefined ? toTranslatedEntry(src, raw) : undefined;
    const issues = validateEntry(src, candidate, locale);
    if (issues.length === 0 && candidate) {
      results.set(src.key, candidate);
    } else {
      pendingRepair.push({ source: src, issues, current: candidate });
    }
  }

  let repairedKeys = 0;
  let remaining = pendingRepair;

  for (let attempt = 1; attempt <= maxRepairAttempts && remaining.length > 0; attempt++) {
    const repairInput = remaining.map((item) => ({
      key: item.source.key,
      source: item.source.kind === 'string' ? item.source.value : item.source.forms,
      previousAttempt: item.current
        ? item.current.kind === 'string'
          ? item.current.value
          : item.current.forms
        : null,
      errors: item.issues.map((i) => i.message),
    }));

    const repairResp = await llm.chatJson<TranslationPayload>([
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `Fix the validation errors below and return { "translations": { ... } }:\n${JSON.stringify(repairInput)}`,
      },
    ]);

    const nextRemaining: typeof remaining = [];
    for (const item of remaining) {
      const raw = repairResp.translations?.[item.source.key];
      const candidate = raw !== undefined ? toTranslatedEntry(item.source, raw) : item.current;
      const issues = validateEntry(item.source, candidate, locale);
      if (issues.length === 0 && candidate) {
        results.set(item.source.key, candidate);
        repairedKeys++;
      } else {
        nextRemaining.push({ source: item.source, issues, current: candidate });
      }
    }
    remaining = nextRemaining;
  }

  const flagged: FlaggedItem[] = [];
  for (const item of remaining) {
    if (item.current) {
      results.set(item.source.key, item.current);
    }
    flagged.push({
      file: fileName,
      key: item.source.key,
      locale,
      reason: item.issues.map((i) => `${i.code}: ${i.message}`).join('; '),
      source: item.source.kind === 'string' ? item.source.value : item.source.forms,
      translation: item.current
        ? item.current.kind === 'string'
          ? item.current.value
          : item.current.forms
        : '',
    });
  }

  return { entries: results, repairedKeys, flagged };
}

export async function checkLocales(
  repoRoot: string,
  config: CtxL10nConfig,
): Promise<LocaleRunReport[]> {
  const resRoot = path.resolve(repoRoot, config.sourceDir);
  const sourceByFile = await readLocaleDirectory(resRoot, config.sourceLocale, config.excludeFiles);
  const reports: LocaleRunReport[] = [];

  for (const locale of config.targetLocales) {
    const targetByFile = await readLocaleDirectory(resRoot, locale, config.excludeFiles);
    const issues: ValidationIssue[] = [];
    let totalSourceKeys = 0;
    let presentKeys = 0;

    for (const [fileName, srcEntries] of sourceByFile.entries()) {
      const targetMap = new Map<string, ResourceEntry>();
      for (const t of targetByFile.get(fileName) ?? []) {
        targetMap.set(t.key, t);
      }
      for (const src of srcEntries) {
        totalSourceKeys++;
        const tgt = targetMap.get(src.key);
        if (tgt) presentKeys++;
        issues.push(...validateEntry(src, tgt, locale));
      }
    }

    reports.push({
      locale,
      totalSourceKeys,
      reusedKeys: presentKeys,
      translatedKeys: 0,
      repairedKeys: 0,
      flaggedItems: [],
      issues,
    });
  }

  return reports;
}

export async function syncGlossary(
  repoRoot: string,
  config: CtxL10nConfig,
  llm: LlmClient,
): Promise<{ glossaryPath: string; glossary: ProjectGlossary }> {
  const docsText = await collectDocsText(repoRoot, config.docs);
  const existing = await loadGlossary(repoRoot, config.glossaryPath);
  const glossary = await buildGlossaryFromDocs(llm, config.projectName, docsText, existing);
  const glossaryPath = await saveGlossary(repoRoot, config.glossaryPath, glossary);
  return { glossaryPath, glossary };
}

export async function translateLocales(
  repoRoot: string,
  config: CtxL10nConfig,
  llm: LlmClient,
  options: { dryRun?: boolean; locales?: string[] } = {},
): Promise<TranslateRunReport> {
  const resRoot = path.resolve(repoRoot, config.sourceDir);
  const sourceByFile = await readLocaleDirectory(resRoot, config.sourceLocale, config.excludeFiles);
  const allSourceEntries = Array.from(sourceByFile.values()).flat();
  const prevState = await loadSnapshotState(repoRoot, config.statePath);
  const glossary = await loadGlossary(repoRoot, config.glossaryPath);
  const localesToRun = options.locales?.length ? options.locales : config.targetLocales;

  const localeReports: LocaleRunReport[] = [];
  const filesWritten: string[] = [];

  for (const locale of localesToRun) {
    const targetByFile = await readLocaleDirectory(resRoot, locale, config.excludeFiles);
    const targetById = new Map<string, ResourceEntry>();
    for (const [fileName, entries] of targetByFile.entries()) {
      for (const e of entries) {
        targetById.set(entryId(fileName, e.key), e);
      }
    }

    const diff = computeDiff(allSourceEntries, targetById, prevState);
    const diffByFile = new Map<string, DiffItem[]>();
    for (const d of diff) {
      const list = diffByFile.get(d.entry.file) ?? [];
      list.push(d);
      diffByFile.set(d.entry.file, list);
    }

    let translatedKeys = 0;
    let repairedKeys = 0;
    const flaggedItems: FlaggedItem[] = [];
    const issues: ValidationIssue[] = [];

    for (const [fileName, srcEntries] of sourceByFile.entries()) {
      const mergedMap = new Map<string, ResourceEntry>();
      for (const existing of targetByFile.get(fileName) ?? []) {
        mergedMap.set(existing.key, existing);
      }

      const fileDiff = diffByFile.get(fileName) ?? [];
      for (let i = 0; i < fileDiff.length; i += config.batchSize) {
        const batch = fileDiff.slice(i, i + config.batchSize);
        const batchResult = await translateBatchWithRepair(
          llm,
          locale,
          fileName,
          batch,
          glossary,
          config.maxRepairAttempts,
        );
        for (const [k, v] of batchResult.entries.entries()) {
          mergedMap.set(k, v);
          translatedKeys++;
        }
        repairedKeys += batchResult.repairedKeys;
        flaggedItems.push(...batchResult.flagged);
      }

      for (const src of srcEntries) {
        issues.push(...validateEntry(src, mergedMap.get(src.key), locale));
      }

      if (!options.dryRun && fileDiff.length > 0) {
        const xml = serializeAndroidXml(srcEntries, mergedMap);
        const written = await writeLocaleFile(resRoot, locale, fileName, xml);
        filesWritten.push(written);
      }
    }

    localeReports.push({
      locale,
      totalSourceKeys: allSourceEntries.length,
      reusedKeys: allSourceEntries.length - diff.length,
      translatedKeys,
      repairedKeys,
      flaggedItems,
      issues,
    });
  }

  if (!options.dryRun) {
    await saveSnapshotState(repoRoot, config.statePath, allSourceEntries);
    const reportMd = formatTranslateReportMarkdown({ locales: localeReports, filesWritten });
    const reportFullPath = path.resolve(repoRoot, config.reportPath);
    await fs.writeFile(reportFullPath, reportMd, 'utf8');
  }

  return { locales: localeReports, filesWritten };
}

export function formatTranslateReportMarkdown(report: TranslateRunReport): string {
  const lines: string[] = [
    '# ctx-l10n Localization Report',
    '',
    '> Machine-translated delta with automated placeholder, XML tag, and CLDR plural verification.',
    '',
    '| Locale | Total | Reused | Translated | Self-repaired | Flagged | Remaining issues |',
    '|---|---:|---:|---:|---:|---:|---:|',
  ];

  for (const loc of report.locales) {
    lines.push(
      `| \`${loc.locale}\` | ${loc.totalSourceKeys} | ${loc.reusedKeys} | ${loc.translatedKeys} | ${loc.repairedKeys} | ${loc.flaggedItems.length} | ${loc.issues.length} |`,
    );
  }

  const allFlagged = report.locales.flatMap((l) => l.flaggedItems);
  if (allFlagged.length > 0) {
    lines.push('', '## Flagged items requiring human review', '');
    for (const item of allFlagged.slice(0, 50)) {
      lines.push(`- \`${item.locale}\` · \`${item.file}\` / \`${item.key}\`: ${item.reason}`);
    }
  }

  lines.push('');
  return lines.join('\n');
}
