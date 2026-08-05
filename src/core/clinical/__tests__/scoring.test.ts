import type { CheckIn, WeightEntry } from '@core/domain/types';

import { computeAdherence, computeRelapseRisk, computeWellnessScore } from '../scoring';

function checkIn(partial: Partial<CheckIn>): CheckIn {
  return {
    id: 'c1',
    userId: 'u1',
    kind: 'passive',
    occurredAt: new Date().toISOString(),
    weightKg: null,
    moodScore: null,
    appetiteScore: null,
    energyScore: null,
    sleepHours: null,
    sleepQuality: null,
    stressScore: null,
    cravingScore: null,
    waterLitres: null,
    exerciseMinutes: null,
    nutritionAdherence: null,
    medicationAdherence: null,
    confidenceScore: null,
    sideEffects: [],
    freeText: null,
    wellnessScore: null,
    relapseRisk: null,
    ...partial,
  };
}

function weight(recordedOn: string, weightKg: number): WeightEntry {
  return { id: recordedOn, userId: 'u1', recordedOn, weightKg, waistCm: null, source: 'manual' };
}

describe('wellness score', () => {
  it('is null when nothing was answered', () => {
    expect(computeWellnessScore(checkIn({}))).toBeNull();
  });

  it('scores a good week high', () => {
    const result = computeWellnessScore(
      checkIn({
        moodScore: 8,
        energyScore: 8,
        sleepQuality: 8,
        stressScore: 2,
        nutritionAdherence: 90,
        medicationAdherence: 100,
        exerciseMinutes: 150,
      }),
    );
    expect(result?.score).toBeGreaterThanOrEqual(75);
    expect(result?.band).toBe('thriving');
  });

  it('penalises severe side effects hard', () => {
    const good = computeWellnessScore(checkIn({ moodScore: 8, energyScore: 8 }));
    const withSevere = computeWellnessScore(
      checkIn({
        moodScore: 8,
        energyScore: 8,
        sideEffects: [{ code: 'vomiting', severity: 'severe' }],
      }),
    );
    expect(withSevere!.score).toBeLessThan(good!.score - 10);
  });

  it('treats high stress as a negative, not a positive', () => {
    const calm = computeWellnessScore(checkIn({ stressScore: 1, moodScore: 5 }));
    const stressed = computeWellnessScore(checkIn({ stressScore: 9, moodScore: 5 }));
    expect(stressed!.score).toBeLessThan(calm!.score);
  });
});

describe('adherence', () => {
  const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString();

  it('is the percentage of doses taken in the window', () => {
    const events = [
      { status: 'taken', scheduledFor: iso(1) },
      { status: 'taken', scheduledFor: iso(8) },
      { status: 'missed', scheduledFor: iso(15) },
      { status: 'taken', scheduledFor: iso(22) },
    ];
    expect(computeAdherence(events, 28)).toBe(75);
  });

  it('ignores doses outside the window', () => {
    const events = [
      { status: 'taken', scheduledFor: iso(1) },
      { status: 'missed', scheduledFor: iso(200) },
    ];
    expect(computeAdherence(events, 28)).toBe(100);
  });

  it('is null with no doses to judge', () => {
    expect(computeAdherence([], 28)).toBeNull();
  });
});

describe('relapse risk', () => {
  it('is low when weight is stable and check-ins are recent', () => {
    const risk = computeRelapseRisk({
      weights: [weight('2026-01-01', 80), weight('2026-02-01', 79.5)],
      latestCheckIn: checkIn({ moodScore: 7, cravingScore: 2, exerciseMinutes: 150, confidenceScore: 8 }),
      daysSinceLastCheckIn: 5,
    });
    expect(risk.band).toBe('low');
    expect(risk.score).toBeLessThan(30);
  });

  it('rises sharply with more than 10% regain from the lowest weight', () => {
    const risk = computeRelapseRisk({
      weights: [weight('2026-01-01', 90), weight('2026-03-01', 70), weight('2026-06-01', 79)],
      latestCheckIn: null,
      daysSinceLastCheckIn: 10,
    });
    expect(risk.signals.join(' ')).toMatch(/10%/);
    expect(risk.score).toBeGreaterThanOrEqual(35);
  });

  it('counts a long silence as a risk signal', () => {
    const risk = computeRelapseRisk({
      weights: [weight('2026-01-01', 80)],
      latestCheckIn: null,
      daysSinceLastCheckIn: 90,
    });
    expect(risk.signals.join(' ')).toMatch(/six weeks/i);
  });

  it('always returns an actionable recommendation', () => {
    const risk = computeRelapseRisk({ weights: [], latestCheckIn: null, daysSinceLastCheckIn: 0 });
    expect(risk.recommendation.length).toBeGreaterThan(20);
  });
});
