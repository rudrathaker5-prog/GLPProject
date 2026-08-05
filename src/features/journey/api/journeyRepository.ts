import { COLLECTIONS, findBy, newId, nowIso, update, upsert } from '@core/data/localDb';
import type {
  JourneyEvent,
  JourneyEventType,
  JourneyStage,
  Milestone,
  MilestoneCode,
} from '@core/domain/types';
import { supabase } from '@core/supabase/client';
import type { Json, JourneyEventRow, MilestoneRow } from '@core/supabase/database.types';
import { currentOwnerId, useAuthStore } from '@features/auth/store/authStore';
import { celebrateMilestone } from '@features/notifications/service/notificationService';

export interface JourneyEventInput {
  type: JourneyEventType;
  title: string;
  description?: string | null;
  occurredAt?: string;
  stage?: JourneyStage;
  metadata?: Record<string, unknown> | null;
}

export async function addJourneyEvent(input: JourneyEventInput): Promise<JourneyEvent> {
  const { userId, stage } = useAuthStore.getState();

  const event: JourneyEvent = {
    id: newId(),
    userId: userId ?? currentOwnerId(),
    type: input.type,
    title: input.title,
    description: input.description ?? null,
    occurredAt: input.occurredAt ?? nowIso(),
    stage: input.stage ?? stage,
    metadata: input.metadata ?? null,
  };

  if (userId && supabase) {
    const { data, error } = await supabase
      .from('journey_events')
      .insert({
        user_id: userId,
        type: event.type,
        title: event.title,
        description: event.description,
        occurred_at: event.occurredAt,
        stage: event.stage,
        metadata: event.metadata as Json,
      })
      .select()
      .single();
    if (!error && data) return fromRow(data as JourneyEventRow);
  }

  await upsert(COLLECTIONS.journey, event);
  return event;
}

