import { COLLECTIONS, findBy, newId, nowIso, update, upsert } from '@core/data/localDb';
import type {
  DoseEvent,
  DoseFrequency,
  DoseStatus,
  MedicationForm,
  MedicationItem,
  Prescription,
  RefillChannel,
  RefillRequest,
} from '@core/domain/types';
import { supabase } from '@core/supabase/client';
import type {
  DoseEventRow,
  MedicationRow,
  PrescriptionRow,
  RefillRequestRow,
} from '@core/supabase/database.types';
import { currentOwnerId, useAuthStore } from '@features/auth/store/authStore';
import { addJourneyEvent } from '@features/journey/api/journeyRepository';
import {
  cancelReminders,
  scheduleMedicationReminders,
  scheduleRefillReminder,
} from '@features/notifications/service/notificationService';

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

function toMedication(row: MedicationRow): MedicationItem {
  return {
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
    timesOfDay: row.times_of_day ?? ['09:00'],
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
  };
}

function toDoseEvent(row: DoseEventRow): DoseEvent {
  return {
    id: row.id,
    userId: row.user_id,
    medicationId: row.medication_id,
    scheduledFor: row.scheduled_for,
    takenAt: row.taken_at,
    status: row.status,
    notes: row.notes,
    notificationId: row.notification_id,
  };
}

// ---------------------------------------------------------------------------
// Medications
// ---------------------------------------------------------------------------

export interface MedicationInput {
  name: string;
  genericName?: string | null;
  form: MedicationForm;
  strength: string;
  doseAmount: number;
  doseUnit: string;
  frequency: DoseFrequency;
  timesOfDay: string[];
  daysOfWeek?: number[] | null;
  startDate?: string;
  durationDays?: number | null;
  instructions?: string | null;
  storageNote?: string | null;
  isTitration?: boolean;
  unitsRemaining?: number | null;
  refillThresholdDays?: number;
  prescriptionId?: string | null;
}

export async function addMedication(input: MedicationInput): Promise<MedicationItem> {
  const { userId, ensureIdentity } = useAuthStore.getState();
  const identity = userId ?? (await ensureIdentity());

  const startDate = input.startDate ?? new Date().toISOString().slice(0, 10);
  const endDate = input.durationDays
    ? new Date(Date.now() + input.durationDays * 86_400_000).toISOString().slice(0, 10)
    : null;

  const storageNote =
    input.storageNote ??
    (input.form === 'injection' ? 'Keep refrigerated at 2-8 °C. Do not freeze.' : null);

  let medication: MedicationItem;

  if (identity && supabase) {
    const { data, error } = await supabase
      .from('medications')
      .insert({
        user_id: identity,
        prescription_id: input.prescriptionId ?? null,
        name: input.name,
        generic_name: input.genericName ?? null,
        form: input.form,
        strength: input.strength,
        dose_amount: input.doseAmount,
        dose_unit: input.doseUnit,
        frequency: input.frequency,
        times_of_day: input.timesOfDay,
        days_of_week: input.daysOfWeek ?? null,
        start_date: startDate,
        end_date: endDate,
        duration_days: input.durationDays ?? null,
        instructions: input.instructions ?? null,
        storage_note: storageNote,
        is_titration: input.isTitration ?? false,
        units_remaining: input.unitsRemaining ?? null,
        refill_threshold_days: input.refillThresholdDays ?? 7,
        active: true,
      })
      .select()
      .single();
    if (error) throw error;
    medication = toMedication(data as MedicationRow);
  } else {
    medication = {
      id: newId(),
      prescriptionId: input.prescriptionId ?? null,
      userId: currentOwnerId(),
      name: input.name,
      genericName: input.genericName ?? null,
      form: input.form,
      strength: input.strength,
      doseAmount: input.doseAmount,
      doseUnit: input.doseUnit,
      frequency: input.frequency,
      timesOfDay: input.timesOfDay,
      daysOfWeek: input.daysOfWeek ?? null,
      startDate,
      endDate,
      durationDays: input.durationDays ?? null,
      instructions: input.instructions ?? null,
      storageNote,
      isTitration: input.isTitration ?? false,
      titrationStep: null,
      refillThresholdDays: input.refillThresholdDays ?? 7,
      unitsRemaining: input.unitsRemaining ?? null,
      active: true,
    };
    await upsert(COLLECTIONS.medications, medication);
    await generateDoseEvents(medication, 35);
  }

  await scheduleMedicationReminders(medication);
  await addJourneyEvent({
    type: 'prescription',
    title: `${medication.name} added`,
    description: `${medication.doseAmount} ${medication.doseUnit}, ${frequencyLabel(medication.frequency)}`,
    stage: 'treatment',
    metadata: { medicationId: medication.id },
  });

  return medication;
}

