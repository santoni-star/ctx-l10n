import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseMarkdownEntries,
  reconstructMarkdown,
} from '../src/adapters/markdownAdapter.js';
import { ResourceEntry } from '../src/core/types.js';

test('markdownAdapter protects frontmatter and fenced code blocks while translating prose', () => {
  const md = `---
title: Guide
---

# Getting Started

Run \`npm install\` to begin:

\`\`\`bash
npx ctx-l10n check
\`\`\`

Visit [Docs](https://example.com) for details.
`;

  const entries = parseMarkdownEntries(md, 'guide.md');
  assert.equal(entries.length, 3);
  assert.equal(entries[0].kind === 'string' ? entries[0].value : '', '# Getting Started');

  const translated = new Map<string, ResourceEntry>([
    ['seg_1', { kind: 'string', file: 'guide.md', key: 'seg_1', value: '# Початок роботи' }],
    ['seg_2', { kind: 'string', file: 'guide.md', key: 'seg_2', value: 'Виконайте `npm install`, щоб почати:' }],
    ['seg_3', { kind: 'string', file: 'guide.md', key: 'seg_3', value: 'Відвідайте [Документацію](https://example.com) для деталей.' }],
  ]);

  const out = reconstructMarkdown(md, translated);
  assert.match(out, /^---\ntitle: Guide\n---/);
  assert.match(out, /# Початок роботи/);
  assert.match(out, /```bash\nnpx ctx-l10n check\n```/);
  assert.match(out, /Відвідайте \[Документацію\]\(https:\/\/example\.com\)/);
});
