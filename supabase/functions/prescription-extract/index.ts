/**
 * prescription-extract
 *
 * Turns a prescription image (or pasted text) into structured medication rows
 * and materialises the reminder schedule.
 *
 * Request  POST { prescriptionId?, imageUrl?, imageBase64?, rawText? }
 * Response { prescription, medications, confidence, degraded }
 *
 * Vision is used when the configured model supports it; a text-only model can
 * still be used by passing `rawText` from on-device OCR.
 */
import { errorResponse, handlePreflight, jsonResponse } from '../_shared/cors.ts';
import { chatCompletion, llmConfigured, parseJsonLoose } from '../_shared/llm.ts';
import { PRESCRIPTION_EXTRACTION_PROMPT } from '../_shared/prompts.ts';
import { getUserId, userClient } from '../_shared/supabase.ts';

interface ExtractedMedication {
  name: string;
  generic_name?: string | null;
  form?: string;
  strength?: string;
  dose_amount?: number;
  dose_unit?: string;
  frequency?: string;
  times_of_day?: string[];
  days_of_week?: number[] | null;
  duration_days?: number | null;
  instructions?: string | null;
  storage_note?: string | null;
  is_titration?: boolean;
}

interface ExtractionResult {
  doctor_name?: string | null;
  hospital_name?: string | null;
  issued_on?: string | null;
  confidence?: number;
  medications?: ExtractedMedication[];
}

const VALID_FORMS = ['injection', 'tablet', 'capsule', 'syrup', 'other'];
const VALID_FREQUENCIES = ['weekly', 'daily', 'twice_daily', 'thrice_daily', 'as_needed'];

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  const userId = await getUserId(req);
  if (!userId) return errorResponse('Authentication required', 401);

  const supabase = userClient(req);
  const body = await req.json().catch(() => null);
  if (!body) return errorResponse('Invalid JSON body');

  const { prescriptionId, imageUrl, imageBase64, rawText } = body as {
    prescriptionId?: string;
    imageUrl?: string;
    imageBase64?: string;
    rawText?: string;
  };

  if (!imageUrl && !imageBase64 && !rawText) {
    return errorResponse('Provide imageUrl, imageBase64 or rawText');
  }

  if (!llmConfigured()) {
    return jsonResponse({
      degraded: true,
      reason: 'OPENAI_API_KEY not configured — use manual medication entry',
      medications: [],
    });
  }

  // ---- Ask the model ------------------------------------------------------
  const userContent = imageBase64 || imageUrl
    ? ([
        { type: 'text', text: 'Extract the prescription.' },
        {
          type: 'image_url',
          image_url: { url: imageBase64 ? `data:image/jpeg;base64,${imageBase64}` : imageUrl! },
        },
      ] as unknown as string)
    : `Extract the prescription from this transcription:\n\n${rawText}`;

  let extracted: ExtractionResult | null = null;
  try {
    const completion = await chatCompletion({
      messages: [
        { role: 'system', content: PRESCRIPTION_EXTRACTION_PROMPT },
        { role: 'user', content: userContent },
      ],
      temperature: 0.1,
      maxTokens: 1400,
      responseFormat: { type: 'json_object' },
    });
    extracted = parseJsonLoose<ExtractionResult>(completion.message.content);
  } catch (error) {
    console.error('extraction failed', error);
    return jsonResponse({
      degraded: true,
      reason: error instanceof Error ? error.message.slice(0, 200) : 'extraction failed',
      medications: [],
    });
  }

  if (!extracted || !Array.isArray(extracted.medications) || extracted.medications.length === 0) {
    return jsonResponse({
      degraded: false,
      confidence: 0,
      medications: [],
      message:
        'I could not read this prescription clearly. You can add the medicines manually — it takes a minute and the reminders work exactly the same.',
    });
  }

  // ---- Persist ------------------------------------------------------------
  let prescription: Record<string, unknown> | null = null;

  if (prescriptionId) {
    const { data } = await supabase
      .from('prescriptions')
      .update({
        doctor_name: extracted.doctor_name ?? null,
        hospital_name: extracted.hospital_name ?? null,
        issued_on: normaliseDate(extracted.issued_on) ?? new Date().toISOString().slice(0, 10),
        raw_text: rawText ?? null,
        extraction_confidence: clamp01(extracted.confidence ?? 0.5),
        status: 'active',
      })
      .eq('id', prescriptionId)
      .select()
      .single();
    prescription = data;
  } else {
    const { data } = await supabase
      .from('prescriptions')
      .insert({
        user_id: userId,
        doctor_name: extracted.doctor_name ?? null,
        hospital_name: extracted.hospital_name ?? null,
        issued_on: normaliseDate(extracted.issued_on) ?? new Date().toISOString().slice(0, 10),
        image_url: imageUrl ?? null,
        raw_text: rawText ?? null,
        extraction_confidence: clamp01(extracted.confidence ?? 0.5),
        status: 'active',
      })
      .select()
      .single();
    prescription = data;
  }

  const rows = extracted.medications.slice(0, 12).map((m) => {
    const frequency = VALID_FREQUENCIES.includes(m.frequency ?? '')
      ? m.frequency!
      : 'daily';
    const form = VALID_FORMS.includes(m.form ?? '') ? m.form! : 'tablet';
    return {
      user_id: userId,
      prescription_id: (prescription as any)?.id ?? null,
      name: String(m.name).slice(0, 120),
      generic_name: m.generic_name ?? null,
      form,
      strength: m.strength ?? '',
      dose_amount: Number.isFinite(m.dose_amount) ? Number(m.dose_amount) : 1,
      dose_unit: m.dose_unit ?? 'mg',
      frequency,
      times_of_day: normaliseTimes(m.times_of_day, frequency),
      days_of_week: Array.isArray(m.days_of_week) ? m.days_of_week : null,
      duration_days: m.duration_days ?? null,
      instructions: m.instructions ?? null,
      storage_note:
        m.storage_note ??
        (form === 'injection' ? 'Keep refrigerated at 2-8 °C. Do not freeze.' : null),
      is_titration: Boolean(m.is_titration),
      start_date: new Date().toISOString().slice(0, 10),
      active: true,
    };
  });

  const { data: medications, error: medError } = await supabase
    .from('medications')
    .insert(rows)
    .select();

  if (medError) return errorResponse(medError.message, 500);

  // Dose events are generated by a database trigger; add the journey entry here.
  await supabase.from('journey_events').insert({
    user_id: userId,
    type: 'prescription',
    title: 'Prescription added',
    description: `${medications?.length ?? 0} medicine(s) scheduled with reminders.`,
    stage: 'treatment',
    metadata: { prescription_id: (prescription as any)?.id ?? null },
  });

  return jsonResponse({
    degraded: false,
    prescription,
    medications: medications ?? [],
    confidence: clamp01(extracted.confidence ?? 0.5),
  });
});

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, Number(n) || 0));
}

function normaliseDate(value?: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function normaliseTimes(times: string[] | undefined, frequency: string): string[] {
  const valid = (times ?? []).filter((t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t));
  if (valid.length > 0) return valid;
  switch (frequency) {
    case 'twice_daily':
      return ['09:00', '21:00'];
    case 'thrice_daily':
      return ['09:00', '14:00', '21:00'];
    case 'weekly':
    case 'daily':
    default:
      return ['09:00'];
  }
}
