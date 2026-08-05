/**
 * WhatsApp Business Cloud API transport.
 *
 * INTEGRATION POINT
 * -----------------
 * Set these secrets to go live:
 *   WHATSAPP_PHONE_NUMBER_ID   from Meta Business Manager
 *   WHATSAPP_ACCESS_TOKEN      permanent system-user token
 *   WHATSAPP_API_VERSION       optional, defaults to v21.0
 *
 * Templates must be pre-approved by Meta before they can be sent outside the
 * 24-hour customer service window. Register these names (or change the map):
 *
 *   glp_medication_reminder   {{1}} = title, {{2}} = body
 *   glp_refill_reminder       {{1}} = medicine, {{2}} = days remaining
 *   glp_appointment_reminder  {{1}} = doctor,   {{2}} = date/time
 *   glp_doctor_note           {{1}} = summary
 *   glp_milestone             {{1}} = milestone
 *   glp_checkin               {{1}} = prompt
 *
 * Until the secrets exist the function logs the intended message and returns
 * false, so the rest of the reminder pipeline runs unchanged in development.
 */

const TEMPLATE_BY_CATEGORY: Record<string, string> = {
  medication: 'glp_medication_reminder',
  refill: 'glp_refill_reminder',
  appointment: 'glp_appointment_reminder',
  doctor_note: 'glp_doctor_note',
  milestone: 'glp_milestone',
  checkin: 'glp_checkin',
  motivation: 'glp_checkin',
  relapse: 'glp_checkin',
  system: 'glp_checkin',
};

export function whatsappConfigured(): boolean {
  return Boolean(
    Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') && Deno.env.get('WHATSAPP_ACCESS_TOKEN'),
  );
}

export interface WhatsAppRequest {
  to: string | null | undefined;
  category: string;
  variables: string[];
  languageCode?: string;
}

export async function sendWhatsAppTemplate(req: WhatsAppRequest): Promise<boolean> {
  const to = normaliseIndianNumber(req.to);
  if (!to) return false;

  const template = TEMPLATE_BY_CATEGORY[req.category] ?? 'glp_checkin';

  if (!whatsappConfigured()) {
    console.log(
      `[whatsapp:dry-run] template=${template} to=${maskNumber(to)} vars=${JSON.stringify(req.variables)}`,
    );
    return false;
  }

  const version = Deno.env.get('WHATSAPP_API_VERSION') ?? 'v21.0';
  const phoneNumberId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID')!;

  try {
    const response = await fetch(
      `https://graph.facebook.com/${version}/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${Deno.env.get('WHATSAPP_ACCESS_TOKEN')}`,
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'template',
          template: {
            name: template,
            language: { code: req.languageCode ?? 'en' },
            components: [
              {
                type: 'body',
                parameters: req.variables.map((text) => ({ type: 'text', text: text.slice(0, 900) })),
              },
            ],
          },
        }),
      },
    );

    if (!response.ok) {
      console.error('whatsapp send failed', response.status, await response.text());
      return false;
    }
    return true;
  } catch (error) {
    console.error('whatsapp error', error);
    return false;
  }
}

/** Accepts 10-digit Indian numbers, +91 forms, and returns E.164 without '+'. */
export function normaliseIndianNumber(input: string | null | undefined): string | null {
  if (!input) return null;
  const digits = input.replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return digits;
  if (digits.length === 13 && digits.startsWith('091')) return digits.slice(1);
  if (digits.length > 10) return digits;
  return null;
}

function maskNumber(n: string): string {
  return n.length > 4 ? `${'*'.repeat(n.length - 4)}${n.slice(-4)}` : n;
}
