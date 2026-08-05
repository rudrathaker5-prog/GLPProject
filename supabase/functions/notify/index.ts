/**
 * notify — on-demand notification send.
 *
 * Used by the app and the doctor portal to push a message immediately rather
 * than waiting for the scheduler: milestone celebrations, doctor notes,
 * appointment confirmations, relapse nudges.
 *
 * Request  POST { userId?, category, title, body, channels?, deepLink?, payload? }
 * Response { delivered: { push, whatsapp, stored } }
 *
 * A caller may only target themselves unless they hold the service role key or
 * are the treating doctor of the target patient.
 */
import { errorResponse, handlePreflight, jsonResponse } from '../_shared/cors.ts';
import { sendExpoPush } from '../_shared/push.ts';
import { getUserId, serviceClient, userClient } from '../_shared/supabase.ts';
import { sendWhatsAppTemplate } from '../_shared/whatsapp.ts';

const CATEGORIES = [
  'medication',
  'refill',
  'appointment',
  'checkin',
  'motivation',
  'milestone',
  'relapse',
  'doctor_note',
  'system',
];

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  const body = await req.json().catch(() => null);
  if (!body) return errorResponse('Invalid JSON body');

  const { category, title, body: text, channels, deepLink, payload } = body as {
    category: string;
    title: string;
    body: string;
    channels?: string[];
    deepLink?: string;
    payload?: Record<string, unknown>;
    userId?: string;
  };

  if (!CATEGORIES.includes(category)) return errorResponse('Unknown category');
  if (!title?.trim() || !text?.trim()) return errorResponse('title and body are required');

  const isService =
    req.headers.get('Authorization') === `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`;

  const callerId = isService ? null : await getUserId(req);
  if (!isService && !callerId) return errorResponse('Authentication required', 401);

  const targetId = body.userId ?? callerId;
  if (!targetId) return errorResponse('userId is required');

  // Authorisation: self, service role, or treating doctor.
  if (!isService && targetId !== callerId) {
    const client = userClient(req);
    const { data } = await client.rpc('is_caring_doctor', { patient: targetId });
    if (data !== true) return errorResponse('Not permitted', 403);
  }

  const admin = serviceClient();
  const selected = channels?.length ? channels : ['push'];

  const { data: settings } = await admin
    .from('user_settings')
    .select('whatsapp_opt_in, whatsapp_number')
    .eq('user_id', targetId)
    .maybeSingle();

  const { error: storeError } = await admin.from('notifications').insert({
    user_id: targetId,
    category,
    title,
    body: text,
    channel: selected.includes('push') ? 'push' : 'local',
    deep_link: deepLink ?? null,
    payload: payload ?? null,
    sent_at: new Date().toISOString(),
  });

  let pushCount = 0;
  if (selected.includes('push')) {
    const { data: tokens } = await admin
      .from('push_tokens')
      .select('token')
      .eq('user_id', targetId);
    pushCount = await sendExpoPush(
      (tokens ?? []).map((t: { token: string }) => t.token),
      { title, body: text, data: { category, deepLink, ...(payload ?? {}) } },
    );
  }

  let whatsappSent = false;
  if (selected.includes('whatsapp') && settings?.whatsapp_opt_in) {
    whatsappSent = await sendWhatsAppTemplate({
      to: settings.whatsapp_number,
      category,
      variables: [title, text],
    });
  }

  return jsonResponse({
    delivered: { push: pushCount, whatsapp: whatsappSent, stored: !storeError },
  });
});
