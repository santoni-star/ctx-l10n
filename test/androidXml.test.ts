import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  escapeAndroidXmlText,
  localeToValuesDir,
  parseAndroidXml,
  serializeAndroidXml,
  syncLocalesConfigXml,
} from '../src/adapters/androidXml.js';

test('localeToValuesDir maps default, id, and BCP-47 script tags', () => {
  assert.equal(localeToValuesDir('en', 'en'), 'values');
  assert.equal(localeToValuesDir('zh-Hans', 'zh-Hans'), 'values');
  assert.equal(localeToValuesDir('uk', 'en'), 'values-uk');
  assert.equal(localeToValuesDir('id', 'en'), 'values-in');
  assert.equal(localeToValuesDir('zh-Hans', 'en'), 'values-b+zh+Hans');
});

test('parseAndroidXml skips translatable=false and parses strings + plurals', () => {
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<resources>
  <string name="skip_me" translatable="false">Skills</string>
  <string name="greeting">It\\'s &amp; ready for %1$s</string>
  <string name="scale" formatted="false">Scale (80%–110%)</string>
  <plurals name="items_count">
    <item quantity="one">%d item</item>
    <item quantity="other">%d items</item>
  </plurals>
</resources>`;

  const entries = parseAndroidXml(xml, 'strings.xml');
  assert.equal(entries.length, 3);
  assert.equal(entries[0].key, 'greeting');
  assert.equal(entries[0].kind, 'string');
  if (entries[0].kind === 'string') {
    assert.equal(entries[0].value, "It's & ready for %1$s");
  }
  assert.equal(entries[1].kind === 'string' ? entries[1].formatted : undefined, false);
  assert.equal(entries[2].kind, 'plurals');
});

test('serializeAndroidXml escapes quotes, ampersands, and preserves order', () => {
  const src = parseAndroidXml(
    `<resources><string name="a">One</string><string name="b" formatted="false">80%-110%</string></resources>`,
    'strings.xml',
  );
  const map = new Map(
    src.map((e) => [
      e.key,
      e.kind === 'string'
        ? { ...e, value: e.key === 'a' ? "Ім'я & <b>" : '80%-110%' }
        : e,
    ]),
  );
  const out = serializeAndroidXml(src, map);
  assert.match(out, /<string name="a">Ім\\'я &amp; &lt;b&gt;<\/string>/);
  assert.match(out, /<string name="b" formatted="false">80%-110%<\/string>/);
  assert.equal(escapeAndroidXmlText("it's ok"), "it\\'s ok");
});

test('syncLocalesConfigXml generates Android Per-App Language config', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ctx-l10n-lc-'));
  try {
    const outPath = path.join(tmp, 'locales_config.xml');
    await syncLocalesConfigXml(outPath, ['en', 'uk', 'b+zh+Hans', 'in']);
    const content = await fs.readFile(outPath, 'utf8');
    assert.match(content, /<locale android:name="en" \/>/);
    assert.match(content, /<locale android:name="uk" \/>/);
    assert.match(content, /<locale android:name="zh-Hans" \/>/);
    assert.match(content, /<locale android:name="id" \/>/);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});
