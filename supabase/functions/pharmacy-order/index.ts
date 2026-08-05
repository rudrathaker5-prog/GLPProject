/**
 * pharmacy-order — medicine procurement integration point.
 *
 * Sends a refill request to the chosen fulfilment channel and tracks status.
 *
 * Request  POST { refillId }
 * Response { status, provider, reference, expectedBy }
 *
 * INTEGRATION POINT
 * -----------------
 * Three channels are modelled. Each has a provider adapter below; only the
 * adapter body needs replacing when a real partner is signed:
 *
 *   hospital_pharmacy  -> hospital HIS / pharmacy queue (HL7 or REST)
 *   nearby_pharmacy    -> local chemist network API
 *   home_delivery      -> e-pharmacy partner (cold chain required for GLP-1 pens)
 *
 * Set PHARMACY_API_URL + PHARMACY_API_KEY to enable live dispatch. Without
 * them the request is recorded and marked `confirmed` locally so the patient
 * journey and reminders continue to work end to end during pilots, and the
 * response makes the simulation explicit.
 */
import { errorResponse, handlePreflight, jsonResponse } from '../_shared/cors.ts';
import { getUserId, userClient } from '../_shared/supabase.ts';

interface DispatchResult {
  accepted: boolean;
  reference: string;
  expectedBy: string;
  simulated: boolean;
  provider: string;
}

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  const userId = await getUserId(req);
  if (!userId) return errorResponse('Authentication required', 401);

  const supabase = userClient(req);
  const { refillId } = (await req.json().catch(() => ({}))) as { refillId?: string };
  if (!refillId) return errorResponse('refillId is required');

  const { data: refill, error } = await supabase
    .from('refill_requests')
    .select('*, medication:medications(*), pharmacy:pharmacies(*)')
    .eq('id', refillId)
    .single();

  if (error || !refill) return errorResponse('Refill request not found', 404);

  const medication = (refill as any).medication;
  const requiresColdChain = medication?.form === 'injection';

  const result = await dispatch({
    channel: refill.channel,
    medicationName: medication?.name ?? 'medication',
    strength: medication?.strength ?? '',
    requiresColdChain,
    addressLine: refill.address_line,
    pharmacy: (refill as any).pharmacy,
  });

  await supabase
    .from('refill_requests')
    .update({
      status: result.accepted ? 'confirmed' : 'requested',
      expected_by: result.expectedBy,
      notes: result.simulated
        ? `Simulated dispatch (${result.provider}). Configure PHARMACY_API_URL to go live. Ref ${result.reference}`
        : `Dispatched via ${result.provider}. Ref ${result.reference}`,
    })
    .eq('id', refillId);

  await supabase.from('notifications').insert({
    user_id: userId,
    category: 'refill',
    title: result.accepted ? 'Refill confirmed' : 'Refill requested',
    body: `${medication?.name ?? 'Your medicine'} — expected by ${new Date(result.expectedBy).toLocaleDateString('en-IN')}.`,
    channel: 'push',
    deep_link: 'glpcare://medication',
  });

  return jsonResponse({
    status: result.accepted ? 'confirmed' : 'requested',
    provider: result.provider,
    reference: result.reference,
    expectedBy: result.expectedBy,
    simulated: result.simulated,
    coldChain: requiresColdChain,
  });
});

async function dispatch(params: {
  channel: string;
  medicationName: string;
  strength: string;
  requiresColdChain: boolean;
  addressLine: string | null;
  pharmacy: Record<string, unknown> | null;
}): Promise<DispatchResult> {
  const apiUrl = Deno.env.get('PHARMACY_API_URL');
  const apiKey = Deno.env.get('PHARMACY_API_KEY');

  const leadDays = params.channel === 'home_delivery' ? 3 : params.channel === 'nearby_pharmacy' ? 1 : 2;
  const expectedBy = new Date(Date.now() + leadDays * 86_400_000).toISOString();
  const reference = `GLP-${Date.now().toString(36).toUpperCase()}`;

  if (!apiUrl || !apiKey) {
    return {
      accepted: true,
      reference,
      expectedBy,
      simulated: true,
      provider: `${params.channel} (local)`,
    };
  }

  try {
    const response = await fetch(`${apiUrl.replace(/\/$/, '')}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        channel: params.channel,
        items: [{ name: params.medicationName, strength: params.strength, quantity: 1 }],
        cold_chain: params.requiresColdChain,
        delivery_address: params.addressLine,
        pharmacy_id: (params.pharmacy as any)?.id ?? null,
        reference,
      }),
    });

    if (!response.ok) {
      console.error('pharmacy dispatch failed', response.status, await response.text());
      return { accepted: false, reference, expectedBy, simulated: false, provider: params.channel };
    }

    const json = await response.json();
    return {
      accepted: true,
      reference: json.reference ?? reference,
      expectedBy: json.expected_by ?? expectedBy,
      simulated: false,
      provider: json.provider ?? params.channel,
    };
  } catch (error) {
    console.error('pharmacy dispatch error', error);
    return { accepted: false, reference, expectedBy, simulated: false, provider: params.channel };
  }
}
