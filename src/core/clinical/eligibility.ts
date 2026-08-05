import type {
  Comorbidity,
  Contraindication,
  EligibilityInput,
  EligibilityResult,
  Sex,
} from '@core/domain/types';

/**
 * Educational eligibility screening for obesity pharmacotherapy using Indian
 * (ICMR-NIN / Indian obesity consensus) thresholds rather than Western BMI
 * cut-offs, because South Asians accumulate visceral fat at a lower BMI.
 *
 * This NEVER prescribes and NEVER names a specific medicine. It classifies the
 * likelihood that a doctor would consider the patient a candidate, and always
 * routes to a clinician.
 */

export const BMI_THRESHOLDS = {
  underweight: 18.5,
  normal: 23,
  overweight: 25,
  obesityClass2: 30,
  obesityClass3: 35,
} as const;

export const WAIST_THRESHOLD_CM: Record<'male' | 'female', number> = {
  male: 90,
  female: 80,
};

export function calculateBmi(heightCm?: number | null, weightKg?: number | null): number | null {
  if (!heightCm || !weightKg || heightCm <= 0) return null;
  const metres = heightCm / 100;
  return Math.round((weightKg / (metres * metres)) * 10) / 10;
}

export function bmiCategoryIndian(bmi: number | null): string | null {
  if (bmi === null) return null;
  if (bmi < BMI_THRESHOLDS.underweight) return 'Underweight';
  if (bmi < BMI_THRESHOLDS.normal) return 'Normal (Asian-Indian range)';
  if (bmi < BMI_THRESHOLDS.overweight) return 'Overweight (Asian-Indian range)';
  if (bmi < BMI_THRESHOLDS.obesityClass2) return 'Obesity — class I';
  if (bmi < BMI_THRESHOLDS.obesityClass3) return 'Obesity — class II';
  return 'Obesity — class III';
}

export function waistAboveThreshold(waistCm?: number | null, sex?: Sex): boolean | null {
  if (!waistCm) return null;
  if (sex !== 'male' && sex !== 'female') {
    // Without a recorded sex, use the lower (more sensitive) threshold.
    return waistCm >= WAIST_THRESHOLD_CM.female;
  }
  return waistCm >= WAIST_THRESHOLD_CM[sex];
}

const MEANINGFUL_COMORBIDITIES: Comorbidity[] = [
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
];

const ABSOLUTE_CONTRAINDICATIONS: Contraindication[] = [
  'pregnancy',
  'breastfeeding',
  'mtc_men2_history',
];

const CAUTION_CONTRAINDICATIONS: Contraindication[] = [
  'pancreatitis_history',
  'type1_diabetes',
  'severe_gi_disease',
  'active_eating_disorder',
];

export const DISCLAIMER =
  'This is educational information based on published Indian and WHO guidance. It is not a prescription, a diagnosis, or medical advice. Only a registered doctor can examine you, order the right tests and decide whether any medicine is appropriate.';

