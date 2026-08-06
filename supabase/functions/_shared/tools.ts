import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

import type { LlmToolDefinition } from './llm.ts';
import type { Stage } from './prompts.ts';
import { isDirectCallRequest } from './safety.ts';

/**
 * The agent's action space.
 *
 * Every tool either (a) computes something deterministic, (b) reads the
 * patient's own records through RLS, or (c) writes a record on the patient's
 * behalf. Writes are deliberately limited to things a patient can already do
 * themselves in the UI — the agent never performs an action the user could not.
 */

export interface ToolContext {
  supabase: SupabaseClient;
  userId: string | null;
  conversationId: string | null;
  stage: Stage;
  language: string;
  /**
   * What the user actually typed this turn.
   *
   * Needed by `call_doctor`: whether the dialler may open by itself is decided
   * against the user's own words, not against the model's reading of them.
   */
  userMessage?: string;
}

export interface ToolResult {
  /** Returned to the model as the tool message. */
  forModel: unknown;
  /** Rendered by the app as a structured card. */
  card?: Record<string, unknown>;
}

type ToolHandler = (args: Record<string, any>, ctx: ToolContext) => Promise<ToolResult>;

interface Tool {
  definition: LlmToolDefinition;
  /** Stages in which the tool is offered to the model. */
  stages: Stage[];
  /** Whether the tool needs an authenticated user. */
  requiresAuth: boolean;
  handler: ToolHandler;
}

// ---------------------------------------------------------------------------
// Clinical helpers (duplicated intentionally: this file must run standalone in
// Deno without importing the React Native source tree)
// ---------------------------------------------------------------------------

function calculateBmi(heightCm?: number | null, weightKg?: number | null): number | null {
  if (!heightCm || !weightKg || heightCm <= 0) return null;
  const m = heightCm / 100;
  return Math.round((weightKg / (m * m)) * 10) / 10;
}

function bmiCategoryIndian(bmi: number | null): string | null {
  if (bmi === null) return null;
  if (bmi < 18.5) return 'Underweight';
  if (bmi < 23) return 'Normal (Asian-Indian range)';
  if (bmi < 25) return 'Overweight (Asian-Indian range)';
  if (bmi < 30) return 'Obesity — class I';
  if (bmi < 35) return 'Obesity — class II';
  return 'Obesity — class III';
}

const DISCLAIMER =
  'This is educational information based on published Indian and WHO guidance. It is not a prescription, a diagnosis, or medical advice. Only a registered doctor can decide whether any medicine is appropriate for you.';

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

const checkEligibility: Tool = {
  stages: ['awareness', 'treatment', 'vigilance'],
  requiresAuth: false,
  definition: {
    type: 'function',
    function: {
      name: 'check_eligibility',
      description:
        'Run the educational eligibility screen for obesity pharmacotherapy using Indian (ICMR) thresholds. Call whenever the user asks whether they qualify, or after they give height and weight in an eligibility conversation. Pass only the values the user actually gave.',
      parameters: {
        type: 'object',
        properties: {
          height_cm: { type: 'number', description: 'Height in centimetres' },
          weight_kg: { type: 'number', description: 'Weight in kilograms' },
          waist_cm: { type: 'number', description: 'Waist circumference in centimetres' },
          age: { type: 'number' },
          sex: { type: 'string', enum: ['male', 'female', 'other', 'undisclosed'] },
          comorbidities: {
            type: 'array',
            items: {
              type: 'string',
              enum: [
                'type2_diabetes',
                'prediabetes',
                'hypertension',
                'dyslipidaemia',
                'osa',
                'pcos',
                'nafld',
                'osteoarthritis',
                'cvd',
                'infertility',
                'none',
              ],
            },
          },
          contraindications: {
            type: 'array',
            items: {
              type: 'string',
              enum: [
                'pregnancy',
                'breastfeeding',
                'mtc_men2_history',
                'pancreatitis_history',
                'type1_diabetes',
                'severe_gi_disease',
                'active_eating_disorder',
                'none',
              ],
            },
          },
        },
        required: [],
      },
    },
  },
  handler: async (args) => {
    const bmi = calculateBmi(args.height_cm, args.weight_kg);
    const category = bmiCategoryIndian(bmi);
    const comorbidities: string[] = (args.comorbidities ?? []).filter((c: string) => c !== 'none');
    const contraindications: string[] = (args.contraindications ?? []).filter(
      (c: string) => c !== 'none',
    );

    const absolute = contraindications.filter((c) =>
      ['pregnancy', 'breastfeeding', 'mtc_men2_history'].includes(c),
    );
    const caution = contraindications.filter((c) =>
      ['pancreatitis_history', 'type1_diabetes', 'severe_gi_disease', 'active_eating_disorder'].includes(
        c,
      ),
    );

    const waistThreshold = args.sex === 'male' ? 90 : 80;
    const waistFlag = args.waist_cm ? args.waist_cm >= waistThreshold : null;

    const missing: string[] = [];
    if (!args.height_cm) missing.push('height');
    if (!args.weight_kg) missing.push('weight');
    if (!args.waist_cm) missing.push('waist circumference');
    if (!args.age) missing.push('age');

    let verdict:
      | 'likely_eligible'
      | 'possibly_eligible'
      | 'needs_consultation'
      | 'insufficient_information'
      | 'not_advisable';
    const reasons: string[] = [];
    const nextSteps: string[] = [];

    if (absolute.length > 0) {
      verdict = 'not_advisable';
      reasons.push(
        'You reported a situation where weight-loss medicines are not used at all, whatever the BMI.',
      );
      nextSteps.push('Talk to your doctor about what is safe for you right now.');
    } else if (bmi === null) {
      verdict = 'insufficient_information';
      reasons.push('I need height and weight before I can say anything useful.');
      nextSteps.push('Share your height and weight for an indication.');
    } else if (args.age && args.age < 18) {
      verdict = 'needs_consultation';
      reasons.push('Under 18, obesity care runs through a paediatric specialist.');
      nextSteps.push('Ask for a referral to a paediatric endocrinologist.');
    } else {
      reasons.push(`BMI ${bmi} — ${category}.`);
      if (waistFlag === true) {
        reasons.push(`Waist is at or above the Indian threshold of ${waistThreshold} cm.`);
      }
      if (comorbidities.length) {
        reasons.push(`Reported conditions: ${comorbidities.join(', ')}.`);
      }
      const hasComorbidity = comorbidities.length > 0;
      if (bmi >= 27.5 || (bmi >= 25 && hasComorbidity)) verdict = 'likely_eligible';
      else if (bmi >= 25 || (bmi >= 23 && (hasComorbidity || waistFlag === true)))
        verdict = 'possibly_eligible';
      else if (bmi >= 23) verdict = 'needs_consultation';
      else verdict = 'not_advisable';

      if (caution.length > 0 && verdict === 'likely_eligible') verdict = 'needs_consultation';

      nextSteps.push(
        verdict === 'likely_eligible'
          ? 'Book a consultation — this is the range where doctors commonly consider medical treatment.'
          : 'A consultation is the right next step; the decision needs an examination.',
      );
    }

    const result = {
      verdict,
      bmi,
      bmiCategoryIndian: category,
      waistFlag,
      reasons,
      missing,
      nextSteps,
      guidelineRefs: [
        'ICMR-NIN Dietary Guidelines for Indians (2024)',
        'WHO Obesity and overweight fact sheet',
      ],
      disclaimer: DISCLAIMER,
    };

    return { forModel: result, card: { kind: 'eligibility', result } };
  },
};

