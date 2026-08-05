import { computeRelapseRisk, computeWellnessScore } from '@core/clinical/scoring';
import { COLLECTIONS, findBy, newId, nowIso, upsert } from '@core/data/localDb';
import type {
  CheckIn,
  CheckInKind,
  RelapseRisk,
  SideEffectReport,
  WeightEntry,
  WellnessScore,
} from '@core/domain/types';
import { supabase } from '@core/supabase/client';
import type { CheckInRow, Json, WeightEntryRow } from '@core/supabase/database.types';
import { currentOwnerId, useAuthStore } from '@features/auth/store/authStore';
import { evaluateWeightMilestones } from '@features/journey/api/journeyRepository';
import { getProfile, saveProfile } from '@features/profile/api/profileRepository';

// ---------------------------------------------------------------------------
// Weight
// ---------------------------------------------------------------------------

export async function logWeight(input: {
  weightKg: number;
  waistCm?: number | null;
  recordedOn?: string;
  source?: WeightEntry['source'];
}): Promise<{ entry: WeightEntry; milestones: string[] }> {
  const { userId, ensureIdentity } = useAuthStore.getState();
  const identity = userId ?? (await ensureIdentity());
  const recordedOn = input.recordedOn ?? new Date().toISOString().slice(0, 10);

  let entry: WeightEntry;

  if (identity && supabase) {
    const { data, error } = await supabase
      .from('weight_entries')
      .upsert(
        {
          user_id: identity,
          recorded_on: recordedOn,
          weight_kg: input.weightKg,
          waist_cm: input.waistCm ?? null,
          source: input.source ?? 'manual',
        },
        { onConflict: 'user_id,recorded_on' },
      )
      .select()
      .single();
    if (error) throw error;
    entry = toWeight(data as WeightEntryRow);
  } else {
    const owner = currentOwnerId();
    entry = {
      id: newId(),
      userId: owner,
      recordedOn,
      weightKg: input.weightKg,
      waistCm: input.waistCm ?? null,
      source: input.source ?? 'manual',
    };
    await upsert(
      COLLECTIONS.weights,
      entry,
      (a, b) => a.userId === b.userId && a.recordedOn === b.recordedOn,
    );
  }

  // The first weight ever logged becomes the baseline for percentage loss.
  const profile = await getProfile();
  if (!profile.startingWeightKg) {
    await saveProfile({ startingWeightKg: input.weightKg });
  }
  if (input.waistCm) {
    await saveProfile({ waistCm: input.waistCm });
  }

  const milestones = await evaluateWeightMilestones(
    profile.startingWeightKg ?? input.weightKg,
    input.weightKg,
  );

  return { entry, milestones };
}

export async function listWeights(days = 365): Promise<WeightEntry[]> {
  const { userId } = useAuthStore.getState();
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

  if (userId && supabase) {
    const { data, error } = await supabase
      .from('weight_entries')
      .select('*')
      .eq('user_id', userId)
      .gte('recorded_on', since)
      .order('recorded_on', { ascending: true });
    if (!error && data) return (data as WeightEntryRow[]).map(toWeight);
  }

  const owner = currentOwnerId();
  const rows = await findBy<WeightEntry>(
    COLLECTIONS.weights,
    (w) => w.userId === owner && w.recordedOn >= since,
  );
  return rows.sort((a, b) => a.recordedOn.localeCompare(b.recordedOn));
}

export async function latestWeight(): Promise<WeightEntry | null> {
  const all = await listWeights(3650);
  return all.length ? all[all.length - 1] : null;
}

function toWeight(row: WeightEntryRow): WeightEntry {
  return {
    id: row.id,
    userId: row.user_id,
    recordedOn: row.recorded_on,
    weightKg: Number(row.weight_kg),
    waistCm: row.waist_cm === null ? null : Number(row.waist_cm),
    source: row.source,
  };
}

// ---------------------------------------------------------------------------
// Check-ins
// ---------------------------------------------------------------------------