export function evaluateEligibility(input: EligibilityInput): EligibilityResult {
  const bmi = calculateBmi(input.heightCm, input.weightKg);
  const category = bmiCategoryIndian(bmi);
  const waistFlag = waistAboveThreshold(input.waistCm, input.sex);

  const comorbidities = (input.comorbidities ?? []).filter(
    (c) => c !== 'none' && MEANINGFUL_COMORBIDITIES.includes(c),
  );
  const contraindications = (input.contraindications ?? []).filter((c) => c !== 'none');

  const reasons: string[] = [];
  const missing: string[] = [];
  const nextSteps: string[] = [];
  const guidelineRefs = [
    'ICMR-NIN Dietary Guidelines for Indians (2024) — Asian-Indian BMI and waist cut-offs',
    'WHO Obesity and overweight fact sheet',
    'Indian consensus statements on medical management of obesity',
  ];

  if (!input.heightCm) missing.push('height');
  if (!input.weightKg) missing.push('weight');
  if (!input.waistCm) missing.push('waist circumference');
  if (!input.age) missing.push('age');

  // --- Absolute stops ------------------------------------------------------
  const absolute = contraindications.filter((c) =>
    ABSOLUTE_CONTRAINDICATIONS.includes(c as Contraindication),
  );
  if (absolute.length > 0) {
    return {
      verdict: 'not_advisable',
      bmi,
      bmiCategoryIndian: category,
      waistFlag,
      reasons: [
        ...absolute.map((c) => contraindicationReason(c as Contraindication)),
        'These are situations where weight-loss medicines are not given, regardless of BMI.',
      ],
      missing: [],
      nextSteps: [
        'Speak to your doctor about safe options for now.',
        'Nutrition, activity and sleep support can begin immediately and are safe.',
        'Revisit medication as an option when the situation changes, with your doctor.',
      ],
      guidelineRefs,
      disclaimer: DISCLAIMER,
    };
  }

  // --- Age -----------------------------------------------------------------
  if (input.age !== null && input.age !== undefined) {
    if (input.age < 18) {
      return {
        verdict: 'needs_consultation',
        bmi,
        bmiCategoryIndian: category,
        waistFlag,
        reasons: [
          'Under 18, obesity care is handled by a paediatric specialist and the rules are different from adult care.',
        ],
        missing,
        nextSteps: ['Ask for a referral to a paediatric endocrinologist or adolescent obesity clinic.'],
        guidelineRefs,
        disclaimer: DISCLAIMER,
      };
    }
    if (input.age > 75) {
      reasons.push(
        'Above 75, doctors weigh muscle loss and frailty carefully before starting weight-loss medicines.',
      );
    }
  }

  // --- Not enough data -----------------------------------------------------
  if (bmi === null) {
    return {
      verdict: 'insufficient_information',
      bmi: null,
      bmiCategoryIndian: null,
      waistFlag,
      reasons: ['I need your height and weight before I can say anything useful.'],
      missing,
      nextSteps: [
        'Add your height and weight to get an indication.',
        'Waist circumference makes the estimate meaningfully better.',
      ],
      guidelineRefs,
      disclaimer: DISCLAIMER,
    };
  }

  // --- Build the picture ---------------------------------------------------
  reasons.push(`Your BMI is ${bmi} — ${category}.`);
  if (waistFlag === true) {
    reasons.push(
      `Your waist measurement is at or above the Indian risk threshold (${
        input.sex === 'male' ? '90' : '80'
      } cm), which points to visceral fat around the organs.`,
    );
  } else if (waistFlag === false) {
    reasons.push('Your waist measurement is below the Indian risk threshold.');
  }

  if (comorbidities.length > 0) {
    reasons.push(
      `You reported ${comorbidities.map(comorbidityLabel).join(', ')}, which raises the medical case for treating weight actively.`,
    );
  }

  const caution = contraindications.filter((c) =>
    CAUTION_CONTRAINDICATIONS.includes(c as Contraindication),
  );
  if (caution.length > 0) {
    reasons.push(
      `You also reported ${caution.map(contraindicationLabel).join(', ')} — this does not automatically rule treatment out, but it must be assessed by a doctor first.`,
    );
  }

  // --- Verdict -------------------------------------------------------------
  const hasComorbidity = comorbidities.length > 0;
  let verdict: EligibilityResult['verdict'];

  if (bmi >= 27.5 || (bmi >= 25 && hasComorbidity)) {
    verdict = 'likely_eligible';
  } else if (bmi >= 25 || (bmi >= 23 && (hasComorbidity || waistFlag === true))) {
    verdict = 'possibly_eligible';
  } else if (bmi >= BMI_THRESHOLDS.normal) {
    verdict = 'needs_consultation';
  } else {
    verdict = 'not_advisable';
    reasons.push(
      'At this BMI, weight-loss medicines are not indicated. If weight is still a worry for you, that is worth discussing with a doctor.',
    );
  }

  if (caution.length > 0 && verdict === 'likely_eligible') {
    verdict = 'needs_consultation';
  }

  if (missing.length > 1 && verdict === 'likely_eligible') {
    verdict = 'possibly_eligible';
    reasons.push('Some details are missing, so treat this as an indication rather than a conclusion.');
  }

  // --- Next steps ----------------------------------------------------------
  switch (verdict) {
    case 'likely_eligible':
      nextSteps.push(
        'Book a consultation — you are in the range where doctors commonly consider medical treatment.',
        'Before the visit, note your weight history, any medicines you take, and your family history.',
        'Expect blood tests: HbA1c, lipids, liver and kidney function, and thyroid.',
      );
      break;
    case 'possibly_eligible':
      nextSteps.push(
        'A consultation is the right next step — the decision depends on details only an examination can settle.',
        'Start the lifestyle foundation now: protein at every meal, 150 minutes of activity a week, 7-9 hours of sleep.',
      );
      break;
    case 'needs_consultation':
      nextSteps.push(
        'Talk to a doctor before assuming anything either way.',
        'Bring your waist measurement and any recent blood reports.',
      );
      break;
    case 'not_advisable':
      nextSteps.push(
        'Focus on nutrition, movement, sleep and stress — these help regardless of medication.',
        'If your weight or eating feels out of your control, a doctor can still help.',
      );
      break;
    default:
      break;
  }

  return {
    verdict,
    bmi,
    bmiCategoryIndian: category,
    waistFlag,
    reasons,
    missing,
    nextSteps,
    guidelineRefs,
    disclaimer: DISCLAIMER,
  };
}

