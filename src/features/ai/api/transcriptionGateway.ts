import * as FileSystem from 'expo-file-system/legacy';

import type { LanguageCode } from '@core/domain/types';
import { supabase } from '@core/supabase/client';

/**
 * Speech-to-text transport.
 *
 * Uploads the recording to the `transcribe` edge function, which calls a
 * Whisper-compatible endpoint. Audio never touches a third party directly from
 * the device and no API key ships in the app.
 */
export async function transcribeAudio(
  uri: string,
  language: LanguageCode,
): Promise<{ text: string | null; reason?: string }> {
  if (!supabase) {
    return {
      text: null,
      reason: 'Voice input needs the backend to be configured. Type your message instead.',
    };
  }

  try {
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // Whisper's limit is 25 MB; a minute of m4a is well under 1 MB.
    if (base64.length > 20 * 1024 * 1024) {
      return { text: null, reason: 'That recording is too long. Keep it under a minute.' };
    }

    const { data, error } = await supabase.functions.invoke<{
      text?: string;
      degraded?: boolean;
      reason?: string;
    }>('transcribe', {
      body: { audioBase64: base64, language, format: uri.split('.').pop() ?? 'm4a' },
    });

    if (error) return { text: null, reason: error.message };
    if (data?.degraded) return { text: null, reason: data.reason };
    return { text: data?.text?.trim() || null };
  } catch (error) {
    return {
      text: null,
      reason: error instanceof Error ? error.message : 'Could not read the recording',
    };
  }
}
