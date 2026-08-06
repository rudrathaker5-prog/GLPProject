import { screenForSafety } from '@core/clinical/safety';
import type {
  AgentCard,
  ChatMessage,
  JourneyStage,
  LanguageCode,
} from '@core/domain/types';
import { newId, nowIso } from '@core/data/localDb';
import { AgentUnavailableError, callAgent, isAgentConfigured } from '@features/ai/api/agentGateway';
import { hasApiKey } from '@features/ai/api/openAiClient';
import {
  extractDoctorName,
  isDirectCallRequest,
  resolveDoctorToCall,
} from '@features/calls/api/resolveDoctor';
import { runLocalEngine } from '@features/ai/engine/localEngine';
import { runOnDeviceAgent } from '@features/ai/agent/onDeviceAgent';
import { getProfile, saveProfile } from '@features/profile/api/profileRepository';

/**
 * Decides who answers a turn.
 *
 * Three engines, one contract — the UI never knows which replied:
 *
 *   1. Server agent      full agentic loop, key held server-side. Preferred
 *                        whenever a Supabase project is configured, because no
 *                        key touches the device.
 *   2. On-device agent   same prompts, same tools, running against the user's
 *                        own API key from Settings → AI. This is what makes a
 *                        personally installed APK genuinely conversational.
 *   3. Offline engine    deterministic rules over the bundled care library.
 *                        Always available, needs nothing.
 *
 * Each falls through to the next on failure, so there is no dead end.
 */

export type AgentSource = 'server' | 'device' | 'offline';

export interface AgentTurnInput {
  message: string;
  conversationId: string | null;
  stage: JourneyStage;
  language: LanguageCode;
  history: ChatMessage[];
}

export interface AgentTurnResult {
  conversationId: string | null;
  assistantMessage: ChatMessage;
  source: AgentSource;
  /** Set when we had to fall back — surfaced in the UI so the user is not misled. */
  degradedReason?: string;
}

const HISTORY_WINDOW = 12;

export async function runAgentTurn(input: AgentTurnInput): Promise<AgentTurnResult> {
  const { message, stage, language } = input;
  const profile = await getProfile().catch(() => null);

  // ---- 1. Server agent ----------------------------------------------------
  if (isAgentConfigured()) {
    try {
      const response = await callAgent({
        conversationId: input.conversationId,
        message,
        stage,
        language,
        clientContext: {
          heightCm: profile?.heightCm ?? undefined,
          weightKg: profile?.startingWeightKg ?? undefined,
          waistCm: profile?.waistCm ?? undefined,
          sex: profile?.sex,
          comorbidities: profile?.comorbidities,
          contraindications: profile?.contraindications,
          recentMessages: input.history
            .filter((m) => m.role === 'user' || m.role === 'assistant')
            .slice(-HISTORY_WINDOW)
            .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        },
      });

      if (!response.degraded && response.reply) {
        return {
          conversationId: response.conversationId,
          assistantMessage: buildMessage({
            conversationId: response.conversationId ?? input.conversationId,
            content: response.reply,
            language,
            cards: response.cards,
          }),
          source: 'server',
        };
      }
    } catch (error) {
      // Fall through to the device agent.
      if (!(error instanceof AgentUnavailableError)) {
        console.warn('server agent failed', error);
      }
    }
  }

  // ---- 2. On-device agent -------------------------------------------------
  if (await hasApiKey()) {
    try {
      const result = await runOnDeviceAgent({
        message,
        stage,
        language,
        history: input.history,
      });

      return {
        conversationId: input.conversationId,
        assistantMessage: buildMessage({
          conversationId: input.conversationId,
          content: result.reply,
          language,
          cards: result.cards,
        }),
        source: 'device',
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'AI request failed';
      return localTurn(input, profile, reason);
    }
  }

  // ---- 3. Offline engine --------------------------------------------------
  return localTurn(
    input,
    profile,
    isAgentConfigured()
      ? 'The care service is unavailable'
      : 'Add your AI key in Settings → AI for full conversational coaching',
  );
}

async function localTurn(
  input: AgentTurnInput,
  profile: Awaited<ReturnType<typeof getProfile>> | null,
  reason: string,
): Promise<AgentTurnResult> {
  /*
    Resolve the call target before running the engine.

    The engine is synchronous by design — it must answer with the network down
    and nothing loaded — so the async directory lookup happens here. Only done
    when the message actually looks like a request to be put through, so the
    common path costs nothing.
  */
  const callTarget = isDirectCallRequest(input.message)
    ? await resolveDoctorToCall({ doctorName: extractDoctorName(input.message) }).catch(() => null)
    : null;

  const result = runLocalEngine({
    message: input.message,
    stage: input.stage,
    language: input.language,
    history: input.history.map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    })),
    profile: {
      heightCm: profile?.heightCm,
      weightKg: profile?.startingWeightKg,
      waistCm: profile?.waistCm,
      sex: profile?.sex,
      comorbidities: profile?.comorbidities,
      contraindications: profile?.contraindications,
      displayName: profile?.displayName,
    },
    callTarget: callTarget
      ? {
          name: callTarget.name,
          number: callTarget.number,
          confidence: callTarget.confidence,
        }
      : null,
  });

  // Persist measurements the user mentioned in passing.
  const { heightCm, weightKg, waistCm } = result.extracted;
  if (heightCm || weightKg || waistCm) {
    await saveProfile({
      heightCm: heightCm ?? profile?.heightCm ?? null,
      startingWeightKg: profile?.startingWeightKg ?? weightKg ?? null,
      waistCm: waistCm ?? profile?.waistCm ?? null,
    }).catch(() => undefined);
  }

  const content = result.followUp ? `${result.reply}\n\n${result.followUp}` : result.reply;

  return {
    conversationId: input.conversationId,
    assistantMessage: buildMessage({
      conversationId: input.conversationId,
      content,
      language: input.language,
      cards: result.cards,
    }),
    source: 'offline',
    degradedReason: reason,
  };
}

function buildMessage(params: {
  conversationId: string | null;
  content: string;
  language: LanguageCode;
  cards: AgentCard[];
}): ChatMessage {
  return {
    id: newId(),
    conversationId: params.conversationId ?? 'local',
    role: 'assistant',
    content: params.content,
    language: params.language,
    toolName: null,
    toolPayload: null,
    cards: params.cards.length ? params.cards : null,
    createdAt: nowIso(),
  };
}

export function userMessage(
  content: string,
  conversationId: string | null,
  language: LanguageCode,
): ChatMessage {
  return {
    id: newId(),
    conversationId: conversationId ?? 'local',
    role: 'user',
    content,
    language,
    toolName: null,
    toolPayload: null,
    cards: null,
    createdAt: nowIso(),
  };
}

/** Pre-turn screen so the UI can show an escalation banner immediately. */
export function screenMessage(content: string) {
  return screenForSafety(content);
}
