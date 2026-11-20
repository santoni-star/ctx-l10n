import fs from 'node:fs/promises';
import path from 'node:path';
import { ResourceEntry } from '../core/types.js';
import { FormatAdapter } from './adapter.js';

interface MarkdownBlock {
  translatable: boolean;
  key?: string;
  raw: string;
}

export function splitMarkdownBlocks(markdown: string): MarkdownBlock[] {
  const lines = markdown.split(/\r?\n/);
  const blocks: MarkdownBlock[] = [];
  let i = 0;
  let segIndex = 0;

  // Preserve YAML frontmatter untouched
  if (lines[0]?.trim() === '---') {
    let end = 1;
    while (end < lines.length && lines[end].trim() !== '---') end++;
    if (end < lines.length) {
      blocks.push({ translatable: false, raw: lines.slice(0, end + 1).join('\n') });
      i = end + 1;
    }
  }

  let buf: string[] = [];
  const flushBuf = (): void => {
    if (buf.length === 0) return;
    const text = buf.join('\n').trim();
    if (text) {
      segIndex++;
      blocks.push({ translatable: true, key: `seg_${segIndex}`, raw: text });
    }
    buf = [];
  };

  while (i < lines.length) {
    const line = lines[i];
    const fenceMatch = line.match(/^(\s*)(`{3,}|~{3,})/);
    if (fenceMatch) {
      flushBuf();
      const fence = fenceMatch[2];
      const codeLines = [line];
      i++;
      while (i < lines.length) {
        codeLines.push(lines[i]);
        if (lines[i].trim().startsWith(fence)) {
          i++;
          break;
        }
        i++;
      }
      blocks.push({ translatable: false, raw: codeLines.join('\n') });
      continue;
    }

    if (line.trim() === '') {
      flushBuf();
      i++;
      continue;
    }

    buf.push(line);
    i++;
  }
  flushBuf();
  return blocks;
}

export function parseMarkdownEntries(markdown: string, fileName: string): ResourceEntry[] {
  const entries: ResourceEntry[] = [];
  for (const b of splitMarkdownBlocks(markdown)) {
    if (b.translatable && b.key) {
      entries.push({ kind: 'string', file: fileName, key: b.key, value: b.raw });
    }
  }
  return entries;
}

export function reconstructMarkdown(
  sourceMarkdown: string,
  translatedMap: Map<string, ResourceEntry>,
): string {
  const outBlocks: string[] = [];
  for (const b of splitMarkdownBlocks(sourceMarkdown)) {
    if (!b.translatable || !b.key) {
      outBlocks.push(b.raw);
    } else {
      const tr = translatedMap.get(b.key);
      outBlocks.push(tr && tr.kind === 'string' ? tr.value : b.raw);
    }
  }
  return `${outBlocks.join('\n\n')}\n`;
}

export const markdownAdapter: FormatAdapter = {
  id: 'markdown',

  async readLocale(repoRoot, config, locale) {
    const baseDir = path.resolve(repoRoot, config.sourceDir, locale);
    const result = new Map<string, ResourceEntry[]>();
    let files: string[];
    try {
      files = (await fs.readdir(baseDir)).sort();
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return result;
      }
      throw err;
    }

    for (const file of files) {
      if (!file.endsWith('.md') || config.excludeFiles.includes(file)) continue;
      const content = await fs.readFile(path.join(baseDir, file), 'utf8');
      result.set(file, parseMarkdownEntries(content, file));
    }
    return result;
  },

  async writeLocaleFile(repoRoot, config, locale, fileName, _sourceOrder, translatedMap) {
    const srcPath = path.resolve(repoRoot, config.sourceDir, config.sourceLocale, fileName);
    const srcMarkdown = await fs.readFile(srcPath, 'utf8');
    const outPath = path.resolve(repoRoot, config.sourceDir, locale, fileName);
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, reconstructMarkdown(srcMarkdown, translatedMap), 'utf8');
    return outPath;
  },
};
