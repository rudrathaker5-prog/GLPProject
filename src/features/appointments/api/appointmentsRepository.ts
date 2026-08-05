import { COLLECTIONS, findBy, newId, nowIso, update, upsert } from '@core/data/localDb';
import type {
  Appointment,
  AppointmentMode,
  AppointmentStatus,
} from '@core/domain/types';
import { supabase } from '@core/supabase/client';
import type { AppointmentRow, DoctorRow } from '@core/supabase/database.types';
import { currentOwnerId, useAuthStore } from '@features/auth/store/authStore';
import { getDoctor } from '@features/doctors/api/doctorsRepository';
import { scheduleAppointmentReminders, cancelReminders } from '@features/notifications/service/notificationService';
import { addJourneyEvent } from '@features/journey/api/journeyRepository';

function toDomain(row: AppointmentRow & { doctor?: DoctorRow | null }): Appointment {
  return {
    id: row.id,
    userId: row.user_id,
    doctorId: row.doctor_id,
    doctor: row.doctor
      ? {
          id: row.doctor.id,
          fullName: row.doctor.full_name,
          speciality: row.doctor.speciality,
          qualifications: row.doctor.qualifications,
          registrationNumber: row.doctor.registration_number,
          hospitalId: row.doctor.hospital_id,
          city: row.doctor.city,
          languages: row.doctor.languages,
          consultationFee: row.doctor.consultation_fee,
          teleconsultAvailable: row.doctor.teleconsult_available,
          rating: row.doctor.rating,
          yearsExperience: row.doctor.years_experience,
          photoUrl: row.doctor.photo_url,
          phone: row.doctor.phone,
          bio: row.doctor.bio,
        }
      : null,
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
  };
}

export class SlotUnavailableError extends Error {
  constructor() {
    super('That time was just taken. Please pick another slot.');
    this.name = 'SlotUnavailableError';
  }
}

export interface BookInput {
  doctorId: string;
  scheduledAt: string;
  mode: AppointmentMode;
  durationMinutes?: number;
  reason?: string | null;
  notesForDoctor?: string | null;
}

export async function bookAppointment(input: BookInput): Promise<Appointment> {
  const { userId, ensureIdentity } = useAuthStore.getState();

  // Booking is the point where an anonymous user needs a real identity.
  const identity = userId ?? (await ensureIdentity());

  if (identity && supabase) {
    const { data, error } = await supabase.rpc('book_appointment', {
      p_doctor: input.doctorId,
      p_scheduled_at: input.scheduledAt,
      p_mode: input.mode,
      p_reason: input.reason ?? null,
      p_duration: input.durationMinutes ?? 20,
    });

    if (error) {
      if (error.message.includes('slot_unavailable')) throw new SlotUnavailableError();
      throw error;
    }

    const appointment = toDomain(data as AppointmentRow);
    if (input.notesForDoctor) {
      await supabase
        .from('appointments')
        .update({ notes_for_doctor: input.notesForDoctor })
        .eq('id', appointment.id);
      appointment.notesForDoctor = input.notesForDoctor;
    }

    const doctor = await getDoctor(input.doctorId);
    await scheduleAppointmentReminders(appointment, doctor?.fullName ?? 'your doctor');
    return appointment;
  }

  // Offline / no backend: keep the booking locally so the journey is complete.
  const clash = await findBy<Appointment>(
    COLLECTIONS.appointments,
    (a) =>
      a.doctorId === input.doctorId &&
      a.scheduledAt === input.scheduledAt &&
      ['requested', 'confirmed', 'rescheduled'].includes(a.status),
  );
  if (clash.length > 0) throw new SlotUnavailableError();

  const doctor = await getDoctor(input.doctorId);
  const appointment: Appointment = {
    id: newId(),
    userId: currentOwnerId(),
    doctorId: input.doctorId,
    doctor,
    hospitalId: doctor?.hospitalId ?? null,
    scheduledAt: input.scheduledAt,
    durationMinutes: input.durationMinutes ?? 20,
    mode: input.mode,
    status: 'confirmed',
    reason: input.reason ?? null,
    notesForDoctor: input.notesForDoctor ?? null,
    meetingUrl: input.mode === 'video' ? `glpcare://consult/${newId()}` : null,
    calendarEventId: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  await upsert(COLLECTIONS.appointments, appointment);
  await addJourneyEvent({
    type: 'appointment',
    title: 'Appointment booked',
    description: `${doctor?.fullName ?? 'Doctor'} — ${new Date(input.scheduledAt).toLocaleString('en-IN')}`,
    stage: 'awareness',
  });
  await scheduleAppointmentReminders(appointment, doctor?.fullName ?? 'your doctor');

  return appointment;
}

export async function listAppointments(): Promise<Appointment[]> {
  const { userId } = useAuthStore.getState();

  if (userId && supabase) {
    const { data, error } = await supabase
      .from('appointments')
      .select('*, doctor:doctors(*)')
      .eq('user_id', userId)
      .order('scheduled_at', { ascending: false });
    if (!error && data) {
      return (data as unknown as (AppointmentRow & { doctor?: DoctorRow | null })[]).map(toDomain);
    }
  }

  const owner = currentOwnerId();
  const rows = await findBy<Appointment>(COLLECTIONS.appointments, (a) => a.userId === owner);
  return rows.sort(
    (a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime(),
  );
}

export async function getAppointment(id: string): Promise<Appointment | null> {
  const all = await listAppointments();
  return all.find((a) => a.id === id) ?? null;
}

export async function updateAppointmentStatus(
  id: string,
  status: AppointmentStatus,
): Promise<void> {
  const { userId } = useAuthStore.getState();

  if (userId && supabase) {
    await supabase.from('appointments').update({ status }).eq('id', id);
  } else {
    await update<Appointment>(COLLECTIONS.appointments, id, { status, updatedAt: nowIso() });
  }

  if (status === 'cancelled') {
    await cancelReminders('appointment', id);
  }
}

export async function rescheduleAppointment(
  id: string,
  scheduledAt: string,
  mode?: AppointmentMode,
): Promise<Appointment | null> {
  const { userId } = useAuthStore.getState();
  await cancelReminders('appointment', id);

  if (userId && supabase) {
    const { data, error } = await supabase
      .from('appointments')
      .update({ scheduled_at: scheduledAt, status: 'rescheduled', ...(mode ? { mode } : {}) })
      .eq('id', id)
      .select('*, doctor:doctors(*)')
      .single();
    if (error) throw error;
    const appointment = toDomain(data as unknown as AppointmentRow & { doctor?: DoctorRow | null });
    await scheduleAppointmentReminders(appointment, appointment.doctor?.fullName ?? 'your doctor');
    return appointment;
  }

  const updated = await update<Appointment>(COLLECTIONS.appointments, id, {
    scheduledAt,
    status: 'rescheduled',
    ...(mode ? { mode } : {}),
    updatedAt: nowIso(),
  });
  if (updated) {
    await scheduleAppointmentReminders(updated, updated.doctor?.fullName ?? 'your doctor');
  }
  return updated;
}

export async function attachCalendarEvent(id: string, calendarEventId: string): Promise<void> {
  const { userId } = useAuthStore.getState();
  if (userId && supabase) {
    await supabase.from('appointments').update({ calendar_event_id: calendarEventId }).eq('id', id);
    return;
  }
  await update<Appointment>(COLLECTIONS.appointments, id, { calendarEventId });
}

export function isUpcoming(appointment: Appointment): boolean {
  return (
    new Date(appointment.scheduledAt).getTime() > Date.now() &&
    ['requested', 'confirmed', 'rescheduled'].includes(appointment.status)
  );
}
