import fs from 'node:fs/promises';
import path from 'node:path';
import { CtxL10nConfig, ResourceEntry } from '../core/types.js';
import { FormatAdapter } from './adapter.js';

function flattenJson(
  obj: Record<string, unknown>,
  fileName: string,
  prefix = '',
): ResourceEntry[] {
  const entries: ResourceEntry[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') {
      entries.push({ kind: 'string', file: fileName, key: fullKey, value: v });
    } else if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      entries.push(...flattenJson(v as Record<string, unknown>, fileName, fullKey));
    }
  }
  return entries;
}

function setNested(root: Record<string, unknown>, dottedKey: string, value: string): void {
  const parts = dottedKey.split('.');
  let cur = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (typeof cur[p] !== 'object' || cur[p] === null || Array.isArray(cur[p])) {
      cur[p] = {};
    }
    cur = cur[p] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
}

export function serializeJsonEntries(
  sourceOrder: ResourceEntry[],
  translatedMap: Map<string, ResourceEntry>,
): string {
  const root: Record<string, unknown> = {};
  for (const src of sourceOrder) {
    const entry = translatedMap.get(src.key);
    if (!entry || entry.kind !== 'string') continue;
    setNested(root, entry.key, entry.value);
  }
  return `${JSON.stringify(root, null, 2)}\n`;
}

export const jsonAdapter: FormatAdapter = {
  id: 'json',

  async readLocale(repoRoot, config, locale) {
    const baseDir = path.resolve(repoRoot, config.sourceDir);
    const result = new Map<string, ResourceEntry[]>();

    // Mode 1: directory per locale (e.g. locales/en/*.json -> locales/uk/*.json)
    const localeDir = path.join(baseDir, locale);
    try {
      const stat = await fs.stat(localeDir);
      if (stat.isDirectory()) {
        const files = (await fs.readdir(localeDir)).sort();
        for (const file of files) {
          if (!file.endsWith('.json') || config.excludeFiles.includes(file)) continue;
          const raw = await fs.readFile(path.join(localeDir, file), 'utf8');
          const parsed = JSON.parse(raw) as Record<string, unknown>;
          result.set(file, flattenJson(parsed, file));
        }
        return result;
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }

    // Mode 2: single file per locale (e.g. locales/en.json -> locales/uk.json)
    const singleFile = path.join(baseDir, `${locale}.json`);
    try {
      const raw = await fs.readFile(singleFile, 'utf8');
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      result.set('messages.json', flattenJson(parsed, 'messages.json'));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
    return result;
  },

  async writeLocaleFile(repoRoot, config, locale, fileName, sourceOrder, translatedMap) {
    const baseDir = path.resolve(repoRoot, config.sourceDir);
    const sourceLocaleDir = path.join(baseDir, config.sourceLocale);
    let useDirMode = false;
    try {
      useDirMode = (await fs.stat(sourceLocaleDir)).isDirectory();
    } catch {
      useDirMode = false;
    }

    const outPath = useDirMode
      ? path.join(baseDir, locale, fileName)
      : path.join(baseDir, `${locale}.json`);
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, serializeJsonEntries(sourceOrder, translatedMap), 'utf8');
    return outPath;
  },
};
