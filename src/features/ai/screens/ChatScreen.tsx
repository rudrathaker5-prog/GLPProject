import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Speech from 'expo-speech';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { AllParamList } from '@/app/navigation/types';
import type { ChatMessage } from '@core/domain/types';
import { AgentCardList } from '@features/ai/components/AgentCards';
import { useChatStore } from '@features/ai/store/chatStore';
import { useAuthStore } from '@features/auth/store/authStore';
import { VoiceInputButton } from '@features/ai/components/VoiceInputButton';
import { useTranslation } from '@i18n/useTranslation';
import { Badge, Row, Text } from '@ui/components';
import { Icon } from '@ui/components/Icon';
import { useTheme } from '@ui/theme/ThemeProvider';

type ChatRouteProp = RouteProp<AllParamList, 'Chat'>;
type Nav = NativeStackNavigationProp<AllParamList>;

const SPEECH_LOCALE: Record<string, string> = {
  en: 'en-IN',
  hi: 'hi-IN',
  gu: 'gu-IN',
  mr: 'mr-IN',
};

export function ChatScreen() {
  const route = useRoute<ChatRouteProp>();
  const navigation = useNavigation<Nav>();
  const { theme } = useTheme();
  const { t, language } = useTranslation();
  const stage = useAuthStore((s) => s.stage);

  const messages = useChatStore((s) => s.messages);
  const sending = useChatStore((s) => s.sending);
  const degraded = useChatStore((s) => s.degraded);
  const degradedReason = useChatStore((s) => s.degradedReason);
  const send = useChatStore((s) => s.send);
  const seedGreeting = useChatStore((s) => s.seedGreeting);
  const loadHistory = useChatStore((s) => s.loadHistory);

  const [draft, setDraft] = useState('');
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const initialPromptSent = useRef(false);

  useEffect(() => {
    void (async () => {
      await loadHistory();
      await seedGreeting(stage, language);
    })();
  }, [loadHistory, seedGreeting, stage, language]);

  // A prompt passed from another screen (quick question, "ask the coach") is
  // sent once, automatically.
  useEffect(() => {
    const prompt = route.params?.initialPrompt;
    if (prompt && !initialPromptSent.current) {
      initialPromptSent.current = true;
      void send(prompt, stage, language);
    }
  }, [route.params?.initialPrompt, send, stage, language]);

  useEffect(() => {
    const timer = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120);
    return () => clearTimeout(timer);
  }, [messages.length, sending]);

  useEffect(() => () => void Speech.stop(), []);

  const onSend = useCallback(() => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    void send(text, stage, language);
  }, [draft, send, stage, language]);

  const toggleSpeech = useCallback(
    async (message: ChatMessage) => {
      if (speakingId === message.id) {
        await Speech.stop();
        setSpeakingId(null);
        return;
      }
      await Speech.stop();
      setSpeakingId(message.id);
      Speech.speak(message.content, {
        language: SPEECH_LOCALE[message.language ?? language] ?? 'en-IN',
        rate: 0.95,
        onDone: () => setSpeakingId(null),
        onStopped: () => setSpeakingId(null),
        onError: () => setSpeakingId(null),
      });
    },
    [speakingId, language],
  );

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: theme.background }} edges={['bottom']}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
      >
        {degraded ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open AI settings to enable full conversation"
            onPress={() => navigation.navigate('AiSettings')}
            className="mx-4 mt-3 flex-row items-center rounded-2xl bg-warn-100 px-3 py-2.5 dark:bg-amber-900/30"
          >
            <Icon name="shield" size={16} color={theme.warning} />
            <View className="ml-2 flex-1">
              <Text variant="caption" className="font-semibold text-warn-600 dark:text-amber-200">
                {t('chat.offlineNotice')}
              </Text>
              {degradedReason ? (
                <Text variant="caption" className="mt-0.5">
                  {degradedReason}
                </Text>
              ) : null}
            </View>
            <Icon name="chevron" size={16} color={theme.warning} />
          </Pressable>
        ) : null}

        <ScrollView
          ref={scrollRef}
          className="flex-1"
          contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
        >
          {messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              speaking={speakingId === message.id}
              onToggleSpeech={() => void toggleSpeech(message)}
            />
          ))}
          {sending ? (
            <View className="mb-3 max-w-[85%] self-start rounded-card rounded-bl-md bg-white px-4 py-3 dark:bg-dark-surface-raised">
              <Row>
                <Icon name="sparkle" size={16} color={theme.primary} />
                <Text variant="caption" className="ml-2">
                  {t('chat.thinking')}
                </Text>
              </Row>
            </View>
          ) : null}
        </ScrollView>

        <View
          className="border-t border-slate-100 px-4 pb-2 pt-3 dark:border-slate-800"
          style={{ backgroundColor: theme.surface }}
        >
          <Row className="items-end">
            <View className="mr-2 flex-1 rounded-3xl border border-slate-200 px-4 py-2 dark:border-slate-700">
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder={t('chat.inputPlaceholder')}
                placeholderTextColor={theme.textMuted}
                multiline
                style={{ color: theme.text, maxHeight: 120, fontSize: 15 }}
                accessibilityLabel={t('chat.inputPlaceholder')}
                onSubmitEditing={onSend}
              />
            </View>

            <VoiceInputButton
              language={language}
              onTranscript={(text) => setDraft((current) => (current ? `${current} ${text}` : text))}
            />

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('chat.send')}
              disabled={!draft.trim() || sending}
              onPress={onSend}
              className={`ml-2 h-11 w-11 items-center justify-center rounded-full ${
                draft.trim() && !sending ? 'bg-brand-600' : 'bg-slate-200 dark:bg-slate-700'
              }`}
            >
              <Icon name="send" size={20} color="#ffffff" />
            </Pressable>
          </Row>

          <Text variant="caption" className="mt-2 text-center">
            {t('safety.notMedicalAdvice')}
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function MessageBubble({
  message,
  speaking,
  onToggleSpeech,
}: {
  message: ChatMessage;
  speaking: boolean;
  onToggleSpeech: () => void;
}) {
  const { theme } = useTheme();
  const isUser = message.role === 'user';

  if (message.pending) return null;

  return (
    <View className={`mb-3 w-full ${isUser ? 'items-end' : 'items-start'}`}>
      <View
        className={`max-w-[88%] rounded-card px-4 py-3 ${
          isUser
            ? 'rounded-br-md bg-brand-600'
            : 'rounded-bl-md bg-white dark:bg-dark-surface-raised'
        } ${message.error ? 'border border-danger-400' : ''}`}
      >
        <Text
          variant="body"
          className={isUser ? 'text-white' : 'text-ink dark:text-slate-100'}
          selectable
        >
          {message.content}
        </Text>
      </View>

      {!isUser ? (
        <Row className="mt-1">
          <Pressable
            onPress={onToggleSpeech}
            accessibilityRole="button"
            accessibilityLabel={speaking ? 'Stop reading' : 'Read aloud'}
            className="flex-row items-center px-1 py-1"
          >
            <Icon name={speaking ? 'close' : 'mic'} size={14} color={theme.textMuted} />
            <Text variant="caption" className="ml-1">
              {speaking ? 'Stop' : 'Read aloud'}
            </Text>
          </Pressable>
          {message.error ? <Badge label="Failed" tone="danger" className="ml-2" /> : null}
        </Row>
      ) : null}

      {message.cards?.length ? (
        <View className="mt-1 w-full">
          <AgentCardList cards={message.cards} />
        </View>
      ) : null}
    </View>
  );
}
