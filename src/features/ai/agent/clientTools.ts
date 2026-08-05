import { evaluateEligibility } from '@core/clinical/eligibility';
import { violatesPrescribingRule } from '@core/clinical/prescribingGuard';
import type {
  AgentAction,
  AgentCard,
  CheckInField,
  Comorbidity,
  Contraindication,
  JourneyStage,
  Sex,
  SideEffectReport,
} from '@core/domain/types';
import { searchTopics, getTopic } from '@features/awareness/content/education';
import { searchMyths } from '@features/awareness/content/myths';
import { bookAppointment } from '@features/appointments/api/appointmentsRepository';
import { listDoctors, listSlots } from '@features/doctors/api/doctorsRepository';
import { addJourneyEvent } from '@features/journey/api/journeyRepository';
import {
  listMedications,
  nextDose,
  refillDaysRemaining,
  requestRefill,
} from '@features/medication/api/medicationRepository';
import { listCallLog } from '@features/calls/api/callService';
import { getActivePlan } from '@features/nutrition/api/nutritionRepository';
import {
  maintenanceStatus,
  needsClinicalReview,
  sideEffectTrend,
} from '@features/vigilance/api/vigilanceRepository';
import { getProfile, saveProfile } from '@features/profile/api/profileRepository';
import {
  currentRelapseRisk,
  logWeight,
  progressSummary,
  saveCheckIn,
} from '@features/tracking/api/trackingRepository';

/**
 * Tool execution on the device.
 *
 * These are the same tool names, arguments and semantics as the server agent in
 * `supabase/functions/_shared/tools.ts`. The difference is only where they run:
 * here they call the app's repositories directly, which means a tool works
 * offline and against local storage exactly as it does against Postgres.
 *
 * Nothing here can do something the user could not do themselves in the UI.
 */

export interface ToolResult {
  /** Fed back to the model as the tool message. */
  forModel: unknown;
  /** Rendered by the app as a real UI element. */
  card?: AgentCard;
}

type Args = Record<string, unknown>;

const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;
const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);
const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/**
 * A number the model supplied, accepted only inside a plausible range.
 *
 * These values are written to a health record and then read back by the
 * wellness score, the relapse band and every percentage-lost calculation. A
 * model that mis-parses "I was 95 kg back in 2019" should not be able to store
 * -40 or 4000 kg. Postgres has CHECK constraints for the same ranges, but the
 * on-device store — which is exactly the bring-your-own-key configuration this
 * agent exists for — has none, so the check has to live here too.
 *
 * Out of range returns undefined, which every caller already treats as "not
 * provided", so a bad value is dropped rather than clamped into a plausible
 * lie.
 */
const inRange = (v: unknown, min: number, max: number): number | undefined => {
  const n = num(v);
  return n !== undefined && n >= min && n <= max ? n : undefined;
};

/** A 0-10 self-reported score. */
const score = (v: unknown): number | undefined => inRange(v, 0, 10);

/** Body weight in kilograms — the same bounds as the weight_entries CHECK. */
const weight = (v: unknown): number | undefined => inRange(v, 10, 500);

/** One of a fixed set, or undefined. `as` casts let anything through. */
const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): T | undefined =>
  typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;

/*
  These used to be `as` casts, which assert rather than check: "telepathy"
  passed straight through to bookAppointment. Postgres enums reject them, but
  the on-device store does not — and that is the configuration this agent runs
  in.
*/
const SEXES = ['male', 'female', 'other', 'undisclosed'] as const satisfies readonly Sex[];
const APPOINTMENT_MODES = ['in_person', 'video', 'phone'] as const;
const REFILL_CHANNELS = ['hospital_pharmacy', 'nearby_pharmacy', 'home_delivery'] as const;

