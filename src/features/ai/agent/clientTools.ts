import { evaluateEligibility } from '@core/clinical/eligibility';
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
import { getActivePlan } from '@features/nutrition/api/nutritionRepository';
import { saveProfile } from '@features/profile/api/profileRepository';
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
  const result = evaluateEligibility({
    heightCm: num(args.height_cm) ?? null,
    weightKg: num(args.weight_kg) ?? null,
    waistCm: num(args.waist_cm) ?? null,
    age: num(args.age) ?? null,
    sex: (str(args.sex) as Sex) ?? 'undisclosed',
    comorbidities: arr<Comorbidity>(args.comorbidities),
    contraindications: arr<Contraindication>(args.contraindications),
  });

  // Anything the user volunteered mid-conversation is worth keeping.
  if (num(args.height_cm) || num(args.weight_kg) || num(args.waist_cm)) {
    await saveProfile({
      heightCm: num(args.height_cm) ?? undefined,
      startingWeightKg: num(args.weight_kg) ?? undefined,
      waistCm: num(args.waist_cm) ?? undefined,
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
    mode: (str(args.mode) as 'in_person' | 'video' | 'phone') ?? 'in_person',
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
  const weightKg = num(args.weight_kg);
  if (!weightKg) return { forModel: { logged: false, error: 'weight_kg is required' } };

  const { milestones } = await logWeight({
    weightKg,
    waistCm: num(args.waist_cm) ?? null,
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
    weightKg: num(args.weight_kg) ?? null,
    moodScore: num(args.mood_score) ?? null,
    appetiteScore: num(args.appetite_score) ?? null,
    energyScore: num(args.energy_score) ?? null,
    sleepHours: num(args.sleep_hours) ?? null,
    sleepQuality: num(args.sleep_quality) ?? null,
    stressScore: num(args.stress_score) ?? null,
    cravingScore: num(args.craving_score) ?? null,
    waterLitres: num(args.water_litres) ?? null,
    exerciseMinutes: num(args.exercise_minutes) ?? null,
    nutritionAdherence: num(args.nutrition_adherence) ?? null,
    confidenceScore: num(args.confidence_score) ?? null,
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
  const channel = str(args.channel) as
    | 'hospital_pharmacy'
    | 'nearby_pharmacy'
    | 'home_delivery'
    | undefined;

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
  return {
    forModel: { escalated: true, severity },
    card: { kind: 'escalation', severity, message },
  };
}

function suggestActions(args: Args): ToolResult {
  const raw = arr<{ label?: string; intent?: string }>(args.actions).slice(0, 3);
  const actions: AgentAction[] = raw
    .filter((a) => a.label && a.intent)
    .map((a, i) => ({
      id: `${a.intent}-${i}`,
      label: a.label as string,
      intent: a.intent as AgentAction['intent'],
    }));

  if (actions.length === 0) return { forModel: { shown: 0 } };
  return { forModel: { shown: actions.length }, card: { kind: 'action', actions } };
}
