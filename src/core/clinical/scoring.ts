import type {
  CheckIn,
  RelapseRisk,
  SideEffectReport,
  WeightEntry,
  WellnessScore,
} from '@core/domain/types';

/**
 * Client-side mirrors of the SQL scoring functions so the app produces the same
 * numbers offline as the backend does online. Keep in sync with
 * `supabase/migrations/20260101000100_functions_and_triggers.sql`.
 */

interface WeightedDriver {
  key: keyof CheckIn;
  label: string;
  weight: number;
  /** Normalises the raw value to 0-100 where higher is better. */
  normalise: (value: number) => number;
}

const DRIVERS: WeightedDriver[] = [
  { key: 'moodScore', label: 'Mood', weight: 0.18, normalise: (v) => v * 10 },
  { key: 'energyScore', label: 'Energy', weight: 0.15, normalise: (v) => v * 10 },
  { key: 'sleepQuality', label: 'Sleep', weight: 0.14, normalise: (v) => v * 10 },
  { key: 'stressScore', label: 'Stress', weight: 0.13, normalise: (v) => (10 - v) * 10 },
  { key: 'nutritionAdherence', label: 'Nutrition', weight: 0.15, normalise: (v) => v },
  { key: 'medicationAdherence', label: 'Medication', weight: 0.15, normalise: (v) => v },
  {
    key: 'exerciseMinutes',
    label: 'Activity',
    weight: 0.1,
    normalise: (v) => Math.min(v / 150, 1) * 100,
  },
];

export function computeWellnessScore(checkIn: Partial<CheckIn>): WellnessScore | null {
  let total = 0;
  let weightSum = 0;
  const drivers: { label: string; delta: number }[] = [];

  for (const driver of DRIVERS) {
    const raw = checkIn[driver.key];
    if (typeof raw !== 'number') continue;
    const normalised = driver.normalise(raw);
    total += normalised * driver.weight;
    weightSum += driver.weight;
    drivers.push({ label: driver.label, delta: Math.round(normalised - 60) });
  }

  if (weightSum === 0) return null;

  const sideEffects = (checkIn.sideEffects ?? []) as SideEffectReport[];
  const severe = sideEffects.filter((s) => s.severity === 'severe').length;
  const penalty = severe * 12 + sideEffects.length * 2;

  const score = Math.max(0, Math.min(100, Math.round(total / weightSum) - penalty));

  return {
    score,
    band: score >= 75 ? 'thriving' : score >= 55 ? 'steady' : score >= 35 ? 'needs_attention' : 'at_risk',
    drivers: drivers.sort((a, b) => a.delta - b.delta).slice(0, 4),
  };
}

/**
 * Relapse risk for the post-treatment vigilance stage. Mirrors
 * `compute_relapse_risk` in SQL.
 */
export function computeRelapseRisk(params: {
  weights: WeightEntry[];
  latestCheckIn?: CheckIn | null;
  daysSinceLastCheckIn?: number | null;
}): RelapseRisk {
  const { weights, latestCheckIn } = params;
  let score = 0;
  const signals: string[] = [];

  if (weights.length > 0) {
    const nadir = Math.min(...weights.map((w) => w.weightKg));
    const sorted = [...weights].sort(
      (a, b) => new Date(b.recordedOn).getTime() - new Date(a.recordedOn).getTime(),
    );
    const current = sorted[0]?.weightKg;
    if (current && nadir > 0) {
      const regain = ((current - nadir) / nadir) * 100;
      if (regain >= 10) {
        score += 35;
        signals.push('Weight is more than 10% above your lowest');
      } else if (regain >= 5) {
        score += 20;
        signals.push('Weight is drifting up from your lowest');
      } else if (regain >= 3) {
        score += 10;
        signals.push('Small upward weight drift');
      }
    }
  }

  if (latestCheckIn) {
    if ((latestCheckIn.cravingScore ?? 0) >= 7) {
      score += 15;
      signals.push('Strong cravings reported');
    }
    if (latestCheckIn.moodScore !== null && latestCheckIn.moodScore <= 3) {
      score += 15;
      signals.push('Low mood reported');
    }
    if ((latestCheckIn.stressScore ?? 0) >= 7) {
      score += 10;
      signals.push('High stress reported');
    }
    if (latestCheckIn.exerciseMinutes !== null && latestCheckIn.exerciseMinutes < 60) {
      score += 10;
      signals.push('Activity has dropped below 60 min/week');
    }
    if (latestCheckIn.confidenceScore !== null && latestCheckIn.confidenceScore <= 4) {
      score += 10;
      signals.push('Low confidence in maintaining progress');
    }
  }

  const daysSince = params.daysSinceLastCheckIn ?? (latestCheckIn ? 0 : 999);
  if (daysSince > 45) {
    score += 15;
    signals.push('No check-in for over six weeks');
  }

  score = Math.min(100, score);
  const band: RelapseRisk['band'] = score >= 60 ? 'high' : score >= 30 ? 'moderate' : 'low';

  return {
    score,
    band,
    signals,
    recommendation:
      band === 'high'
        ? 'Book a review with your doctor this week and restart daily logging.'
        : band === 'moderate'
          ? 'Tighten the basics for two weeks: protein at every meal, 7,000 steps, weekly weigh-in.'
          : 'You are holding steady. Keep your weekly weigh-in and monthly check-in going.',
  };
}

/** Adherence over a window of dose events. */
export function computeAdherence(
  events: { status: string; scheduledFor: string }[],
  windowDays = 28,
): number | null {
  const cutoff = Date.now() - windowDays * 86_400_000;
  const relevant = events.filter((e) => {
    const t = new Date(e.scheduledFor).getTime();
    return t >= cutoff && t <= Date.now();
  });
  if (relevant.length === 0) return null;
  const taken = relevant.filter((e) => e.status === 'taken').length;
  return Math.round((taken / relevant.length) * 100);
}

/** Consecutive-day streak from a list of ISO dates. */
export function computeStreak(dates: string[]): number {
  if (dates.length === 0) return 0;
  const days = new Set(dates.map((d) => d.slice(0, 10)));
  let streak = 0;
  const cursor = new Date();
  for (;;) {
    const key = cursor.toISOString().slice(0, 10);
    if (days.has(key)) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    } else if (streak === 0) {
      // Allow "today not logged yet" without breaking yesterday's streak.
      cursor.setDate(cursor.getDate() - 1);
      if (!days.has(cursor.toISOString().slice(0, 10))) return 0;
    } else {
      break;
    }
  }
  return streak;
}