export async function executeClientTool(
  name: string,
  args: Args,
  ctx: { stage: JourneyStage },
): Promise<ToolResult> {
  try {
    switch (name) {
      case 'check_eligibility':
        return await checkEligibility(args);
      case 'find_doctors':
      case 'recommend_doctor_consultation':
        return await findDoctors(args);
      case 'get_available_slots':
        return await getSlots(args);
      case 'book_appointment':
        return await book(args);
      case 'explain_myth':
        return explainMyth(args);
      case 'get_education_topic':
        return getEducation(args);
      case 'log_weight':
        return await doLogWeight(args);
      case 'request_check_in':
        return requestCheckIn(args);
      case 'save_check_in':
        return await doSaveCheckIn(args, ctx);
      case 'get_medication_schedule':
        return await medicationSchedule();
      case 'request_refill':
        return await doRequestRefill(args);
      case 'get_progress':
        return await getProgress();
      case 'get_nutrition_plan':
        return await nutritionPlan();
      case 'get_side_effect_trend':
        return await sideEffects(args);
      case 'get_call_history':
        return await callHistory();
      case 'get_maintenance_status':
        return await maintenance();
      case 'trigger_relapse_protocol':
        return await relapseProtocol(args);
      case 'escalate_to_care':
        return escalate(args);
      case 'suggest_actions':
        return suggestActions(args);
      case 'remember':
        return { forModel: { stored: false, note: 'Memory is stored by the app automatically.' } };
      default:
        return { forModel: { error: `Unknown tool ${name}` } };
    }
  } catch (error) {
    return {
      forModel: { error: error instanceof Error ? error.message : 'Tool failed' },
    };
  }
}

// ---------------------------------------------------------------------------

async function checkEligibility(args: Args): Promise<ToolResult> {
  const heightCm = inRange(args.height_cm, 50, 250);
  const weightKg = weight(args.weight_kg);
  const waistCm = inRange(args.waist_cm, 30, 250);

  const result = evaluateEligibility({
    heightCm: heightCm ?? null,
    weightKg: weightKg ?? null,
    waistCm: waistCm ?? null,
    age: inRange(args.age, 0, 120) ?? null,
    sex: oneOf(args.sex, SEXES) ?? 'undisclosed',
    comorbidities: arr<Comorbidity>(args.comorbidities),
    contraindications: arr<Contraindication>(args.contraindications),
  });

  // Anything the user volunteered mid-conversation is worth keeping. Note this
  // overwrites startingWeightKg — the anchor every percentage-lost figure is
  // measured from — so it only accepts a plausible body weight.
  if (heightCm || weightKg || waistCm) {
    await saveProfile({
      heightCm: heightCm ?? undefined,
      startingWeightKg: weightKg ?? undefined,
      waistCm: waistCm ?? undefined,
    }).catch(() => undefined);
  }

  return { forModel: result, card: { kind: 'eligibility', result } };
}

async function findDoctors(args: Args): Promise<ToolResult> {
  const { doctors } = await listDoctors({
    city: str(args.city),
    teleconsultOnly: args.teleconsult_only === true,
  });
  const shown = doctors.slice(0, Math.min(num(args.limit) ?? 3, 5));

  return {
    forModel: {
      count: shown.length,
      reason: str(args.reason) ?? null,
      doctors: shown.map((d) => ({
        id: d.id,
        name: d.fullName,
        speciality: d.speciality,
        city: d.city,
        phone: d.phone,
        fee: d.consultationFee,
        teleconsult: d.teleconsultAvailable,
      })),
      note: 'The app shows tappable Call and Book buttons for each of these. Do not repeat the phone numbers as plain text.',
    },
    card: { kind: 'doctor_list', doctors: shown },
  };
}

async function getSlots(args: Args): Promise<ToolResult> {
  const doctorId = str(args.doctor_id);
  const date = str(args.date);
  if (!doctorId || !date) return { forModel: { error: 'doctor_id and date are required' } };

  const slots = await listSlots(doctorId, new Date(date));
  return {
    forModel: {
      slots: slots.slice(0, 12).map((s) => ({
        starts_at: s.startsAt,
        duration_minutes: s.durationMinutes,
        mode: s.mode,
      })),
    },
  };
}

