import * as Linking from 'expo-linking';
import { Alert, Linking as RNLinking, Platform } from 'react-native';

import type { Appointment, Hospital } from '@core/domain/types';
import { supabase } from '@core/supabase/client';

/**
 * Outbound communication: phone, maps, video consultation and WhatsApp.
 *
 * Phone, maps and WhatsApp deep links are fully working today — they use the
 * OS handlers and need no server. Video consultation and WhatsApp *templated*
 * messages need a provider; both are declared here with their integration
 * points and degrade honestly rather than pretending to succeed.
 */

// ---------------------------------------------------------------------------
// Phone
// ---------------------------------------------------------------------------

/**
 * Dials a number through the OS dialler.
 *
 * Deliberately does **not** gate on `canOpenURL`. Since Android 11 (API 30),
 * package visibility filtering makes `canOpenURL('tel:…')` answer false on a
 * phone that dials perfectly well, because the check is a `resolveActivity`
 * call and the dialler is hidden from us unless declared in `<queries>`. We do
 * declare it (plugins/withAndroidQueries.js), but a manifest is not something
 * to bet a doctor's phone number on: firing the intent is not filtered, so we
 * fire it and only report failure if the OS actually rejects it.
 *
 * Returns true when the dialler was opened.
 */
export async function callNumber(phone: string | null | undefined): Promise<boolean> {
  const dialable = phone?.replace(/[^\d+*#]/g, '');
  if (!dialable) return false;

  try {
    await RNLinking.openURL(`tel:${dialable}`);
    return true;
  } catch {
    // Genuinely no dialler — a tablet, an emulator, or a locked-down device.
    // Show the number so it can still be written down or dialled elsewhere.
    Alert.alert(
      'Could not open the dialler',
      `This device cannot place calls. The number is ${phone}.`,
    );
    return false;
  }
}

// ---------------------------------------------------------------------------
// Maps
// ---------------------------------------------------------------------------

export async function openDirections(hospital: Hospital): Promise<boolean> {
  const label = encodeURIComponent(`${hospital.name}, ${hospital.address}`);
  const url =
    hospital.latitude && hospital.longitude
      ? Platform.select({
          ios: `maps:0,0?q=${label}@${hospital.latitude},${hospital.longitude}`,
          android: `geo:${hospital.latitude},${hospital.longitude}?q=${label}`,
          default: `https://www.google.com/maps/search/?api=1&query=${hospital.latitude},${hospital.longitude}`,
        })!
      : `https://www.google.com/maps/search/?api=1&query=${label}`;

  try {
    await RNLinking.openURL(url);
    return true;
  } catch {
    await RNLinking.openURL(`https://www.google.com/maps/search/?api=1&query=${label}`);
    return true;
  }
}

// ---------------------------------------------------------------------------
// WhatsApp
// ---------------------------------------------------------------------------

/**
 * Opens WhatsApp with a prefilled message. This is user-initiated and works
 * without any Business API setup.
 */
export async function openWhatsApp(phone: string, message: string): Promise<boolean> {
  const normalised = normaliseIndianNumber(phone);
  if (!normalised) return false;

  const url = `whatsapp://send?phone=${normalised}&text=${encodeURIComponent(message)}`;
  const webUrl = `https://wa.me/${normalised}?text=${encodeURIComponent(message)}`;

  try {
    if (await RNLinking.canOpenURL(url)) {
      await RNLinking.openURL(url);
      return true;
    }
    await RNLinking.openURL(webUrl);
    return true;
  } catch {
    return false;
  }
}

/**
 * INTEGRATION POINT — server-sent WhatsApp notifications.
 *
 * Templated, business-initiated messages must go through the WhatsApp Business
 * Cloud API with Meta-approved templates. That lives in the `notify` edge
 * function (`supabase/functions/_shared/whatsapp.ts`); this client call opts the
 * user in and triggers a send. Without the Meta credentials the function logs
 * the intended message and reports that it was not delivered.
 */
export async function sendWhatsAppNotification(params: {
  category: string;
  title: string;
  body: string;
}): Promise<{ delivered: boolean; reason?: string }> {
  if (!supabase) {
    return { delivered: false, reason: 'Backend not configured' };
  }

  const { data, error } = await supabase.functions.invoke<{
    delivered: { whatsapp: boolean };
  }>('notify', {
    body: { ...params, channels: ['whatsapp', 'push'] },
  });

  if (error) return { delivered: false, reason: error.message };
  return { delivered: Boolean(data?.delivered?.whatsapp) };
}

export function normaliseIndianNumber(input: string | null | undefined): string | null {
  if (!input) return null;
  const digits = input.replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return digits;
  if (digits.length === 13 && digits.startsWith('091')) return digits.slice(1);
  return digits.length > 10 ? digits : null;
}

// ---------------------------------------------------------------------------
// Video consultation
// ---------------------------------------------------------------------------

/**
 * INTEGRATION POINT — teleconsultation.
 *
 * `meetingUrl` is issued by the booking flow. Today it is either a real URL
 * supplied by the clinic (opened in the browser) or an app-scheme placeholder
 * for local bookings. To move to an in-app video room, replace `joinConsultation`
 * with your provider's SDK — Twilio Video, Agora, 100ms and Daily all expose a
 * "join room with token" call that fits this signature. The token should be
 * minted server-side in a `video-token` edge function so no key ships in the app.
 */
export async function joinConsultation(
  appointment: Appointment,
): Promise<{ joined: boolean; reason?: string }> {
  if (!appointment.meetingUrl) {
    return { joined: false, reason: 'No meeting link has been issued for this appointment yet.' };
  }

  if (appointment.meetingUrl.startsWith('http')) {
    await RNLinking.openURL(appointment.meetingUrl);
    return { joined: true };
  }

  return {
    joined: false,
    reason:
      'Video consultation needs a provider (Twilio, Agora, 100ms or Daily) to be connected. Your doctor can also call you on the number in your profile.',
  };
}

export function buildDeepLink(path: string): string {
  return Linking.createURL(path);
}
