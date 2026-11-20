import { PluralEntry, ResourceEntry, ValidationIssue } from './types.js';

const PLACEHOLDER_REGEX = /%(?:\d+\$)?[-#+ 0,(]*\d*(?:\.\d+)?[a-zA-Z]|%%|\{\{[a-zA-Z0-9_]+\}\}/g;
const HTML_TAG_NAMES = '(?:b|i|u|s|a|p|br|hr|em|strong|small|big|sub|sup|font|span|div|code|pre|tt|li|ul|ol|xliff:g)';
const TAG_REGEX = new RegExp(`<\\/?${HTML_TAG_NAMES}(?:\\s+[^>]*)?\\/?>`, 'gi');
const CJK_REGEX = /[\u4E00-\u9FFF]/;

const CLDR_REQUIRED_PLURALS: Record<string, string[]> = {
  uk: ['one', 'few', 'many', 'other'],
  ru: ['one', 'few', 'many', 'other'],
  pl: ['one', 'few', 'many', 'other'],
  cs: ['one', 'few', 'many', 'other'],
  ro: ['one', 'few', 'other'],
  ar: ['zero', 'one', 'two', 'few', 'many', 'other'],
  en: ['one', 'other'],
  de: ['one', 'other'],
  fr: ['one', 'many', 'other'],
  es: ['one', 'many', 'other'],
  it: ['one', 'many', 'other'],
  pt: ['one', 'many', 'other'],
  nl: ['one', 'other'],
  tr: ['one', 'other'],
  ja: ['other'],
  ko: ['other'],
  vi: ['other'],
  id: ['other'],
  in: ['other'],
  hi: ['one', 'other'],
};

export function extractPlaceholders(text: string): string[] {
  return text.match(PLACEHOLDER_REGEX) ?? [];
}

export function extractTags(text: string): string[] {
  const tags: string[] = [];
  for (const match of text.matchAll(TAG_REGEX)) {
    tags.push(match[0].startsWith('</') ? `/${match[1]}` : match[1]);
  }
  return tags;
}

function isCjkLocale(locale: string): boolean {
  const norm = locale.toLowerCase();
  return norm.startsWith('zh') || norm.startsWith('ja');
}

function validateTextPair(
  file: string,
  key: string,
  locale: string,
  sourceText: string,
  targetText: string,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!targetText.trim()) {
    issues.push({ file, key, locale, code: 'empty', message: 'Translation is empty' });
    return issues;
  }

  if (!isCjkLocale(locale) && CJK_REGEX.test(targetText)) {
    issues.push({ file, key, locale, code: 'foreign_script', message: 'Contains unexpected CJK characters' });
  }

  if (locale.toLowerCase().startsWith('uk') && /[ыэъёЫЭЪЁ]/.test(targetText)) {
    issues.push({ file, key, locale, code: 'foreign_script', message: 'Contains non-Ukrainian Cyrillic letters' });
  }

  const srcPh = extractPlaceholders(sourceText);
  const tgtPh = extractPlaceholders(targetText);
  const srcSorted = [...srcPh].sort();
  const tgtSorted = [...tgtPh].sort();

  if (srcSorted.join('|') !== tgtSorted.join('|')) {
    issues.push({
      file,
      key,
      locale,
      code: 'placeholder_mismatch',
      message: `Placeholder mismatch: expected [${srcPh.join(', ')}], got [${tgtPh.join(', ')}]`,
    });
  } else {
    const hasNonPositional = srcPh.some((p) => p.startsWith('%') && p !== '%%' && !/%\d+\$/.test(p));
    if (hasNonPositional && srcPh.join('|') !== tgtPh.join('|')) {
      issues.push({
        file,
        key,
        locale,
        code: 'placeholder_order',
        message: `Non-positional placeholder order changed: expected [${srcPh.join(', ')}], got [${tgtPh.join(', ')}]`,
      });
    }
  }

  const srcTags = extractTags(sourceText).sort();
  const tgtTags = extractTags(targetText).sort();
  if (srcTags.join('|') !== tgtTags.join('|')) {
    issues.push({
      file,
      key,
      locale,
      code: 'tag_mismatch',
      message: `Tag mismatch: expected [${srcTags.join(', ')}], got [${tgtTags.join(', ')}]`,
    });
  }

  return issues;
}

export function requiredPluralQuantities(locale: string): string[] {
  const base = locale.toLowerCase().split(/[-+]/)[0];
  return CLDR_REQUIRED_PLURALS[locale.toLowerCase()] ?? CLDR_REQUIRED_PLURALS[base] ?? ['one', 'other'];
}

export function validateEntry(
  source: ResourceEntry,
  target: ResourceEntry | undefined,
  locale: string,
): ValidationIssue[] {
  if (!target) {
    return [{ file: source.file, key: source.key, locale, code: 'missing', message: 'Missing translation' }];
  }

  if (source.kind === 'string' && target.kind === 'string') {
    return validateTextPair(source.file, source.key, locale, source.value, target.value);
  }

  if (source.kind === 'plurals' && target.kind === 'plurals') {
    return validatePluralEntry(source, target, locale);
  }

  return [{ file: source.file, key: source.key, locale, code: 'missing', message: 'Entry kind mismatch' }];
}

function validatePluralEntry(
  source: PluralEntry,
  target: PluralEntry,
  locale: string,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const srcOther = source.forms.other ?? Object.values(source.forms)[0] ?? '';
  const required = requiredPluralQuantities(locale);

  for (const qty of required) {
    if (!(qty in target.forms)) {
      issues.push({
        file: source.file,
        key: source.key,
        locale,
        code: 'plural_missing_quantity',
        message: `Missing CLDR plural quantity "${qty}" for locale "${locale}"`,
      });
    }
  }

  const srcNeedsCount = /%(?:\d+\$)?d/.test(srcOther);
  for (const [qty, val] of Object.entries(target.forms)) {
    issues.push(...validateTextPair(source.file, `${source.key}[${qty}]`, locale, srcOther, val));
    if (srcNeedsCount && !/%(?:\d+\$)?d/.test(val)) {
      issues.push({
        file: source.file,
        key: source.key,
        locale,
        code: 'plural_missing_number',
        message: `Plural quantity "${qty}" must include numeric placeholder (%d / %1$d)`,
      });
    }
  }
  return issues;
}