export async function listMedications(includeInactive = false): Promise<MedicationItem[]> {
  const { userId } = useAuthStore.getState();

  if (userId && supabase) {
    let query = supabase.from('medications').select('*').eq('user_id', userId);
    if (!includeInactive) query = query.eq('active', true);
    const { data, error } = await query.order('created_at', { ascending: false });
    if (!error && data) return (data as MedicationRow[]).map(toMedication);
  }

  const owner = currentOwnerId();
  const rows = await findBy<MedicationItem>(
    COLLECTIONS.medications,
    (m) => m.userId === owner && (includeInactive || m.active),
  );
  return rows;
}

export async function getMedication(id: string): Promise<MedicationItem | null> {
  const all = await listMedications(true);
  return all.find((m) => m.id === id) ?? null;
}

export async function updateMedication(
  id: string,
  patch: Partial<MedicationInput> & { active?: boolean },
): Promise<MedicationItem | null> {
  const { userId } = useAuthStore.getState();

  if (userId && supabase) {
    const { data, error } = await supabase
      .from('medications')
      .update({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.strength !== undefined ? { strength: patch.strength } : {}),
        ...(patch.doseAmount !== undefined ? { dose_amount: patch.doseAmount } : {}),
        ...(patch.frequency !== undefined ? { frequency: patch.frequency } : {}),
        ...(patch.timesOfDay !== undefined ? { times_of_day: patch.timesOfDay } : {}),
        ...(patch.daysOfWeek !== undefined ? { days_of_week: patch.daysOfWeek } : {}),
        ...(patch.instructions !== undefined ? { instructions: patch.instructions } : {}),
        ...(patch.unitsRemaining !== undefined ? { units_remaining: patch.unitsRemaining } : {}),
        ...(patch.active !== undefined ? { active: patch.active } : {}),
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    const medication = toMedication(data as MedicationRow);
    if (medication.active) await scheduleMedicationReminders(medication);
    else await cancelReminders('medication', medication.id);
    return medication;
  }

  const updated = await update<MedicationItem>(COLLECTIONS.medications, id, {
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.strength !== undefined ? { strength: patch.strength } : {}),
    ...(patch.doseAmount !== undefined ? { doseAmount: patch.doseAmount } : {}),
    ...(patch.frequency !== undefined ? { frequency: patch.frequency } : {}),
    ...(patch.timesOfDay !== undefined ? { timesOfDay: patch.timesOfDay } : {}),
    ...(patch.daysOfWeek !== undefined ? { daysOfWeek: patch.daysOfWeek } : {}),
    ...(patch.instructions !== undefined ? { instructions: patch.instructions } : {}),
    ...(patch.unitsRemaining !== undefined ? { unitsRemaining: patch.unitsRemaining } : {}),
    ...(patch.active !== undefined ? { active: patch.active } : {}),
  });

  if (updated) {
    if (updated.active) await scheduleMedicationReminders(updated);
    else await cancelReminders('medication', updated.id);
  }
  return updated;
}

export async function stopMedication(id: string): Promise<void> {
  await updateMedication(id, { active: false });
  await cancelReminders('medication', id);
  await cancelReminders('refill', id);
}

// ---------------------------------------------------------------------------
// Dose events
// ---------------------------------------------------------------------------

