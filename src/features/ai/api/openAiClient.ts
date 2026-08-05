import * as SecureStore from 'expo-secure-store';

/**
 * On-device LLM transport.
 *
 * Speaks the OpenAI Chat Completions wire format, so the same code works with
 * OpenAI, Azure OpenAI, Groq, Together, OpenRouter or a self-hosted vLLM by
 * changing the base URL.
 *
 * SECURITY NOTE
 * -------------
 * A key stored on a device is extractable by anyone with that device. This path
 * exists so a single user can run the full agent on their own phone without
 * deploying a server. For anything multi-user or clinical, the key belongs in
 * the `ai-agent` edge function and the app should call that instead — which it
 * automatically prefers when a Supabase project is configured.
 */

const KEY_STORAGE = 'glpcare.ai.apiKey';
const BASE_URL_STORAGE = 'glpcare.ai.baseUrl';
const MODEL_STORAGE = 'glpcare.ai.model';

export const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
export const DEFAULT_MODEL = 'gpt-4o-mini';

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

export interface LlmCompletion {
  message: LlmMessage;
  finishReason: string;
}

export class LlmError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'LlmError';
  }
}

// ---------------------------------------------------------------------------
// Credential storage
// ---------------------------------------------------------------------------

export async function saveApiKey(key: string): Promise<void> {
  const trimmed = key.trim();
  if (!trimmed) {
    await SecureStore.deleteItemAsync(KEY_STORAGE).catch(() => undefined);
    return;
  }
  await SecureStore.setItemAsync(KEY_STORAGE, trimmed);
}

export async function getApiKey(): Promise<string | null> {
  return SecureStore.getItemAsync(KEY_STORAGE).catch(() => null);
}

export async function clearApiKey(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY_STORAGE).catch(() => undefined);
}

export async function saveEndpoint(baseUrl: string, model: string): Promise<void> {
  await SecureStore.setItemAsync(BASE_URL_STORAGE, baseUrl.trim() || DEFAULT_BASE_URL);
  await SecureStore.setItemAsync(MODEL_STORAGE, model.trim() || DEFAULT_MODEL);
}

export async function getEndpoint(): Promise<{ baseUrl: string; model: string }> {
  const [baseUrl, model] = await Promise.all([
    SecureStore.getItemAsync(BASE_URL_STORAGE).catch(() => null),
    SecureStore.getItemAsync(MODEL_STORAGE).catch(() => null),
  ]);
  return { baseUrl: baseUrl || DEFAULT_BASE_URL, model: model || DEFAULT_MODEL };
}

export async function hasApiKey(): Promise<boolean> {
  return Boolean(await getApiKey());
}

/** Shows the user their key is stored without revealing it. */
export function maskKey(key: string): string {
  if (key.length <= 10) return '•'.repeat(key.length);
  return `${key.slice(0, 6)}${'•'.repeat(12)}${key.slice(-4)}`;
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

const TIMEOUT_MS = 45_000;

export async function chatCompletion(params: {
  messages: LlmMessage[];
  tools?: unknown[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}): Promise<LlmCompletion> {
  const apiKey = await getApiKey();
  if (!apiKey) throw new LlmError('No API key configured');

  const { baseUrl, model } = await getEndpoint();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const body: Record<string, unknown> = {
      model,
      messages: params.messages,
      temperature: params.temperature ?? 0.6,
      max_tokens: params.maxTokens ?? 900,
    };
    if (params.tools?.length) {
      body.tools = params.tools;
      body.tool_choice = 'auto';
    }

    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: params.signal ?? controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new LlmError(explainStatus(response.status, text), response.status);
    }

    const json = await response.json();
    const choice = json?.choices?.[0];
    if (!choice) throw new LlmError('The AI service returned an empty response');

    return { message: choice.message as LlmMessage, finishReason: choice.finish_reason ?? 'stop' };
  } catch (error) {
    if (error instanceof LlmError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new LlmError('The AI service took too long to respond');
    }
    throw new LlmError(
      error instanceof Error ? error.message : 'Could not reach the AI service',
    );
  } finally {
    clearTimeout(timer);
  }
}

/** Turns provider errors into something a patient can act on. */
function explainStatus(status: number, body: string): string {
  switch (status) {
    case 401:
      return 'That API key was rejected. Check it in Settings → AI.';
    case 402:
      return 'Your AI account has no credit left. Add billing and try again.';
    case 404:
      return 'That model name was not found. Check the model in Settings → AI.';
    case 429:
      return 'Rate limited by the AI provider. Wait a moment and try again.';
    default:
      if (status >= 500) return 'The AI provider is having trouble. Try again shortly.';
      return `AI request failed (${status})${body ? `: ${body.slice(0, 160)}` : ''}`;
  }
}

/** Validates a key by making the smallest possible real request. */
export async function testConnection(): Promise<{ ok: boolean; detail: string }> {
  try {
    const { model } = await getEndpoint();
    const completion = await chatCompletion({
      messages: [
        { role: 'system', content: 'Reply with exactly the word: ready' },
        { role: 'user', content: 'ping' },
      ],
      maxTokens: 5,
      temperature: 0,
    });
    return {
      ok: true,
      detail: `Connected to ${model}. Replied: "${(completion.message.content ?? '').trim()}"`,
    };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : 'Connection failed' };
  }
}

export function parseJsonLoose<T>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  const cleaned = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
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
