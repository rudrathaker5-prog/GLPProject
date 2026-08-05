/**
 * doctor-note-translate
 *
 * Converts a doctor's clinical note into patient-friendly language, optionally
 * in the patient's own language, and stores it against the note.
 *
 * Request  POST { noteId } | { clinicalText, language?, patientId? }
 * Response { patientFriendly, watchFor, contactDoctorIf, translated?, degraded }
 *
 * Called by the doctor portal on save, and by the patient app if a note arrives
 * without a translation (for example when it was written offline).
 */
import { errorResponse, handlePreflight, jsonResponse } from '../_shared/cors.ts';
import { chatCompletion, llmConfigured, parseJsonLoose } from '../_shared/llm.ts';
import { DOCTOR_NOTE_PROMPT, LANGUAGE_INSTRUCTION, type Language } from '../_shared/prompts.ts';
import { getUserId, userClient } from '../_shared/supabase.ts';

interface NoteTranslation {
  patient_friendly: string;
  watch_for?: string[];
  contact_doctor_if?: string[];
}

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  const userId = await getUserId(req);
  if (!userId) return errorResponse('Authentication required', 401);

  const supabase = userClient(req);
  const body = await req.json().catch(() => null);
  if (!body) return errorResponse('Invalid JSON body');

  const { noteId } = body as { noteId?: string };
  let clinicalText: string | undefined = body.clinicalText;
  let language: Language = body.language ?? 'en';

  if (noteId) {
    const { data, error } = await supabase
      .from('doctor_notes')
      .select('clinical_text, user_id')
      .eq('id', noteId)
      .single();
    if (error || !data) return errorResponse('Note not found', 404);
    clinicalText = data.clinical_text;

    const { data: profile } = await supabase
      .from('profiles')
      .select('language')
      .eq('id', data.user_id)
      .maybeSingle();
    if (profile?.language) language = profile.language as Language;
  }

  if (!clinicalText?.trim()) return errorResponse('clinicalText is required');

  if (!llmConfigured()) {
    return jsonResponse({
      degraded: true,
      reason: 'OPENAI_API_KEY not configured',
      patientFriendly: null,
    });
  }

  let parsed: NoteTranslation | null = null;
  try {
    const completion = await chatCompletion({
      messages: [
        {
          role: 'system',
          content: `${DOCTOR_NOTE_PROMPT}\n\nLANGUAGE\n${LANGUAGE_INSTRUCTION[language]}`,
        },
        { role: 'user', content: clinicalText },
      ],
      temperature: 0.3,
      maxTokens: 700,
      responseFormat: { type: 'json_object' },
    });
    parsed = parseJsonLoose<NoteTranslation>(completion.message.content);
  } catch (error) {
    console.error('note translation failed', error);
    return jsonResponse({
      degraded: true,
      reason: error instanceof Error ? error.message.slice(0, 200) : 'translation failed',
      patientFriendly: null,
    });
  }

  if (!parsed?.patient_friendly) {
    return jsonResponse({ degraded: true, reason: 'no usable output', patientFriendly: null });
  }

  if (noteId) {
    await supabase
      .from('doctor_notes')
      .update({
        patient_friendly_text: parsed.patient_friendly,
        translated_text: { [language]: parsed.patient_friendly },
      })
      .eq('id', noteId);

    const { data: note } = await supabase
      .from('doctor_notes')
      .select('user_id')
      .eq('id', noteId)
      .single();

    if (note?.user_id) {
      await supabase.from('notifications').insert({
        user_id: note.user_id,
        category: 'doctor_note',
        title: 'Your doctor added a note',
        body: parsed.patient_friendly.slice(0, 140),
        channel: 'push',
        deep_link: `glpcare://doctor-notes/${noteId}`,
      });
    }
  }

  return jsonResponse({
    degraded: false,
    patientFriendly: parsed.patient_friendly,
    watchFor: parsed.watch_for ?? [],
    contactDoctorIf: parsed.contact_doctor_if ?? [],
    language,
  });
});