export function comorbidityLabel(c: Comorbidity): string {
  return {
    type2_diabetes: 'type 2 diabetes',
    prediabetes: 'prediabetes',
    hypertension: 'high blood pressure',
    dyslipidaemia: 'abnormal cholesterol',
    osa: 'sleep apnoea',
    pcos: 'PCOS',
    nafld: 'fatty liver',
    osteoarthritis: 'joint pain / osteoarthritis',
    cvd: 'heart disease',
    infertility: 'fertility difficulty',
    none: 'none',
  }[c];
}

export function contraindicationLabel(c: Contraindication): string {
  return {
    pregnancy: 'pregnancy',
    breastfeeding: 'breastfeeding',
    mtc_men2_history: 'family history of medullary thyroid cancer or MEN2',
    pancreatitis_history: 'previous pancreatitis',
    type1_diabetes: 'type 1 diabetes',
    severe_gi_disease: 'severe stomach or bowel disease',
    active_eating_disorder: 'an active eating disorder',
    none: 'none',
  }[c];
}

function contraindicationReason(c: Contraindication): string {
  return {
    pregnancy:
      'Weight-loss medicines are not used during pregnancy — weight loss itself is not a goal while pregnant.',
    breastfeeding: 'These medicines are not used while breastfeeding.',
    mtc_men2_history:
      'A personal or family history of medullary thyroid carcinoma or MEN2 syndrome is an absolute contraindication for GLP-1 medicines.',
    pancreatitis_history: 'Previous pancreatitis needs specialist assessment first.',
    type1_diabetes: 'Type 1 diabetes changes how these medicines are used and needs a specialist.',
    severe_gi_disease: 'Severe stomach or bowel disease needs assessment first.',
    active_eating_disorder:
      'An active eating disorder needs treatment in its own right before weight-loss medicine is considered.',
    none: '',
  }[c];
}

/** Percentage of starting weight lost — the number that matters clinically. */
export function percentWeightLoss(startKg?: number | null, currentKg?: number | null): number | null {
  if (!startKg || !currentKg || startKg <= 0) return null;
  return Math.round(((startKg - currentKg) / startKg) * 1000) / 10;
}
