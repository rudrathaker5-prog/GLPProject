/**
 * reminder-dispatch
 *
 * Server-side scheduler. Run every 5 minutes from pg_cron or an external cron:
 *
 *   select cron.schedule(
 *     'reminder-dispatch', '*_/5 * * * *',
 *     $$ select net.http_post(
 *          url := 'https://<project>.functions.supabase.co/reminder-dispatch',
 *          headers := '{"Authorization":"Bearer <service-role-key>"}'::jsonb
 *        ) $$
 *   );
 *
 * Responsibilities
 *  1. Fire due reminder_schedules across every enabled channel.
 *  2. Advance repeating reminders to their next occurrence.
 *  3. Flag medications that are approaching a refill.
 *  4. Mark overdue doses as missed.
 *  5. Queue passive check-ins and vigilance follow-ups (3/6/12 months).
 *
 * Local notifications on the device cover the offline case; this covers the
 * "phone was off / app never opened" case and anything cross-device.
 */
import { errorResponse, handlePreflight, jsonResponse } from '../_shared/cors.ts';
import { serviceClient } from '../_shared/supabase.ts';
import { sendExpoPush } from '../_shared/push.ts';
import { sendWhatsAppTemplate } from '../_shared/whatsapp.ts';

const BATCH_SIZE = 200;

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  const authHeader = req.headers.get('Authorization') ?? '';
  const expected = `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`;
  const cronSecret = Deno.env.get('CRON_SECRET');
  const providedSecret = req.headers.get('x-cron-secret');

  const authorised =
    authHeader === expected || (cronSecret && providedSecret === cronSecret);
  if (!authorised) return errorResponse('Unauthorised', 401);

  const supabase = serviceClient();
  const now = new Date();
  const summary = {
    remindersFired: 0,
    pushSent: 0,
    whatsappSent: 0,
    refillsFlagged: 0,
    dosesMissed: 0,
    checkInsQueued: 0,
    errors: [] as string[],
  };

  // ---- 1. Due reminders ---------------------------------------------------
  const { data: due, error: dueError } = await supabase
    .from('reminder_schedules')
    .select('*')
    .eq('active', true)
    .lte('next_fire_at', now.toISOString())
    .limit(BATCH_SIZE);

  if (dueError) summary.errors.push(`due query: ${dueError.message}`);

  for (const reminder of due ?? []) {
    try {
      const { data: settings } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', reminder.user_id)
        .maybeSingle();

      if (!categoryEnabled(reminder.category, settings)) {
        await advance(supabase, reminder);
        continue;
      }

      if (inQuietHours(now, settings)) {
        // Push it to the end of quiet hours rather than dropping it.
        const next = endOfQuietHours(now, settings);
        await supabase
          .from('reminder_schedules')
          .update({ next_fire_at: next.toISOString() })
          .eq('id', reminder.id);
        continue;
      }

      await supabase.from('notifications').insert({
        user_id: reminder.user_id,
        category: reminder.category,
        title: reminder.title,
        body: reminder.body,
        channel: 'push',
        deep_link: deepLinkFor(reminder.category, reminder.reference_id),
        sent_at: now.toISOString(),
      });

      if (reminder.channels.includes('push')) {
        const { data: tokens } = await supabase
          .from('push_tokens')
          .select('token')
          .eq('user_id', reminder.user_id);
        const sent = await sendExpoPush(
          (tokens ?? []).map((t: { token: string }) => t.token),
          {
            title: reminder.title,
            body: reminder.body,
            data: {
              category: reminder.category,
              referenceId: reminder.reference_id,
              deepLink: deepLinkFor(reminder.category, reminder.reference_id),
            },
          },
        );
        summary.pushSent += sent;
      }

      if (reminder.channels.includes('whatsapp') && settings?.whatsapp_opt_in) {
        const ok = await sendWhatsAppTemplate({
          to: settings.whatsapp_number,
          category: reminder.category,
          variables: [reminder.title, reminder.body],
        });
        if (ok) summary.whatsappSent += 1;
      }

      summary.remindersFired += 1;
      await advance(supabase, reminder);
    } catch (error) {
      summary.errors.push(`reminder ${reminder.id}: ${String(error).slice(0, 120)}`);
    }
  }

  // ---- 2. Refill detection ------------------------------------------------
  const { data: medications } = await supabase
    .from('medications')
    .select('id, user_id, name, units_remaining, refill_threshold_days, frequency')
    .eq('active', true)
    .not('units_remaining', 'is', null)
    .limit(BATCH_SIZE);

  for (const med of medications ?? []) {
    const { data: days } = await supabase.rpc('refill_days_remaining', { p_medication: med.id });
    if (days === null || days === undefined) continue;
    if (days > med.refill_threshold_days) continue;

    const { data: existing } = await supabase
      .from('reminder_schedules')
      .select('id')
      .eq('user_id', med.user_id)
      .eq('category', 'refill')
      .eq('reference_id', med.id)
      .eq('active', true)
      .maybeSingle();

    if (existing) continue;

    await supabase.from('reminder_schedules').insert({
      user_id: med.user_id,
      category: 'refill',
      reference_id: med.id,
      title: 'Refill reminder',
      body: `Your ${med.name} runs out in about ${days} day${days === 1 ? '' : 's'}. Arrange a refill so you do not miss a dose.`,
      next_fire_at: now.toISOString(),
      channels: ['push', 'local', 'whatsapp'],
    });
    summary.refillsFlagged += 1;
  }

  // ---- 3. Missed doses ----------------------------------------------------
  const { data: expired } = await supabase.rpc('expire_overdue_doses', { p_grace_hours: 12 });
  summary.dosesMissed = typeof expired === 'number' ? expired : 0;

  // ---- 4. Passive & vigilance check-ins -----------------------------------
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, stage, treatment_completed_at')
    .in('stage', ['treatment', 'vigilance'])
    .limit(500);

  for (const profile of profiles ?? []) {
    const { data: lastCheckIn } = await supabase
      .from('check_ins')
      .select('occurred_at')
      .eq('user_id', profile.id)
      .order('occurred_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const intervalDays = profile.stage === 'treatment' ? 3 : 30;
    const lastAt = lastCheckIn?.occurred_at ? new Date(lastCheckIn.occurred_at) : null;
    const dueNow =
      !lastAt || now.getTime() - lastAt.getTime() > intervalDays * 86_400_000;

    if (!dueNow) continue;

    const { data: pending } = await supabase
      .from('reminder_schedules')
      .select('id')
      .eq('user_id', profile.id)
      .eq('category', 'checkin')
      .eq('active', true)
      .maybeSingle();
    if (pending) continue;

    await supabase.from('reminder_schedules').insert({
      user_id: profile.id,
      category: 'checkin',
      title: 'Quick check-in',
      body:
        profile.stage === 'treatment'
          ? 'How have the last few days been? It takes a minute and helps me support you better.'
          : 'Monthly check-in time — how has maintenance been going?',
      next_fire_at: new Date(now.getTime() + 60_000).toISOString(),
      channels: ['push', 'local'],
    });
    summary.checkInsQueued += 1;
  }

  return jsonResponse({ ok: true, at: now.toISOString(), ...summary });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function categoryEnabled(category: string, settings: Record<string, any> | null): boolean {
  if (!settings) return true;
  switch (category) {
    case 'medication':
      return settings.medication_reminders_enabled !== false;
    case 'refill':
      return settings.refill_reminders_enabled !== false;
    case 'appointment':
      return settings.appointment_reminders_enabled !== false;
    case 'checkin':
      return settings.checkin_reminders_enabled !== false;
    case 'motivation':
    case 'milestone':
      return settings.motivation_nudges_enabled !== false;
    default:
      return true;
  }
}

function parseTime(value?: string | null): { h: number; m: number } | null {
  if (!value) return null;
  const [h, m] = value.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return { h, m };
}

/** Quiet hours are evaluated in IST, which is where the service operates. */
function istParts(date: Date): { h: number; m: number } {
  const ist = new Date(date.getTime() + 5.5 * 3600_000);
  return { h: ist.getUTCHours(), m: ist.getUTCMinutes() };
}

function inQuietHours(now: Date, settings: Record<string, any> | null): boolean {
  const start = parseTime(settings?.quiet_hours_start);
  const end = parseTime(settings?.quiet_hours_end);
  if (!start || !end) return false;

  const { h, m } = istParts(now);
  const cur = h * 60 + m;
  const s = start.h * 60 + start.m;
  const e = end.h * 60 + end.m;

  return s <= e ? cur >= s && cur < e : cur >= s || cur < e;
}

function endOfQuietHours(now: Date, settings: Record<string, any> | null): Date {
  const end = parseTime(settings?.quiet_hours_end) ?? { h: 7, m: 0 };
  const ist = new Date(now.getTime() + 5.5 * 3600_000);
  ist.setUTCHours(end.h, end.m, 0, 0);
  let target = new Date(ist.getTime() - 5.5 * 3600_000);
  if (target <= now) target = new Date(target.getTime() + 86_400_000);
  return target;
}

function deepLinkFor(category: string, referenceId: string | null): string {
  switch (category) {
    case 'medication':
      return 'glpcare://medication';
    case 'refill':
      return referenceId ? `glpcare://refill/${referenceId}` : 'glpcare://medication';
    case 'appointment':
      return referenceId ? `glpcare://appointment/${referenceId}` : 'glpcare://appointments';
    case 'checkin':
      return 'glpcare://checkin';
    case 'relapse':
      return 'glpcare://vigilance';
    case 'doctor_note':
      return referenceId ? `glpcare://doctor-notes/${referenceId}` : 'glpcare://doctor-notes';
    default:
      return 'glpcare://home';
  }
}

async function advance(
  supabase: ReturnType<typeof serviceClient>,
  reminder: Record<string, any>,
): Promise<void> {
  const rule = reminder.repeat_rule as
    | { frequency: string; interval?: number; weekday?: number; hour: number; minute: number }
    | null;

  if (!rule) {
    await supabase.from('reminder_schedules').update({ active: false }).eq('id', reminder.id);
    return;
  }

  const current = new Date(reminder.next_fire_at);
  const next = new Date(current);

  switch (rule.frequency) {
    case 'daily':
      next.setDate(next.getDate() + (rule.interval ?? 1));
      break;
    case 'weekly':
      next.setDate(next.getDate() + 7 * (rule.interval ?? 1));
      break;
    case 'monthly':
      next.setMonth(next.getMonth() + (rule.interval ?? 1));
      break;
    case 'interval':
      next.setDate(next.getDate() + (rule.interval ?? 1));
      break;
    default:
      await supabase.from('reminder_schedules').update({ active: false }).eq('id', reminder.id);
      return;
  }

  // Never leave a reminder in the past after a long outage.
  const now = Date.now();
  while (next.getTime() <= now) {
    next.setDate(next.getDate() + (rule.frequency === 'weekly' ? 7 : 1));
  }

  await supabase
    .from('reminder_schedules')
    .update({ next_fire_at: next.toISOString() })
    .eq('id', reminder.id);
}
