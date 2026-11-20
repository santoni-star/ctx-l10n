import { LlmClient, LlmMessage } from './types.js';

export interface OpenAiClientOptions {
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
  temperature?: number;
  timeoutMs?: number;
}

export function extractJsonPayload(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }
  return trimmed;
}

export class OpenAiCompatibleClient implements LlmClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly defaultModel: string;
  private readonly temperature: number;
  private readonly timeoutMs: number;

  constructor(options: OpenAiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.apiKey = options.apiKey;
    this.defaultModel = options.defaultModel;
    this.temperature = options.temperature ?? 0.1;
    this.timeoutMs = options.timeoutMs ?? 90_000;
  }

  async chatJson<T>(
    messages: LlmMessage[],
    options?: { model?: string; temperature?: number },
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: options?.model ?? this.defaultModel,
          temperature: options?.temperature ?? this.temperature,
          response_format: { type: 'json_object' },
          messages,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`LLM API error HTTP ${response.status}: ${errText.slice(0, 400)}`);
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error('LLM API returned empty message content');
      }
      const jsonText = extractJsonPayload(content);
      return JSON.parse(jsonText) as T;
    } finally {
      clearTimeout(timer);
    }
  }
}
