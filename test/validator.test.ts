import assert from 'node:assert/strict';
import test from 'node:test';
import { ResourceEntry } from '../src/core/types.js';
import { requiredPluralQuantities, validateEntry } from '../src/core/validator.js';

test('validateEntry catches placeholder mismatch and foreign script leaks across any locale', () => {
  const src: ResourceEntry = { kind: 'string', file: 's.xml', key: 'k', value: 'Hello %1$s (%2$d)' };
  const badPh: ResourceEntry = { kind: 'string', file: 's.xml', key: 'k', value: 'Привіт %1$s' };
  assert.equal(validateEntry(src, badPh, 'uk')[0]?.code, 'placeholder_mismatch');

  const cjk: ResourceEntry = { kind: 'string', file: 's.xml', key: 'k', value: 'Привіт %1$s (%2$d) 你好' };
  assert.equal(validateEntry(src, cjk, 'uk')[0]?.code, 'foreign_script');

  const cyrInEn: ResourceEntry = { kind: 'string', file: 's.xml', key: 'k', value: 'Hello П %1$s (%2$d)' };
  assert.equal(validateEntry(src, cyrInEn, 'en')[0]?.code, 'foreign_script');

  const webSrc: ResourceEntry = { kind: 'string', file: 'c.json', key: 'k', value: 'Hi {name}, {{count}} items' };
  const webOk: ResourceEntry = { kind: 'string', file: 'c.json', key: 'k', value: 'Привіт {name}, {{count}} ел.' };
  assert.equal(validateEntry(webSrc, webOk, 'uk').length, 0);
});

test('requiredPluralQuantities uses Intl.PluralRules for any world language', () => {
  assert.deepEqual(requiredPluralQuantities('uk'), ['one', 'few', 'many', 'other']);
  assert.deepEqual(requiredPluralQuantities('ar'), ['zero', 'one', 'two', 'few', 'many', 'other']);
  assert.deepEqual(requiredPluralQuantities('ja'), ['other']);
  assert.deepEqual(requiredPluralQuantities('en'), ['one', 'other']);
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