export async function listJourneyEvents(): Promise<JourneyEvent[]> {
  const { userId } = useAuthStore.getState();

  if (userId && supabase) {
    const { data, error } = await supabase
      .from('journey_events')
      .select('*')
      .eq('user_id', userId)
      .order('occurred_at', { ascending: false })
      .limit(200);
    if (!error && data) return (data as JourneyEventRow[]).map(fromRow);
  }

  const owner = currentOwnerId();
  const rows = await findBy<JourneyEvent>(COLLECTIONS.journey, (e) => e.userId === owner);
  return rows.sort(
    (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
  );
}

// ---------------------------------------------------------------------------
// Milestones
// ---------------------------------------------------------------------------

export const MILESTONE_LABELS: Record<MilestoneCode, { title: string; body: string }> = {
  weight_loss_5: {
    title: '5% down',
    body: 'A 5% loss already improves blood sugar, blood pressure and joint load. This is the threshold doctors look for.',
  },
  weight_loss_10: {
    title: '10% down',
    body: 'At 10%, sleep apnoea, fatty liver and cholesterol all measurably improve. This is a serious clinical result.',
  },
  weight_loss_15: {
    title: '15% down',
    body: 'Fifteen percent puts you in the range where type 2 diabetes remission becomes realistic for many people.',
  },
  weight_loss_20: {
    title: '20% down',
    body: 'Twenty percent is the range usually associated with bariatric surgery. You have done something remarkable.',
  },
  adherence_streak_4w: {
    title: '4 weeks of consistency',
    body: 'Four weeks without a missed dose. Consistency is what makes the medicine work.',
  },
  adherence_streak_12w: {
    title: '12 weeks of consistency',
    body: 'Three months of steady adherence — this is the habit that carries the whole treatment.',
  },
  exercise_streak_7d: { title: '7 days of movement', body: 'A week of moving every day. That is the hard part done.' },
  exercise_streak_30d: {
    title: '30 days of movement',
    body: 'A month of daily movement. This is now a habit, not a project.',
  },
  nutrition_streak_7d: { title: '7 days on plan', body: 'A full week of hitting your nutrition targets.' },
  nutrition_streak_30d: {
    title: '30 days on plan',
    body: 'A month of protein at every meal. Your muscle is thanking you.',
  },
  checkin_streak_4w: {
    title: '4 weeks of check-ins',
    body: 'Consistent tracking is how problems get caught early.',
  },
  treatment_complete: {
    title: 'Treatment completed',
    body: 'You finished the active phase. Maintenance is the next skill, and you already have the foundation.',
  },
  maintenance_6m: {
    title: '6 months maintained',
    body: 'Six months of holding your loss. Maintenance is harder than losing, and you are doing it.',
  },
  maintenance_12m: {
    title: 'A year maintained',
    body: 'Twelve months. At this point the new weight is genuinely yours.',
  },
};

export async function listMilestones(): Promise<Milestone[]> {
  const { userId } = useAuthStore.getState();

  if (userId && supabase) {
    const { data, error } = await supabase
      .from('milestones')
      .select('*')
      .eq('user_id', userId)
      .order('achieved_at', { ascending: false });
    if (!error && data) {
      return (data as MilestoneRow[]).map((m) => ({
        id: m.id,
        userId: m.user_id,
        code: m.code,
        achievedAt: m.achieved_at,
        celebrated: m.celebrated,
        value: m.value,
      }));
    }
  }

  const owner = currentOwnerId();
  return findBy<Milestone>(COLLECTIONS.milestones, (m) => m.userId === owner);
}

export async function awardMilestone(code: MilestoneCode, value?: number): Promise<boolean> {
  const existing = await listMilestones();
  if (existing.some((m) => m.code === code)) return false;

  const { userId } = useAuthStore.getState();
  const milestone: Milestone = {
    id: newId(),
    userId: userId ?? currentOwnerId(),
    code,
    achievedAt: nowIso(),
    celebrated: false,
    value: value ?? null,
  };

  if (userId && supabase) {
    await supabase
      .from('milestones')
      .upsert(
        { user_id: userId, code, value: value ?? null },
        { onConflict: 'user_id,code', ignoreDuplicates: true },
      );
  } else {
    await upsert(COLLECTIONS.milestones, milestone);
  }

  const label = MILESTONE_LABELS[code];
  await addJourneyEvent({
    type: 'milestone',
    title: label.title,
    description: label.body,
    metadata: { code, value },
  });
  await celebrateMilestone(label.title, label.body);

  return true;
}

export async function markMilestoneCelebrated(id: string): Promise<void> {
  const { userId } = useAuthStore.getState();
  if (userId && supabase) {
    await supabase.from('milestones').update({ celebrated: true }).eq('id', id);
    return;
  }
  await update<Milestone>(COLLECTIONS.milestones, id, { celebrated: true });
}

/** Evaluates weight-loss milestones after a new measurement. */
export async function evaluateWeightMilestones(
  startingWeightKg: number | null,
  currentWeightKg: number,
): Promise<MilestoneCode[]> {
  if (!startingWeightKg || startingWeightKg <= 0) return [];
  const percent = ((startingWeightKg - currentWeightKg) / startingWeightKg) * 100;

  const thresholds: [number, MilestoneCode][] = [
    [20, 'weight_loss_20'],
    [15, 'weight_loss_15'],
    [10, 'weight_loss_10'],
    [5, 'weight_loss_5'],
  ];

  const awarded: MilestoneCode[] = [];
  for (const [threshold, code] of thresholds) {
    if (percent >= threshold) {
      const isNew = await awardMilestone(code, Math.round(percent * 10) / 10);
      if (isNew) awarded.push(code);
    }
  }
  return awarded;
}

function fromRow(row: JourneyEventRow): JourneyEvent {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    title: row.title,
    description: row.description,
    occurredAt: row.occurred_at,
    stage: row.stage,
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
  };
}
