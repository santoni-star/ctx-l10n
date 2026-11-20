import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { loadConfig } from '../src/core/config.js';
import { syncGlossary, translateLocales } from '../src/core/translator.js';
import { LlmClient, LlmMessage } from '../src/core/types.js';

test('translateLocales translates delta, self-repairs broken placeholder, and writes XML + report', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ctx-l10n-'));
  try {
    await fs.mkdir(path.join(tmp, 'app/src/main/res/values'), { recursive: true });
    await fs.writeFile(path.join(tmp, 'README.md'), '# Eta\nAndroid AI agent with MCP and Skills.', 'utf8');
    await fs.writeFile(
      path.join(tmp, 'app/src/main/res/values/strings.xml'),
      `<?xml version="1.0" encoding="utf-8"?>
<resources>
  <string name="hello">Hello %1$s</string>
  <plurals name="items">
    <item quantity="one">%d item</item>
    <item quantity="other">%d items</item>
  </plurals>
</resources>`,
      'utf8',
    );

    let call = 0;
    const mockLlm: LlmClient = {
      async chatJson<T>(messages: LlmMessage[]): Promise<T> {
        const userMsg = messages.find((m) => m.role === 'user')?.content ?? '';
        if (userMsg.includes('Analyze the project documentation')) {
          return {
            projectName: 'Eta',
            summary: 'Android AI agent',
            tone: 'Concise UI copy',
            doNotTranslate: ['Eta', 'MCP'],
            terms: [{ term: 'Skills', keepUntranslated: false, note: 'Навички' }],
          } as T;
        }
        call++;
        if (call === 1) {
          // Intentionally drop %1$s on hello to trigger self-repair!
          return {
            translations: {
              hello: 'Привіт',
              items: {
                one: '%d елемент',
                few: '%d елементи',
                many: '%d елементів',
                other: '%d елемента',
              },
            },
          } as T;
        }
        return {
          translations: {
            hello: 'Привіт %1$s',
          },
        } as T;
      },
    };

    const config = await loadConfig(tmp);
    await syncGlossary(tmp, config, mockLlm);
    const report = await translateLocales(tmp, config, mockLlm);

    assert.equal(report.locales.length, 1);
    assert.equal(report.locales[0].translatedKeys, 2);
    assert.equal(report.locales[0].repairedKeys, 1);
    assert.equal(report.locales[0].flaggedItems.length, 0);
    assert.equal(report.locales[0].issues.length, 0);

    const ukXml = await fs.readFile(path.join(tmp, 'app/src/main/res/values-uk/strings.xml'), 'utf8');
    assert.match(ukXml, /Привіт %1\$s/);
    assert.match(ukXml, /<item quantity="many">%d елементів<\/item>/);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});
