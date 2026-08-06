import * as Notifications from 'expo-notifications';

import { handleNotificationAction } from '../notificationActions';
import { NOTIFICATION_ACTIONS, SNOOZE_MINUTES } from '../notificationService';

/**
 * Notification buttons act with the phone locked and the app closed.
 *
 * That is the whole point of them, and it is also what makes them easy to get
 * wrong: there is no screen to show an error on, no navigation, and an
 * unhandled rejection in a background notification task takes the handler down
 * and the next reminder with it.
 *
 * The rule these tests exist for: "Remind me later" must never be recorded as
 * "I took it". Adherence is a number a doctor acts on, and a snooze counted as
 * a dose is a number that is wrong in the direction nobody checks.
 */

jest.mock('@features/medication/api/medicationRepository', () => ({
  setDoseStatus: jest.fn(async () => undefined),
  listDoseEvents: jest.fn(async () => []),
}));

// expo-notifications exports getters, so its properties cannot be redefined by
// jest.spyOn. Mock the module instead, keeping the constants the code reads.
jest.mock('expo-notifications', () => ({
  ...jest.requireActual('expo-notifications'),
  scheduleNotificationAsync: jest.fn(async () => 'scheduled-id'),
  setNotificationCategoryAsync: jest.fn(async () => undefined),
}));

import { listDoseEvents, setDoseStatus } from '@features/medication/api/medicationRepository';

const scheduleSpy = Notifications.scheduleNotificationAsync as jest.Mock;

/** When the reminder was delivered by the OS. */
const FIRED_AT = new Date('2026-08-06T09:00:00.000Z').getTime();

/** Builds the response shape expo hands the listener. */
function response(
  action: string,
  data: Record<string, unknown> = {},
  firedAt: number = FIRED_AT,
) {
  return {
    actionIdentifier: action,
    notification: {
      date: firedAt,
      request: {
        content: { title: 'Time for your Ozempic', body: 'Tap to mark it', data },
      },
    },
  } as unknown as Notifications.NotificationResponse;
}

const dose = (over: Record<string, unknown> = {}) => ({
  id: 'dose-1',
  medicationId: 'med-1',
  status: 'scheduled',
  scheduledFor: new Date(FIRED_AT).toISOString(),
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  scheduleSpy.mockResolvedValue('scheduled-id');
});

describe('marking a dose taken from the shade', () => {
  it('marks the outstanding dose for that medication', async () => {
    (listDoseEvents as jest.Mock).mockResolvedValue([dose()]);

    const outcome = await handleNotificationAction(
      response(NOTIFICATION_ACTIONS.taken, { medicationId: 'med-1' }),
    );

    expect(setDoseStatus).toHaveBeenCalledWith('dose-1', 'taken');
    expect(outcome).toEqual({ handled: true, action: 'taken', medicationId: 'med-1' });
  });

  it('picks the dose closest to when the reminder fired', async () => {
    (listDoseEvents as jest.Mock).mockResolvedValue([
      dose({ id: 'evening', scheduledFor: '2026-08-06T21:00:00.000Z' }),
      dose({ id: 'morning', scheduledFor: '2026-08-06T09:00:00.000Z' }),
    ]);

    // The 09:00 reminder fired, so the 09:00 dose is the one meant.
    await handleNotificationAction(response(NOTIFICATION_ACTIONS.taken, { medicationId: 'med-1' }));

    expect(setDoseStatus).toHaveBeenCalledWith('morning', 'taken');
  });

  it('marks the day the reminder fired, not the day the app was opened', async () => {
    /*
      The bug this replaced: with no background task the response is replayed
      whenever the app is next opened, and resolving against "today" then marked
      the wrong day. Tap Taken on Monday night, open the app Tuesday morning,
      and Tuesday's dose was recorded while Monday's stayed scheduled — one tap,
      two wrong numbers, in the figure a doctor reads.
    */
    (listDoseEvents as jest.Mock).mockResolvedValue([
      dose({ id: 'monday', scheduledFor: '2026-08-06T21:00:00.000Z' }),
      dose({ id: 'tuesday', scheduledFor: '2026-08-07T09:00:00.000Z' }),
    ]);

    const mondayEvening = new Date('2026-08-06T21:00:00.000Z').getTime();
    await handleNotificationAction(
      response(NOTIFICATION_ACTIONS.taken, { medicationId: 'med-1' }, mondayEvening),
    );

    expect(setDoseStatus).toHaveBeenCalledWith('monday', 'taken');
  });

  it('claims nothing when no dose is near the reminder', async () => {
    // A stale reminder must not grab whatever dose happens to be outstanding.
    (listDoseEvents as jest.Mock).mockResolvedValue([
      dose({ id: 'much-later', scheduledFor: '2026-08-10T09:00:00.000Z' }),
    ]);

    const outcome = await handleNotificationAction(
      response(NOTIFICATION_ACTIONS.taken, { medicationId: 'med-1' }),
    );

    expect(setDoseStatus).not.toHaveBeenCalled();
    expect(outcome).toEqual({ handled: false, reason: 'no-dose' });
  });

  it('ignores doses already dealt with', async () => {
    (listDoseEvents as jest.Mock).mockResolvedValue([dose({ status: 'taken' })]);

    const outcome = await handleNotificationAction(
      response(NOTIFICATION_ACTIONS.taken, { medicationId: 'med-1' }),
    );

    expect(setDoseStatus).not.toHaveBeenCalled();
    expect(outcome).toEqual({ handled: false, reason: 'no-dose' });
  });

  it('ignores doses for a different medication', async () => {
    (listDoseEvents as jest.Mock).mockResolvedValue([dose({ medicationId: 'med-other' })]);

    await handleNotificationAction(response(NOTIFICATION_ACTIONS.taken, { medicationId: 'med-1' }));

    expect(setDoseStatus).not.toHaveBeenCalled();
  });
});

