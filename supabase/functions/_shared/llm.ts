/**
 * LLM transport.
 *
 * Speaks the OpenAI Chat Completions wire format, which is also implemented by
 * Azure OpenAI, Together, Groq, OpenRouter, vLLM and most self-hosted gateways.
 * Swap providers by changing OPENAI_BASE_URL / OPENAI_API_KEY / OPENAI_MODEL —
 * no code change is required.
 */

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  name?: string;
  tool_calls?: LlmToolCall[];
  tool_call_id?: string;
}

export interface LlmToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface LlmToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface LlmCompletion {
  message: LlmMessage;
  finishReason: string;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

export class LlmNotConfiguredError extends Error {
  constructor() {
    super('OPENAI_API_KEY is not set');
    this.name = 'LlmNotConfiguredError';
  }
}

export function llmConfigured(): boolean {
  return Boolean(Deno.env.get('OPENAI_API_KEY'));
}

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';

export async function chatCompletion(params: {
  messages: LlmMessage[];
  tools?: LlmToolDefinition[];
  toolChoice?: 'auto' | 'none' | 'required';
  temperature?: number;
  maxTokens?: number;
  responseFormat?: { type: 'json_object' } | { type: 'text' };
  signal?: AbortSignal;
}): Promise<LlmCompletion> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) throw new LlmNotConfiguredError();

  const baseUrl = (Deno.env.get('OPENAI_BASE_URL') ?? DEFAULT_BASE_URL).replace(/\/$/, '');
  const model = Deno.env.get('OPENAI_MODEL') ?? 'gpt-4o-mini';

  const body: Record<string, unknown> = {
    model,
    messages: params.messages,
    temperature: params.temperature ?? 0.6,
    max_tokens: params.maxTokens ?? 900,
  };
  if (params.tools?.length) {
    body.tools = params.tools;
    body.tool_choice = params.toolChoice ?? 'auto';
  }
  if (params.responseFormat) body.response_format = params.responseFormat;

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      ...(Deno.env.get('OPENAI_ORG') ? { 'OpenAI-Organization': Deno.env.get('OPENAI_ORG')! } : {}),
    },
    body: JSON.stringify(body),
    signal: params.signal,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`LLM request failed (${response.status}): ${text.slice(0, 500)}`);
  }

  const json = await response.json();
  const choice = json.choices?.[0];
  if (!choice) throw new Error('LLM returned no choices');

  return {
    message: choice.message as LlmMessage,
    finishReason: choice.finish_reason ?? 'stop',
    usage: json.usage,
  };
}

/** Parses a JSON object out of a model response, tolerating code fences. */
export function parseJsonLoose<T>(raw: string | null): T | null {
  if (!raw) return null;
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1)) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}