const findDoctors: Tool = {
  stages: ['awareness', 'treatment', 'vigilance'],
  requiresAuth: false,
  definition: {
    type: 'function',
    function: {
      name: 'find_doctors',
      description:
        'Find obesity/endocrinology doctors near the user. Call when the user asks to see a doctor, asks who can help, or after recommending a consultation.',
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string', description: 'City name, if the user has said one' },
          teleconsult_only: { type: 'boolean' },
          language: { type: 'string', enum: ['en', 'hi', 'gu', 'mr'] },
          limit: { type: 'number', default: 5 },
        },
        required: [],
      },
    },
  },
  handler: async (args, ctx) => {
    let query = ctx.supabase
      .from('doctors')
      .select('*, hospital:hospitals(*)')
      .eq('accepting_patients', true)
      .limit(Math.min(args.limit ?? 5, 10));

    if (args.city) query = query.ilike('city', `%${args.city}%`);
    if (args.teleconsult_only) query = query.eq('teleconsult_available', true);

    const { data, error } = await query;
    if (error) return { forModel: { error: error.message, doctors: [] } };

    const doctors = data ?? [];
    return {
      forModel: {
        count: doctors.length,
        doctors: doctors.map((d: any) => ({
          id: d.id,
          name: d.full_name,
          speciality: d.speciality,
          city: d.city,
          fee: d.consultation_fee,
          teleconsult: d.teleconsult_available,
          languages: d.languages,
        })),
      },
      card: { kind: 'doctor_list', doctors },
    };
  },
};

const recommendConsultation: Tool = {
  stages: ['awareness', 'treatment', 'vigilance'],
  requiresAuth: false,
  definition: {
    type: 'function',
    function: {
      name: 'recommend_doctor_consultation',
      description:
        'Surface the "Talk to a doctor" pathway with nearby doctors and a booking button. Call whenever the user asks for treatment, medicine or injections, or when a symptom needs clinical assessment.',
      parameters: {
        type: 'object',
        properties: {
          reason: { type: 'string', description: 'Short reason shown to the user' },
          urgency: { type: 'string', enum: ['routine', 'soon', 'urgent'], default: 'routine' },
          city: { type: 'string' },
        },
        required: ['reason'],
      },
    },
  },
  handler: async (args, ctx) => {
    let query = ctx.supabase
      .from('doctors')
      .select('*, hospital:hospitals(*)')
      .eq('accepting_patients', true)
      .limit(5);
    if (args.city) query = query.ilike('city', `%${args.city}%`);
    const { data } = await query;

    return {
      forModel: {
        acknowledged: true,
        reason: args.reason,
        urgency: args.urgency ?? 'routine',
        doctors_shown: data?.length ?? 0,
      },
      card: {
        kind: 'doctor_list',
        doctors: data ?? [],
        reason: args.reason,
        urgency: args.urgency ?? 'routine',
      },
    };
  },
};

