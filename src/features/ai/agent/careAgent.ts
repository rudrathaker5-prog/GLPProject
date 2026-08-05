import { screenForSafety } from '@core/clinical/safety';
import type {
  AgentCard,
  ChatMessage,
  JourneyStage,
  LanguageCode,
} from '@core/domain/types';
import { newId, nowIso } from '@core/data/localDb';
import { runLocalEngine } from '@features/ai/engine/localEngine';
import { AgentUnavailableError, callAgent, isAgentConfigured } from '@features/ai/api/agentGateway';
import { getProfile, saveProfile } from '@features/profile/api/profileRepository';

/**
 * Client-side orchestration.
 *
 * Decides between the server agent and the on-device engine, applies the local
 * safety screen either way, and persists anything the conversation revealed
 * (measurements the user typed in prose, for example) back onto the profile.
 */

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
  degraded: boolean;
  degradedReason?: string;
  followUp: string | null;
}

const HISTORY_WINDOW = 12;

export async function runAgentTurn(input: AgentTurnInput): Promise<AgentTurnResult> {
  const { message, stage, language } = input;
  const profile = await getProfile();

  const recentMessages = input.history
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .slice(-HISTORY_WINDOW)
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

  // ---- Remote first -------------------------------------------------------
  if (isAgentConfigured()) {
    try {
      const response = await callAgent({
        conversationId: input.conversationId,
        message,
        stage,
        language,
        clientContext: {
          heightCm: profile.heightCm ?? undefined,
          weightKg: profile.startingWeightKg ?? undefined,
          waistCm: profile.waistCm ?? undefined,
          sex: profile.sex,
          comorbidities: profile.comorbidities,
          contraindications: profile.contraindications,
          recentMessages,
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
          degraded: false,
          followUp: null,
        };
      }

      return localTurn(input, profile, response.reason ?? 'Gateway degraded');
    } catch (error) {
      const reason =
        error instanceof AgentUnavailableError ? error.reason : 'Could not reach the care service';
      return localTurn(input, profile, reason);
    }
  }

  return localTurn(input, profile, 'No AI gateway configured — using the built-in care library');
}

async function localTurn(
  input: AgentTurnInput,
  profile: Awaited<ReturnType<typeof getProfile>>,
  reason: string,
): Promise<AgentTurnResult> {
  const result = runLocalEngine({
    message: input.message,
    stage: input.stage,
    language: input.language,
    history: input.history.map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    })),
    profile: {
      heightCm: profile.heightCm,
      weightKg: profile.startingWeightKg,
      waistCm: profile.waistCm,
      sex: profile.sex,
      comorbidities: profile.comorbidities,
      contraindications: profile.contraindications,
      displayName: profile.displayName,
    },
  });

  // Persist measurements the user mentioned in passing.
  const { heightCm, weightKg, waistCm } = result.extracted;
  if (heightCm || weightKg || waistCm) {
    await saveProfile({
      heightCm: heightCm ?? profile.heightCm,
      startingWeightKg: profile.startingWeightKg ?? weightKg ?? null,
      waistCm: waistCm ?? profile.waistCm,
    });
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
    degraded: true,
    degradedReason: reason,
    followUp: result.followUp,
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

/** Pre-turn screen used by the UI to show an escalation banner immediately. */
export function screenMessage(content: string) {
  return screenForSafety(content);
}
