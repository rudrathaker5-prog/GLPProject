import {
  ACTION_THRESHOLD_PERCENT,
  CHECKPOINT_MONTHS,
  needsClinicalReview,
  type SideEffectTrendEntry,
} from '../vigilanceRepository';

/**
 * The maintenance-phase arithmetic.
 *
 * Two things here are clinical rather than cosmetic. Drift is measured from the
 * *lowest* weight, not the starting weight — someone 20 kg below where they
 * began and 4 kg above their lowest is regaining, and reporting that as "still
 * 20 kg down" is exactly how a slow return goes unnoticed for a year. And the
 * side-effect triage decides whether the app tells a patient to ring a doctor,
 * so the conditions it fires on are worth stating explicitly.
 */

describe('the action threshold', () => {
  it('is 3% above the lowest weight', () => {
    // Low enough to catch a regain while behaviour alone can still reverse it,
    // high enough not to fire on ordinary daily fluctuation.
    expect(ACTION_THRESHOLD_PERCENT).toBe(3);
  });

  it('produces an action weight above the nadir', () => {
    const nadir = 78;
    const action = Math.round(nadir * (1 + ACTION_THRESHOLD_PERCENT / 100) * 10) / 10;
    expect(action).toBeCloseTo(80.3, 1);
    expect(action).toBeGreaterThan(nadir);
  });
});

describe('checkpoints', () => {
  it('are the three the clinical protocol uses', () => {
    expect(CHECKPOINT_MONTHS).toEqual([3, 6, 12]);
  });
});

describe('side-effect triage', () => {
  const entry = (over: Partial<SideEffectTrendEntry> = {}): SideEffectTrendEntry => ({
    code: 'nausea',
    occurrences: 1,
    worstSeverity: 'mild',
    lastReportedAt: new Date().toISOString(),
    worsening: false,
    ...over,
  });

  it('leaves a single mild report alone', () => {
    // Nausea once on a GLP-1 is expected. Flagging it would train people to
    // ignore the flag.
    expect(needsClinicalReview([entry()])).toEqual([]);
  });

  it('flags anything severe', () => {
    expect(needsClinicalReview([entry({ worstSeverity: 'severe' })])).toHaveLength(1);
  });

  it('flags a symptom that is getting worse', () => {
    expect(needsClinicalReview([entry({ worsening: true })])).toHaveLength(1);
  });

  it('flags a symptom that keeps coming back', () => {
    expect(needsClinicalReview([entry({ occurrences: 3 })])).toHaveLength(1);
    expect(needsClinicalReview([entry({ occurrences: 2 })])).toEqual([]);
  });

  it('always flags severe abdominal pain, even reported once and mild', () => {
    // Pancreatitis-shaped. The severity the patient assigns is not the signal.
    const result = needsClinicalReview([
      entry({ code: 'severe_abdominal_pain', worstSeverity: 'mild', occurrences: 1 }),
    ]);
    expect(result).toHaveLength(1);
  });

  it('always flags low blood sugar', () => {
    const result = needsClinicalReview([
      entry({ code: 'hypoglycaemia', worstSeverity: 'mild', occurrences: 1 }),
    ]);
    expect(result).toHaveLength(1);
  });

  it('returns the flagged entries themselves, so the UI can name them', () => {
    const severe = entry({ code: 'vomiting', worstSeverity: 'severe' });
    const mild = entry({ code: 'headache' });
    expect(needsClinicalReview([severe, mild])).toEqual([severe]);
  });
});