const bookAppointment: Tool = {
  stages: ['awareness', 'treatment', 'vigilance'],
  requiresAuth: true,
  definition: {
    type: 'function',
    function: {
      name: 'book_appointment',
      description:
        'Book a confirmed appointment slot with a doctor. Only call after the user has explicitly chosen a doctor AND a time. Never guess a time.',
      parameters: {
        type: 'object',
        properties: {
          doctor_id: { type: 'string' },
          scheduled_at: { type: 'string', description: 'ISO 8601 timestamp' },
          mode: { type: 'string', enum: ['in_person', 'video', 'phone'], default: 'in_person' },
          reason: { type: 'string' },
        },
        required: ['doctor_id', 'scheduled_at'],
      },
    },
  },
  handler: async (args, ctx) => {
    const { data, error } = await ctx.supabase.rpc('book_appointment', {
      p_doctor: args.doctor_id,
      p_scheduled_at: args.scheduled_at,
      p_mode: args.mode ?? 'in_person',
      p_reason: args.reason ?? null,
    });
    if (error) {
      return {
        forModel: {
          booked: false,
          error: error.message.includes('slot_unavailable')
            ? 'That slot was taken. Offer the user another time.'
            : error.message,
        },
      };
    }
    return {
      forModel: { booked: true, appointment: data },
      card: { kind: 'appointment', appointment: data },
    };
  },
};

const getAvailableSlots: Tool = {
  stages: ['awareness', 'treatment', 'vigilance'],
  requiresAuth: false,
  definition: {
    type: 'function',
    function: {
      name: 'get_available_slots',
      description: 'List free appointment slots for a doctor on a date. Call before offering times.',
      parameters: {
        type: 'object',
        properties: {
          doctor_id: { type: 'string' },
          date: { type: 'string', description: 'YYYY-MM-DD' },
        },
        required: ['doctor_id', 'date'],
      },
    },
  },
  handler: async (args, ctx) => {
    const { data, error } = await ctx.supabase.rpc('available_slots', {
      p_doctor: args.doctor_id,
      p_date: args.date,
    });
    if (error) return { forModel: { error: error.message, slots: [] } };
    return { forModel: { slots: (data ?? []).slice(0, 12) } };
  },
};

const explainMyth: Tool = {
  stages: ['awareness', 'treatment', 'vigilance'],
  requiresAuth: false,
  definition: {
    type: 'function',
    function: {
      name: 'explain_myth',
      description:
        'Retrieve the evidence card for a common obesity or GLP-1 myth. Call when the user states a myth or asks whether something they heard is true.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The myth in the user\'s own words' },
        },
        required: ['query'],
      },
    },
  },
  handler: async (args, ctx) => {
    const q = String(args.query ?? '').toLowerCase();
    const { data } = await ctx.supabase.from('myth_cards').select('*').limit(50);
    const cards = data ?? [];

    const scored = cards
      .map((c: any) => {
        const haystack = `${c.myth} ${c.tags?.join(' ') ?? ''} ${c.explanation}`.toLowerCase();
        const score = q
          .split(/\s+/)
          .filter((w) => w.length > 3)
          .reduce((acc, w) => acc + (haystack.includes(w) ? 1 : 0), 0);
        return { card: c, score };
      })
      .sort((a, b) => b.score - a.score);

    const best = scored[0];
    if (!best || best.score === 0) {
      return {
        forModel: {
          found: false,
          note: 'No stored card matched. Answer from your own evidence knowledge, carefully and without inventing citations.',
        },
      };
    }
    return { forModel: { found: true, myth: best.card }, card: { kind: 'myth', myth: best.card } };
  },
};

const getEducation: Tool = {
  stages: ['awareness', 'treatment', 'vigilance'],
  requiresAuth: false,
  definition: {
    type: 'function',
    function: {
      name: 'get_education_topic',
      description:
        'Retrieve a WHO/ICMR-based education article to show the user. Call when explaining a topic in depth would help.',
      parameters: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            enum: ['basics', 'nutrition', 'activity', 'behaviour', 'medical', 'long_term', 'safety'],
          },
          query: { type: 'string' },
        },
        required: [],
      },
    },
  },
  handler: async (args, ctx) => {
    let query = ctx.supabase.from('education_topics').select('*').limit(20);
    if (args.category) query = query.eq('category', args.category);
    const { data } = await query;
    const topics = data ?? [];
    if (topics.length === 0) return { forModel: { found: false } };

    const q = String(args.query ?? '').toLowerCase();
    const best =
      topics.find((t: any) => q && `${t.title} ${t.summary}`.toLowerCase().includes(q.split(' ')[0])) ??
      topics[0];

    return { forModel: { found: true, topic: best }, card: { kind: 'education', topic: best } };
  },
};

const logWeight: Tool = {
  stages: ['treatment', 'vigilance'],
  requiresAuth: true,
  definition: {
    type: 'function',
    function: {
      name: 'log_weight',
      description:
        'Record a weight the user has just told you. Only call with a number the user actually stated.',
      parameters: {
        type: 'object',
        properties: {
          weight_kg: { type: 'number' },
          waist_cm: { type: 'number' },
          recorded_on: { type: 'string', description: 'YYYY-MM-DD, defaults to today' },
        },
        required: ['weight_kg'],
      },
    },
  },
  handler: async (args, ctx) => {
    const { data, error } = await ctx.supabase
      .from('weight_entries')
      .upsert(
        {
          user_id: ctx.userId!,
          weight_kg: args.weight_kg,
          waist_cm: args.waist_cm ?? null,
          recorded_on: args.recorded_on ?? new Date().toISOString().slice(0, 10),
          source: 'manual',
        },
        { onConflict: 'user_id,recorded_on' },
      )
      .select()
      .single();

    if (error) return { forModel: { logged: false, error: error.message } };
    return { forModel: { logged: true, entry: data } };
  },
};