async function book(args: Args): Promise<ToolResult> {
  const doctorId = str(args.doctor_id);
  const scheduledAt = str(args.scheduled_at);
  if (!doctorId || !scheduledAt) {
    return { forModel: { booked: false, error: 'doctor_id and scheduled_at are required' } };
  }

  const appointment = await bookAppointment({
    doctorId,
    scheduledAt,
    mode: oneOf(args.mode, APPOINTMENT_MODES) ?? 'in_person',
    reason: str(args.reason) ?? null,
  });

  return {
    forModel: { booked: true, at: appointment.scheduledAt, mode: appointment.mode },
    card: { kind: 'appointment', appointment },
  };
}

function explainMyth(args: Args): ToolResult {
  const matches = searchMyths(str(args.query) ?? '');
  const myth = matches[0];
  if (!myth) {
    return {
      forModel: {
        found: false,
        note: 'No stored card matched. Answer from your own evidence knowledge, carefully, without inventing citations.',
      },
    };
  }
  return { forModel: { found: true, myth }, card: { kind: 'myth', myth } };
}

function getEducation(args: Args): ToolResult {
  const category = str(args.category);
  const query = str(args.query) ?? '';
  const matches = searchTopics(query);
  const topic =
    (category ? matches.find((t) => t.category === category) : undefined) ??
    matches[0] ??
    getTopic('obesity-is-a-disease');

  if (!topic) return { forModel: { found: false } };
  return { forModel: { found: true, topic }, card: { kind: 'education', topic } };
}

async function doLogWeight(args: Args): Promise<ToolResult> {
  const weightKg = weight(args.weight_kg);
  if (!weightKg) {
    return {
      forModel: {
        logged: false,
        error: 'weight_kg is required and must be a plausible body weight in kg (10-500)',
      },
    };
  }

  const { milestones } = await logWeight({
    weightKg,
    waistCm: inRange(args.waist_cm, 30, 250) ?? null,
    recordedOn: str(args.recorded_on),
  });

  return { forModel: { logged: true, weight_kg: weightKg, new_milestones: milestones } };
}

function requestCheckIn(args: Args): ToolResult {
  const fields = arr<CheckInField>(args.fields);
  return {
    forModel: { shown: true, fields },
    card: {
      kind: 'checkin_request',
      fields: fields.length ? fields : ['weight', 'mood', 'appetite', 'energy', 'side_effects'],
    },
  };
}

async function doSaveCheckIn(args: Args, ctx: { stage: JourneyStage }): Promise<ToolResult> {
  const { wellness } = await saveCheckIn({
    kind: ctx.stage === 'vigilance' ? 'vigilance' : 'passive',
    // Every score feeds the wellness calculation and the relapse band, so an
    // out-of-range value would quietly distort both. Dropped, not clamped.
    weightKg: weight(args.weight_kg) ?? null,
    moodScore: score(args.mood_score) ?? null,
    appetiteScore: score(args.appetite_score) ?? null,
    energyScore: score(args.energy_score) ?? null,
    sleepHours: inRange(args.sleep_hours, 0, 24) ?? null,
    sleepQuality: score(args.sleep_quality) ?? null,
    stressScore: score(args.stress_score) ?? null,
    cravingScore: score(args.craving_score) ?? null,
    waterLitres: inRange(args.water_litres, 0, 20) ?? null,
    exerciseMinutes: inRange(args.exercise_minutes, 0, 1440) ?? null,
    nutritionAdherence: score(args.nutrition_adherence) ?? null,
    confidenceScore: score(args.confidence_score) ?? null,
    sideEffects: arr<SideEffectReport>(args.side_effects),
    freeText: str(args.free_text) ?? null,
  });

  return {
    forModel: { saved: true, wellness_score: wellness?.score ?? null, band: wellness?.band ?? null },
    card: wellness ? { kind: 'wellness', wellness } : undefined,
  };
}

