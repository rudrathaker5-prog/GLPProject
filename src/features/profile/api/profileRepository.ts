import { COLLECTIONS, nowIso, readCollection, upsert } from '@core/data/localDb';
import type {
  Comorbidity,
  Contraindication,
  JourneyStage,
  LanguageCode,
  Sex,
  UserProfile,
} from '@core/domain/types';
import type { ProfileRow } from '@core/supabase/database.types';
import { supabase } from '@core/supabase/client';
import { currentOwnerId, useAuthStore } from '@features/auth/store/authStore';

/**
 * Profile repository.
 *
 * Reads and writes go to Supabase when a session exists, and to the on-device
 * store otherwise. Anonymous users therefore get the full product — measurements,
 * eligibility, reminders — without an account, and the data migrates on sign-up.
 */

function toDomain(row: ProfileRow): UserProfile {
  return {
    id: row.id,
    mode: row.mode,
    stage: row.stage,
    displayName: row.display_name,
    phone: row.phone,
    email: row.email,
    language: row.language,
    dateOfBirth: row.date_of_birth,
    sex: row.sex,
    heightCm: row.height_cm,
    startingWeightKg: row.starting_weight_kg,
    targetWeightKg: row.target_weight_kg,
    waistCm: row.waist_cm,
    comorbidities: (row.comorbidities ?? []) as Comorbidity[],
    contraindications: (row.contraindications ?? []) as Contraindication[],
    city: row.city,
    consentedAt: row.consented_at,
    onboardedAt: row.onboarded_at,
    treatmentStartedAt: row.treatment_started_at,
    treatmentCompletedAt: row.treatment_completed_at,
    primaryDoctorId: row.primary_doctor_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function emptyProfile(id: string, stage: JourneyStage): UserProfile {
  return {
    id,
    mode: 'anonymous',
    stage,
    displayName: null,
    phone: null,
    email: null,
    language: 'en',
    dateOfBirth: null,
    sex: 'undisclosed',
    heightCm: null,
    startingWeightKg: null,
    targetWeightKg: null,
    waistCm: null,
    comorbidities: [],
    contraindications: [],
    city: null,
    consentedAt: null,
    onboardedAt: null,
    treatmentStartedAt: null,
    treatmentCompletedAt: null,
    primaryDoctorId: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

export interface ProfilePatch {
  displayName?: string | null;
  language?: LanguageCode;
  dateOfBirth?: string | null;
  sex?: Sex;
  heightCm?: number | null;
  startingWeightKg?: number | null;
  targetWeightKg?: number | null;
  waistCm?: number | null;
  comorbidities?: Comorbidity[];
  contraindications?: Contraindication[];
  city?: string | null;
  stage?: JourneyStage;
  consentedAt?: string | null;
  onboardedAt?: string | null;
  treatmentStartedAt?: string | null;
  treatmentCompletedAt?: string | null;
  primaryDoctorId?: string | null;
}

export async function getProfile(): Promise<UserProfile> {
  const { userId, stage } = useAuthStore.getState();

  if (userId && supabase) {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    if (!error && data) return toDomain(data as ProfileRow);
  }

  const ownerId = currentOwnerId();
  const rows = await readCollection<UserProfile>(COLLECTIONS.profile);
  return rows.find((p) => p.id === ownerId) ?? emptyProfile(ownerId, stage);
}

export async function saveProfile(patch: ProfilePatch): Promise<UserProfile> {
  const { userId } = useAuthStore.getState();

  if (userId && supabase) {
    const { data, error } = await supabase
      .from('profiles')
      .update({
        display_name: patch.displayName,
        language: patch.language,
        date_of_birth: patch.dateOfBirth,
        sex: patch.sex,
        height_cm: patch.heightCm,
        starting_weight_kg: patch.startingWeightKg,
        target_weight_kg: patch.targetWeightKg,
        waist_cm: patch.waistCm,
        comorbidities: patch.comorbidities,
        contraindications: patch.contraindications,
        city: patch.city,
        stage: patch.stage,
        consented_at: patch.consentedAt,
        onboarded_at: patch.onboardedAt,
        treatment_started_at: patch.treatmentStartedAt,
        treatment_completed_at: patch.treatmentCompletedAt,
        primary_doctor_id: patch.primaryDoctorId,
      })
      .eq('id', userId)
      .select()
      .single();

    if (!error && data) return toDomain(data as ProfileRow);
  }

  const existing = await getProfile();
  const merged: UserProfile = {
    ...existing,
    ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)),
    id: currentOwnerId(),
    updatedAt: nowIso(),
  } as UserProfile;

  await upsert(COLLECTIONS.profile, merged);
  return merged;
}

/**
 * Copies everything held locally into the backend once a user signs in. Called
 * from the sign-up flow so anonymous progress is never lost.
 */
export async function migrateLocalProfileToAccount(): Promise<void> {
  const { userId, localId } = useAuthStore.getState();
  if (!userId || !supabase) return;

  const rows = await readCollection<UserProfile>(COLLECTIONS.profile);
  const local = rows.find((p) => p.id === localId);
  if (!local) return;

  await supabase
    .from('profiles')
    .update({
      language: local.language,
      date_of_birth: local.dateOfBirth,
      sex: local.sex,
      height_cm: local.heightCm,
      starting_weight_kg: local.startingWeightKg,
      target_weight_kg: local.targetWeightKg,
      waist_cm: local.waistCm,
      comorbidities: local.comorbidities,
      contraindications: local.contraindications,
      city: local.city,
      stage: local.stage,
      consented_at: local.consentedAt,
      onboarded_at: local.onboardedAt,
    })
    .eq('id', userId);
}
