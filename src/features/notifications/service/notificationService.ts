import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { COLLECTIONS, findBy, newId, nowIso, readCollection, remove, upsert } from '@core/data/localDb';
import type {
  Appointment,
  MedicationItem,
  NotificationCategory,
  ReminderSchedule,
} from '@core/domain/types';
import { supabase } from '@core/supabase/client';
import type { Json } from '@core/supabase/database.types';
import { currentOwnerId, useAuthStore } from '@features/auth/store/authStore';
import { useSettingsStore } from '@features/settings/store/settingsStore';
import { translate } from '@i18n/index';

/**
 * Notification service.
 *
 * Local notifications are the source of truth on-device: they fire with no
 * network, no account and no server. The server-side `reminder-dispatch`
 * function covers the cases local notifications cannot — a phone that was off,
 * a second device, and WhatsApp.
 */

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export const CHANNELS: {
  id: string;
  name: string;
  category: NotificationCategory;
  importance: Notifications.AndroidImportance;
}[] = [
  {
    id: 'medication-reminders',
    name: 'Medication reminders',
    category: 'medication',
    importance: Notifications.AndroidImportance.MAX,
  },
  {
    id: 'refill-reminders',
    name: 'Refill reminders',
    category: 'refill',
    importance: Notifications.AndroidImportance.HIGH,
  },
  {
    id: 'appointment-reminders',
    name: 'Appointment reminders',
    category: 'appointment',
    importance: Notifications.AndroidImportance.HIGH,
  },
  {
    id: 'checkin-reminders',
    name: 'Check-ins',
    category: 'checkin',
    importance: Notifications.AndroidImportance.DEFAULT,
  },
  {
    id: 'motivation',
    name: 'Motivation & milestones',
    category: 'motivation',
    importance: Notifications.AndroidImportance.DEFAULT,
  },
];

function channelFor(category: NotificationCategory): string {
  return CHANNELS.find((c) => c.category === category)?.id ?? 'motivation';
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

export async function configureNotificationChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  for (const channel of CHANNELS) {
    await Notifications.setNotificationChannelAsync(channel.id, {
      name: channel.name,
      importance: channel.importance,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#1a63dd',
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    });
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: true, allowSound: true },
  });
  return status === 'granted';
}

/**
 * Registers this device for push. Requires a real device and, for a production
 * build, an EAS project id. Returns null when push is unavailable — local
 * reminders still work.
 */
