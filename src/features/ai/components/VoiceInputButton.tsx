import type { ComponentType } from 'react';

import type { LanguageCode } from '@core/domain/types';

import type { VoiceRecorderProps } from './VoiceRecorder';

/**
 * Voice input, loaded only when it is actually rendered.
 *
 * Records with `expo-audio` and transcribes through the `transcribe` edge
 * function (Whisper-compatible, so it handles Hindi, Gujarati and Marathi as
 * well as English). Hold to speak, release to send.
 *
 * WHY THE INDIRECTION
 *
 * `expo-audio` mutates native prototypes while its module is being evaluated:
 *
 *   AudioModule.AudioPlayer.prototype.replace = …
 *
 * If the native module is missing, or its JS and native halves are version
 * mismatched, `AudioModule.AudioPlayer` is `undefined` and that line throws a
 * TypeError during import. This component is reachable from the chat screen,
 * which the first tab imports, so the throw landed in the middle of evaluating
 * the bundle — before React had mounted and before `ErrorBoundary` existed to
 * catch anything. The result on a real phone was an app that installed, showed
 * its icon, and died on the splash screen with no message at all.
 *
 * Deferring the import to render time turns that from "the app cannot start"
 * into "the microphone button is missing", which is the correct severity for an
 * optional input method. Typing has always worked without it.
 */

type Recorder = ComponentType<VoiceRecorderProps>;

/** `undefined` = not tried yet, `null` = tried and unavailable. */
let cached: Recorder | null | undefined;

function loadRecorder(): Recorder | null {
  if (cached !== undefined) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = (require('./VoiceRecorder') as { VoiceRecorder: Recorder }).VoiceRecorder;
  } catch (error) {
    // Deliberately not surfaced to the user: they did not ask for voice, they
    // opened the app. The console line is for the developer reading logcat.
    console.warn('[voice] audio module unavailable, hiding the microphone', error);
    cached = null;
  }
  return cached;
}

export function VoiceInputButton({
  language,
  onTranscript,
}: {
  language: LanguageCode;
  onTranscript: (text: string) => void;
}) {
  const Recorder = loadRecorder();
  if (!Recorder) return null;
  return <Recorder language={language} onTranscript={onTranscript} />;
}
