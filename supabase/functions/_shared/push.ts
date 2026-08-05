/**
 * Expo push transport.
 *
 * Uses Expo's push service, which fans out to FCM (Android) and APNs (iOS)
 * without needing per-platform credentials in this function. To move to raw
 * FCM/APNs later, replace `sendExpoPush` — nothing else needs to change.
 */

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
  channelId?: string;
  badge?: number;
}

/** Returns the number of receipts Expo accepted. */
export async function sendExpoPush(tokens: string[], message: PushMessage): Promise<number> {
  const valid = tokens.filter((t) => t?.startsWith('ExponentPushToken') || t?.startsWith('ExpoPushToken'));
  if (valid.length === 0) return 0;

  const payload = valid.map((to) => ({
    to,
    title: message.title,
    body: message.body,
    data: message.data ?? {},
    sound: message.sound === null ? undefined : 'default',
    channelId: message.channelId ?? 'medication-reminders',
    priority: 'high',
    badge: message.badge,
  }));

  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        ...(Deno.env.get('EXPO_ACCESS_TOKEN')
          ? { Authorization: `Bearer ${Deno.env.get('EXPO_ACCESS_TOKEN')}` }
          : {}),
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error('expo push failed', response.status, await response.text());
      return 0;
    }

    const json = await response.json();
    const receipts: { status?: string }[] = json.data ?? [];
    return receipts.filter((r) => r.status === 'ok').length;
  } catch (error) {
    console.error('expo push error', error);
    return 0;
  }
}
