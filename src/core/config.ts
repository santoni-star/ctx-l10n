import fs from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { z } from 'zod';
import { CtxL10nConfig } from './types.js';

const ConfigSchema = z.object({
  version: z.literal(1).default(1),
  projectName: z.string().min(1).default('App'),
  adapter: z.enum(['android-xml']).default('android-xml'),
  sourceDir: z.string().min(1).default('app/src/main/res'),
  sourceLocale: z.string().min(1).default('en'),
  targetLocales: z.array(z.string().min(1)).default(['uk']),
  excludeFiles: z.array(z.string()).default(['colors.xml', 'styles.xml']),
  docs: z.array(z.string()).default(['README.md']),
  glossaryPath: z.string().default('.ctx-l10n.glossary.json'),
  statePath: z.string().default('.ctx-l10n.state.json'),
  reportPath: z.string().default('.ctx-l10n.report.md'),
  batchSize: z.number().int().min(1).max(100).default(30),
  maxRepairAttempts: z.number().int().min(0).max(5).default(2),
  backTranslationCheck: z.boolean().default(false),
  llm: z
    .object({
      baseUrl: z.string().default(process.env.CTX_L10N_BASE_URL ?? process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1'),
      model: z.string().default(process.env.CTX_L10N_MODEL ?? 'gpt-4o-mini'),
      backTranslationModel: z.string().optional(),
      apiKeyEnv: z.string().default('CTX_L10N_API_KEY'),
      temperature: z.number().min(0).max(1).default(0.1),
    })
    .default({}),
});

export async function loadConfig(repoRoot: string, configPath?: string): Promise<CtxL10nConfig> {
  const targetPath = path.resolve(repoRoot, configPath ?? '.ctx-l10n.yml');
  let rawObj: unknown = {};
  try {
    const content = await fs.readFile(targetPath, 'utf8');
    rawObj = YAML.parse(content) ?? {};
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT' || configPath) {
      throw err;
    }
  }
  const parsed = ConfigSchema.parse(rawObj);
  return {
    ...parsed,
    llm: {
      ...parsed.llm,
      baseUrl: process.env.CTX_L10N_BASE_URL || parsed.llm.baseUrl,
      model: process.env.CTX_L10N_MODEL || parsed.llm.model,
    },
  };
}

export function renderDefaultConfig(projectName: string, targetLocales: string[] = ['uk']): string {
  const cfg = {
    version: 1,
    projectName,
    adapter: 'android-xml',
    sourceDir: 'app/src/main/res',
    sourceLocale: 'en',
    targetLocales,
    excludeFiles: ['colors.xml', 'styles.xml'],
    docs: ['README.md'],
    glossaryPath: '.ctx-l10n.glossary.json',
    statePath: '.ctx-l10n.state.json',
    reportPath: '.ctx-l10n.report.md',
    batchSize: 30,
    maxRepairAttempts: 2,
    backTranslationCheck: false,
    llm: {
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      apiKeyEnv: 'CTX_L10N_API_KEY',
      temperature: 0.1,
    },
  };
  return YAML.stringify(cfg);
}