export async function registerForPush(): Promise<string | null> {
  if (!Device.isDevice) return null;
  if (!(await requestNotificationPermission())) return null;

  try {
    const projectId =
      (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)?.projectId;

    const token = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );

    const { userId } = useAuthStore.getState();
    if (userId && supabase) {
      await supabase.from('push_tokens').upsert(
        {
          user_id: userId,
          token: token.data,
          platform: Platform.OS,
          device_id: Device.osInternalBuildId ?? null,
        },
        { onConflict: 'user_id,token' },
      );
      await supabase.from('profiles').update({ push_token: token.data }).eq('id', userId);
    }

    return token.data;
  } catch (error) {
    console.warn('push registration failed', error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------------------

interface ScheduleOptions {
  category: NotificationCategory;
  referenceId: string | null;
  title: string;
  body: string;
  fireAt: Date;
  repeat?: { frequency: 'daily' | 'weekly'; weekday?: number; hour: number; minute: number };
  data?: Record<string, unknown>;
}

async function scheduleLocal(options: ScheduleOptions): Promise<string | null> {
  if (options.fireAt.getTime() <= Date.now() && !options.repeat) return null;

  const trigger: Notifications.NotificationTriggerInput = options.repeat
    ? options.repeat.frequency === 'weekly'
      ? {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          weekday: (options.repeat.weekday ?? 1) + 1, // expo: 1 = Sunday
          hour: options.repeat.hour,
          minute: options.repeat.minute,
          channelId: channelFor(options.category),
        }
      : {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: options.repeat.hour,
          minute: options.repeat.minute,
          channelId: channelFor(options.category),
        }
    : {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: options.fireAt,
        channelId: channelFor(options.category),
      };

  try {
    return await Notifications.scheduleNotificationAsync({
      content: {
        title: options.title,
        body: options.body,
        sound: 'default',
        data: {
          category: options.category,
          referenceId: options.referenceId,
          ...(options.data ?? {}),
        },
      },
      trigger,
    });
  } catch (error) {
    console.warn('scheduleNotificationAsync failed', error);
    return null;
  }
}

async function persistReminder(
  options: ScheduleOptions,
  localIds: string[],
): Promise<ReminderSchedule> {
  const reminder: ReminderSchedule = {
    id: newId(),
    userId: currentOwnerId(),
    category: options.category,
    referenceId: options.referenceId,
    title: options.title,
    body: options.body,
    nextFireAt: options.fireAt.toISOString(),
    repeatRule: options.repeat
      ? {
          frequency: options.repeat.frequency,
          weekday: options.repeat.weekday,
          hour: options.repeat.hour,
          minute: options.repeat.minute,
        }
      : null,
    channels: ['local', 'push'],
    active: true,
    localNotificationIds: localIds,
  };

  await upsert(COLLECTIONS.reminders, reminder);

  const { userId } = useAuthStore.getState();
  if (userId && supabase) {
    await supabase.from('reminder_schedules').insert({
      user_id: userId,
      category: reminder.category,
      reference_id: reminder.referenceId,
      title: reminder.title,
      body: reminder.body,
      next_fire_at: reminder.nextFireAt,
      repeat_rule: reminder.repeatRule as unknown as Json,
      channels: ['local', 'push', 'whatsapp'],
      local_notification_ids: localIds,
    });
  }

  return reminder;
}

/**
 * Creates the full reminder set for a medication: one repeating notification
 * per dose time (per weekday for weekly medicines).
 */
export async function scheduleMedicationReminders(
  medication: MedicationItem,
): Promise<ReminderSchedule[]> {
  const { settings } = useSettingsStore.getState();
  if (!settings.medicationRemindersEnabled) return [];

  await cancelReminders('medication', medication.id);

  const title = translate(settings.language, 'notifications.medicationTitle', {
    medication: medication.name,
  });
  const body = translate(settings.language, 'notifications.medicationBody');
  const created: ReminderSchedule[] = [];

  for (const time of medication.timesOfDay) {
    const [hourStr, minuteStr] = time.split(':');
    const hour = Number(hourStr);
    const minute = Number(minuteStr);
    if (Number.isNaN(hour) || Number.isNaN(minute)) continue;

    const weekdays =
      medication.frequency === 'weekly'
        ? (medication.daysOfWeek?.length ? medication.daysOfWeek : [new Date().getDay()])
        : [null];

    for (const weekday of weekdays) {
      const fireAt = nextOccurrence(hour, minute, weekday);
      const localId = await scheduleLocal({
        category: 'medication',
        referenceId: medication.id,
        title,
        body,
        fireAt,
        repeat:
          weekday === null
            ? { frequency: 'daily', hour, minute }
            : { frequency: 'weekly', weekday, hour, minute },
        data: { deepLink: 'glpcare://medication', medicationId: medication.id },
      });

      created.push(
        await persistReminder(
          {
            category: 'medication',
            referenceId: medication.id,
            title,
            body,
            fireAt,
            repeat:
              weekday === null
                ? { frequency: 'daily', hour, minute }
                : { frequency: 'weekly', weekday, hour, minute },
          },
          localId ? [localId] : [],
        ),
      );
    }
  }

  return created;
}

export async function scheduleAppointmentReminders(
  appointment: Appointment,
  doctorName: string,
): Promise<void> {
  const { settings } = useSettingsStore.getState();
  if (!settings.appointmentRemindersEnabled) return;

  await cancelReminders('appointment', appointment.id);

  const when = new Date(appointment.scheduledAt);
  const title = translate(settings.language, 'notifications.appointmentTitle');
  const body = translate(settings.language, 'notifications.appointmentBody', {
    doctor: doctorName,
    when: when.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }),
  });

  const offsets = [24 * 60, 60]; // a day before, an hour before
  const localIds: string[] = [];

  for (const minutes of offsets) {
    const fireAt = new Date(when.getTime() - minutes * 60_000);
    const id = await scheduleLocal({
      category: 'appointment',
      referenceId: appointment.id,
      title,
      body,
      fireAt,
      data: { deepLink: `glpcare://appointment/${appointment.id}` },
    });
    if (id) localIds.push(id);
  }

  await persistReminder(
    {
      category: 'appointment',
      referenceId: appointment.id,
      title,
      body,
      fireAt: new Date(when.getTime() - 24 * 3600_000),
    },
    localIds,
  );
}

export async function scheduleRefillReminder(
  medication: MedicationItem,
  daysRemaining: number,
): Promise<void> {
  const { settings } = useSettingsStore.getState();
  if (!settings.refillRemindersEnabled) return;

  await cancelReminders('refill', medication.id);

  const fireAt = new Date();
  fireAt.setHours(10, 0, 0, 0);
  if (fireAt.getTime() < Date.now()) fireAt.setDate(fireAt.getDate() + 1);

  const title = translate(settings.language, 'notifications.refillTitle');
  const body = translate(settings.language, 'notifications.refillBody', {
    medication: medication.name,
    days: daysRemaining,
  });

  const localId = await scheduleLocal({
    category: 'refill',
    referenceId: medication.id,
    title,
    body,
    fireAt,
    data: { deepLink: 'glpcare://medication' },
  });

  await persistReminder(
    { category: 'refill', referenceId: medication.id, title, body, fireAt },
    localId ? [localId] : [],
  );
}

