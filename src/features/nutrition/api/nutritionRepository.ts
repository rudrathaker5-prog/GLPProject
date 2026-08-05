import { COLLECTIONS, findBy, newId, nowIso, upsert } from '@core/data/localDb';
import type { MealGuidance, NutritionLog, NutritionPlan } from '@core/domain/types';
import { supabase } from '@core/supabase/client';
import type { Json, NutritionLogRow, NutritionPlanRow } from '@core/supabase/database.types';
import { currentOwnerId, useAuthStore } from '@features/auth/store/authStore';
import { getProfile } from '@features/profile/api/profileRepository';

/**
 * Nutrition plans are generated from the patient's own targets using ICMR-NIN
 * guidance: 1.2-1.6 g protein per kg of target weight, 2.5-3 L water, 30 g fibre,
 * half the plate vegetables. The plan is deterministic — the AI coach explains
 * and adapts it, it does not invent the numbers.
 */

const INDIAN_MEALS: MealGuidance[] = [
  {
    meal: 'breakfast',
    guidance:
      'Start with protein. On appetite-lowering medicines breakfast is often the meal that gets skipped, and that is where most of the protein gap comes from.',
    examples: [
      'Besan chilla with curd',
      'Moong dal chilla + 2 boiled eggs',
      'Paneer bhurji with 1 multigrain roti',
      'Oats with milk, nuts and seeds',
      'Idli with sambar (extra dal)',
    ],
    proteinG: 20,
  },
  {
    meal: 'lunch',
    guidance:
      'Half the plate vegetables, a quarter protein, a quarter grain. Serve dal or curd in a proper katori, not as a garnish.',
    examples: [
      'Rajma + 1 katori brown rice + salad',
      '2 jowar roti + paneer sabzi + dahi',
      'Fish curry + rice + sautéed vegetables',
      'Chana masala + roti + cucumber salad',
    ],
    proteinG: 25,
  },
  {
    meal: 'snack',
    guidance:
      'Plan the 5 pm snack. This is where most unplanned eating happens, and hunger at this hour is usually thirst or tiredness.',
    examples: [
      'Roasted chana (1 mutthi)',
      'Buttermilk / chaas',
      'Sprouts chaat',
      'A handful of almonds and walnuts',
      'Greek-style dahi with fruit',
    ],
    proteinG: 10,
  },
  {
    meal: 'dinner',
    guidance:
      'Keep it lighter and earlier. Slowed stomach emptying plus a heavy late meal is the most common cause of overnight nausea.',
    examples: [
      'Grilled chicken / tofu + vegetables',
      'Dal khichdi with vegetables + dahi',
      '2 roti + mixed vegetable + dal',
      'Vegetable soup + paneer tikka',
    ],
    proteinG: 20,
  },
];

const BEHAVIOUR_GOALS = [
  'Eat slowly and stop at comfortably full, not stuffed',
  'Protein first at every meal, before the grain',
  'Water within reach all day — aim for a glass every waking hour',
  'No screens while eating',
  'Plan the 5 pm snack instead of deciding when hungry',
  'Two resistance sessions a week, non-negotiable',
];

