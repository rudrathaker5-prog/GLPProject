import type { JourneyStage } from '@core/domain/types';

/**
 * Standard nutrition guidance for people on, and after, a GLP-1.
 *
 * Distinct from the personalised plan in `nutritionRepository`: that one is
 * generated from a patient's weight and targets, this is the general standard
 * anyone can read without entering anything. Someone deciding whether to start,
 * or three months post-treatment wondering what "eating properly" now means,
 * should not have to fill in a form first.
 *
 * SOURCES AND HONESTY
 *
 * Every figure below is attributed, because the numbers genuinely disagree and
 * a reader deserves to know which is which:
 *
 *  - The GLP-1 protein target (1.2-1.6 g/kg/day) comes from Western obesity
 *    medicine, driven by the finding that roughly 40% of weight lost on
 *    semaglutide is lean mass.
 *  - ICMR-NIN's general adult figure for India is 0.8 g/kg/day, and the 2024
 *    guidelines specifically advise against routine protein supplements.
 *
 * Those are not contradictory — one is a general population guideline and one
 * is for people in a rapid deficit on a medication — but presenting the higher
 * number to an Indian patient without saying where it comes from would be
 * misleading, so both are shown.
 *
 * This is education, not a prescription. Nothing here is tailored, and the
 * screen says so.
 */

export interface NutritionStandardSection {
  id: string;
  title: string;
  /** Short summary shown collapsed. */
  summary: string;
  points: string[];
  /** Where the guidance comes from, shown to the reader. */
  sources: string[];
}

export interface NutritionStandard {
  /** Which phase this set applies to. */
  phase: 'on_treatment' | 'after_treatment' | 'always';
  title: string;
  intro: string;
  sections: NutritionStandardSection[];
}

/** Protein target while on a GLP-1, as g/kg of body weight per day. */
export const GLP1_PROTEIN_G_PER_KG = { min: 1.2, max: 1.6 } as const;

/** ICMR-NIN's general adult figure for India, for comparison. */
export const ICMR_PROTEIN_G_PER_KG = 0.8;

/** Per-meal protein most adults are advised to aim for in maintenance. */
export const MAINTENANCE_PROTEIN_G_PER_MEAL = { min: 25, max: 35 } as const;

