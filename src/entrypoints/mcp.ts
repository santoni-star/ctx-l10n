#!/usr/bin/env node
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { loadConfig } from '../core/config.js';
import { OpenAiCompatibleClient } from '../core/openaiClient.js';
import { checkLocales, syncGlossary, translateLocales } from '../core/translator.js';

const server = new McpServer({
  name: 'ctx-l10n',
  version: '0.1.0',
});

server.tool(
  'ctx_l10n_check',
  'Validate existing localized resources against the source locale (placeholders, tags, CLDR plurals, foreign scripts).',
  {
    repoRoot: z.string().describe('Absolute path to the target repository root'),
    configPath: z.string().optional().describe('Optional path to .ctx-l10n.yml'),
  },
  async ({ repoRoot, configPath }) => {
    const config = await loadConfig(path.resolve(repoRoot), configPath);
    const reports = await checkLocales(path.resolve(repoRoot), config);
    return {
      content: [{ type: 'text', text: JSON.stringify(reports, null, 2) }],
    };
  },
);

server.tool(
  'ctx_l10n_glossary',
  'Analyze project README/docs and generate or update the domain glossary JSON.',
  {
    repoRoot: z.string().describe('Absolute path to the target repository root'),
    configPath: z.string().optional(),
  },
  async ({ repoRoot, configPath }) => {
    const absRoot = path.resolve(repoRoot);
    const config = await loadConfig(absRoot, configPath);
    const apiKey = process.env[config.llm.apiKeyEnv] ?? process.env.OPENAI_API_KEY ?? '';
    if (!apiKey) {
      throw new Error(`Missing API key in ${config.llm.apiKeyEnv} or OPENAI_API_KEY`);
    }
    const llm = new OpenAiCompatibleClient({
      baseUrl: config.llm.baseUrl,
      apiKey,
      defaultModel: config.llm.model,
      temperature: config.llm.temperature,
    });
    const res = await syncGlossary(absRoot, config, llm);
    return {
      content: [{ type: 'text', text: JSON.stringify(res, null, 2) }],
    };
  },
);

server.tool(
  'ctx_l10n_translate',
  'Translate only missing or changed keys with docs/glossary context, strict validation, and self-repair.',
  {
    repoRoot: z.string().describe('Absolute path to the target repository root'),
    configPath: z.string().optional(),
    locales: z.array(z.string()).optional(),
    dryRun: z.boolean().optional(),
  },
  async ({ repoRoot, configPath, locales, dryRun }) => {
    const absRoot = path.resolve(repoRoot);
    const config = await loadConfig(absRoot, configPath);
    const apiKey = process.env[config.llm.apiKeyEnv] ?? process.env.OPENAI_API_KEY ?? '';
    if (!apiKey) {
      throw new Error(`Missing API key in ${config.llm.apiKeyEnv} or OPENAI_API_KEY`);
    }
    const llm = new OpenAiCompatibleClient({
      baseUrl: config.llm.baseUrl,
      apiKey,
      defaultModel: config.llm.model,
      temperature: config.llm.temperature,
    });
    const report = await translateLocales(absRoot, config, llm, { locales, dryRun });
    return {
      content: [{ type: 'text', text: JSON.stringify(report, null, 2) }],
    };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