export async function getActivePlan(): Promise<NutritionPlan | null> {
  const { userId } = useAuthStore.getState();

  if (userId && supabase) {
    const { data, error } = await supabase
      .from('nutrition_plans')
      .select('*')
      .eq('user_id', userId)
      .eq('active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!error && data) return toPlan(data as NutritionPlanRow);
  }

  const owner = currentOwnerId();
  const rows = await findBy<NutritionPlan>(
    COLLECTIONS.nutritionPlans,
    (p) => p.userId === owner && p.active,
  );
  return rows[0] ?? null;
}

/** Creates (or refreshes) a plan from the patient's current targets. */
export async function generatePlan(): Promise<NutritionPlan> {
  const profile = await getProfile();
  const { userId, ensureIdentity } = useAuthStore.getState();

  const targetWeight =
    profile.targetWeightKg ??
    (profile.startingWeightKg ? Math.round(profile.startingWeightKg * 0.85) : 65);

  const proteinTarget = Math.round(targetWeight * 1.4);
  const waterTarget = targetWeight > 80 ? 3 : 2.5;

  const plan: NutritionPlan = {
    id: newId(),
    userId: userId ?? currentOwnerId(),
    createdAt: nowIso(),
    proteinTargetG: proteinTarget,
    calorieTarget: null,
    waterTargetLitres: waterTarget,
    fibreTargetG: 30,
    mealGuidance: INDIAN_MEALS,
    behaviourGoals: BEHAVIOUR_GOALS,
    notes:
      'Protein target is 1.4 g per kg of target body weight — the middle of the 1.2-1.6 range that protects muscle during medical weight loss. Adjust with your doctor if you have kidney disease.',
    active: true,
  };

  const identity = userId ?? (await ensureIdentity());

  if (identity && supabase) {
    await supabase
      .from('nutrition_plans')
      .update({ active: false })
      .eq('user_id', identity)
      .eq('active', true);

    const { data, error } = await supabase
      .from('nutrition_plans')
      .insert({
        user_id: identity,
        protein_target_g: plan.proteinTargetG,
        water_target_litres: plan.waterTargetLitres,
        fibre_target_g: plan.fibreTargetG,
        meal_guidance: plan.mealGuidance as unknown as Json,
        behaviour_goals: plan.behaviourGoals,
        notes: plan.notes,
        active: true,
      })
      .select()
      .single();
    if (!error && data) return toPlan(data as NutritionPlanRow);
  }

  const existing = await findBy<NutritionPlan>(
    COLLECTIONS.nutritionPlans,
    (p) => p.userId === plan.userId,
  );
  for (const old of existing) {
    await upsert(COLLECTIONS.nutritionPlans, { ...old, active: false });
  }
  await upsert(COLLECTIONS.nutritionPlans, plan);
  return plan;
}

export async function logNutrition(input: {
  proteinG?: number | null;
  waterLitres?: number | null;
  vegetableServings?: number | null;
  notes?: string | null;
  loggedOn?: string;
}): Promise<NutritionLog> {
  const { userId } = useAuthStore.getState();
  const loggedOn = input.loggedOn ?? new Date().toISOString().slice(0, 10);
  const plan = await getActivePlan();

  const adherence = plan
    ? Math.round(
        (Math.min(1, (input.proteinG ?? 0) / plan.proteinTargetG) * 0.5 +
          Math.min(1, (input.waterLitres ?? 0) / plan.waterTargetLitres) * 0.25 +
          Math.min(1, (input.vegetableServings ?? 0) / 5) * 0.25) *
          100,
      )
    : null;

  if (userId && supabase) {
    const { data, error } = await supabase
      .from('nutrition_logs')
      .upsert(
        {
          user_id: userId,
          logged_on: loggedOn,
          protein_g: input.proteinG ?? null,
          water_litres: input.waterLitres ?? null,
          vegetable_servings: input.vegetableServings ?? null,
          adherence_score: adherence,
          notes: input.notes ?? null,
        },
        { onConflict: 'user_id,logged_on' },
      )
      .select()
      .single();
    if (!error && data) return toLog(data as NutritionLogRow);
  }

  const log: NutritionLog = {
    id: newId(),
    userId: currentOwnerId(),
    loggedOn,
    proteinG: input.proteinG ?? null,
    waterLitres: input.waterLitres ?? null,
    vegetableServings: input.vegetableServings ?? null,
    adherenceScore: adherence,
    notes: input.notes ?? null,
  };
  await upsert(
    COLLECTIONS.nutritionLogs,
    log,
    (a, b) => a.userId === b.userId && a.loggedOn === b.loggedOn,
  );
  return log;
}

export async function listNutritionLogs(days = 30): Promise<NutritionLog[]> {
  const { userId } = useAuthStore.getState();
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

  if (userId && supabase) {
    const { data, error } = await supabase
      .from('nutrition_logs')
      .select('*')
      .eq('user_id', userId)
      .gte('logged_on', since)
      .order('logged_on', { ascending: false });
    if (!error && data) return (data as NutritionLogRow[]).map(toLog);
  }

  const owner = currentOwnerId();
  const rows = await findBy<NutritionLog>(
    COLLECTIONS.nutritionLogs,
    (l) => l.userId === owner && l.loggedOn >= since,
  );
  return rows.sort((a, b) => b.loggedOn.localeCompare(a.loggedOn));
}

/** Weekly adherence, used by the coach and the dashboard. */
export async function weeklyAdherence(): Promise<number | null> {
  const logs = await listNutritionLogs(7);
  const scored = logs.filter((l) => l.adherenceScore !== null);
  if (scored.length === 0) return null;
  return Math.round(
    scored.reduce((sum, l) => sum + (l.adherenceScore ?? 0), 0) / scored.length,
  );
}

function toPlan(row: NutritionPlanRow): NutritionPlan {
  return {
    id: row.id,
    userId: row.user_id,
    createdAt: row.created_at,
    proteinTargetG: row.protein_target_g,
    calorieTarget: row.calorie_target,
    waterTargetLitres: Number(row.water_target_litres),
    fibreTargetG: row.fibre_target_g,
    mealGuidance: (row.meal_guidance as unknown as MealGuidance[]) ?? INDIAN_MEALS,
    behaviourGoals: row.behaviour_goals ?? BEHAVIOUR_GOALS,
    notes: row.notes,
    active: row.active,
  };
}

function toLog(row: NutritionLogRow): NutritionLog {
  return {
    id: row.id,
    userId: row.user_id,
    loggedOn: row.logged_on,
    proteinG: row.protein_g === null ? null : Number(row.protein_g),
    waterLitres: row.water_litres === null ? null : Number(row.water_litres),
    vegetableServings: row.vegetable_servings,
    adherenceScore: row.adherence_score,
    notes: row.notes,
  };
}

export { INDIAN_MEALS, BEHAVIOUR_GOALS };
