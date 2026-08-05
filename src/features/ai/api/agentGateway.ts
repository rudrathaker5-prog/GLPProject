import { env, hasBackend } from '@core/config/env';
import type { AgentCard, JourneyStage, LanguageCode } from '@core/domain/types';
import { supabase } from '@core/supabase/client';
import { useAuthStore } from '@features/auth/store/authStore';

/**
 * Transport to the server-side agent (`supabase/functions/ai-agent`).
 *
 * The client never holds an LLM key. If the gateway is unreachable or reports
 * `degraded`, the caller falls back to the on-device engine.
 */

export interface AgentRequest {
  conversationId: string | null;
  message: string;
  stage: JourneyStage;
  language: LanguageCode;
  clientContext?: {
    heightCm?: number;
    weightKg?: number;
    waistCm?: number;
    age?: number;
    sex?: string;
    comorbidities?: string[];
    contraindications?: string[];
    recentMessages?: { role: 'user' | 'assistant'; content: string }[];
  };
}

export interface AgentResponse {
  conversationId: string | null;
  reply: string | null;
  cards: AgentCard[];
  toolCalls: { name: string; arguments: unknown }[];
  safety: { level: string; category: string; message: string } | null;
  degraded: boolean;
  reason?: string;
}

export class AgentUnavailableError extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = 'AgentUnavailableError';
  }
}

const REQUEST_TIMEOUT_MS = 30_000;

export function isAgentConfigured(): boolean {
  return hasBackend || Boolean(env.aiGatewayUrl);
}

export async function callAgent(request: AgentRequest): Promise<AgentResponse> {
  if (!isAgentConfigured()) {
    throw new AgentUnavailableError('No AI gateway configured');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    // Preferred path: Supabase Functions client (handles auth + base URL).
    if (supabase) {
      const { data, error } = await supabase.functions.invoke<AgentResponse>('ai-agent', {
        body: request,
      });
      if (error) throw new AgentUnavailableError(error.message);
      if (!data) throw new AgentUnavailableError('Empty response from agent');
      return normalise(data);
    }

    // Fallback path: a bare gateway URL (self-hosted, or a different provider).
    const token = useAuthStore.getState().session?.access_token;
    const response = await fetch(env.aiGatewayUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(request),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new AgentUnavailableError(`Gateway returned ${response.status}`);
    }
    return normalise((await response.json()) as AgentResponse);
  } catch (error) {
    if (error instanceof AgentUnavailableError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new AgentUnavailableError(message);
  } finally {
    clearTimeout(timer);
  }
}

function normalise(data: AgentResponse): AgentResponse {
  return {
    conversationId: data.conversationId ?? null,
    reply: data.reply ?? null,
    cards: Array.isArray(data.cards) ? (data.cards as AgentCard[]) : [],
    toolCalls: Array.isArray(data.toolCalls) ? data.toolCalls : [],
    safety: data.safety ?? null,
    degraded: Boolean(data.degraded) || !data.reply,
    reason: data.reason,
  };
}