export interface CheckInInput {
  kind?: CheckInKind;
  weightKg?: number | null;
  moodScore?: number | null;
  appetiteScore?: number | null;
  energyScore?: number | null;
  sleepHours?: number | null;
  sleepQuality?: number | null;
  stressScore?: number | null;
  cravingScore?: number | null;
  waterLitres?: number | null;
  exerciseMinutes?: number | null;
  nutritionAdherence?: number | null;
  medicationAdherence?: number | null;
  confidenceScore?: number | null;
  sideEffects?: SideEffectReport[];
  freeText?: string | null;
}

export async function saveCheckIn(
  input: CheckInInput,
): Promise<{ checkIn: CheckIn; wellness: WellnessScore | null }> {
  const { userId, ensureIdentity } = useAuthStore.getState();
  const identity = userId ?? (await ensureIdentity());

  const draft: CheckIn = {
    id: newId(),
    userId: identity ?? currentOwnerId(),
    kind: input.kind ?? 'passive',
    occurredAt: nowIso(),
    weightKg: input.weightKg ?? null,
    moodScore: input.moodScore ?? null,
    appetiteScore: input.appetiteScore ?? null,
    energyScore: input.energyScore ?? null,
    sleepHours: input.sleepHours ?? null,
    sleepQuality: input.sleepQuality ?? null,
    stressScore: input.stressScore ?? null,
    cravingScore: input.cravingScore ?? null,
    waterLitres: input.waterLitres ?? null,
    exerciseMinutes: input.exerciseMinutes ?? null,
    nutritionAdherence: input.nutritionAdherence ?? null,
    medicationAdherence: input.medicationAdherence ?? null,
    confidenceScore: input.confidenceScore ?? null,
    sideEffects: input.sideEffects ?? [],
    freeText: input.freeText ?? null,
    wellnessScore: null,
    relapseRisk: null,
  };

  const wellness = computeWellnessScore(draft);
  draft.wellnessScore = wellness?.score ?? null;

  if (identity && supabase) {
    const { data, error } = await supabase
      .from('check_ins')
      .insert({
        user_id: identity,
        kind: draft.kind,
        weight_kg: draft.weightKg,
        mood_score: draft.moodScore,
        appetite_score: draft.appetiteScore,
        energy_score: draft.energyScore,
        sleep_hours: draft.sleepHours,
        sleep_quality: draft.sleepQuality,
        stress_score: draft.stressScore,
        craving_score: draft.cravingScore,
        water_litres: draft.waterLitres,
        exercise_minutes: draft.exerciseMinutes,
        nutrition_adherence: draft.nutritionAdherence,
        medication_adherence: draft.medicationAdherence,
        confidence_score: draft.confidenceScore,
        side_effects: draft.sideEffects as unknown as Json,
        free_text: draft.freeText,
      })
      .select()
      .single();
    if (!error && data) {
      const saved = toCheckIn(data as CheckInRow);
      if (draft.weightKg) await logWeight({ weightKg: draft.weightKg });
      return { checkIn: saved, wellness };
    }
  }

  await upsert(COLLECTIONS.checkIns, draft);
  if (draft.weightKg) await logWeight({ weightKg: draft.weightKg });
  return { checkIn: draft, wellness };
}

export async function listCheckIns(limit = 60): Promise<CheckIn[]> {
  const { userId } = useAuthStore.getState();

  if (userId && supabase) {
    const { data, error } = await supabase
      .from('check_ins')
      .select('*')
      .eq('user_id', userId)
      .order('occurred_at', { ascending: false })
      .limit(limit);
    if (!error && data) return (data as CheckInRow[]).map(toCheckIn);
  }

  const owner = currentOwnerId();
  const rows = await findBy<CheckIn>(COLLECTIONS.checkIns, (c) => c.userId === owner);
  return rows.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, limit);
}

export async function latestCheckIn(): Promise<CheckIn | null> {
  const rows = await listCheckIns(1);
  return rows[0] ?? null;
}

export async function daysSinceLastCheckIn(): Promise<number | null> {
  const latest = await latestCheckIn();
  if (!latest) return null;
  return Math.floor((Date.now() - new Date(latest.occurredAt).getTime()) / 86_400_000);
}

