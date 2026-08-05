import {
  bmiCategoryIndian,
  calculateBmi,
  evaluateEligibility,
  percentWeightLoss,
  waistAboveThreshold,
} from '../eligibility';

describe('BMI calculation', () => {
  it('computes BMI to one decimal place', () => {
    expect(calculateBmi(165, 82)).toBe(30.1);
    expect(calculateBmi(180, 75)).toBe(23.1);
  });

  it('returns null when a measurement is missing', () => {
    expect(calculateBmi(null, 80)).toBeNull();
    expect(calculateBmi(170, null)).toBeNull();
    expect(calculateBmi(0, 80)).toBeNull();
  });
});

describe('Indian BMI categories', () => {
  it('uses Asian-Indian cut-offs, not Western ones', () => {
    // 24 would be "normal" on Western cut-offs but is overweight here.
    expect(bmiCategoryIndian(24)).toBe('Overweight (Asian-Indian range)');
    expect(bmiCategoryIndian(22.9)).toBe('Normal (Asian-Indian range)');
    expect(bmiCategoryIndian(26)).toBe('Obesity — class I');
    expect(bmiCategoryIndian(31)).toBe('Obesity — class II');
    expect(bmiCategoryIndian(40)).toBe('Obesity — class III');
  });
});

describe('waist thresholds', () => {
  it('applies 90 cm for men and 80 cm for women', () => {
    expect(waistAboveThreshold(92, 'male')).toBe(true);
    expect(waistAboveThreshold(88, 'male')).toBe(false);
    expect(waistAboveThreshold(82, 'female')).toBe(true);
    expect(waistAboveThreshold(78, 'female')).toBe(false);
  });

  it('falls back to the more sensitive threshold when sex is unknown', () => {
    expect(waistAboveThreshold(85, 'undisclosed')).toBe(true);
  });
});

describe('eligibility screening', () => {
  it('flags likely eligible at BMI 27.5 or above', () => {
    const result = evaluateEligibility({ heightCm: 165, weightKg: 80, age: 40, sex: 'female' });
    expect(result.verdict).toBe('likely_eligible');
    expect(result.bmi).toBe(29.4);
  });

  it('flags likely eligible at BMI 25 with a comorbidity', () => {
    const result = evaluateEligibility({
      heightCm: 170,
      weightKg: 74,
      age: 45,
      sex: 'male',
      comorbidities: ['type2_diabetes'],
    });
    expect(result.bmi).toBe(25.6);
    expect(result.verdict).toBe('likely_eligible');
  });

  it('never advises treatment during pregnancy, whatever the BMI', () => {
    const result = evaluateEligibility({
      heightCm: 160,
      weightKg: 95,
      contraindications: ['pregnancy'],
    });
    expect(result.verdict).toBe('not_advisable');
    expect(result.reasons.join(' ')).toMatch(/pregnancy/i);
  });

  it('downgrades to needs_consultation when a caution flag is present', () => {
    const result = evaluateEligibility({
      heightCm: 165,
      weightKg: 85,
      age: 38,
      sex: 'female',
      contraindications: ['pancreatitis_history'],
    });
    expect(result.verdict).toBe('needs_consultation');
  });

  it('routes under-18s to paediatric care', () => {
    const result = evaluateEligibility({ heightCm: 160, weightKg: 80, age: 15 });
    expect(result.verdict).toBe('needs_consultation');
    expect(result.nextSteps.join(' ')).toMatch(/paediatric/i);
  });

  it('reports insufficient information without height and weight', () => {
    const result = evaluateEligibility({ age: 30 });
    expect(result.verdict).toBe('insufficient_information');
    expect(result.missing).toContain('height');
    expect(result.missing).toContain('weight');
  });

  it('always carries the educational disclaimer', () => {
    const result = evaluateEligibility({ heightCm: 170, weightKg: 90 });
    expect(result.disclaimer).toMatch(/not a prescription/i);
    expect(result.guidelineRefs.length).toBeGreaterThan(0);
  });

  it('never names a medicine', () => {
    const result = evaluateEligibility({ heightCm: 165, weightKg: 95, sex: 'female', age: 42 });
    const text = [...result.reasons, ...result.nextSteps, result.disclaimer].join(' ').toLowerCase();
    for (const drug of ['semaglutide', 'tirzepatide', 'ozempic', 'wegovy', 'mounjaro', 'liraglutide']) {
      expect(text).not.toContain(drug);
    }
  });
});

describe('percent weight loss', () => {
  it('reports loss as a percentage of the starting weight', () => {
    expect(percentWeightLoss(100, 90)).toBe(10);
    expect(percentWeightLoss(88, 83.6)).toBe(5);
  });

  it('returns null without a baseline', () => {
    expect(percentWeightLoss(null, 80)).toBeNull();
  });
});