export async function scheduleCheckInReminder(intervalDays: number): Promise<void> {
  const { settings } = useSettingsStore.getState();
  if (!settings.checkInRemindersEnabled) return;

  await cancelReminders('checkin', null);

  const fireAt = new Date(Date.now() + intervalDays * 86_400_000);
  fireAt.setHours(19, 0, 0, 0);

  const title = translate(settings.language, 'notifications.checkinTitle');
  const body = translate(settings.language, 'notifications.checkinBody');

  const localId = await scheduleLocal({
    category: 'checkin',
    referenceId: null,
    title,
    body,
    fireAt,
    data: { deepLink: 'glpcare://checkin' },
  });

  await persistReminder(
    { category: 'checkin', referenceId: null, title, body, fireAt },
    localId ? [localId] : [],
  );
}

/** Vigilance follow-ups at 3, 6 and 12 months after treatment completion. */
export async function scheduleVigilanceFollowUps(completedAt: Date): Promise<void> {
  await cancelReminders('checkin', 'vigilance');

  const months = [3, 6, 12];
  const localIds: string[] = [];

  for (const month of months) {
    const fireAt = new Date(completedAt);
    fireAt.setMonth(fireAt.getMonth() + month);
    fireAt.setHours(10, 0, 0, 0);
    if (fireAt.getTime() <= Date.now()) continue;

    const id = await scheduleLocal({
      category: 'checkin',
      referenceId: 'vigilance',
      title: `${month}-month check-in`,
      body: 'A quick check on weight, cravings and how maintenance is going.',
      fireAt,
      data: { deepLink: 'glpcare://checkin', kind: 'vigilance' },
    });
    if (id) localIds.push(id);
  }

  if (localIds.length > 0) {
    const first = new Date(completedAt);
    first.setMonth(first.getMonth() + 3);
    await persistReminder(
      {
        category: 'checkin',
        referenceId: 'vigilance',
        title: 'Vigilance check-in',
        body: 'A quick check on weight, cravings and how maintenance is going.',
        fireAt: first,
      },
      localIds,
    );
  }
}

export async function celebrateMilestone(title: string, body: string): Promise<void> {
  const { settings } = useSettingsStore.getState();
  if (!settings.motivationNudgesEnabled) return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: 'default',
      data: { category: 'milestone', deepLink: 'glpcare://journey' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 2,
      channelId: 'motivation',
      repeats: false,
    },
  });
}

// ---------------------------------------------------------------------------
// Cancellation & inspection
// ---------------------------------------------------------------------------

export async function cancelReminders(
  category: NotificationCategory,
  referenceId: string | null,
): Promise<void> {
  const owner = currentOwnerId();
  const matches = await findBy<ReminderSchedule>(
    COLLECTIONS.reminders,
    (r) =>
      r.userId === owner &&
      r.category === category &&
      (referenceId === null || r.referenceId === referenceId),
  );

  for (const reminder of matches) {
    for (const id of reminder.localNotificationIds) {
      await Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined);
    }
    await remove(COLLECTIONS.reminders, reminder.id);
  }

  const { userId } = useAuthStore.getState();
  if (userId && supabase) {
    let query = supabase
      .from('reminder_schedules')
      .update({ active: false })
      .eq('user_id', userId)
      .eq('category', category);
    if (referenceId) query = query.eq('reference_id', referenceId);
    await query;
  }
}

export async function cancelAllReminders(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
  const owner = currentOwnerId();
  const all = await readCollection<ReminderSchedule>(COLLECTIONS.reminders);
  for (const reminder of all.filter((r) => r.userId === owner)) {
    await remove(COLLECTIONS.reminders, reminder.id);
  }
}

export async function listScheduledReminders(): Promise<ReminderSchedule[]> {
  const owner = currentOwnerId();
  const rows = await findBy<ReminderSchedule>(
    COLLECTIONS.reminders,
    (r) => r.userId === owner && r.active,
  );
  return rows.sort(
    (a, b) => new Date(a.nextFireAt).getTime() - new Date(b.nextFireAt).getTime(),
  );
}

export async function getPendingSystemNotifications(): Promise<
  Notifications.NotificationRequest[]
> {
  return Notifications.getAllScheduledNotificationsAsync();
}

/** Re-applies every reminder after a settings change (e.g. language switch). */
export async function reapplyReminders(medications: MedicationItem[]): Promise<void> {
  for (const medication of medications.filter((m) => m.active)) {
    await scheduleMedicationReminders(medication);
  }
}

function nextOccurrence(hour: number, minute: number, weekday: number | null): Date {
  const date = new Date();
  date.setSeconds(0, 0);
  date.setHours(hour, minute);

  if (weekday === null) {
    if (date.getTime() <= Date.now()) date.setDate(date.getDate() + 1);
    return date;
  }

  const delta = (weekday - date.getDay() + 7) % 7;
  date.setDate(date.getDate() + delta);
  if (date.getTime() <= Date.now()) date.setDate(date.getDate() + 7);
  return date;
}

export const notificationTimestamp = nowIso;