/** Materialises dose events locally, mirroring the SQL `generate_dose_events`. */
export async function generateDoseEvents(
  medication: MedicationItem,
  days = 35,
): Promise<DoseEvent[]> {
  if (medication.frequency === 'as_needed') return [];

  const owner = currentOwnerId();
  const existing = await findBy<DoseEvent>(
    COLLECTIONS.doseEvents,
    (d) => d.medicationId === medication.id,
  );
  const seen = new Set(existing.map((d) => d.scheduledFor));
  const created: DoseEvent[] = [];

  const cursor = new Date(Math.max(new Date(medication.startDate).getTime(), Date.now()));
  cursor.setHours(0, 0, 0, 0);
  const limit = new Date(Date.now() + days * 86_400_000);

  while (cursor <= limit) {
    const matchesWeekday =
      !medication.daysOfWeek?.length || medication.daysOfWeek.includes(cursor.getDay());

    if (matchesWeekday) {
      for (const time of medication.timesOfDay) {
        const [h, m] = time.split(':').map(Number);
        if (Number.isNaN(h) || Number.isNaN(m)) continue;
        const at = new Date(cursor);
        at.setHours(h, m, 0, 0);
        if (at.getTime() < Date.now() - 86_400_000) continue;
        const iso = at.toISOString();
        if (seen.has(iso)) continue;

        const event: DoseEvent = {
          id: newId(),
          userId: owner,
          medicationId: medication.id,
          scheduledFor: iso,
          takenAt: null,
          status: 'scheduled',
          notes: null,
          notificationId: null,
        };
        await upsert(COLLECTIONS.doseEvents, event);
        created.push(event);
        seen.add(iso);
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return created;
}

export async function listDoseEvents(fromDays = 30, toDays = 14): Promise<DoseEvent[]> {
  const { userId } = useAuthStore.getState();
  const from = new Date(Date.now() - fromDays * 86_400_000).toISOString();
  const to = new Date(Date.now() + toDays * 86_400_000).toISOString();

  if (userId && supabase) {
    const { data, error } = await supabase
      .from('dose_events')
      .select('*')
      .eq('user_id', userId)
      .gte('scheduled_for', from)
      .lte('scheduled_for', to)
      .order('scheduled_for', { ascending: true });
    if (!error && data) return (data as DoseEventRow[]).map(toDoseEvent);
  }

  const owner = currentOwnerId();
  const rows = await findBy<DoseEvent>(
    COLLECTIONS.doseEvents,
    (d) => d.userId === owner && d.scheduledFor >= from && d.scheduledFor <= to,
  );
  return rows.sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));
}

export async function todaysDoses(): Promise<DoseEvent[]> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const all = await listDoseEvents(1, 2);
  return all.filter((d) => {
    const t = new Date(d.scheduledFor).getTime();
    return t >= start.getTime() && t < end.getTime();
  });
}

export async function nextDose(): Promise<DoseEvent | null> {
  const all = await listDoseEvents(0, 30);
  const upcoming = all
    .filter((d) => d.status === 'scheduled' && new Date(d.scheduledFor).getTime() > Date.now())
    .sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));
  return upcoming[0] ?? null;
}

export async function setDoseStatus(
  id: string,
  status: DoseStatus,
  notes?: string,
): Promise<void> {
  const { userId } = useAuthStore.getState();
  const takenAt = status === 'taken' ? nowIso() : null;

  if (userId && supabase) {
    await supabase
      .from('dose_events')
      .update({ status, taken_at: takenAt, notes: notes ?? null })
      .eq('id', id);
  } else {
    await update<DoseEvent>(COLLECTIONS.doseEvents, id, {
      status,
      takenAt,
      notes: notes ?? null,
    });
  }

  if (status === 'taken') {
    const event = (await listDoseEvents(30, 30)).find((d) => d.id === id);
    if (event) await decrementUnits(event.medicationId);
  }
}

/** Decrements remaining units and raises a refill reminder when low. */
async function decrementUnits(medicationId: string): Promise<void> {
  const medication = await getMedication(medicationId);
  if (!medication || medication.unitsRemaining === null) return;

  const remaining = Math.max(0, medication.unitsRemaining - 1);
  await updateMedication(medicationId, { unitsRemaining: remaining });

  const days = refillDaysRemaining({ ...medication, unitsRemaining: remaining });
  if (days !== null && days <= medication.refillThresholdDays) {
    await scheduleRefillReminder(medication, days);
  }
}

/** Days of supply left. Mirrors the SQL `refill_days_remaining`. */
export function refillDaysRemaining(medication: MedicationItem): number | null {
  if (medication.unitsRemaining === null) return null;
  const perWeek = {
    weekly: 1,
    daily: 7,
    twice_daily: 14,
    thrice_daily: 21,
    as_needed: 0,
  }[medication.frequency];
  if (!perWeek) return null;
  return Math.floor(medication.unitsRemaining / (perWeek / 7));
}

export function frequencyLabel(frequency: DoseFrequency): string {
  return {
    weekly: 'once a week',
    daily: 'once a day',
    twice_daily: 'twice a day',
    thrice_daily: 'three times a day',
    as_needed: 'as needed',
  }[frequency];
}

export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ---------------------------------------------------------------------------
// Prescriptions
// ---------------------------------------------------------------------------

export async function listPrescriptions(): Promise<Prescription[]> {
  const { userId } = useAuthStore.getState();

  if (userId && supabase) {
    const { data, error } = await supabase
      .from('prescriptions')
      .select('*')
      .eq('user_id', userId)
      .order('issued_on', { ascending: false });
    if (!error && data) {
      return (data as PrescriptionRow[]).map((row) => ({
        id: row.id,
        userId: row.user_id,
        doctorId: row.doctor_id,
        doctorName: row.doctor_name,
        hospitalName: row.hospital_name,
        issuedOn: row.issued_on,
        validUntil: row.valid_until,
        imageUrl: row.image_url,
        rawText: row.raw_text,
        extractionConfidence: row.extraction_confidence,
        status: row.status,
        createdAt: row.created_at,
      }));
    }
  }

  const owner = currentOwnerId();
  return findBy<Prescription>(COLLECTIONS.prescriptions, (p) => p.userId === owner);
}