async function medicationSchedule(): Promise<ToolResult> {
  const medications = await listMedications();
  const next = await nextDose();

  return {
    forModel: {
      medications: medications.map((m) => ({
        id: m.id,
        name: m.name,
        strength: m.strength,
        dose: `${m.doseAmount} ${m.doseUnit}`,
        frequency: m.frequency,
        times: m.timesOfDay,
        storage: m.storageNote,
        instructions: m.instructions,
        refill_days_remaining: refillDaysRemaining(m),
      })),
      next_dose_at: next?.scheduledFor ?? null,
    },
    card: medications.length ? { kind: 'medication_schedule', medications } : undefined,
  };
}

async function doRequestRefill(args: Args): Promise<ToolResult> {
  const medicationId = str(args.medication_id);
  const channel = oneOf(args.channel, REFILL_CHANNELS);

  if (!medicationId || !channel) {
    // Let the model ask rather than guessing on the patient's behalf.
    const medications = await listMedications();
    return {
      forModel: {
        requested: false,
        need: 'medication_id and channel',
        medications: medications.map((m) => ({ id: m.id, name: m.name })),
        channels: ['hospital_pharmacy', 'nearby_pharmacy', 'home_delivery'],
      },
    };
  }

  const refill = await requestRefill({
    medicationId,
    channel,
    addressLine: str(args.address_line) ?? null,
  });

  return {
    forModel: {
      requested: true,
      channel: refill.channel,
      expected_by: refill.expectedBy,
      note: refill.notes,
    },
  };
}

async function getProgress(): Promise<ToolResult> {
  const summary = await progressSummary();
  return {
    forModel: {
      starting_weight_kg: summary.startingWeightKg,
      current_weight_kg: summary.currentWeightKg,
      lowest_weight_kg: summary.nadirKg,
      lost_kg: summary.lostKg,
      percent_lost: summary.percentLost,
      entries: summary.entries.length,
    },
  };
}

/**
 * Side effects across recent check-ins.
 *
 * Returns the aggregate, plus which entries meet the "say this to a clinician"
 * bar, so the model is not left to decide clinical significance for itself.
 */
async function sideEffects(args: Args): Promise<ToolResult> {
  const windowDays = inRange(args.window_days, 7, 365) ?? 60;
  const trend = await sideEffectTrend(windowDays);
  const review = needsClinicalReview(trend);

  return {
    forModel: {
      window_days: windowDays,
      reported: trend.map((entry) => ({
        code: entry.code,
        times: entry.occurrences,
        worst: entry.worstSeverity,
        worsening: entry.worsening,
        last_reported: entry.lastReportedAt.slice(0, 10),
      })),
      worth_clinical_review: review.map((entry) => entry.code),
      note: review.length
        ? 'Advise raising the flagged ones with their doctor. Do not suggest stopping or changing the dose.'
        : 'Nothing here meets the threshold for a call on its own.',
    },
  };
}

/**
 * Calls already placed.
 *
 * The point is negative evidence: telling someone to ring their doctor when
 * they rang two hours ago is how an assistant loses their trust.
 */
async function callHistory(): Promise<ToolResult> {
  const calls = await listCallLog(20);

  return {
    forModel: {
      count: calls.length,
      calls: calls.map((call) => ({
        to: call.contactName ?? call.number,
        kind: call.kind,
        reason: call.reason,
        placed_at: call.placedAt,
        outcome: call.outcomeNote,
      })),
      note: 'These are calls started from the app. It records that the dialler opened, not that anyone answered — ask rather than assume the call connected.',
    },
  };
}

