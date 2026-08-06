import { COLLECTIONS, newId, nowIso, readCollection, upsert } from '@core/data/localDb';
import type { SideEffectCode } from '@core/domain/types';
import { currentOwnerId } from '@features/auth/store/authStore';
import {
  latestWeight,
  listCheckIns,
  listWeights,
} from '@features/tracking/api/trackingRepository';

/**
 * The maintenance phase, as data rather than as a screen.
 *
 * Vigilance had three screens and no repository — every number on them was
 * derived inline from tracking data. That was fine while the tab only showed a
 * risk score, but the checkpoints (3, 6 and 12 months) are things that happen
 * to a patient over a year, and they need somewhere to live: whether each one
 * was reached, what the weight was at the time, and whether the person acted on
 * it. Without that, "you are due your 6-month check" is a guess from a date.
 */

export type CheckpointMonth = 3 | 6 | 12;

export const CHECKPOINT_MONTHS: CheckpointMonth[] = [3, 6, 12];

export interface VigilanceCheckpoint {
  id: string;
  userId: string | null;
  month: CheckpointMonth;
  /** When this checkpoint becomes due, derived from the completion date. */
  dueAt: string;
  completedAt: string | null;
  weightKg: number | null;
  /** Percent above the lowest weight ever recorded, at the time of the check. */
  driftPercent: number | null;
  note: string | null;
}

export interface CheckpointStatus extends VigilanceCheckpoint {
  state: 'upcoming' | 'due' | 'overdue' | 'done';
  daysUntilDue: number;
}

/**
 * The threshold at which the relapse protocol says to act.
 *
 * 3% above the lowest weight reached. Chosen because it is early enough to be
 * reversible with behaviour alone and late enough not to fire on normal daily
 * fluctuation — and because a number the patient agreed to in advance is much
 * easier to act on than a judgement made while it is happening.
 */
export const ACTION_THRESHOLD_PERCENT = 3;

function daysBetween(fromIso: string, to = Date.now()): number {
  return Math.floor((to - new Date(fromIso).getTime()) / 86_400_000);
}

function addMonths(iso: string, months: number): string {
  const date = new Date(iso);
  date.setMonth(date.getMonth() + months);
  return date.toISOString();
}

/**
 * The three checkpoints with their live state.
 *
 * Derived from the completion date rather than stored, so a patient who
 * corrects their completion date in Profile does not end up with checkpoints
 * that disagree with it. Only the *outcome* of a checkpoint is persisted.
 */
export async function listCheckpoints(
  treatmentCompletedAt: string | null,
): Promise<CheckpointStatus[]> {
  if (!treatmentCompletedAt) return [];

  const owner = currentOwnerId();
  const stored = (await readCollection<VigilanceCheckpoint>(COLLECTIONS.vigilanceCheckpoints))
    .filter((row) => !owner || !row.userId || row.userId === owner);

  return CHECKPOINT_MONTHS.map((month) => {
    const dueAt = addMonths(treatmentCompletedAt, month);
    const existing = stored.find((row) => row.month === month);

    const base: VigilanceCheckpoint = existing ?? {
      id: newId(),
      userId: owner,
      month,
      dueAt,
      completedAt: null,
      weightKg: null,
      driftPercent: null,
      note: null,
    };

    const daysUntilDue = -daysBetween(dueAt);

    const state: CheckpointStatus['state'] = base.completedAt
      ? 'done'
      : daysUntilDue > 14
        ? 'upcoming'
        : daysUntilDue >= -14
          ? 'due'
          : 'overdue';

    return { ...base, dueAt, state, daysUntilDue };
  });
}

/** Records that a checkpoint was done, with the weight it was done at. */
export async function completeCheckpoint(input: {
  month: CheckpointMonth;
  dueAt: string;
  weightKg?: number | null;
  note?: string | null;
}): Promise<VigilanceCheckpoint> {
  const [current, nadir] = await Promise.all([
    latestWeight().catch(() => null),
    lifetimeNadirKg(),
  ]);

  const weightKg = input.weightKg ?? current?.weightKg ?? null;

  const driftPercent =
    weightKg && nadir && nadir > 0
      ? Math.round(((weightKg - nadir) / nadir) * 1000) / 10
      : null;

  const record: VigilanceCheckpoint = {
    id: newId(),
    userId: currentOwnerId(),
    month: input.month,
    dueAt: input.dueAt,
    completedAt: nowIso(),
    weightKg,
    driftPercent,
    note: input.note?.trim() || null,
  };

  // Keyed on the month, so re-doing a checkpoint updates rather than duplicates.
  await upsert(
    COLLECTIONS.vigilanceCheckpoints,
    record,
    (existing, incoming) =>
      existing.month === incoming.month && existing.userId === incoming.userId,
  );

  return record;
}

/**
 * The lowest weight ever recorded, not the lowest of the last year.
 *
 * `progressSummary().nadirKg` looks at `listWeights(365)`, which is right for a
 * progress chart and wrong here. Maintenance drift is measured from the floor a
 * patient actually reached, and at the 12-month checkpoint — the exact moment
 * this feature exists for — the real nadir has aged out of a 365-day window.
 *
 * Concretely: treatment ends at 72 kg, a year later the lowest reading still in
 * the window is 76 kg and the patient is 78 kg. Against the 365-day nadir that
 * is 2.6% and "holding". Against the real one it is 8.3%, well past the action
 * threshold, and the relapse protocol should have been offered months ago.
 */
