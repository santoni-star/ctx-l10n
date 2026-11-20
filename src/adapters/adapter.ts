import { CtxL10nConfig, ResourceEntry } from '../core/types.js';

export interface FormatAdapter {
  readonly id: string;
  readLocale(
    repoRoot: string,
    config: CtxL10nConfig,
    locale: string,
  ): Promise<Map<string, ResourceEntry[]>>;
  writeLocaleFile(
    repoRoot: string,
    config: CtxL10nConfig,
    locale: string,
    fileName: string,
    sourceOrder: ResourceEntry[],
    translatedMap: Map<string, ResourceEntry>,
  ): Promise<string>;
  afterTranslate?(
    repoRoot: string,
    config: CtxL10nConfig,
    locales: string[],
  ): Promise<string[]>;
}
