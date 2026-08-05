import type { LanguageCodeDb } from '@core/supabase/database.types';
import { supabase } from '@core/supabase/client';
import { currentOwnerId } from '@features/auth/store/authStore';
import type { SettingsState } from '@features/settings/store/settingsStore';

/**
 * Pushes the device's settings to the server row the schedulers actually read.
 *
 * The WhatsApp opt-in was a local-only flag: it persisted to AsyncStorage and
 * nothing ever consumed it, while `notify` and `reminder-dispatch` decide
 * delivery from `user_settings.whatsapp_opt_in` — a row the app never wrote.
 * Turning the switch on therefore did nothing at all.
 *
 * Only the fields the server acts on are synced. Everything else (theme, text
 * size, reduce-motion) is a device preference and deliberately stays local.
 */

export type ServerSettingsSync =
  | { synced: true }
  | { synced: false; reason: 'no-backend' | 'no-account'; message: string };

export async function syncSettingsToServer(
  settings: SettingsState,
): Promise<ServerSettingsSync> {
  if (!supabase) {
    return {
      synced: false,
      reason: 'no-backend',
      message: 'No care service is connected, so server-sent messages cannot be delivered.',
    };
  }

  const userId = currentOwnerId();
  if (!userId) {
    return {
      synced: false,
      reason: 'no-account',
      message: 'Create an account so the care service knows where to send messages.',
    };
  }

  const { error } = await supabase.from('user_settings').upsert(
    {
      user_id: userId,
      language: settings.language as LanguageCodeDb,
      theme: settings.theme,
      medication_reminders_enabled: settings.medicationRemindersEnabled,
      refill_reminders_enabled: settings.refillRemindersEnabled,
      appointment_reminders_enabled: settings.appointmentRemindersEnabled,
      motivation_nudges_enabled: settings.motivationNudgesEnabled,
      checkin_reminders_enabled: settings.checkInRemindersEnabled,
      whatsapp_opt_in: settings.whatsappOptIn,
      whatsapp_number: settings.whatsappNumber,
      quiet_hours_start: settings.quietHoursStart,
      quiet_hours_end: settings.quietHoursEnd,
      share_data_with_doctor: settings.shareDataWithDoctor,
      large_text: settings.largeText,
      reduce_motion: settings.reduceMotion,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );

  if (error) {
    return { synced: false, reason: 'no-backend', message: error.message };
  }
  return { synced: true };
}

/** Whether server-delivered WhatsApp messages are possible at all right now. */
export function canReceiveServerMessages(): boolean {
  return Boolean(supabase) && Boolean(currentOwnerId());
}
