export type PluralForms = Record<string, string>;

export interface StringEntry {
  kind: 'string';
  file: string;
  key: string;
  value: string;
  formatted?: boolean;
}

export interface PluralEntry {
  kind: 'plurals';
  file: string;
  key: string;
  forms: PluralForms;
}

export type ResourceEntry = StringEntry | PluralEntry;

export interface GlossaryTerm {
  term: string;
  keepUntranslated?: boolean;
  note?: string;
  translations?: Record<string, string>;
}

export interface ProjectGlossary {
  projectName: string;
  summary: string;
  tone: string;
  doNotTranslate: string[];
  terms: GlossaryTerm[];
}

export interface DiffItem {
  entry: ResourceEntry;
  reason: 'missing' | 'source_changed';
}

export interface ValidationIssue {
  file: string;
  key: string;
  locale: string;
  code:
    | 'missing'
    | 'empty'
    | 'placeholder_mismatch'
    | 'placeholder_order'
    | 'tag_mismatch'
    | 'plural_missing_quantity'
    | 'plural_missing_number'
    | 'foreign_script'
    | 'back_translation_drift';
  message: string;
}

export interface FlaggedItem {
  file: string;
  key: string;
  locale: string;
  reason: string;
  source: string | PluralForms;
  translation: string | PluralForms;
}

export interface LocaleRunReport {
  locale: string;
  totalSourceKeys: number;
  reusedKeys: number;
  translatedKeys: number;
  repairedKeys: number;
  flaggedItems: FlaggedItem[];
  issues: ValidationIssue[];
}

export interface TranslateRunReport {
  locales: LocaleRunReport[];
  filesWritten: string[];
}

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmClient {
  chatJson<T>(messages: LlmMessage[], options?: { model?: string; temperature?: number }): Promise<T>;
}

export interface CtxL10nConfig {
  version: 1;
  projectName: string;
  adapter: 'android-xml';
  sourceDir: string;
  sourceLocale: string;
  targetLocales: string[];
  excludeFiles: string[];
  docs: string[];
  glossaryPath: string;
  statePath: string;
  reportPath: string;
  batchSize: number;
  maxRepairAttempts: number;
  backTranslationCheck: boolean;
  llm: {
    baseUrl: string;
    model: string;
    backTranslationModel?: string;
    apiKeyEnv: string;
    temperature: number;
  };
}
