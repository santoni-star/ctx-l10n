import fs from 'node:fs/promises';
import path from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import { PluralEntry, PluralForms, ResourceEntry, StringEntry } from '../core/types.js';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  preserveOrder: true,
  trimValues: false,
  parseTagValue: false,
  processEntities: false,
});

export function localeToValuesDir(locale: string): string {
  if (locale === 'en' || locale === 'default') return 'values';
  if (locale === 'id') return 'values-in';
  if (locale.includes('-') && !locale.startsWith('b+')) {
    const parts = locale.split('-');
    return `values-b+${parts.join('+')}`;
  }
  return `values-${locale}`;
}

export function escapeAndroidXmlText(text: string): string {
  const withEntities = text
    .replace(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return withEntities.replace(/(?<!\\)'/g, "\\'");
}

export function unescapeAndroidXmlText(raw: string): string {
  return raw
    .replace(/\\'/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function extractText(nodes: unknown): string {
  if (typeof nodes === 'string') return nodes;
  if (!Array.isArray(nodes)) return '';
  let out = '';
  for (const item of nodes) {
    if (typeof item === 'object' && item !== null && '#text' in item) {
      out += String((item as Record<string, unknown>)['#text']);
    }
  }
  return out;
}

export function parseAndroidXml(xmlContent: string, fileName: string): ResourceEntry[] {
  const parsed = parser.parse(xmlContent) as Array<Record<string, unknown>>;
  const resourcesNode = parsed.find((n) => 'resources' in n);
  if (!resourcesNode || !Array.isArray(resourcesNode.resources)) {
    return [];
  }

  const entries: ResourceEntry[] = [];
  for (const child of resourcesNode.resources as Array<Record<string, unknown>>) {
    const attrs = (child[':@'] as Record<string, string> | undefined) ?? {};
    const name = attrs['@_name'];
    if (!name) continue;
    if (attrs['@_translatable'] === 'false') continue;

    if ('string' in child) {
      const raw = extractText(child.string);
      const entry: StringEntry = {
        kind: 'string',
        file: fileName,
        key: name,
        value: unescapeAndroidXmlText(raw),
        formatted: attrs['@_formatted'] === 'false' ? false : undefined,
      };
      entries.push(entry);
    } else if ('plurals' in child && Array.isArray(child.plurals)) {
      const forms: PluralForms = {};
      for (const pChild of child.plurals as Array<Record<string, unknown>>) {
        if (!('item' in pChild)) continue;
        const pAttrs = (pChild[':@'] as Record<string, string> | undefined) ?? {};
        const qty = pAttrs['@_quantity'];
        if (!qty) continue;
        forms[qty] = unescapeAndroidXmlText(extractText(pChild.item));
      }
      const entry: PluralEntry = {
        kind: 'plurals',
        file: fileName,
        key: name,
        forms,
      };
      entries.push(entry);
    }
  }
  return entries;
}

export function serializeAndroidXml(
  sourceOrder: ResourceEntry[],
  translatedMap: Map<string, ResourceEntry>,
): string {
  const lines: string[] = ['<?xml version="1.0" encoding="utf-8"?>', '<resources>'];
  for (const src of sourceOrder) {
    const entry = translatedMap.get(src.key);
    if (!entry) continue;
    if (entry.kind === 'string') {
      const fmtAttr = entry.formatted === false || (src.kind === 'string' && src.formatted === false)
        ? ' formatted="false"'
        : '';
      lines.push(`  <string name="${entry.key}"${fmtAttr}>${escapeAndroidXmlText(entry.value)}</string>`);
    } else {
      lines.push(`  <plurals name="${entry.key}">`);
      for (const [qty, val] of Object.entries(entry.forms)) {
        lines.push(`    <item quantity="${qty}">${escapeAndroidXmlText(val)}</item>`);
      }
      lines.push('  </plurals>');
    }
  }
  lines.push('</resources>', '');
  return lines.join('\n');
}

export async function readLocaleDirectory(
  resRoot: string,
  locale: string,
  excludeFiles: string[],
): Promise<Map<string, ResourceEntry[]>> {
  const dirPath = path.join(resRoot, localeToValuesDir(locale));
  const result = new Map<string, ResourceEntry[]>();
  let dirEntries: string[];
  try {
    dirEntries = await fs.readdir(dirPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return result;
    }
    throw err;
  }

  for (const file of dirEntries.sort()) {
    if (!file.endsWith('.xml') || excludeFiles.includes(file)) continue;
    const content = await fs.readFile(path.join(dirPath, file), 'utf8');
    result.set(file, parseAndroidXml(content, file));
  }
  return result;
}

export async function writeLocaleFile(
  resRoot: string,
  locale: string,
  fileName: string,
  xmlContent: string,
): Promise<string> {
  const dirPath = path.join(resRoot, localeToValuesDir(locale));
  await fs.mkdir(dirPath, { recursive: true });
  const filePath = path.join(dirPath, fileName);
  await fs.writeFile(filePath, xmlContent, 'utf8');
  return filePath;
}
