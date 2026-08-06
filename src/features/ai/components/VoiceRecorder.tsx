import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable } from 'react-native';

import type { LanguageCode } from '@core/domain/types';
import { transcribeAudio } from '@features/ai/api/transcriptionGateway';
import { Icon } from '@ui/components/Icon';
import { useTheme } from '@ui/theme/ThemeProvider';

export interface VoiceRecorderProps {
  language: LanguageCode;
  onTranscript: (text: string) => void;
}

/**
 * The half of voice input that touches the audio hardware.
 *
 * Split out of `VoiceInputButton` so that importing it is a decision made at
 * render time rather than at app launch. `expo-audio` patches native prototypes
 * during module evaluation (`AudioModule.AudioPlayer.prototype.replace = …`),
 * so if that native module is missing or version-mismatched the import throws a
 * TypeError. Because this component was reachable from the first screen, that
 * throw happened while the bundle was still being evaluated — before React
 * mounted, and therefore before any error boundary existed to catch it. The app
 * died on the splash screen with nothing on screen and nothing in the UI to
 * explain it.
 *
 * Nothing else in the file changed; the isolation is the point.
 */
export function VoiceRecorder({ language, onTranscript }: VoiceRecorderProps) {
  const { theme } = useTheme();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [state, setState] = useState<'idle' | 'recording' | 'transcribing'>('idle');

  const start = useCallback(async () => {
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Microphone needed',
          'Allow microphone access to speak with your care coach. You can always type instead.',
        );
        return;
      }

      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setState('recording');
    } catch (error) {
      console.warn('recording failed to start', error);
      setState('idle');
    }
  }, [recorder]);

  const stop = useCallback(async () => {
    if (state !== 'recording') return;
    setState('transcribing');

    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) {
        setState('idle');
        return;
      }

      const result = await transcribeAudio(uri, language);
      if (result.text) {
        onTranscript(result.text);
      } else {
        Alert.alert(
          'Could not transcribe',
          result.reason ??
            'Voice input needs the AI service to be configured. You can type your message instead.',
        );
      }
    } catch (error) {
      console.warn('transcription failed', error);
      Alert.alert('Voice input failed', 'Please type your message instead.');
    } finally {
      setState('idle');
      await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
    }
  }, [recorder, state, language, onTranscript]);

  const recording = state === 'recording';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={recording ? 'Release to send voice message' : 'Hold to speak'}
      accessibilityState={{ busy: state === 'transcribing' }}
      onPressIn={start}
      onPressOut={stop}
      disabled={state === 'transcribing'}
      className={`h-11 w-11 items-center justify-center rounded-full ${
        recording ? 'bg-danger-600' : 'bg-slate-100 dark:bg-slate-700'
      }`}
    >
      {state === 'transcribing' ? (
        <ActivityIndicator size="small" color={theme.primary} />
      ) : (
        <Icon name="mic" size={20} color={recording ? '#ffffff' : theme.textSoft} />
      )}
    </Pressable>
  );
}
