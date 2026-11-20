import assert from 'node:assert/strict';
import test from 'node:test';
import { ResourceEntry } from '../src/core/types.js';
import { validateEntry } from '../src/core/validator.js';

test('validateEntry catches placeholder mismatch and CJK/Russian leaks in uk', () => {
  const src: ResourceEntry = { kind: 'string', file: 's.xml', key: 'k', value: 'Hello %1$s (%2$d)' };
  const badPh: ResourceEntry = { kind: 'string', file: 's.xml', key: 'k', value: 'Привіт %1$s' };
  assert.equal(validateEntry(src, badPh, 'uk')[0]?.code, 'placeholder_mismatch');

  const cjk: ResourceEntry = { kind: 'string', file: 's.xml', key: 'k', value: 'Привіт %1$s (%2$d) 你好' };
  assert.equal(validateEntry(src, cjk, 'uk')[0]?.code, 'foreign_script');

  const ru: ResourceEntry = { kind: 'string', file: 's.xml', key: 'k', value: 'Привет ы %1$s (%2$d)' };
  assert.equal(validateEntry(src, ru, 'uk')[0]?.code, 'foreign_script');

  const ok: ResourceEntry = { kind: 'string', file: 's.xml', key: 'k', value: 'Привіт %1$s (%2$d)' };
  assert.equal(validateEntry(src, ok, 'uk').length, 0);
});

test('validateEntry enforces Ukrainian CLDR plural forms and %d presence', () => {
  const src: ResourceEntry = {
    kind: 'plurals',
    file: 's.xml',
    key: 'cnt',
    forms: { one: '%d model', other: '%d models' },
  };
  const missingFew: ResourceEntry = {
    kind: 'plurals',
    file: 's.xml',
    key: 'cnt',
    forms: { one: '%d модель', many: '%d моделей', other: '%d моделі' },
  };
  const issues = validateEntry(src, missingFew, 'uk');
  assert.ok(issues.some((i) => i.code === 'plural_missing_quantity'));

  const missingNum: ResourceEntry = {
    kind: 'plurals',
    file: 's.xml',
    key: 'cnt',
    forms: { one: 'Одна модель', few: '%d моделі', many: '%d моделей', other: '%d моделі' },
  };
  const numIssues = validateEntry(src, missingNum, 'uk');
  assert.ok(numIssues.some((i) => i.code === 'plural_missing_number'));
});
