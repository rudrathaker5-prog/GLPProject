import { COLLECTIONS, findBy, newId, nowIso, update, upsert } from '@core/data/localDb';
import type { DoctorNote, LanguageCode } from '@core/domain/types';
import { supabase } from '@core/supabase/client';
import type { DoctorNoteRow } from '@core/supabase/database.types';
import { currentOwnerId, useAuthStore } from '@features/auth/store/authStore';

/**
 * Doctor notes.
 *
 * A note is stored in clinical language exactly as the doctor wrote it, and a
 * patient-friendly version is generated alongside it. When the AI service is
 * unavailable the deterministic simplifier below runs instead, so the patient
 * always sees something readable rather than raw shorthand.
 */

export async function listDoctorNotes(): Promise<DoctorNote[]> {
  const { userId } = useAuthStore.getState();

  if (userId && supabase) {
    const { data, error } = await supabase
      .from('doctor_notes')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (!error && data) return (data as DoctorNoteRow[]).map(toNote);
  }

  const owner = currentOwnerId();
  const rows = await findBy<DoctorNote>(COLLECTIONS.doctorNotes, (n) => n.userId === owner);
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getDoctorNote(id: string): Promise<DoctorNote | null> {
  const notes = await listDoctorNotes();
  return notes.find((n) => n.id === id) ?? null;
}

export async function acknowledgeNote(id: string): Promise<void> {
  const { userId } = useAuthStore.getState();
  if (userId && supabase) {
    await supabase.from('doctor_notes').update({ acknowledged_at: nowIso() }).eq('id', id);
    return;
  }
  await update<DoctorNote>(COLLECTIONS.doctorNotes, id, { acknowledgedAt: nowIso() });
}

/**
 * Called from the doctor portal. Persists the clinical note and requests the
 * patient-friendly translation.
 */
export async function createDoctorNote(input: {
  patientId: string;
  doctorId: string;
  clinicalText: string;
  appointmentId?: string | null;
  language?: LanguageCode;
}): Promise<DoctorNote> {
  const friendlyFallback = simplifyClinicalText(input.clinicalText);

  if (supabase) {
    const { data, error } = await supabase
      .from('doctor_notes')
      .insert({
        user_id: input.patientId,
        doctor_id: input.doctorId,
        appointment_id: input.appointmentId ?? null,
        clinical_text: input.clinicalText,
        patient_friendly_text: friendlyFallback,
      })
      .select()
      .single();
    if (error) throw error;

    const note = toNote(data as DoctorNoteRow);

    // Ask the AI service for a better translation; the fallback already shipped.
    void supabase.functions
      .invoke('doctor-note-translate', { body: { noteId: note.id } })
      .catch(() => undefined);

    return note;
  }

  const note: DoctorNote = {
    id: newId(),
    userId: input.patientId,
    doctorId: input.doctorId,
    doctorName: null,
    appointmentId: input.appointmentId ?? null,
    clinicalText: input.clinicalText,
    patientFriendlyText: friendlyFallback,
    translatedText: null,
    createdAt: nowIso(),
    acknowledgedAt: null,
  };
  await upsert(COLLECTIONS.doctorNotes, note);
  return note;
}

/**
 * Deterministic clinical-shorthand expander.
 *
 * Not a substitute for the AI translation — it expands abbreviations and adds
 * an explanation for the terms Indian prescriptions use most, so an unreadable
 * note never reaches a patient.
 */
export function simplifyClinicalText(text: string): string {
  const EXPANSIONS: [RegExp, string][] = [
    [/\bOD\b/g, 'once a day'],
    [/\bBD\b/g, 'twice a day'],
    [/\bTDS\b/g, 'three times a day'],
    [/\bQID\b/g, 'four times a day'],
    [/\bHS\b/g, 'at bedtime'],
    [/\bSOS\b/g, 'only if needed'],
    [/\bPRN\b/g, 'only if needed'],
    [/\bAC\b/g, 'before food'],
    [/\bPC\b/g, 'after food'],
    [/\bs\/c\b/gi, 'under the skin (subcutaneous)'],
    [/\bIM\b/g, 'into the muscle'],
    [/\bGI\b/g, 'stomach and bowel (gastrointestinal)'],
    [/\bHbA1c\b/gi, 'HbA1c (three-month average blood sugar)'],
    [/\bLFT\b/g, 'liver function test'],
    [/\bRFT\b/g, 'kidney function test'],
    [/\bTFT\b/g, 'thyroid function test'],
    [/\bBP\b/g, 'blood pressure'],
    [/\bF\/U\b/gi, 'follow-up'],
    [/\bR\/V\b/gi, 'review'],
    [/\btitrate\b/gi, 'increase the dose in steps'],
    [/\bmonitor tolerance\b/gi, 'watch how well you handle it'],
    [/\bcontinue\b/gi, 'keep taking'],
    [/\bdiscontinue\b/gi, 'stop'],
    [/\bwkly\b/gi, 'weekly'],
  ];

  let out = text.trim();
  for (const [pattern, replacement] of EXPANSIONS) {
    out = out.replace(pattern, replacement);
  }

  const sentences = out
    .split(/(?<=[.;])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1));

  return [
    ...sentences,
    'If anything here is unclear, or symptoms get worse, contact your doctor before changing anything yourself.',
  ].join(' ');
}

function toNote(row: DoctorNoteRow): DoctorNote {
  return {
    id: row.id,
    userId: row.user_id,
    doctorId: row.doctor_id,
    doctorName: null,
    appointmentId: row.appointment_id,
    clinicalText: row.clinical_text,
    patientFriendlyText: row.patient_friendly_text,
    translatedText:
      (row.translated_text as unknown as Partial<Record<LanguageCode, string>> | null) ?? null,
    createdAt: row.created_at,
    acknowledgedAt: row.acknowledged_at,
  };
}