const requestCheckIn: Tool = {
  stages: ['treatment', 'vigilance'],
  requiresAuth: false,
  definition: {
    type: 'function',
    function: {
      name: 'request_check_in',
      description:
        'Show the user an in-chat check-in form. Call when a passive check-in is due, or when the conversation suggests tracking would help.',
      parameters: {
        type: 'object',
        properties: {
          fields: {
            type: 'array',
            items: {
              type: 'string',
              enum: [
                'weight',
                'mood',
                'appetite',
                'energy',
                'sleep',
                'side_effects',
                'exercise',
                'nutrition',
                'water',
                'stress',
                'cravings',
                'confidence',
              ],
            },
          },
          reason: { type: 'string' },
        },
        required: ['fields'],
      },
    },
  },
  handler: async (args) => ({
    forModel: { shown: true, fields: args.fields },
    card: { kind: 'checkin_request', fields: args.fields, reason: args.reason ?? null },
  }),
};

const saveCheckIn: Tool = {
  stages: ['treatment', 'vigilance'],
  requiresAuth: true,
  definition: {
    type: 'function',
    function: {
      name: 'save_check_in',
      description:
        'Persist check-in values the user reported conversationally. Only include values the user actually gave. Scores are 0-10.',
      parameters: {
        type: 'object',
        properties: {
          weight_kg: { type: 'number' },
          mood_score: { type: 'number' },
          appetite_score: { type: 'number' },
          energy_score: { type: 'number' },
          sleep_hours: { type: 'number' },
          sleep_quality: { type: 'number' },
          stress_score: { type: 'number' },
          craving_score: { type: 'number' },
          water_litres: { type: 'number' },
          exercise_minutes: { type: 'number' },
          nutrition_adherence: { type: 'number', description: '0-100' },
          confidence_score: { type: 'number' },
          side_effects: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                code: { type: 'string' },
                severity: { type: 'string', enum: ['mild', 'moderate', 'severe'] },
                note: { type: 'string' },
              },
              required: ['code', 'severity'],
            },
          },
          free_text: { type: 'string' },
        },
        required: [],
      },
    },
  },
  handler: async (args, ctx) => {
    const { data, error } = await ctx.supabase
      .from('check_ins')
      .insert({
        user_id: ctx.userId!,
        kind: ctx.stage === 'vigilance' ? 'vigilance' : 'passive',
        weight_kg: args.weight_kg ?? null,
        mood_score: args.mood_score ?? null,
        appetite_score: args.appetite_score ?? null,
        energy_score: args.energy_score ?? null,
        sleep_hours: args.sleep_hours ?? null,
        sleep_quality: args.sleep_quality ?? null,
        stress_score: args.stress_score ?? null,
        craving_score: args.craving_score ?? null,
        water_litres: args.water_litres ?? null,
        exercise_minutes: args.exercise_minutes ?? null,
        nutrition_adherence: args.nutrition_adherence ?? null,
        confidence_score: args.confidence_score ?? null,
        side_effects: args.side_effects ?? [],
        free_text: args.free_text ?? null,
      })
      .select()
      .single();

    if (error) return { forModel: { saved: false, error: error.message } };
    if (args.weight_kg) {
      await ctx.supabase.from('weight_entries').upsert(
        {
          user_id: ctx.userId!,
          weight_kg: args.weight_kg,
          recorded_on: new Date().toISOString().slice(0, 10),
          source: 'manual',
        },
        { onConflict: 'user_id,recorded_on' },
      );
    }

    return {
      forModel: { saved: true, wellness_score: data?.wellness_score ?? null },
      card: data?.wellness_score
        ? {
            kind: 'wellness',
            wellness: {
              score: data.wellness_score,
              band:
                data.wellness_score >= 75
                  ? 'thriving'
                  : data.wellness_score >= 55
                    ? 'steady'
                    : data.wellness_score >= 35
                      ? 'needs_attention'
                      : 'at_risk',
              drivers: [],
            },
          }
        : undefined,
    };
  },
};

