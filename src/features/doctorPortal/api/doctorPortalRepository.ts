import type { Appointment, CheckIn, MedicationItem, WeightEntry } from '@core/domain/types';
import { supabase } from '@core/supabase/client';
import type {
  AppointmentRow,
  CheckInRow,
  MedicationRow,
  ProfileRow,
  WeightEntryRow,
} from '@core/supabase/database.types';
import { useAuthStore } from '@features/auth/store/authStore';

/**
 * Doctor-side data access.
 *
 * Every read here goes through the patient's row-level security policies: a
 * doctor sees a patient only while `care_relationships` has an open row AND the
 * patient has left `share_data_with_doctor` on. There is no privileged path.
 */

export interface PatientSummary {
  id: string;
  displayName: string | null;
  stage: string;
  startingWeightKg: number | null;
  currentWeightKg: number | null;
  targetWeightKg: number | null;
  percentLost: number | null;
  adherence28d: number | null;
  lastCheckInAt: string | null;
  nextAppointmentAt: string | null;
  isPrimary: boolean;
}

export class DoctorPortalUnavailableError extends Error {
  constructor() {
    super('The doctor portal needs a Supabase project configured.');
    this.name = 'DoctorPortalUnavailableError';
  }
}

export async function listPatients(): Promise<PatientSummary[]> {
  const { doctorId } = useAuthStore.getState();
  if (!supabase || !doctorId) throw new DoctorPortalUnavailableError();

  const { data: relationships, error } = await supabase
    .from('care_relationships')
    .select('patient_id, is_primary')
    .eq('doctor_id', doctorId)
    .is('ended_at', null);

  if (error) throw error;
  const ids = (relationships ?? []).map((r) => r.patient_id);
  if (ids.length === 0) return [];

  const { data: snapshots } = await supabase
    .from('patient_snapshot')
    .select('*')
    .in('user_id', ids);

  return (snapshots ?? []).map((snapshot) => {
    const relationship = (relationships ?? []).find((r) => r.patient_id === snapshot.user_id);
    const percentLost =
      snapshot.starting_weight_kg && snapshot.current_weight_kg && snapshot.starting_weight_kg > 0
        ? Math.round(
            ((snapshot.starting_weight_kg - snapshot.current_weight_kg) /
              snapshot.starting_weight_kg) *
              1000,
          ) / 10
        : null;

    return {
      id: snapshot.user_id,
      displayName: snapshot.display_name,
      stage: snapshot.stage,
      startingWeightKg: snapshot.starting_weight_kg,
      currentWeightKg: snapshot.current_weight_kg,
      targetWeightKg: snapshot.target_weight_kg,
      percentLost,
      adherence28d: snapshot.adherence_28d,
      lastCheckInAt: snapshot.last_checkin_at,
      nextAppointmentAt: snapshot.next_appointment_at,
      isPrimary: relationship?.is_primary ?? false,
    };
  });
}

export interface PatientDetail {
  profile: Pick<ProfileRow, 'id' | 'display_name' | 'stage' | 'comorbidities' | 'contraindications'> | null;
  weights: WeightEntry[];
  checkIns: CheckIn[];
  medications: MedicationItem[];
  appointments: Appointment[];
}

export async function getPatientDetail(patientId: string): Promise<PatientDetail> {
  if (!supabase) throw new DoctorPortalUnavailableError();

  const [profile, weights, checkIns, medications, appointments] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, display_name, stage, comorbidities, contraindications')
      .eq('id', patientId)
      .maybeSingle(),
    supabase
      .from('weight_entries')
      .select('*')
      .eq('user_id', patientId)
      .order('recorded_on', { ascending: true })
      .limit(180),
    supabase
      .from('check_ins')
      .select('*')
      .eq('user_id', patientId)
      .order('occurred_at', { ascending: false })
      .limit(20),
    supabase.from('medications').select('*').eq('user_id', patientId).eq('active', true),
    supabase
      .from('appointments')
      .select('*')
      .eq('user_id', patientId)
      .order('scheduled_at', { ascending: false })
      .limit(20),
  ]);

  return {
    profile: (profile.data as PatientDetail['profile']) ?? null,
    weights: ((weights.data ?? []) as WeightEntryRow[]).map((row) => ({
      id: row.id,
      userId: row.user_id,
      recordedOn: row.recorded_on,
      weightKg: Number(row.weight_kg),
      waistCm: row.waist_cm === null ? null : Number(row.waist_cm),
      source: row.source,
    })),
    checkIns: ((checkIns.data ?? []) as CheckInRow[]).map((row) => ({
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
      sideEffects: (row.side_effects as unknown as CheckIn['sideEffects']) ?? [],
      freeText: row.free_text,
      wellnessScore: row.wellness_score,
      relapseRisk: null,
    })),
    medications: ((medications.data ?? []) as MedicationRow[]).map((row) => ({
      id: row.id,
      prescriptionId: row.prescription_id,
      userId: row.user_id,
      name: row.name,
      genericName: row.generic_name,
      form: row.form,
      strength: row.strength,
      doseAmount: Number(row.dose_amount),
      doseUnit: row.dose_unit,
      frequency: row.frequency,
      timesOfDay: row.times_of_day,
      daysOfWeek: row.days_of_week,
      startDate: row.start_date,
      endDate: row.end_date,
      durationDays: row.duration_days,
      instructions: row.instructions,
      storageNote: row.storage_note,
      isTitration: row.is_titration,
      titrationStep: row.titration_step,
      refillThresholdDays: row.refill_threshold_days,
      unitsRemaining: row.units_remaining === null ? null : Number(row.units_remaining),
      active: row.active,
    })),
    appointments: ((appointments.data ?? []) as AppointmentRow[]).map((row) => ({
      id: row.id,
      userId: row.user_id,
      doctorId: row.doctor_id,
      doctor: null,
      hospitalId: row.hospital_id,
      scheduledAt: row.scheduled_at,
      durationMinutes: row.duration_minutes,
      mode: row.mode,
      status: row.status,
      reason: row.reason,
      notesForDoctor: row.notes_for_doctor,
      meetingUrl: row.meeting_url,
      calendarEventId: row.calendar_event_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
  };
}

export async function listDoctorAppointments(): Promise<Appointment[]> {
  const { doctorId } = useAuthStore.getState();
  if (!supabase || !doctorId) throw new DoctorPortalUnavailableError();

  const { data, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('doctor_id', doctorId)
    .gte('scheduled_at', new Date(Date.now() - 7 * 86_400_000).toISOString())
    .order('scheduled_at', { ascending: true });

  if (error) throw error;

  return ((data ?? []) as AppointmentRow[]).map((row) => ({
    id: row.id,
    userId: row.user_id,
    doctorId: row.doctor_id,
    doctor: null,
    hospitalId: row.hospital_id,
    scheduledAt: row.scheduled_at,
    durationMinutes: row.duration_minutes,
    mode: row.mode,
    status: row.status,
    reason: row.reason,
    notesForDoctor: row.notes_for_doctor,
    meetingUrl: row.meeting_url,
    calendarEventId: row.calendar_event_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function setAppointmentStatus(
  appointmentId: string,
  status: Appointment['status'],
): Promise<void> {
  if (!supabase) throw new DoctorPortalUnavailableError();
  const { error } = await supabase
    .from('appointments')
    .update({ status })
    .eq('id', appointmentId);
  if (error) throw error;
}
