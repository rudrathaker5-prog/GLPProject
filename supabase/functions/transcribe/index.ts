/**
 * transcribe — speech to text for voice input.
 *
 * Request  POST { audioBase64, language?, format? }
 * Response { text } | { degraded: true, reason }
 *
 * Uses the OpenAI-compatible audio transcription endpoint, so the same
 * OPENAI_BASE_URL / OPENAI_API_KEY that drive the agent also drive voice.
 * Whisper handles Hindi, Gujarati and Marathi, which is why transcription is
 * server-side rather than using the platform recogniser.
 */
import { errorResponse, handlePreflight, jsonResponse } from '../_shared/cors.ts';
import { getUserId } from '../_shared/supabase.ts';

const MAX_BYTES = 25 * 1024 * 1024;

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) {
    return jsonResponse({
      degraded: true,
      reason: 'Voice input needs OPENAI_API_KEY to be set on the server. Type your message instead.',
    });
  }

  // Anonymous users may use voice; the check exists so abuse can be rate limited
  // per identity once a session exists.
  await getUserId(req);

  const body = await req.json().catch(() => null);
  if (!body?.audioBase64) return errorResponse('audioBase64 is required');

  const { audioBase64, language, format } = body as {
    audioBase64: string;
    language?: string;
    format?: string;
  };

  let bytes: Uint8Array;
  try {
    const binary = atob(audioBase64);
    bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  } catch {
    return errorResponse('audioBase64 is not valid base64');
  }

  if (bytes.byteLength > MAX_BYTES) return errorResponse('Recording too large', 413);

  const extension = (format ?? 'm4a').replace(/[^a-z0-9]/gi, '').slice(0, 4) || 'm4a';
  const mime =
    { m4a: 'audio/m4a', mp3: 'audio/mpeg', wav: 'audio/wav', webm: 'audio/webm', ogg: 'audio/ogg' }[
      extension
    ] ?? 'audio/m4a';

  const form = new FormData();
  form.append('file', new Blob([bytes], { type: mime }), `speech.${extension}`);
  form.append('model', Deno.env.get('OPENAI_TRANSCRIBE_MODEL') ?? 'whisper-1');
  if (language) form.append('language', language);
  form.append(
    'prompt',
    'Obesity care conversation in India. Terms may include GLP-1, semaglutide, tirzepatide, BMI, HbA1c, dal, roti, paneer.',
  );

  const baseUrl = (Deno.env.get('OPENAI_BASE_URL') ?? 'https://api.openai.com/v1').replace(/\/$/, '');

  try {
    const response = await fetch(`${baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error('transcription failed', response.status, detail.slice(0, 300));
      return jsonResponse({ degraded: true, reason: `Transcription failed (${response.status})` });
    }

    const json = await response.json();
    return jsonResponse({ text: json.text ?? '' });
  } catch (error) {
    console.error('transcription error', error);
    return jsonResponse({
      degraded: true,
      reason: error instanceof Error ? error.message.slice(0, 200) : 'Transcription failed',
    });
  }
});
