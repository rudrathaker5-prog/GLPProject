import * as Notifications from 'expo-notifications';

import { setDoseStatus, todaysDoses } from '@features/medication/api/medicationRepository';
import { translate } from '@i18n/index';
import { useSettingsStore } from '@features/settings/store/settingsStore';

import {
  NOTIFICATION_ACTIONS,
  NOTIFICATION_CATEGORIES,
  SNOOZE_MINUTES,
} from './notificationService';

/**
 * What happens when someone taps a button on a notification.
 *
 * The point of these buttons is that the phone stays locked and the app stays
 * closed. That constrains the implementation: everything here has to work from
 * a background task with no navigation, no React tree and no query client, so
 * it talks to the repositories directly and re-renders nothing.
 *
 * Marking a dose taken from the shade is not a convenience. An adherence figure
 * built only from people who unlocked their phone, opened the app and tapped
 * through to the dashboard measures diligence with an app, not whether the
 * medicine was taken — and adherence is one of the numbers a doctor actually
 * acts on.
 */

export type NotificationActionOutcome =
  | { handled: true; action: 'taken'; medicationId: string }
  | { handled: true; action: 'snoozed'; minutes: number }
  | { handled: false; reason: 'not-an-action' | 'unknown-action' | 'no-dose' };

/**
 * Resolves which of today's doses a medication reminder refers to.
 *
 * The reminder repeats weekly or daily and carries a medication id, not a dose
 * id, so the dose has to be found at the moment the button is pressed. The
 * earliest one still outstanding is the one the reminder is about.
 */
async function outstandingDoseFor(medicationId: string): Promise<string | null> {
  const doses = await todaysDoses().catch(() => []);
  const pending = doses
    .filter((dose) => dose.medicationId === medicationId && dose.status === 'scheduled')
    .sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));
  return pending[0]?.id ?? null;
}

/**
 * Handles a notification action.
 *
 * Returns what it did rather than throwing, so the caller can decide whether
 * anything needs saying. Never throws: an unhandled rejection in a background
 * notification task takes the whole handler down, and the next reminder with
 * it.
 */
export async function handleNotificationAction(
  response: Notifications.NotificationResponse,
): Promise<NotificationActionOutcome> {
  const action = response.actionIdentifier;

  // The default identifier means the body was tapped, not a button — that is
  // the deep-link path, handled in RootNavigator.
  if (!action || action === Notifications.DEFAULT_ACTION_IDENTIFIER) {
    return { handled: false, reason: 'not-an-action' };
  }

  const data = response.notification.request.content.data ?? {};
  const medicationId = typeof data.medicationId === 'string' ? data.medicationId : null;

  try {
    if (action === NOTIFICATION_ACTIONS.taken && medicationId) {
      const doseId = await outstandingDoseFor(medicationId);
      if (!doseId) return { handled: false, reason: 'no-dose' };

      await setDoseStatus(doseId, 'taken');
      return { handled: true, action: 'taken', medicationId };
    }

    if (action === NOTIFICATION_ACTIONS.snooze && medicationId) {
      await snoozeDose(medicationId, response.notification.request.content);
      return { handled: true, action: 'snoozed', minutes: SNOOZE_MINUTES };
    }
  } catch (error) {
    console.warn('notification action failed', error);
  }

  return { handled: false, reason: 'unknown-action' };
}

/**
 * Re-fires the reminder shortly.
 *
 * Deliberately does not touch the dose's status. "Remind me later" is not "I
 * took it", and recording it as either would put a wrong number in front of a
 * doctor. The dose stays `scheduled` and the repeating reminder is untouched —
 * this adds one extra one-off nudge, it does not move the schedule.
 */
async function snoozeDose(
  medicationId: string,
  content: Notifications.NotificationContent,
): Promise<void> {
  const { settings } = useSettingsStore.getState();

  await Notifications.scheduleNotificationAsync({
    content: {
      title: content.title ?? translate(settings.language, 'notifications.medicationTitle', {
        medication: '',
      }),
      body: translate(settings.language, 'notifications.snoozedBody'),
      sound: 'default',
      categoryIdentifier: NOTIFICATION_CATEGORIES.medicationDose,
      data: { deepLink: 'glpcare://medication', medicationId, snoozed: true },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: SNOOZE_MINUTES * 60,
      repeats: false,
    },
  });
}