export const NUTRITION_STANDARDS: NutritionStandard[] = [
  {
    phase: 'on_treatment',
    title: 'Eating while you are on a GLP-1',
    intro:
      'The medicine reduces how much you want to eat. That is the point of it — and it means the food you do eat has to work harder. The single biggest risk of eating badly on these medicines is losing muscle along with fat.',
    sections: [
      {
        id: 'protein',
        title: 'Protein comes first',
        summary: 'Aim for 1.2–1.6 g per kg of body weight a day. Eat it before anything else on the plate.',
        points: [
          'Around 40% of the weight lost on semaglutide is lean mass — muscle, not just fat. Protein is the main thing that reduces that.',
          'Obesity-medicine guidance for people losing weight on a GLP-1 is 1.2–1.6 g of protein per kg of body weight per day. At 80 kg that is roughly 96–128 g a day.',
          'ICMR-NIN’s general figure for Indian adults is 0.8 g/kg/day. The higher number above is specifically for people in a rapid deficit on medication — ask your doctor which applies to you.',
          'Split it across meals rather than eating it all at dinner. Appetite is usually lowest in the evening on these medicines.',
          'Eat the protein portion of the meal first. With a smaller appetite, whatever is eaten first is what actually gets eaten.',
          'Indian sources that work: dal, rajma, chana, paneer, curd, eggs, fish, chicken, soya chunks, sprouts.',
          'ICMR-NIN advises against routine protein supplements — food first, unless your doctor says otherwise.',
        ],
        sources: [
          'Mayo Clinic — GLP-1 medications and muscle loss',
          'Endocrine Society, ENDO 2025 — protein intake and lean mass on anti-obesity medication',
          'ICMR-NIN Dietary Guidelines for Indians, 2024',
        ],
      },
      {
        id: 'muscle',
        title: 'Protein alone is not enough',
        summary: 'Resistance training two to three times a week is what turns the protein into kept muscle.',
        points: [
          'Protein supplies the material; loading the muscle is the signal to keep it. Neither works well alone.',
          'Two to three resistance sessions a week is the commonly cited minimum. Bodyweight work at home counts.',
          'This matters most for older adults and for women, who lose proportionally more lean mass on these medicines.',
        ],
        sources: [
          'Massachusetts General Hospital — preserving lean body mass on GLP-1 therapy',
          'Endocrine Society, ENDO 2025',
        ],
      },
      {
        id: 'fibre',
        title: 'Fibre, and enough water to go with it',
        summary: 'Constipation is one of the most common reasons people stop. Fibre and fluid together prevent most of it.',
        points: [
          'Slowed stomach emptying plus eating less makes constipation very common. Fibre without fluid makes it worse, not better.',
          'ICMR-NIN advises at least half of cereals be whole grains — that alone moves fibre substantially.',
          'Vegetables, fruit, whole dals and millets do more than a supplement.',
          'Increase fibre gradually. A sudden jump causes bloating on a stomach that is already emptying slowly.',
        ],
        sources: ['ICMR-NIN Dietary Guidelines for Indians, 2024'],
      },
      {
        id: 'nausea',
        title: 'Eating when you feel sick',
        summary: 'Smaller, slower, blander, and stop at the first sign of full.',
        points: [
          'Smaller meals more often beats three normal ones. The stomach is emptying slowly; a large meal sits there.',
          'Eat slowly and stop at the first sign of fullness rather than the usual one. On these medicines that signal arrives earlier and is easy to overshoot.',
          'Fatty, fried and very sweet foods make nausea markedly worse. This is the most reliable thing to change first.',
          'Keep sipping fluids through the day even when you do not feel like eating. Dehydration is what turns manageable nausea into a hospital visit.',
          'Persistent vomiting, or being unable to keep fluids down, is not something to manage with diet. Call your doctor.',
        ],
        sources: ['Mayo Clinic', 'Manufacturer patient information leaflets'],
      },
      {
        id: 'limit',
        title: 'What to pull back on',
        summary: 'Ultra-processed food, alcohol, and drinking your calories.',
        points: [
          'ICMR-NIN 2024 is explicit about restricting ultra-processed foods — they are easy to eat past fullness precisely because they do not fill you.',
          'Alcohol on a reduced intake hits harder, adds calories that do not fill, and worsens nausea.',
          'Sweet drinks and juices bypass the fullness the medicine is creating. Water, chaas, or unsweetened tea instead.',
        ],
        sources: ['ICMR-NIN Dietary Guidelines for Indians, 2024'],
      },
    ],
  },
  {
    phase: 'after_treatment',
    title: 'Eating after you stop',
    intro:
      'When the medicine stops, the appetite it was suppressing comes back — often quite suddenly. Nothing about your body has failed. The job now is to do with food and habit what the medicine was doing chemically.',
    sections: [
      {
        id: 'protein-after',
        title: 'Keep the protein up',
        summary: '25–35 g per meal, roughly 75–120 g a day depending on your size and activity.',
        points: [
          'Protein is the most filling macronutrient. It is doing part of the job the medicine used to do.',
          'Most adults are advised 25–35 g per meal, which works out around 75–120 g a day depending on body size and activity.',
          'Muscle is what keeps your metabolic rate up. Losing it after treatment is the quiet mechanism behind a lot of regain.',
          'Keep the resistance training going. It matters more now, not less.',
        ],
        sources: [
          'Cecelia Health — life after a GLP-1',
          'U.S. News expert guide — maintaining weight loss after stopping GLP-1s',
        ],
      },
      {
        id: 'fibre-after',
        title: 'Fibre does more of the work now',
        summary: 'High-fibre foods raise your body’s own GLP-1. This is not a metaphor — it is the same hormone.',
        points: [
          'Fibre slows digestion and prolongs fullness, which is exactly what you have just stopped getting from a syringe.',
          'High-fibre foods increase the body’s own GLP-1 secretion. You are supporting the same pathway by other means.',
          'It also steadies blood sugar, which flattens the crashes that drive evening eating.',
          'Whole grains, dals, vegetables, fruit with the skin on, nuts and seeds.',
        ],
        sources: [
          'Cecelia Health',
          'ICMR-NIN Dietary Guidelines for Indians, 2024',
        ],
      },
      {
        id: 'structure',
        title: 'Structure replaces the medicine',
        summary: 'Balanced meals, on purpose, at roughly the same times.',
        points: [
          'Protein, fibre and some healthy fat at each meal prevents the energy crash that precedes most unplanned eating.',
          'Eating at roughly regular times matters more once appetite signalling is back to normal.',
          'Keep tracking something — weight, food, or activity. Not to police yourself, but because drift is invisible from the inside until it is large.',
          'Weigh weekly, not daily. Daily weight is mostly water and it teaches you to react to noise.',
        ],
        sources: [
          'U.S. News expert guide',
          'Cecelia Health',
        ],
      },
      {
        id: 'stopping',
        title: 'If you are still deciding when to stop',
        summary: 'Tapering and a plan beat stopping abruptly. That is a conversation with your doctor.',
        points: [
          'Gradually reducing the dose is generally preferred to stopping suddenly — but the schedule is your doctor’s decision, not something to work out from an app.',
          'Having the habits in place *before* you stop is what the evidence keeps pointing at.',
          'Regain after stopping is a property of the disease, not a personal failure. It is also treatable, and earlier is much easier.',
        ],
        sources: ['Cecelia Health', 'U.S. News expert guide'],
      },
    ],
  },
];

/** The standard set most relevant to where the patient is. */
export function standardsForStage(stage: JourneyStage): NutritionStandard[] {
  const onTreatment = NUTRITION_STANDARDS.find((s) => s.phase === 'on_treatment')!;
  const after = NUTRITION_STANDARDS.find((s) => s.phase === 'after_treatment')!;

  // Both are shown to everyone — someone on treatment benefits from knowing
  // what comes next, and someone past it may go back on. Only the order
  // changes, so the relevant one is not below a fold.
  return stage === 'vigilance' ? [after, onTreatment] : [onTreatment, after];
}

/** Grams of protein a day for a given weight, as a readable range. */
export function proteinTargetFor(weightKg: number | null): string | null {
  if (!weightKg || weightKg <= 0) return null;
  const low = Math.round(weightKg * GLP1_PROTEIN_G_PER_KG.min);
  const high = Math.round(weightKg * GLP1_PROTEIN_G_PER_KG.max);
  return `${low}–${high} g`;
}