const getMedicationSchedule: Tool = {
  stages: ['treatment'],
  requiresAuth: true,
  definition: {
    type: 'function',
    function: {
      name: 'get_medication_schedule',
      description:
        'Read the user\'s active medications, next dose and refill position. Call before answering anything about their own doses, timing or refills.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  handler: async (_args, ctx) => {
    const { data: meds } = await ctx.supabase
      .from('medications')
      .select('*')
      .eq('user_id', ctx.userId!)
      .eq('active', true);

    const { data: nextDose } = await ctx.supabase
      .from('dose_events')
      .select('*')
      .eq('user_id', ctx.userId!)
      .eq('status', 'scheduled')
      .gt('scheduled_for', new Date().toISOString())
      .order('scheduled_for', { ascending: true })
      .limit(1);

    const medications = meds ?? [];
    const refills = await Promise.all(
      medications.map(async (m: any) => {
        const { data } = await ctx.supabase.rpc('refill_days_remaining', { p_medication: m.id });
        return { medication_id: m.id, days_remaining: data };
      }),
    );

    return {
      forModel: {
        medications: medications.map((m: any) => ({
          id: m.id,
          name: m.name,
          strength: m.strength,
          dose: `${m.dose_amount} ${m.dose_unit}`,
          frequency: m.frequency,
          times: m.times_of_day,
          storage: m.storage_note,
          instructions: m.instructions,
        })),
        next_dose_at: nextDose?.[0]?.scheduled_for ?? null,
        refills,
      },
      card: medications.length ? { kind: 'medication_schedule', medications } : undefined,
    };
  },
};

const requestRefill: Tool = {
  stages: ['treatment'],
  requiresAuth: true,
  definition: {
    type: 'function',
    function: {
      name: 'request_refill',
      description:
        'Raise a refill request for a medication through the chosen channel. Only call after the user has chosen a channel.',
      parameters: {
        type: 'object',
        properties: {
          medication_id: { type: 'string' },
          channel: {
            type: 'string',
            enum: ['hospital_pharmacy', 'nearby_pharmacy', 'home_delivery'],
          },
          address_line: { type: 'string' },
        },
        required: ['medication_id', 'channel'],
      },
    },
  },
  handler: async (args, ctx) => {
    const { data, error } = await ctx.supabase
      .from('refill_requests')
      .insert({
        user_id: ctx.userId!,
        medication_id: args.medication_id,
        channel: args.channel,
        address_line: args.address_line ?? null,
        status: 'requested',
      })
      .select()
      .single();
    if (error) return { forModel: { requested: false, error: error.message } };
    return { forModel: { requested: true, refill: data } };
  },
};

const getProgress: Tool = {
  stages: ['treatment', 'vigilance'],
  requiresAuth: true,
  definition: {
    type: 'function',
    function: {
      name: 'get_progress',
      description:
        'Read weight history, adherence and milestones. Call before making any claim about how the user is doing.',
      parameters: {
        type: 'object',
        properties: { days: { type: 'number', default: 90 } },
        required: [],
      },
    },
  },
  handler: async (args, ctx) => {
    const since = new Date(Date.now() - (args.days ?? 90) * 86_400_000).toISOString().slice(0, 10);
    const [{ data: weights }, { data: milestones }, { data: adherence }] = await Promise.all([
      ctx.supabase
        .from('weight_entries')
        .select('recorded_on, weight_kg')
        .eq('user_id', ctx.userId!)
        .gte('recorded_on', since)
        .order('recorded_on', { ascending: true }),
      ctx.supabase.from('milestones').select('code, achieved_at, value').eq('user_id', ctx.userId!),
      ctx.supabase.rpc('medication_adherence', { p_user: ctx.userId!, p_days: 28 }),
    ]);

    const series = weights ?? [];
    const first = series[0]?.weight_kg;
    const last = series[series.length - 1]?.weight_kg;

    return {
      forModel: {
        entries: series.length,
        first_weight_kg: first ?? null,
        latest_weight_kg: last ?? null,
        change_kg: first && last ? Math.round((last - first) * 10) / 10 : null,
        adherence_28d: adherence ?? null,
        milestones: milestones ?? [],
      },
    };
  },
};

const getNutritionPlan: Tool = {
  stages: ['treatment', 'vigilance'],
  requiresAuth: true,
  definition: {
    type: 'function',
    function: {
      name: 'get_nutrition_plan',
      description: 'Read the active nutrition plan so advice matches the targets the user was given.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  handler: async (_args, ctx) => {
    const { data } = await ctx.supabase
      .from('nutrition_plans')
      .select('*')
      .eq('user_id', ctx.userId!)
      .eq('active', true)
      .maybeSingle();
    if (!data) return { forModel: { found: false } };
    return { forModel: { found: true, plan: data }, card: { kind: 'nutrition_plan', plan: data } };
  },
};

const triggerRelapseProtocol: Tool = {
  stages: ['vigilance', 'treatment'],
  requiresAuth: false,
  definition: {
    type: 'function',
    function: {
      name: 'trigger_relapse_protocol',
      description:
        'Start the relapse-prevention protocol. Call when the user reports binge eating, stopping treatment, weight regain, lost motivation or hopelessness.',
      parameters: {
        type: 'object',
        properties: {
          signals: { type: 'array', items: { type: 'string' } },
          severity: { type: 'string', enum: ['early', 'active', 'severe'] },
        },
        required: ['signals', 'severity'],
      },
    },
  },
  handler: async (args, ctx) => {
    let risk: any = null;
    if (ctx.userId) {
      const { data } = await ctx.supabase.rpc('compute_relapse_risk', { p_user: ctx.userId });
      risk = data;
      await ctx.supabase.from('journey_events').insert({
        user_id: ctx.userId,
        type: 'relapse_alert',
        title: 'Relapse signals detected',
        description: args.signals.join('; '),
        stage: 'vigilance',
        metadata: { severity: args.severity },
      });
    }

    const fallback = {
      score: args.severity === 'severe' ? 75 : args.severity === 'active' ? 50 : 30,
      band: args.severity === 'severe' ? 'high' : args.severity === 'active' ? 'moderate' : 'moderate',
      signals: args.signals,
      recommendation:
        args.severity === 'severe'
          ? 'Book a review with your doctor this week and restart daily logging.'
          : 'Tighten the basics for two weeks: protein at every meal, 7,000 steps, weekly weigh-in.',
    };

    const resolved = risk ?? fallback;
    return {
      forModel: { protocol_started: true, risk: resolved },
      card: { kind: 'relapse', risk: resolved },
    };
  },
};

const escalate: Tool = {
  stages: ['awareness', 'treatment', 'vigilance'],
  requiresAuth: false,
  definition: {
    type: 'function',
    function: {
      name: 'escalate_to_care',
      description:
        'Raise an urgent or routine escalation banner with a direct call/book action. Call for red-flag symptoms or when the user needs a clinician now.',
      parameters: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['urgent', 'routine'] },
          message: { type: 'string' },
        },
        required: ['severity', 'message'],
      },
    },
  },
  handler: async (args, ctx) => {
    if (ctx.userId) {
      await ctx.supabase.from('notifications').insert({
        user_id: ctx.userId,
        category: 'system',
        title: args.severity === 'urgent' ? 'Urgent: contact care' : 'Please contact your doctor',
        body: args.message,
        channel: 'local',
      });
    }
    return {
      forModel: { escalated: true },
      card: { kind: 'escalation', severity: args.severity, message: args.message },
    };
  },
};

