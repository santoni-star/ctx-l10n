import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { loadConfig } from '../src/core/config.js';
import { translateLocales } from '../src/core/translator.js';
import { LlmClient } from '../src/core/types.js';

test('jsonAdapter translates nested Web/CLI JSON from any sourceLocale (e.g. zh-Hans -> en, uk)', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ctx-l10n-json-'));
  try {
    await fs.mkdir(path.join(tmp, 'locales/zh-Hans'), { recursive: true });
    await fs.writeFile(
      path.join(tmp, 'locales/zh-Hans/common.json'),
      JSON.stringify({ nav: { home: '首页', user: '你好, {{name}}' } }, null, 2),
      'utf8',
    );
    await fs.writeFile(
      path.join(tmp, '.ctx-l10n.yml'),
      [
        'version: 1',
        'projectName: WebApp',
        'adapter: json',
        'sourceDir: locales',
        'sourceLocale: zh-Hans',
        'targetLocales:',
        '  - en',
        '  - uk',
      ].join('\n'),
      'utf8',
    );

    const mockLlm: LlmClient = {
      async chatJson<T>(messages): Promise<T> {
        const user = JSON.parse(messages[1].content) as { targetLocale: string };
        if (user.targetLocale === 'en') {
          return { translations: { 'nav.home': 'Home', 'nav.user': 'Hello, {{name}}' } } as T;
        }
        return { translations: { 'nav.home': 'Головна', 'nav.user': 'Привіт, {{name}}' } } as T;
      },
    };

    const config = await loadConfig(tmp);
    const report = await translateLocales(tmp, config, mockLlm);
    assert.equal(report.locales.length, 2);
    assert.equal(report.locales[0].issues.length, 0);
    assert.equal(report.locales[1].issues.length, 0);

    const ukJson = JSON.parse(await fs.readFile(path.join(tmp, 'locales/uk/common.json'), 'utf8')) as {
      nav: { home: string; user: string };
    };
    assert.equal(ukJson.nav.home, 'Головна');
    assert.equal(ukJson.nav.user, 'Привіт, {{name}}');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});
