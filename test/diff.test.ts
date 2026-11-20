import assert from 'node:assert/strict';
import test from 'node:test';
import { computeDiff, entryId, hashEntry } from '../src/core/diff.js';
import { ResourceEntry } from '../src/core/types.js';

test('computeDiff detects missing keys and changed source strings only', () => {
  const s1: ResourceEntry = { kind: 'string', file: 'a.xml', key: 'unchanged', value: 'Save' };
  const s2: ResourceEntry = { kind: 'string', file: 'a.xml', key: 'changed', value: 'Save now' };
  const s3: ResourceEntry = { kind: 'string', file: 'a.xml', key: 'added', value: 'Cancel' };

  const target = new Map<string, ResourceEntry>([
    [entryId('a.xml', 'unchanged'), { kind: 'string', file: 'a.xml', key: 'unchanged', value: 'Зберегти' }],
    [entryId('a.xml', 'changed'), { kind: 'string', file: 'a.xml', key: 'changed', value: 'Зберегти' }],
  ]);

  const prevState = {
    version: 1 as const,
    sourceHashes: {
      [entryId('a.xml', 'unchanged')]: hashEntry(s1),
      [entryId('a.xml', 'changed')]: hashEntry({ ...s2, value: 'Save' }),
    },
  };

  const diff = computeDiff([s1, s2, s3], target, prevState);
  assert.equal(diff.length, 2);
  assert.deepEqual(
    diff.map((d) => [d.entry.key, d.reason]),
    [
      ['changed', 'source_changed'],
      ['added', 'missing'],
    ],
  );
});