const rememberFact: Tool = {
  stages: ['awareness', 'treatment', 'vigilance'],
  requiresAuth: true,
  definition: {
    type: 'function',
    function: {
      name: 'remember',
      description:
        'Store one durable fact about this person for future conversations (a preference, a barrier, a goal, a fear). Use sparingly — only things that will still matter in three months.',
      parameters: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['preference', 'concern', 'goal', 'fact', 'barrier'] },
          content: { type: 'string', description: 'At most 25 words' },
          salience: { type: 'number', description: '0-1' },
        },
        required: ['kind', 'content'],
      },
    },
  },
  handler: async (args, ctx) => {
    const { error } = await ctx.supabase.from('agent_memories').insert({
      user_id: ctx.userId!,
      kind: args.kind,
      content: String(args.content).slice(0, 240),
      salience: Math.min(1, Math.max(0, args.salience ?? 0.6)),
    });
    return { forModel: { stored: !error } };
  },
};

const suggestActions: Tool = {
  stages: ['awareness', 'treatment', 'vigilance'],
  requiresAuth: false,
  definition: {
    type: 'function',
    function: {
      name: 'suggest_actions',
      description:
        'Offer the user up to three tappable next steps inside the app. Use instead of describing where to tap.',
      parameters: {
        type: 'object',
        properties: {
          actions: {
            type: 'array',
            maxItems: 3,
            items: {
              type: 'object',
              properties: {
                label: { type: 'string' },
                intent: {
                  type: 'string',
                  enum: [
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
                  ],
                },
              },
              required: ['label', 'intent'],
            },
          },
        },
        required: ['actions'],
      },
    },
  },
  handler: async (args) => ({
    forModel: { shown: args.actions?.length ?? 0 },
    card: {
      kind: 'action',
      actions: (args.actions ?? []).slice(0, 3).map((a: any, i: number) => ({
        id: `${a.intent}-${i}`,
        label: a.label,
        intent: a.intent,
      })),
    },
  }),
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------


/**
 * Side effects across recent check-ins, aggregated.
 *
 * Runs the same aggregation as `sideEffectTrend()` on the device, but in SQL,
 * so a conversation gets the same answer whichever engine handled it. The
 * "worth a call" rule is applied here rather than left to the model, because
 * clinical significance is not something to delegate to a language model.
 */
const getSideEffectTrend: Tool = {
  stages: ['treatment', 'vigilance'],
  requiresAuth: true,
  definition: {
    type: 'function',
    function: {
      name: 'get_side_effect_trend',
      description:
        'Read side effects the user has logged in recent check-ins, aggregated: how often each one came up, how bad it got, and whether it is worsening. Call before answering anything about side effects, tolerability, or whether something is normal — the pattern across weeks is the clinically useful part, and the user cannot see it from the inside.',
      parameters: {
        type: 'object',
        properties: {
          window_days: { type: 'number', description: 'How far back to look. Defaults to 60.' },
        },
        required: [],
      },
    },
  },
  handler: async (args, ctx) => {
    const windowDays =
      typeof args.window_days === 'number' && args.window_days >= 7 && args.window_days <= 365
        ? args.window_days
        : 60;

    const { data, error } = await ctx.supabase.rpc('side_effect_trend', {
      p_user_id: ctx.userId!,
      p_window_days: windowDays,
    });
    if (error) return { forModel: { error: error.message } };

    const rows = (data ?? []) as {
      code: string;
      occurrences: number;
      worst_severity: string;
      last_reported: string;
      worsening: boolean;
    }[];

    // Same rule as needsClinicalReview() on the device.
    const review = rows.filter(
      (row) =>
        row.worst_severity === 'severe' ||
        row.worsening ||
        row.occurrences >= 3 ||
        row.code === 'severe_abdominal_pain' ||
        row.code === 'hypoglycaemia',
    );

    return {
      forModel: {
        window_days: windowDays,
        reported: rows.map((row) => ({
          code: row.code,
          times: Number(row.occurrences),
          worst: row.worst_severity,
          worsening: row.worsening,
          last_reported: row.last_reported?.slice(0, 10) ?? null,
        })),
        worth_clinical_review: review.map((row) => row.code),
        note: review.length
          ? 'Advise raising the flagged ones with their doctor. Do not suggest stopping or changing the dose.'
          : 'Nothing here meets the threshold for a call on its own.',
      },
    };
  },
};

/**
 * Calls the patient already placed.
 *
 * Mostly useful as negative evidence: telling someone to ring their doctor when
 * they rang two hours ago is how an assistant loses their trust.
 */
const getCallHistory: Tool = {
  stages: ['awareness', 'treatment', 'vigilance'],
  requiresAuth: true,
  definition: {
    type: 'function',
    function: {
      name: 'get_call_history',
      description:
        'Read calls the user has placed from inside the app — who, when and why. Call this before telling someone to ring their doctor, so you do not tell a person who called this morning to call. It records that the dialler was opened, not that anyone answered.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  handler: async (_args, ctx) => {
    const { data, error } = await ctx.supabase
      .from('call_log')
      .select('number, contact_name, kind, reason, placed_at, outcome_note')
      .eq('user_id', ctx.userId!)
      .order('placed_at', { ascending: false })
      .limit(20);
    if (error) return { forModel: { error: error.message } };

    const rows = data ?? [];
    return {
      forModel: {
        count: rows.length,
        calls: rows.map((row) => ({
          to: row.contact_name ?? row.number,
          kind: row.kind,
          reason: row.reason,
          placed_at: row.placed_at,
          outcome: row.outcome_note,
        })),
        note: 'These are calls started from the app. It records that the dialler opened, not that anyone answered — ask rather than assume the call connected.',
      },
    };
  },
};

/** Where the patient stands against their own relapse action threshold. */
const getMaintenanceStatus: Tool = {
  stages: ['vigilance'],
  requiresAuth: true,
  definition: {
    type: 'function',
    function: {
      name: 'get_maintenance_status',
      description:
        'Read where the user stands against their own relapse action threshold: lowest weight, current weight, drift as a percentage, and whether the threshold has been crossed. Call before discussing regain, maintenance or whether they should be worried. Drift is measured from their lowest weight, not their starting weight.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  handler: async (_args, ctx) => {
    const { data, error } = await ctx.supabase.rpc('maintenance_status', {
      p_user_id: ctx.userId!,
    });
    if (error) return { forModel: { error: error.message } };

    const row = (Array.isArray(data) ? data[0] : data) as
      | {
          nadir_kg: number | null;
          current_weight_kg: number | null;
          action_weight_kg: number | null;
          drift_percent: number | null;
          threshold_crossed: boolean;
        }
      | undefined;

    if (!row) return { forModel: { found: false } };

    return {
      forModel: {
        lowest_weight_kg: row.nadir_kg,
        current_weight_kg: row.current_weight_kg,
        drift_percent: row.drift_percent,
        action_weight_kg: row.action_weight_kg,
        threshold_crossed: row.threshold_crossed,
        note: 'Drift is measured from their lowest weight, not their starting weight. If the threshold is crossed, point them at the relapse protocol — early and small beats late and large.',
      },
    };
  },
};


/**
 * Puts the user through to a doctor.
 *
 * The server obviously cannot dial a phone. It does not need to: it returns the
 * same `call` card the on-device tool returns, and the app opens the dialler
 * when it renders. That is why this is a card rather than a direct call in the
 * client tool — one behaviour, whichever engine answered.
 *
 * Resolution order matches resolveDoctorToCall() on the device: an explicit id,
 * then a name, then the patient's own primary doctor, then the general
 * consulting line.
 */
const callDoctor: Tool = {
  stages: ['awareness', 'treatment', 'vigilance'],
  requiresAuth: false,
  definition: {
    type: 'function',
    function: {
      name: 'call_doctor',
      description:
        'Put the user through to a doctor by opening their phone dialler with the number already filled in. Call this ONLY when the user has asked outright — "call my doctor", "phone Dr Mehta", "put me through". Do NOT call it when they are asking whether they should ring someone, or telling you they already did; offer the doctor list instead. With no arguments it resolves to their own doctor, or the general consulting line. The user still presses the call button themselves.',
      parameters: {
        type: 'object',
        properties: {
          doctor_id: {
            type: 'string',
            description: 'Id from a previous find_doctors result, if you have one.',
          },
          doctor_name: {
            type: 'string',
            description: 'The name the user said, if they named someone.',
          },
          reason: {
            type: 'string',
            enum: [
              'routine',
              'side_effect',
              'missed_dose',
              'refill',
              'appointment',
              'red_flag',
              'relapse',
            ],
            description: 'Why they are ringing. Recorded with the call so the reason survives.',
          },
          auto_dial: {
            type: 'boolean',
            description:
              'Defaults to true. Set false only to show the number without opening the dialler.',
          },
        },
        required: [],
      },
    },
  },
  handler: async (args, ctx) => {
    const doctorId = typeof args.doctor_id === 'string' ? args.doctor_id : null;
    const doctorName = typeof args.doctor_name === 'string' ? args.doctor_name : null;

    let doctor: { id: string; full_name: string; phone: string | null } | null = null;
    let confidence: 'explicit' | 'named' | 'primary' | 'fallback' = 'fallback';

    if (doctorId) {
      const { data } = await ctx.supabase
        .from('doctors')
        .select('id, full_name, phone')
        .eq('id', doctorId)
        .maybeSingle();
      if (data?.phone) {
        doctor = data;
        confidence = 'explicit';
      }
    }

    if (!doctor && doctorName) {
      const { data } = await ctx.supabase
        .from('doctors')
        .select('id, full_name, phone')
        .ilike('full_name', `%${doctorName.replace(/[%_]/g, '')}%`)
        .not('phone', 'is', null)
        .limit(1);
      if (data?.[0]?.phone) {
        doctor = data[0];
        confidence = 'named';
      }
    }

    if (!doctor && ctx.userId) {
      const { data: profile } = await ctx.supabase
        .from('profiles')
        .select('primary_doctor_id')
        .eq('id', ctx.userId)
        .maybeSingle();

      if (profile?.primary_doctor_id) {
        const { data } = await ctx.supabase
          .from('doctors')
          .select('id, full_name, phone')
          .eq('id', profile.primary_doctor_id)
          .maybeSingle();
        if (data?.phone) {
          doctor = data;
          confidence = 'primary';
        }
      }
    }

    if (!doctor) {
      const { data } = await ctx.supabase
        .from('doctors')
        .select('id, full_name, phone')
        .not('phone', 'is', null)
        .limit(1);
      if (data?.[0]?.phone) doctor = data[0];
    }

    if (!doctor?.phone) {
      return {
        forModel: { called: false, error: 'No reachable number. Offer the doctor list instead.' },
      };
    }

    const reason = typeof args.reason === 'string' ? args.reason : 'routine';

    /*
      The dialler only opens by itself when BOTH the model chose to and the
      user's own words were an instruction — the same rule as the device.

      The tool description tells the model to call this only on an explicit
      request, but a description is a request, not a constraint. A model asked
      "should I call my doctor about this nausea?" can reasonably decide the
      answer is yes and reach for the tool, which is exactly the false positive
      the feature exists to avoid. Failing closed costs one tap.
    */
    const autoDial = args.auto_dial !== false && isDirectCallRequest(ctx.userMessage ?? '');

    return {
      forModel: {
        called: autoDial,
        doctor: doctor.full_name,
        number: doctor.phone,
        how_resolved: confidence,
        note: !autoDial
          ? 'Showing the number without opening the dialler, because the user did not ask outright. Tell them to tap Call when ready.'
          : confidence === 'fallback'
            ? 'This is the general consulting line, not a doctor the user named. Say so.'
            : 'The dialler is opening with this number. Do not repeat the number as plain text.',
      },
      card: {
        kind: 'call',
        contactName: doctor.full_name,
        number: doctor.phone,
        reason,
        autoDial,
        requestedAt: new Date().toISOString(),
      },
    };
  },
};

export const TOOLS: Record<string, Tool> = {
  check_eligibility: checkEligibility,
  find_doctors: findDoctors,
  recommend_doctor_consultation: recommendConsultation,
  get_available_slots: getAvailableSlots,
  book_appointment: bookAppointment,
  explain_myth: explainMyth,
  get_education_topic: getEducation,
  log_weight: logWeight,
  request_check_in: requestCheckIn,
  save_check_in: saveCheckIn,
  get_medication_schedule: getMedicationSchedule,
  request_refill: requestRefill,
  get_progress: getProgress,
  get_nutrition_plan: getNutritionPlan,
  get_side_effect_trend: getSideEffectTrend,
  get_call_history: getCallHistory,
  get_maintenance_status: getMaintenanceStatus,
  trigger_relapse_protocol: triggerRelapseProtocol,
  call_doctor: callDoctor,
  escalate_to_care: escalate,
  remember: rememberFact,
  suggest_actions: suggestActions,
};

export function toolDefinitionsFor(stage: Stage, authenticated: boolean): LlmToolDefinition[] {
  return Object.values(TOOLS)
    .filter((t) => t.stages.includes(stage) && (authenticated || !t.requiresAuth))
    .map((t) => t.definition);
}

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const tool = TOOLS[name];
  if (!tool) return { forModel: { error: `Unknown tool ${name}` } };
  if (tool.requiresAuth && !ctx.userId) {
    return {
      forModel: {
        error: 'This action needs an account. Ask the user whether they want to create one.',
      },
    };
  }

  try {
    const result = await tool.handler(args, ctx);
    if (ctx.userId) {
      await ctx.supabase.from('agent_actions').insert({
        user_id: ctx.userId,
        conversation_id: ctx.conversationId,
        tool_name: name,
        arguments: args,
        result: result.forModel as Record<string, unknown>,
        status: 'succeeded',
      });
    }
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (ctx.userId) {
      await ctx.supabase.from('agent_actions').insert({
        user_id: ctx.userId,
        conversation_id: ctx.conversationId,
        tool_name: name,
        arguments: args,
        status: 'failed',
        error: message,
      });
    }
    return { forModel: { error: message } };
  }
}