describe('snoozing', () => {
  it('never records the dose as taken', async () => {
    // The rule this whole file exists for.
    (listDoseEvents as jest.Mock).mockResolvedValue([dose()]);

    await handleNotificationAction(response(NOTIFICATION_ACTIONS.snooze, { medicationId: 'med-1' }));

    expect(setDoseStatus).not.toHaveBeenCalled();
  });

  it('re-fires the reminder rather than moving the schedule', async () => {
    const outcome = await handleNotificationAction(
      response(NOTIFICATION_ACTIONS.snooze, { medicationId: 'med-1' }),
    );

    expect(scheduleSpy).toHaveBeenCalledTimes(1);
    const arg = scheduleSpy.mock.calls[0][0] as {
      trigger: { seconds: number; repeats: boolean };
    };
    expect(arg.trigger.seconds).toBe(SNOOZE_MINUTES * 60);
    expect(arg.trigger.repeats).toBe(false);
    expect(outcome).toEqual({ handled: true, action: 'snoozed', minutes: SNOOZE_MINUTES });
  });

  it('keeps the buttons on the snoozed reminder', async () => {
    // A snoozed reminder you cannot action from the shade is a step backwards.
    await handleNotificationAction(response(NOTIFICATION_ACTIONS.snooze, { medicationId: 'med-1' }));

    const arg = scheduleSpy.mock.calls[0][0] as {
      content: { categoryIdentifier?: string };
    };
    expect(arg.content.categoryIdentifier).toBeTruthy();
  });
});

describe('everything else', () => {
  it('leaves a plain tap for the deep-link handler', async () => {
    const outcome = await handleNotificationAction(
      response(Notifications.DEFAULT_ACTION_IDENTIFIER, { deepLink: 'glpcare://medication' }),
    );
    expect(outcome).toEqual({ handled: false, reason: 'not-an-action' });
    expect(setDoseStatus).not.toHaveBeenCalled();
  });

  it('does nothing for an action it does not recognise', async () => {
    const outcome = await handleNotificationAction(response('SOMETHING_ELSE', {}));
    expect(outcome).toEqual({ handled: false, reason: 'unknown-action' });
  });

  it('does not throw when the notification carries no medication', async () => {
    // A background task that throws takes the next reminder down with it.
    await expect(
      handleNotificationAction(response(NOTIFICATION_ACTIONS.taken, {})),
    ).resolves.toEqual({ handled: false, reason: 'unknown-action' });
  });

  it('survives the repository failing', async () => {
    (listDoseEvents as jest.Mock).mockRejectedValue(new Error('storage gone'));

    await expect(
      handleNotificationAction(response(NOTIFICATION_ACTIONS.taken, { medicationId: 'med-1' })),
    ).resolves.toEqual({ handled: false, reason: 'no-dose' });
  });
});
