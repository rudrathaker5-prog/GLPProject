import { COLLECTIONS, insert, newId, nowIso, readCollection } from '@core/data/localDb';
import { CRISIS_RESOURCES_IN } from '@core/clinical/safety';
import { supabase } from '@core/supabase/client';
import { currentOwnerId } from '@features/auth/store/authStore';
import { callNumber } from '@integrations/communication/communicationAdapter';

/**
 * Placing and remembering phone calls.
 *
 * `callNumber` opens the dialler and forgets. That is fine for a directory
 * listing and wrong for a care app: when someone reports a side effect at 2am
 * and calls their doctor, that call is part of the clinical picture. The coach
 * should not ask "have you spoken to your doctor?" ten minutes after the app
 * itself opened the dialler for exactly that.
 *
 * So every call the app initiates is recorded — who, when, why, and whether the
 * dialler actually opened. The log is local-first like everything else, and it
 * records *intent*, not connection: Android gives an app no way to know whether
 * a call connected or how long it lasted without the call-log permission, which
 * this app deliberately does not ask for. The distinction is stated in the UI
 * rather than papered over.
 */

export type CallKind =
  | 'doctor'
  | 'hospital'
  | 'pharmacy'
  | 'emergency'
  | 'crisis_line'
  | 'other';

/** Why the call was placed, so the coach and the doctor can see the context. */
export type CallReason =
  | 'routine'
  | 'side_effect'
  | 'missed_dose'
  | 'refill'
  | 'appointment'
  | 'red_flag'
  | 'relapse'
  | 'unknown';

export interface CallLogEntry {
  id: string;
  userId: string | null;
  number: string;
  contactName: string | null;
  kind: CallKind;
  reason: CallReason;
  /** True when the OS dialler opened. Not a guarantee anyone answered. */
  dialled: boolean;
  placedAt: string;
  /** Free text the user added afterwards — what was said, what to do next. */
  outcomeNote: string | null;
}

/**
 * Numbers that must work when nothing else does.
 *
 * These are national Indian services and are dialled directly rather than
 * through the doctor directory, because in the situations that need them the
 * patient's own doctor may be unreachable and the delay matters.
 */
export const EMERGENCY_CONTACTS: {
  id: string;
  name: string;
  number: string;
  kind: CallKind;
  /** When to use this one, in the patient's terms. */
  when: string;
}[] = [
  {
    id: 'emergency-112',
    name: 'Emergency services',
    number: '112',
    kind: 'emergency',
    when: 'Chest pain, trouble breathing, swelling of the face or throat, collapse.',
  },
  {
    id: 'ambulance-108',
    name: 'Ambulance',
    number: '108',
    kind: 'emergency',
    when: 'You need to get to hospital and cannot travel yourself.',
  },
  {
    id: 'telemanas-14416',
    name: 'Tele-MANAS mental health helpline',
    number: '14416',
    kind: 'crisis_line',
    when: 'Thoughts of harming yourself, or distress you cannot manage alone. Free, 24/7.',
  },
];

/** The crisis list the safety triage cites, kept in one place. */
export const CRISIS_NUMBERS = CRISIS_RESOURCES_IN;

export interface PlaceCallInput {
  number: string | null | undefined;
  contactName?: string | null;
  kind?: CallKind;
  reason?: CallReason;
}

/**
 * Dials a number and records that we did.
 *
 * Never throws: a failure to write the log must not stop a call, least of all
 * an emergency one. The dial happens first for the same reason.
 */
export async function placeCall(input: PlaceCallInput): Promise<CallLogEntry | null> {
  const { number, contactName = null, kind = 'other', reason = 'unknown' } = input;
  if (!number) return null;

  const dialled = await callNumber(number);

  const entry: CallLogEntry = {
    id: newId(),
    userId: currentOwnerId(),
    number,
    contactName,
    kind,
    reason,
    dialled,
    placedAt: nowIso(),
    outcomeNote: null,
  };

  // Local first, always — the log has to survive a flight-mode call.
  try {
    await insert(COLLECTIONS.callLog, entry);
  } catch {
    // Logging is best-effort. The call is the thing that matters.
  }

  // Then the server, so a signed-in patient's care team can see it. Failure
  // here is silent by design: a network problem must never surface as an error
  // on a screen someone reached because they needed to phone a doctor.
  if (supabase && entry.userId) {
    void supabase
      .from('call_log')
      .insert({
        user_id: entry.userId,
        number: entry.number,
        contact_name: entry.contactName,
        kind: entry.kind,
        reason: entry.reason,
        dialled: entry.dialled,
        placed_at: entry.placedAt,
        outcome_note: entry.outcomeNote,
      })
      .then(() => undefined, () => undefined);
  }

  return entry;
}

/** Most recent first. */
export async function listCallLog(limit = 50): Promise<CallLogEntry[]> {
  const rows = await readCollection<CallLogEntry>(COLLECTIONS.callLog);
  const owner = currentOwnerId();
  return rows
    .filter((row) => !owner || !row.userId || row.userId === owner)
    .sort((a, b) => b.placedAt.localeCompare(a.placedAt))
    .slice(0, limit);
}

/** Adds what came of a call, so the note survives past the memory of it. */
export async function noteCallOutcome(callId: string, note: string): Promise<void> {
  const rows = await readCollection<CallLogEntry>(COLLECTIONS.callLog);
  const index = rows.findIndex((row) => row.id === callId);
  if (index < 0) return;
  rows[index] = { ...rows[index], outcomeNote: note.trim() || null };
  const { writeCollection } = await import('@core/data/localDb');
  await writeCollection(COLLECTIONS.callLog, rows);
}

/** The last call placed for a given reason, if any. */
export async function lastCallFor(reason: CallReason): Promise<CallLogEntry | null> {
  const rows = await listCallLog(100);
  return rows.find((row) => row.reason === reason) ?? null;
}

/** Days since the patient last rang anyone in their care team. */
export async function daysSinceLastCareCall(): Promise<number | null> {
  const rows = await listCallLog(100);
  const care = rows.find((row) => row.kind === 'doctor' || row.kind === 'hospital');
  if (!care) return null;
  return Math.floor((Date.now() - new Date(care.placedAt).getTime()) / 86_400_000);
}

export function callKindLabel(kind: CallKind): string {
  return {
    doctor: 'Doctor',
    hospital: 'Hospital',
    pharmacy: 'Pharmacy',
    emergency: 'Emergency',
    crisis_line: 'Helpline',
    other: 'Call',
  }[kind];
}

export function callReasonLabel(reason: CallReason): string {
  return {
    routine: 'Routine',
    side_effect: 'Side effect',
    missed_dose: 'Missed dose',
    refill: 'Refill',
    appointment: 'Appointment',
    red_flag: 'Urgent symptom',
    relapse: 'Weight regain',
    unknown: '—',
  }[reason];
}
