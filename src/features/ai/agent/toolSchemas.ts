import type { JourneyStage } from '@core/domain/types';

/**
 * Tool schemas offered to the model.
 *
 * Mirrors the definitions in `supabase/functions/_shared/tools.ts` — same names,
 * same arguments — so a conversation behaves identically whether it was
 * answered by the server agent or the on-device one.
 */

export interface LlmToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

interface ToolSpec {
  definition: LlmToolDefinition;
  stages: JourneyStage[];
}

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: 'object',
  properties,
  required,
});

const SPECS: ToolSpec[] = [
  {
    stages: ['awareness', 'treatment', 'vigilance'],
    definition: {
      type: 'function',
      function: {
        name: 'check_eligibility',
        description:
          'Run the educational eligibility screen for obesity medication using Indian (ICMR) thresholds. Call whenever the user asks whether they qualify, or as soon as they have given height and weight. Pass only values the user actually gave.',
        parameters: obj({
          height_cm: { type: 'number' },
          weight_kg: { type: 'number' },
          waist_cm: { type: 'number' },
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
              ],
            },
          },
        }),
      },
    },
  },
  {
    stages: ['awareness', 'treatment', 'vigilance'],
    definition: {
      type: 'function',
      function: {
        name: 'recommend_doctor_consultation',
        description:
          'Show the "Talk to a doctor" pathway with real doctors, tappable call buttons and a booking button. Call whenever the user asks for treatment, medicine or injections, or when a symptom needs clinical assessment.',
        parameters: obj(
          {
            reason: { type: 'string', description: 'Short reason shown to the user' },
            urgency: { type: 'string', enum: ['routine', 'soon', 'urgent'] },
            city: { type: 'string' },
          },
          ['reason'],
        ),
      },
    },
  },
  {
    stages: ['awareness', 'treatment', 'vigilance'],
    definition: {
      type: 'function',
      function: {
        name: 'find_doctors',
        description: 'Find obesity and endocrinology doctors the user can call or book.',
        parameters: obj({
          city: { type: 'string' },
          teleconsult_only: { type: 'boolean' },
          limit: { type: 'number' },
        }),
      },
    },
  },
  {
    stages: ['awareness', 'treatment', 'vigilance'],
    definition: {
      type: 'function',
      function: {
        name: 'get_available_slots',
        description: 'List free appointment slots for a doctor on a date. Call before offering times.',
        parameters: obj(
          { doctor_id: { type: 'string' }, date: { type: 'string', description: 'YYYY-MM-DD' } },
          ['doctor_id', 'date'],
        ),
      },
    },
  },
  {
    stages: ['awareness', 'treatment', 'vigilance'],
    definition: {
      type: 'function',
      function: {
        name: 'book_appointment',
        description:
          'Book a confirmed appointment. Only call after the user has explicitly chosen BOTH a doctor and a time. Never guess a time.',
        parameters: obj(
          {
            doctor_id: { type: 'string' },
            scheduled_at: { type: 'string', description: 'ISO 8601 timestamp' },
            mode: { type: 'string', enum: ['in_person', 'video', 'phone'] },
            reason: { type: 'string' },
          },
          ['doctor_id', 'scheduled_at'],
        ),
      },
    },
  },
  {
    stages: ['awareness', 'treatment', 'vigilance'],
    definition: {
      type: 'function',
      function: {
        name: 'explain_myth',
        description:
          'Retrieve the evidence card for a common obesity or GLP-1 myth. Call when the user states a myth or asks whether something they heard is true.',
        parameters: obj({ query: { type: 'string' } }, ['query']),
      },
    },
  },
  {
    stages: ['awareness', 'treatment', 'vigilance'],
    definition: {
      type: 'function',
      function: {
        name: 'get_education_topic',
        description:
          'Retrieve a WHO/ICMR-based education article to show the user. Use when explaining a topic in depth would help.',
        parameters: obj({
          category: {
            type: 'string',
            enum: ['basics', 'nutrition', 'activity', 'behaviour', 'medical', 'long_term', 'safety'],
          },
          query: { type: 'string' },
        }),
      },
    },
  },
  {
    stages: ['treatment', 'vigilance'],
    definition: {
      type: 'function',
      function: {
        name: 'log_weight',
        description: 'Record a weight the user just told you. Only call with a number they stated.',
        parameters: obj(
          {
            weight_kg: { type: 'number' },
            waist_cm: { type: 'number' },
            recorded_on: { type: 'string', description: 'YYYY-MM-DD, defaults to today' },
          },
          ['weight_kg'],
        ),
      },
    },
  },
  {
    stages: ['treatment', 'vigilance'],
    definition: {
      type: 'function',
      function: {
        name: 'request_check_in',
        description:
          'Show the user an in-chat check-in form. Call when a passive check-in is due or tracking would help.',
        parameters: obj(
          {
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
          ['fields'],
        ),
      },
    },
  },
  {
    stages: ['treatment', 'vigilance'],
    definition: {
      type: 'function',
      function: {
        name: 'save_check_in',
        description:
          'Persist check-in values the user reported conversationally. Only include values they actually gave. Scores are 0-10.',
        parameters: obj({
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
            items: obj(
              {
                code: { type: 'string' },
                severity: { type: 'string', enum: ['mild', 'moderate', 'severe'] },
                note: { type: 'string' },
              },
              ['code', 'severity'],
            ),
          },
          free_text: { type: 'string' },
        }),
      },
    },
  },
  {
    stages: ['treatment'],
    definition: {
      type: 'function',
      function: {
        name: 'get_medication_schedule',
        description:
          "Read the user's active medicines, next dose and refill position. Call before answering anything about their own doses, timing or refills.",
        parameters: obj({}),
      },
    },
  },
  {
    stages: ['treatment'],
    definition: {
      type: 'function',
      function: {
        name: 'request_refill',
        description:
          'Send the prescription to a pharmacy and raise a refill. Call with no arguments first to see the options, then again once the user has chosen a medicine and a channel.',
        parameters: obj({
          medication_id: { type: 'string' },
          channel: {
            type: 'string',
            enum: ['hospital_pharmacy', 'nearby_pharmacy', 'home_delivery'],
          },
          address_line: { type: 'string' },
        }),
      },
    },
  },
  {
    stages: ['treatment', 'vigilance'],
    definition: {
      type: 'function',
      function: {
        name: 'get_progress',
        description:
          'Read weight history and progress. Call before making any claim about how the user is doing.',
        parameters: obj({}),
      },
    },
  },
  {
    stages: ['treatment', 'vigilance'],
    definition: {
      type: 'function',
      function: {
        name: 'get_side_effect_trend',
        // Without this the coach asks "any side effects?" every session and
        // ignores sixty days of the user already answering that question.
        description:
          'Read side effects the user has logged in recent check-ins, aggregated: how often each one came up, how bad it got, and whether it is worsening. Call before answering anything about side effects, tolerability, or whether something is normal — the pattern across weeks is the clinically useful part, and the user cannot see it from the inside.',
        parameters: obj({
          window_days: {
            type: 'number',
            description: 'How far back to look. Defaults to 60.',
          },
        }),
      },
    },
  },
  {
    stages: ['awareness', 'treatment', 'vigilance'],
    definition: {
      type: 'function',
      function: {
        name: 'get_call_history',
        description:
          'Read calls the user has placed from inside the app — who, when and why. Call this before telling someone to ring their doctor, so you do not tell a person who called this morning to call. It records that the dialler was opened, not that anyone answered.',
        parameters: obj({}),
      },
    },
  },
  {
    stages: ['vigilance'],
    definition: {
      type: 'function',
      function: {
        name: 'get_maintenance_status',
        description:
          'Read where the user stands against their own relapse action threshold: lowest weight, current weight, drift as a percentage, and whether the threshold has been crossed. Call before discussing regain, maintenance or whether they should be worried. Drift is measured from their lowest weight, not their starting weight.',
        parameters: obj({}),
      },
    },
  },
  {
    stages: ['treatment', 'vigilance'],
    definition: {
      type: 'function',
      function: {
        name: 'get_nutrition_plan',
        description: 'Read the active nutrition plan so advice matches the targets they were given.',
        parameters: obj({}),
      },
    },
  },
  {
    stages: ['treatment', 'vigilance'],
    definition: {
      type: 'function',
      function: {
        name: 'trigger_relapse_protocol',
        description:
          'Start the relapse-prevention protocol. Call when the user reports binge eating, stopping treatment, weight regain, lost motivation or hopelessness.',
        parameters: obj(
          {
            signals: { type: 'array', items: { type: 'string' } },
            severity: { type: 'string', enum: ['early', 'active', 'severe'] },
          },
          ['signals', 'severity'],
        ),
      },
    },
  },
  {
    stages: ['awareness', 'treatment', 'vigilance'],
    definition: {
      type: 'function',
      function: {
        name: 'escalate_to_care',
        description:
          'Raise an urgent or routine escalation banner with direct call buttons. Call for red-flag symptoms or when the user needs a clinician now.',
        parameters: obj(
          {
            severity: { type: 'string', enum: ['urgent', 'routine'] },
            message: { type: 'string' },
          },
          ['severity', 'message'],
        ),
      },
    },
  },
  {
    stages: ['awareness', 'treatment', 'vigilance'],
    definition: {
      type: 'function',
      function: {
        name: 'suggest_actions',
        description:
          'Offer up to three tappable next steps inside the app. Use this instead of describing where to tap.',
        parameters: obj(
          {
            actions: {
              type: 'array',
              maxItems: 3,
              items: obj(
                {
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
                ['label', 'intent'],
              ),
            },
          },
          ['actions'],
        ),
      },
    },
  },
];

export function toolsForStage(stage: JourneyStage): LlmToolDefinition[] {
  return SPECS.filter((s) => s.stages.includes(stage)).map((s) => s.definition);
}

export const ALL_TOOL_NAMES = SPECS.map((s) => s.definition.function.name);