async function lifetimeNadirKg(): Promise<number | null> {
  const entries = await listWeights(3650).catch(() => []);
  if (entries.length === 0) return null;
  return Math.min(...entries.map((entry) => entry.weightKg));
}

export interface MaintenanceStatus {
  /** Current weight as a percentage above the lowest ever recorded. */
  driftPercent: number | null;
  /** The weight at which the protocol says to act. */
  actionWeightKg: number | null;
  nadirKg: number | null;
  currentWeightKg: number | null;
  /** True once drift has crossed the agreed threshold. */
  thresholdCrossed: boolean;
  /** Distance to the threshold in kg — negative once crossed. */
  headroomKg: number | null;
  monthsSinceCompletion: number | null;
}

/**
 * Where the patient stands against the threshold they set for themselves.
 *
 * Everything is expressed against the *lowest* weight rather than the starting
 * weight, because relapse is measured from the floor, not the ceiling — someone
 * 20 kg down from where they began and 4 kg up from their lowest is drifting,
 * and framing that as "still 20 kg down" is how a slow regain goes unnoticed
 * for a year.
 */
export async function maintenanceStatus(
  treatmentCompletedAt: string | null,
): Promise<MaintenanceStatus> {
  const [nadirKg, current] = await Promise.all([
    lifetimeNadirKg(),
    latestWeight().catch(() => null),
  ]);

  const currentWeightKg = current?.weightKg ?? null;

  const actionWeightKg = nadirKg
    ? Math.round(nadirKg * (1 + ACTION_THRESHOLD_PERCENT / 100) * 10) / 10
    : null;

  const driftPercent =
    currentWeightKg && nadirKg && nadirKg > 0
      ? Math.round(((currentWeightKg - nadirKg) / nadirKg) * 1000) / 10
      : null;

  return {
    driftPercent,
    actionWeightKg,
    nadirKg,
    currentWeightKg,
    thresholdCrossed: driftPercent !== null && driftPercent >= ACTION_THRESHOLD_PERCENT,
    headroomKg:
      actionWeightKg && currentWeightKg
        ? Math.round((actionWeightKg - currentWeightKg) * 10) / 10
        : null,
    monthsSinceCompletion: treatmentCompletedAt
      ? Math.floor(daysBetween(treatmentCompletedAt) / 30)
      : null,
  };
}

export interface SideEffectTrendEntry {
  code: SideEffectCode;
  /** How many check-ins in the window reported it. */
  occurrences: number;
  worstSeverity: 'mild' | 'moderate' | 'severe';
  lastReportedAt: string;
  /** True when the most recent report is worse than the first in the window. */
  worsening: boolean;
}

/**
 * Side effects across recent check-ins, aggregated.
 *
 * Check-ins already capture side effects one at a time; nothing ever read them
 * back. A single report of nausea is noise — the same symptom in four
 * consecutive check-ins, or one getting worse, is the thing a doctor needs to
 * hear about, and it is exactly what a patient does not notice from the inside.
 */
export async function sideEffectTrend(windowDays = 60): Promise<SideEffectTrendEntry[]> {
  const checkIns = await listCheckIns().catch(() => []);
  const cutoff = Date.now() - windowDays * 86_400_000;

  const rank = { mild: 1, moderate: 2, severe: 3 } as const;
  const byCode = new Map<SideEffectCode, SideEffectTrendEntry & { firstSeverity: number }>();

  const recent = checkIns
    .filter((entry) => new Date(entry.occurredAt).getTime() >= cutoff)
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));

  for (const checkIn of recent) {
    for (const effect of checkIn.sideEffects ?? []) {
      const existing = byCode.get(effect.code);
      const severityRank = rank[effect.severity] ?? 1;

      if (!existing) {
        byCode.set(effect.code, {
          code: effect.code,
          occurrences: 1,
          worstSeverity: effect.severity,
          lastReportedAt: checkIn.occurredAt,
          worsening: false,
          firstSeverity: severityRank,
        });
        continue;
      }

      existing.occurrences += 1;
      existing.lastReportedAt = checkIn.occurredAt;
      if (severityRank > rank[existing.worstSeverity]) existing.worstSeverity = effect.severity;
      existing.worsening = severityRank > existing.firstSeverity;
    }
  }

  return [...byCode.values()]
    .map(({ firstSeverity: _firstSeverity, ...entry }) => entry)
    .sort(
      (a, b) =>
        rank[b.worstSeverity] - rank[a.worstSeverity] || b.occurrences - a.occurrences,
    );
}

/** Side effects that warrant a call rather than a wait-and-see. */
export function needsClinicalReview(trend: SideEffectTrendEntry[]): SideEffectTrendEntry[] {
  return trend.filter(
    (entry) =>
      entry.worstSeverity === 'severe' ||
      entry.worsening ||
      entry.occurrences >= 3 ||
      entry.code === 'severe_abdominal_pain' ||
      entry.code === 'hypoglycaemia',
  );
}
