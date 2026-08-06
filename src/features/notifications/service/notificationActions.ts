import * as Notifications from 'expo-notifications';

import { listDoseEvents, setDoseStatus } from '@features/medication/api/medicationRepository';
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
 * The buttons act with the phone locked and the app closed, so nothing here may
 * assume navigation, a React tree or a query client — it talks to the
 * repositories directly and re-renders nothing.
 *
 * WHEN THIS ACTUALLY RUNS
 *
 * There is no background task registered, and the buttons are declared
 * `opensAppToForeground: false`, so pressing one does not start the app. The
 * response is queued by the OS and replayed to the listener the next time the
 * app is opened — which can be hours later. Every decision below is written for
 * that delay rather than pretending it does not exist; see `outstandingDoseFor`
 * for the part where it matters.
 *
 * Registering a real background task would make the write immediate. It is a
 * native-module change and is not done here.
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

/** How far either side of the reminder to look for the dose it refers to. */
const MATCH_WINDOW_MS = 12 * 60 * 60 * 1000;

/**
 * Resolves which dose a medication reminder refers to.
 *
 * Matched against **when the notification fired**, not against "today".
 *
 * There is no background task registered — the action buttons say
 * `opensAppToForeground: false`, so pressing one on a locked phone does not
 * start the app, and the response is replayed to the listener whenever the app
 * is next opened. That can be the following morning.
 *
 * Resolving against "today" at that point marks the *wrong day* taken: tap
 * Taken on Monday's 21:00 reminder, open the app on Tuesday, and Tuesday's dose
 * is recorded while Monday's stays scheduled. One tap, two wrong numbers, in
 * the figure the doctor actually looks at.
 *
 * So the delivery timestamp picks the dose, and only within half a day of it —
 * a reminder that fired 30 hours ago should not silently claim a dose that was
 * scheduled for a different day.
 */
async function outstandingDoseFor(
  medicationId: string,
  firedAt: number,
): Promise<string | null> {
  // Wide enough to cover a response replayed days later; the window below is
  // what actually constrains the match.
  const doses = await listDoseEvents(30, 7).catch(() => []);

  const candidates = doses
    .filter((dose) => dose.medicationId === medicationId && dose.status === 'scheduled')
    .map((dose) => ({
      dose,
      distance: Math.abs(new Date(dose.scheduledFor).getTime() - firedAt),
    }))
    .filter((entry) => Number.isFinite(entry.distance) && entry.distance <= MATCH_WINDOW_MS)
    .sort((a, b) => a.distance - b.distance);

  return candidates[0]?.dose.id ?? null;
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
      // `notification.date` is when the OS delivered it — the moment the dose
      // was actually due, not whenever this handler happens to run.
      const firedAt = response.notification.date ?? Date.now();
      const doseId = await outstandingDoseFor(medicationId, firedAt);
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
