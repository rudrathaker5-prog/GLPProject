import { calculateBmi, bmiCategoryIndian } from '@core/clinical/eligibility';
import {
  SAFE_REWRITE_SUFFIX,
  violatesPrescribingRule,
} from '@core/clinical/prescribingGuard';
import { screenForSafety } from '@core/clinical/safety';
import type { AgentCard, ChatMessage, JourneyStage, LanguageCode } from '@core/domain/types';
import { listAppointments, isUpcoming } from '@features/appointments/api/appointmentsRepository';
import {
  chatCompletion,
  parseJsonLoose,
  type LlmMessage,
} from '@features/ai/api/openAiClient';
import { listMedications, nextDose } from '@features/medication/api/medicationRepository';
import { getProfile } from '@features/profile/api/profileRepository';
import {
  currentRelapseRisk,
  latestCheckIn,
  progressSummary,
} from '@features/tracking/api/trackingRepository';

import { executeClientTool } from './clientTools';
import { buildSystemPrompt, type AgentContext } from './prompt';
import { toolsForStage } from './toolSchemas';

/**
 * The agentic loop, running on the device against the user's own API key.
 *
 * Same shape as the server agent in `supabase/functions/ai-agent`:
 *   safety screen → build context → reason with tools → post-model guard.
 *
 * Emergencies are answered before any network call, so a red flag escalates
 * even if the key is wrong, the provider is down, or there is no signal.
 */

const MAX_TOOL_ROUNDS = 4;
const HISTORY_TURNS = 16;

export interface OnDeviceTurn {
  reply: string;
  cards: AgentCard[];
  toolsUsed: string[];
}

export async function runOnDeviceAgent(params: {
  message: string;
  stage: JourneyStage;
  language: LanguageCode;
  history: ChatMessage[];
}): Promise<OnDeviceTurn> {
  const { message, stage, language } = params;

  // ---- 1. Safety before the model -----------------------------------------
  const safety = screenForSafety(message);
  if (safety.level === 'emergency') {
    return {
      reply: safety.message,
      cards: [{ kind: 'escalation', severity: 'urgent', message: safety.message }],
      toolsUsed: [],
    };
  }

  // ---- 2. Context ---------------------------------------------------------
  const context = await buildContext(stage, language);

  const history = params.history
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && !m.pending && m.content.trim())
    .slice(-HISTORY_TURNS)
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

  const messages: LlmMessage[] = [
    { role: 'system', content: buildSystemPrompt(context) },
    ...history,
    { role: 'user', content: message },
  ];

  /*
    An urgent red flag used to be handled by *asking* the model to lead with the
    guidance. Nothing checked that it did. A model that opened with empathy, or
    buried the advice halfway down a long Hindi reply, silently dropped it — and
    unlike the offline engine, no escalation card was produced either. The
    better-connected patient got the weaker handling.

    So the guidance is now prepended deterministically and the card is pushed
    unconditionally, exactly as localEngine does. The model is told the patient
    has already seen it, so it adds to it instead of repeating it.
  */
  if (safety.level === 'urgent' && safety.message) {
    messages.push({
      role: 'system',
      content: `SAFETY: this message matched a "${safety.category}" rule. The patient has ALREADY been shown this guidance at the top of your reply: "${safety.message}". Do not repeat it. Continue from it — acknowledge what they described, and help with the rest of their message.`,
    });
  }

  // ---- 3. Reasoning loop --------------------------------------------------
  const tools = toolsForStage(stage);
  const cards: AgentCard[] = [];
  const toolsUsed: string[] = [];
  let reply = '';

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const completion = await chatCompletion({ messages, tools, temperature: 0.6 });
    const assistant = completion.message;
    messages.push(assistant);

    if (!assistant.tool_calls?.length) {
      reply = assistant.content ?? '';
      break;
    }

    for (const call of assistant.tool_calls) {
      const args = parseJsonLoose<Record<string, unknown>>(call.function.arguments) ?? {};
      toolsUsed.push(call.function.name);

      // `message` is threaded through so call_doctor can check the user's own
      // words before letting the dialler open by itself.
      const result = await executeClientTool(call.function.name, args, {
        stage,
        userMessage: message,
      });
      if (result.card) cards.push(result.card);

      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        name: call.function.name,
        content: JSON.stringify(result.forModel).slice(0, 6000),
      });
    }

    // Last round: force prose rather than another tool call.
    if (round === MAX_TOOL_ROUNDS - 1) {
      const final = await chatCompletion({ messages, temperature: 0.6, maxTokens: 700 });
      reply = final.message.content ?? '';
    }
  }

  if (!reply.trim()) {
    reply =
      'I did not manage to put that into words properly. Could you tell me again what you would like help with?';
  }

  // ---- 4. Post-model guard ------------------------------------------------
  if (violatesPrescribingRule(reply)) {
    reply += SAFE_REWRITE_SUFFIX;
  }

  // ---- 5. Urgent guidance is not left to the model -------------------------
  if (safety.level === 'urgent' && safety.message) {
    reply = `${safety.message}\n\n${reply}`;
    cards.unshift({ kind: 'escalation', severity: 'routine', message: safety.message });
  }

  return { reply, cards, toolsUsed };
}