function toCheckIn(row: CheckInRow): CheckIn {
  return {
    id: row.id,
    userId: row.user_id,
    kind: row.kind,
    occurredAt: row.occurred_at,
    weightKg: row.weight_kg === null ? null : Number(row.weight_kg),
    moodScore: row.mood_score,
    appetiteScore: row.appetite_score,
    energyScore: row.energy_score,
    sleepHours: row.sleep_hours === null ? null : Number(row.sleep_hours),
    sleepQuality: row.sleep_quality,
    stressScore: row.stress_score,
    cravingScore: row.craving_score,
    waterLitres: row.water_litres === null ? null : Number(row.water_litres),
    exerciseMinutes: row.exercise_minutes,
    nutritionAdherence: row.nutrition_adherence,
    medicationAdherence: row.medication_adherence,
    confidenceScore: row.confidence_score,
    sideEffects: (row.side_effects as unknown as SideEffectReport[]) ?? [],
    freeText: row.free_text,
    wellnessScore: row.wellness_score,
    relapseRisk: (row.relapse_risk as unknown as RelapseRisk | null) ?? null,
  };
}

// ---------------------------------------------------------------------------
// Derived
// ---------------------------------------------------------------------------

export async function currentRelapseRisk(): Promise<RelapseRisk> {
  const { userId } = useAuthStore.getState();

  if (userId && supabase) {
    const { data, error } = await supabase.rpc('compute_relapse_risk', { p_user: userId });
    if (!error && data && typeof data === 'object') {
      return data as unknown as RelapseRisk;
    }
  }

  const [weights, latest, days] = await Promise.all([
    listWeights(365),
    latestCheckIn(),
    daysSinceLastCheckIn(),
  ]);
  return computeRelapseRisk({ weights, latestCheckIn: latest, daysSinceLastCheckIn: days });
}

export interface ProgressSummary {
  startingWeightKg: number | null;
  currentWeightKg: number | null;
  targetWeightKg: number | null;
  lostKg: number | null;
  percentLost: number | null;
  toTargetKg: number | null;
  entries: WeightEntry[];
  nadirKg: number | null;
}

export async function progressSummary(): Promise<ProgressSummary> {
  const [profile, entries] = await Promise.all([getProfile(), listWeights(365)]);
  const current = entries.length ? entries[entries.length - 1].weightKg : null;
  const start = profile.startingWeightKg ?? (entries.length ? entries[0].weightKg : null);
  const nadir = entries.length ? Math.min(...entries.map((e) => e.weightKg)) : null;

  return {
    startingWeightKg: start,
    currentWeightKg: current,
    targetWeightKg: profile.targetWeightKg,
    lostKg: start && current ? Math.round((start - current) * 10) / 10 : null,
    percentLost:
      start && current && start > 0 ? Math.round(((start - current) / start) * 1000) / 10 : null,
    toTargetKg:
      current && profile.targetWeightKg
        ? Math.round((current - profile.targetWeightKg) * 10) / 10
        : null,
    entries,
    nadirKg: nadir,
  };
}

export const SIDE_EFFECT_OPTIONS: { code: SideEffectReport['code']; label: string }[] = [
  { code: 'nausea', label: 'Nausea' },
  { code: 'vomiting', label: 'Vomiting' },
  { code: 'diarrhoea', label: 'Loose motions' },
  { code: 'constipation', label: 'Constipation' },
  { code: 'bloating', label: 'Bloating' },
  { code: 'heartburn', label: 'Heartburn' },
  { code: 'fatigue', label: 'Fatigue' },
  { code: 'headache', label: 'Headache' },
  { code: 'dizziness', label: 'Dizziness' },
  { code: 'injection_site_reaction', label: 'Injection site reaction' },
  { code: 'hair_thinning', label: 'Hair thinning' },
  { code: 'hypoglycaemia', label: 'Low blood sugar' },
  { code: 'severe_abdominal_pain', label: 'Severe stomach pain' },
  { code: 'other', label: 'Something else' },
];