/** Where the user stands against their own relapse threshold. */
async function maintenance(): Promise<ToolResult> {
  const profile = await getProfile().catch(() => null);
  const status = await maintenanceStatus(profile?.treatmentCompletedAt ?? null);

  return {
    forModel: {
      lowest_weight_kg: status.nadirKg,
      current_weight_kg: status.currentWeightKg,
      drift_percent: status.driftPercent,
      action_weight_kg: status.actionWeightKg,
      threshold_crossed: status.thresholdCrossed,
      months_since_completion: status.monthsSinceCompletion,
      note: 'Drift is measured from their lowest weight, not their starting weight. If the threshold is crossed, point them at the relapse protocol — early and small beats late and large.',
    },
  };
}

async function nutritionPlan(): Promise<ToolResult> {
  const plan = await getActivePlan();
  if (!plan) return { forModel: { found: false } };
  return { forModel: { found: true, plan }, card: { kind: 'nutrition_plan', plan } };
}

async function relapseProtocol(args: Args): Promise<ToolResult> {
  const risk = await currentRelapseRisk();
  const signals = arr<string>(args.signals);

  await addJourneyEvent({
    type: 'relapse_alert',
    title: 'Relapse signals detected',
    description: signals.join('; ') || 'Reported by the patient in conversation',
    stage: 'vigilance',
    metadata: { severity: str(args.severity) ?? 'active' },
  }).catch(() => undefined);

  const merged = {
    ...risk,
    signals: signals.length ? [...new Set([...risk.signals, ...signals])] : risk.signals,
  };

  return { forModel: { protocol_started: true, risk: merged }, card: { kind: 'relapse', risk: merged } };
}

function escalate(args: Args): ToolResult {
  const severity = str(args.severity) === 'urgent' ? 'urgent' : 'routine';
  const message = str(args.message) ?? 'Please contact your doctor.';

  /*
    The prescribing guard used to inspect only the prose reply, so this string —
    raw model output — reached the patient untouched, rendered as body text
    under a red "Get medical help now" heading. That is the highest-authority
    element in the whole UI. "Stop your 1 mg dose and drop back to 0.5 mg until
    you see your doctor" would have been displayed exactly like that.

    An escalation card must say "get help", never "change your dose", so a
    violation is replaced outright rather than annotated.
  */
  const safeMessage = violatesPrescribingRule(message)
    ? 'Please contact your doctor about this before changing anything.'
    : message;

  return {
    forModel: { escalated: true, severity },
    card: { kind: 'escalation', severity, message: safeMessage },
  };
}

/**
 * The intents the action card knows how to handle. An LLM can emit anything,
 * and an unrecognised intent used to render a perfectly normal-looking button
 * whose press fell through the switch in AgentCards and did nothing. Filtering
 * here means a model that hallucinates an action simply does not get a button.
 */
const ACTION_INTENTS: readonly AgentAction['intent'][] = [
  'open_eligibility',
  'open_doctors',
  'book_appointment',
  'open_education',
  'open_myths',
  'start_treatment',
  'log_weight',
  'log_checkin',
  'open_medication',
  'request_refill',
  'call_doctor',
  'open_nutrition',
  'open_journey',
];

function isKnownIntent(value: unknown): value is AgentAction['intent'] {
  return typeof value === 'string' && ACTION_INTENTS.includes(value as AgentAction['intent']);
}

function suggestActions(args: Args): ToolResult {
  const raw = arr<{ label?: string; intent?: string }>(args.actions).slice(0, 3);
  const actions: AgentAction[] = raw
    // The label is model-authored text rendered on a button, so it goes through
    // the prescribing guard too — "Increase to 1 mg" must not become a tappable
    // suggestion just because the intent beside it is valid.
    .filter(
      (a) => Boolean(a.label) && isKnownIntent(a.intent) && !violatesPrescribingRule(a.label ?? ''),
    )
    .map((a, i) => ({
      id: `${a.intent}-${i}`,
      label: (a.label as string).slice(0, 60),
      intent: a.intent as AgentAction['intent'],
    }));

  if (actions.length === 0) return { forModel: { shown: 0 } };
  return { forModel: { shown: actions.length }, card: { kind: 'action', actions } };
}