export async function createPrescription(input: {
  doctorName?: string | null;
  hospitalName?: string | null;
  issuedOn?: string;
  imageUrl?: string | null;
  rawText?: string | null;
}): Promise<Prescription> {
  const { userId, ensureIdentity } = useAuthStore.getState();
  const identity = userId ?? (await ensureIdentity());
  const issuedOn = input.issuedOn ?? new Date().toISOString().slice(0, 10);

  if (identity && supabase) {
    const { data, error } = await supabase
      .from('prescriptions')
      .insert({
        user_id: identity,
        doctor_name: input.doctorName ?? null,
        hospital_name: input.hospitalName ?? null,
        issued_on: issuedOn,
        image_url: input.imageUrl ?? null,
        raw_text: input.rawText ?? null,
        status: 'active',
      })
      .select()
      .single();
    if (error) throw error;
    const row = data as PrescriptionRow;
    return {
      id: row.id,
      userId: row.user_id,
      doctorId: row.doctor_id,
      doctorName: row.doctor_name,
      hospitalName: row.hospital_name,
      issuedOn: row.issued_on,
      validUntil: row.valid_until,
      imageUrl: row.image_url,
      rawText: row.raw_text,
      extractionConfidence: row.extraction_confidence,
      status: row.status,
      createdAt: row.created_at,
    };
  }

  const prescription: Prescription = {
    id: newId(),
    userId: currentOwnerId(),
    doctorId: null,
    doctorName: input.doctorName ?? null,
    hospitalName: input.hospitalName ?? null,
    issuedOn,
    validUntil: null,
    imageUrl: input.imageUrl ?? null,
    rawText: input.rawText ?? null,
    extractionConfidence: null,
    status: 'active',
    createdAt: nowIso(),
  };
  await upsert(COLLECTIONS.prescriptions, prescription);
  return prescription;
}

// ---------------------------------------------------------------------------
// Refills
// ---------------------------------------------------------------------------

export async function requestRefill(input: {
  medicationId: string;
  channel: RefillChannel;
  pharmacyId?: string | null;
  addressLine?: string | null;
}): Promise<RefillRequest> {
  const { userId, ensureIdentity } = useAuthStore.getState();
  const identity = userId ?? (await ensureIdentity());

  const leadDays = input.channel === 'home_delivery' ? 3 : input.channel === 'nearby_pharmacy' ? 1 : 2;
  const expectedBy = new Date(Date.now() + leadDays * 86_400_000).toISOString();

  if (identity && supabase) {
    const { data, error } = await supabase
      .from('refill_requests')
      .insert({
        user_id: identity,
        medication_id: input.medicationId,
        channel: input.channel,
        pharmacy_id: input.pharmacyId ?? null,
        address_line: input.addressLine ?? null,
        status: 'requested',
        expected_by: expectedBy,
      })
      .select()
      .single();
    if (error) throw error;

    const row = data as RefillRequestRow;
    // Hand off to the fulfilment integration; failure is non-fatal.
    void supabase.functions
      .invoke('pharmacy-order', { body: { refillId: row.id } })
      .catch(() => undefined);

    return toRefill(row);
  }

  const refill: RefillRequest = {
    id: newId(),
    userId: currentOwnerId(),
    medicationId: input.medicationId,
    channel: input.channel,
    pharmacyId: input.pharmacyId ?? null,
    status: 'requested',
    requestedAt: nowIso(),
    expectedBy,
    addressLine: input.addressLine ?? null,
    notes: 'Recorded on this device. Connect a pharmacy partner to dispatch automatically.',
  };
  await upsert(COLLECTIONS.refills, refill);
  return refill;
}

export async function listRefills(): Promise<RefillRequest[]> {
  const { userId } = useAuthStore.getState();

  if (userId && supabase) {
    const { data, error } = await supabase
      .from('refill_requests')
      .select('*')
      .eq('user_id', userId)
      .order('requested_at', { ascending: false });
    if (!error && data) return (data as RefillRequestRow[]).map(toRefill);
  }

  const owner = currentOwnerId();
  const rows = await findBy<RefillRequest>(COLLECTIONS.refills, (r) => r.userId === owner);
  return rows.sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
}

function toRefill(row: RefillRequestRow): RefillRequest {
  return {
    id: row.id,
    userId: row.user_id,
    medicationId: row.medication_id,
    channel: row.channel,
    pharmacyId: row.pharmacy_id,
    status: row.status,
    requestedAt: row.requested_at,
    expectedBy: row.expected_by,
    addressLine: row.address_line,
    notes: row.notes,
  };
}
