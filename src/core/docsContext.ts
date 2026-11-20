import fs from 'node:fs/promises';
import path from 'node:path';
import { LlmClient, ProjectGlossary } from './types.js';

const MAX_DOCS_CHARS = 18_000;

export async function collectDocsText(repoRoot: string, docPaths: string[]): Promise<string> {
  const chunks: string[] = [];
  let total = 0;

  for (const rel of docPaths) {
    const abs = path.resolve(repoRoot, rel);
    try {
      const stat = await fs.stat(abs);
      if (stat.isDirectory()) {
        const files = await fs.readdir(abs);
        for (const f of files.sort()) {
          if (!f.endsWith('.md')) continue;
          const content = await fs.readFile(path.join(abs, f), 'utf8');
          const slice = content.slice(0, MAX_DOCS_CHARS - total);
          if (slice) {
            chunks.push(`### ${rel}/${f}\n${slice}`);
            total += slice.length;
          }
          if (total >= MAX_DOCS_CHARS) break;
        }
      } else {
        const content = await fs.readFile(abs, 'utf8');
        const slice = content.slice(0, MAX_DOCS_CHARS - total);
        if (slice) {
          chunks.push(`### ${rel}\n${slice}`);
          total += slice.length;
        }
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw err;
      }
    }
    if (total >= MAX_DOCS_CHARS) break;
  }

  return chunks.join('\n\n');
}

export async function loadGlossary(repoRoot: string, glossaryPath: string): Promise<ProjectGlossary | null> {
  const fullPath = path.resolve(repoRoot, glossaryPath);
  try {
    const raw = await fs.readFile(fullPath, 'utf8');
    return JSON.parse(raw) as ProjectGlossary;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw err;
  }
}

export async function saveGlossary(
  repoRoot: string,
  glossaryPath: string,
  glossary: ProjectGlossary,
): Promise<string> {
  const fullPath = path.resolve(repoRoot, glossaryPath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, `${JSON.stringify(glossary, null, 2)}\n`, 'utf8');
  return fullPath;
}

export async function buildGlossaryFromDocs(
  llm: LlmClient,
  projectName: string,
  docsText: string,
  existingGlossary: ProjectGlossary | null,
): Promise<ProjectGlossary> {
  if (!docsText.trim()) {
    return (
      existingGlossary ?? {
        projectName,
        summary: `${projectName} application`,
        tone: 'Concise, natural UI copy',
        doNotTranslate: [projectName],
        terms: [],
      }
    );
  }

  const prompt = [
    'Analyze the project documentation below and produce a localization glossary in JSON.',
    'Return ONLY a JSON object with fields:',
    '{ "projectName": string, "summary": string, "tone": string, "doNotTranslate": string[], "terms": [{ "term": string, "keepUntranslated": boolean, "note": string }] }',
    'Include key product concepts, brand names, technical acronyms, and UI terms.',
    existingGlossary
      ? `Preserve human-curated terms from existing glossary where relevant:\n${JSON.stringify(existingGlossary)}`
      : '',
    `Documentation:\n${docsText}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  const generated = await llm.chatJson<ProjectGlossary>([
    {
      role: 'system',
      content: 'You are a localization architect extracting domain terminology and style rules from software documentation.',
    },
    { role: 'user', content: prompt },
  ]);

  return {
    projectName: generated.projectName || projectName,
    summary: generated.summary || `${projectName} application`,
    tone: generated.tone || 'Concise, natural UI copy',
    doNotTranslate: Array.from(new Set([projectName, ...(generated.doNotTranslate ?? [])])),
    terms: generated.terms ?? [],
  };
}