/**
 * Assembles what the agent knows about this person, from the same repositories
 * the screens read. Every call degrades to null rather than throwing, so a
 * missing piece never blocks a reply.
 */
async function buildContext(
  stage: JourneyStage,
  language: LanguageCode,
): Promise<AgentContext> {
  const safe = <T>(p: Promise<T>, fallback: T): Promise<T> => p.catch(() => fallback);

  const [profile, progress, medications, next, appointments, checkIn] = await Promise.all([
    safe(getProfile(), null as Awaited<ReturnType<typeof getProfile>> | null),
    safe(progressSummary(), null as Awaited<ReturnType<typeof progressSummary>> | null),
    safe(listMedications(), []),
    safe(nextDose(), null),
    safe(listAppointments(), []),
    safe(latestCheckIn(), null),
  ]);

  const daysBetween = (iso?: string | null) =>
    iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000) : null;

  const nextAppointment = appointments.filter(isUpcoming).at(-1);

  const bmi = calculateBmi(
    profile?.heightCm ?? null,
    progress?.currentWeightKg ?? profile?.startingWeightKg ?? null,
  );

  let relapseRisk: AgentContext['relapseRisk'] = null;
  if (stage === 'vigilance') {
    const risk = await safe(currentRelapseRisk(), null);
    if (risk) relapseRisk = { score: risk.score, band: risk.band, signals: risk.signals };
  }

  return {
    stage,
    language,
    isAnonymous: !profile?.displayName,
    displayName: profile?.displayName ?? null,
    bmi,
    bmiCategory: bmiCategoryIndian(bmi),
    currentWeightKg: progress?.currentWeightKg ?? null,
    startingWeightKg: progress?.startingWeightKg ?? null,
    targetWeightKg: progress?.targetWeightKg ?? null,
    percentLost: progress?.percentLost ?? null,
    comorbidities: profile?.comorbidities ?? [],
    contraindications: profile?.contraindications ?? [],
    activeMedications: medications.map((m) => ({
      name: m.name,
      strength: m.strength || `${m.doseAmount} ${m.doseUnit}`,
      frequency: m.frequency,
      nextDoseAt: next?.scheduledFor,
    })),
    nextAppointmentAt: nextAppointment
      ? new Date(nextAppointment.scheduledAt).toLocaleString('en-IN')
      : null,
    lastCheckInAt: checkIn ? new Date(checkIn.occurredAt).toLocaleDateString('en-IN') : null,
    daysOnTreatment: daysBetween(profile?.treatmentStartedAt),
    daysSinceTreatment: daysBetween(profile?.treatmentCompletedAt),
    recentSideEffects: (checkIn?.sideEffects ?? []).map((s) => `${s.code} (${s.severity})`),
    relapseRisk,
  };
}

export { violatesPrescribingRule } from '@core/clinical/prescribingGuard';

