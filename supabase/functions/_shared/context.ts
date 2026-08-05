import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

import type { Language, PatientContext, Stage } from './prompts.ts';

/**
 * Builds the live patient context block injected into the system prompt.
 * One round trip against the `patient_snapshot` view plus a few small reads.
 */
export async function buildPatientContext(params: {
  supabase: SupabaseClient;
  userId: string | null;
  stage: Stage;
  language: Language;
  conversationId: string | null;
}): Promise<PatientContext> {
  const { supabase, userId, stage, language, conversationId } = params;

  const base: PatientContext = {
    stage,
    language,
    isAnonymous: !userId,
  };

  if (!userId) return base;

  const [snapshotRes, medsRes, memoriesRes, conversationRes, sideEffectsRes] = await Promise.all([
    supabase.from('patient_snapshot').select('*').eq('user_id', userId).maybeSingle(),
    supabase
      .from('medications')
      .select('name, strength, frequency, dose_amount, dose_unit')
      .eq('user_id', userId)
      .eq('active', true)
      .limit(6),
    supabase
      .from('agent_memories')
      .select('kind, content')
      .eq('user_id', userId)
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      .order('salience', { ascending: false })
      .limit(12),
    conversationId
      ? supabase.from('conversations').select('summary').eq('id', conversationId).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from('check_ins')
      .select('side_effects, occurred_at')
      .eq('user_id', userId)
      .order('occurred_at', { ascending: false })
      .limit(3),
  ]);

  const snap = snapshotRes.data as Record<string, any> | null;

  const percentLost =
    snap?.starting_weight_kg && snap?.current_weight_kg && snap.starting_weight_kg > 0
      ? Math.round(
          ((snap.starting_weight_kg - snap.current_weight_kg) / snap.starting_weight_kg) * 1000,
        ) / 10
      : null;

  const daysBetween = (iso?: string | null) =>
    iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000) : null;

  const recentSideEffects = new Set<string>();
  for (const row of (sideEffectsRes.data ?? []) as any[]) {
    for (const effect of row.side_effects ?? []) {
      if (effect?.code) recentSideEffects.add(`${effect.code} (${effect.severity ?? 'unknown'})`);
    }
  }

  let relapseRisk: PatientContext['relapseRisk'] = null;
  if (stage === 'vigilance') {
    const { data } = await supabase.rpc('compute_relapse_risk', { p_user: userId });
    if (data && typeof data === 'object') relapseRisk = data as PatientContext['relapseRisk'];
  }

  return {
    ...base,
    displayName: snap?.display_name ?? null,
    bmi: snap?.current_bmi ?? null,
    bmiCategory: snap?.bmi_category ?? null,
    currentWeightKg: snap?.current_weight_kg ?? null,
    startingWeightKg: snap?.starting_weight_kg ?? null,
    targetWeightKg: snap?.target_weight_kg ?? null,
    percentLost,
    comorbidities: snap?.comorbidities ?? [],
    contraindications: snap?.contraindications ?? [],
    adherence28d: snap?.adherence_28d ?? null,
    nextAppointmentAt: snap?.next_appointment_at ?? null,
    lastCheckInAt: snap?.last_checkin_at ?? null,
    daysOnTreatment: daysBetween(snap?.treatment_started_at),
    daysSinceTreatment: daysBetween(snap?.treatment_completed_at),
    recentSideEffects: [...recentSideEffects].slice(0, 6),
    activeMedications: (medsRes.data ?? []).map((m: any) => ({
      name: m.name,
      strength: m.strength || `${m.dose_amount} ${m.dose_unit}`,
      frequency: m.frequency,
      nextDoseAt: snap?.next_dose_at ?? undefined,
    })),
    memories: (memoriesRes.data ?? []) as { kind: string; content: string }[],
    conversationSummary: (conversationRes.data as any)?.summary ?? null,
    relapseRisk,
  };
}

/** Loads recent turns, trimmed to a token-safe window. */
export async function loadConversationHistory(
  supabase: SupabaseClient,
  conversationId: string,
  limit = 20,
): Promise<{ role: 'user' | 'assistant'; content: string }[]> {
  const { data } = await supabase
    .from('messages')
    .select('role, content')
    .eq('conversation_id', conversationId)
    .in('role', ['user', 'assistant'])
    .order('created_at', { ascending: false })
    .limit(limit);

  return ((data ?? []) as { role: 'user' | 'assistant'; content: string }[])
    .reverse()
    .filter((m) => m.content?.trim().length > 0);
}
