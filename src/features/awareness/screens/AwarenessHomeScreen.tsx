import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { RootStackParamList } from '@/app/navigation/types';
import { capabilities } from '@core/config/env';
import { quickQuestions } from '@features/ai/engine/localEngine';
import { VoiceInputButton } from '@features/ai/components/VoiceInputButton';
import { useAuthStore } from '@features/auth/store/authStore';
import { EDUCATION_TOPICS } from '@features/awareness/content/education';
import { MYTHS } from '@features/awareness/content/myths';
import { LanguagePicker } from '@features/settings/components/LanguagePicker';
import { useTranslation } from '@i18n/useTranslation';
import { Badge, Card, Row, Text } from '@ui/components';
import { Icon, type IconName } from '@ui/components/Icon';
import { useTheme } from '@ui/theme/ThemeProvider';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * Stage 1 home.
 *
 * The AI card is the primary interface, exactly as the care model requires:
 * type or speak straight into the coach, with the four structured entry points
 * underneath for people who prefer to browse.
 */
export function AwarenessHomeScreen() {
  const navigation = useNavigation<Nav>();
  const { theme, isDark } = useTheme();
  const { t, language } = useTranslation();
  const mode = useAuthStore((s) => s.mode);

  const [draft, setDraft] = useState('');
  const [languageOpen, setLanguageOpen] = useState(false);

  const ask = (prompt: string) => {
    setDraft('');
    navigation.navigate('Chat', { initialPrompt: prompt });
  };

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: theme.background }} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View className="flex-row items-center justify-between px-5 pb-2 pt-1">
          <Row>
            <Icon name="heart" size={22} color={theme.primary} />
            <Text variant="subheading" className="ml-2">
              GLP Care
            </Text>
          </Row>
          <Row>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('settings.language')}
              onPress={() => setLanguageOpen(true)}
              className="mr-3 flex-row items-center rounded-pill border border-slate-200 px-3 py-1.5 dark:border-slate-700"
            >
              <Icon name="globe" size={16} color={theme.textSoft} />
              <Text variant="caption" className="ml-1.5 font-semibold uppercase">
                {language}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('settings.title')}
              onPress={() => navigation.navigate('Settings')}
            >
              <Icon name="settings" size={22} color={theme.textSoft} />
            </Pressable>
          </Row>
        </View>

        {mode === 'anonymous' ? (
          <View className="px-5 pb-1">
            <Badge label={t('awareness.anonymousBadge')} tone="brand" />
          </View>
        ) : null}

        {/* Conversational AI card — the primary interface */}
        <View className="px-5 pt-2">
          <LinearGradient
            colors={isDark ? ['#17438c', '#0b774c'] : ['#1a63dd', '#17b871']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ borderRadius: 24, padding: 20 }}
          >
            <Row className="mb-2">
              <Icon name="sparkle" size={18} color="#ffffff" />
              <Text variant="label" className="ml-2 text-white/90">
                Saathi — your care coach
              </Text>
            </Row>

            <Text variant="title" className="text-white">
              {t('awareness.greeting')}
            </Text>
            <Text variant="body" className="mt-2 text-white/90">
              {t('awareness.heroSubtitle')}
            </Text>

            <View className="mt-4 flex-row items-end rounded-3xl bg-white/95 p-2 dark:bg-white/90">
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder={t('awareness.askPlaceholder')}
                placeholderTextColor="#7b8aa0"
                multiline
                accessibilityLabel={t('awareness.askPlaceholder')}
                style={{
                  flex: 1,
                  color: '#0d1b2a',
                  fontSize: 15,
                  maxHeight: 96,
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                }}
                onSubmitEditing={() => draft.trim() && ask(draft.trim())}
              />
              <VoiceInputButton
                language={language}
                onTranscript={(text) =>
                  setDraft((current) => (current ? `${current} ${text}` : text))
                }
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('chat.send')}
                disabled={!draft.trim()}
                onPress={() => ask(draft.trim())}
                className={`ml-2 h-11 w-11 items-center justify-center rounded-full ${
                  draft.trim() ? 'bg-brand-600' : 'bg-slate-300'
                }`}
              >
                <Icon name="send" size={20} color="#ffffff" />
              </Pressable>
            </View>

            <Pressable
              accessibilityRole="button"
              onPress={() => navigation.navigate('Chat')}
              className="mt-3 self-start"
            >
              <Row>
                <Text variant="label" className="text-white">
                  Open the full conversation
                </Text>
                <View className="ml-1">
                  <Icon name="chevron" size={16} color="#ffffff" />
                </View>
              </Row>
            </Pressable>
          </LinearGradient>
        </View>

        {/* Quick questions */}
        <View className="px-5">
          <Text variant="heading" className="mb-3 mt-6">
            {t('awareness.quickQuestions')}
          </Text>
          <View className="flex-row flex-wrap">
            {quickQuestions(language).map((question) => (
              <Pressable
                key={question}
                accessibilityRole="button"
                onPress={() => ask(question)}
                className="mb-2 mr-2 rounded-pill border border-slate-200 bg-white px-4 py-2.5 dark:border-slate-700 dark:bg-dark-surface-raised"
              >
                <Text variant="label">{question}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Structured entry points */}
        <View className="px-5">
          <Text variant="heading" className="mb-3 mt-6">
            Explore
          </Text>

          <View className="flex-row flex-wrap justify-between">
            <ActionTile
              icon="shield"
              title={t('awareness.eligibilityChecker')}
              subtitle="Indian BMI & waist thresholds"
              tone="brand"
              onPress={() => navigation.navigate('EligibilityChecker')}
            />
            <ActionTile
              icon="learn"
              title={t('awareness.learnObesity')}
              subtitle={`${EDUCATION_TOPICS.length} evidence-based topics`}
              tone="vital"
              onPress={() => navigation.navigate('Awareness', { screen: 'Learn' })}
            />
            <ActionTile
              icon="sparkle"
              title={t('awareness.mythsVsFacts')}
              subtitle={`${MYTHS.length} myths, answered`}
              tone="warn"
              onPress={() => navigation.navigate('Awareness', { screen: 'Myths' })}
            />
            <ActionTile
              icon="doctor"
              title={t('awareness.talkToDoctor')}
              subtitle="Obesity clinics near you"
              tone="brand"
              onPress={() => navigation.navigate('Awareness', { screen: 'Doctors' })}
            />
          </View>
        </View>

        {/* Ready for treatment */}
        <View className="px-5 pt-6">
          <Card onPress={() => navigation.navigate('Onboarding')}>
            <Row className="justify-between">
              <View className="flex-1 pr-3">
                <Text variant="subheading">{t('awareness.startTreatment')}</Text>
                <Text variant="body" className="mt-1">
                  Already under a doctor&apos;s care, or ready to be? Set up your treatment
                  dashboard, reminders and coaching.
                </Text>
              </View>
              <Icon name="chevron" size={20} color={theme.textMuted} />
            </Row>
          </Card>
        </View>

        {/* Honest status */}
        <View className="px-5 pt-4">
          <Text variant="caption" className="text-center">
            {capabilities.remoteAi
              ? 'Connected to the care service.'
              : 'Running on the built-in care library — connect a backend for full AI coaching.'}
          </Text>
          <Text variant="caption" className="mt-1 text-center">
            {t('safety.notMedicalAdvice')}
          </Text>
        </View>
      </ScrollView>

      <LanguagePicker visible={languageOpen} onClose={() => setLanguageOpen(false)} />
    </SafeAreaView>
  );
}

function ActionTile({
  icon,
  title,
  subtitle,
  tone,
  onPress,
}: {
  icon: IconName;
  title: string;
  subtitle: string;
  tone: 'brand' | 'vital' | 'warn';
  onPress: () => void;
}) {
  const colours = {
    brand: { bg: 'bg-brand-50 dark:bg-brand-900/30', icon: '#1a63dd' },
    vital: { bg: 'bg-vital-50 dark:bg-vital-900/30', icon: '#0b955c' },
    warn: { bg: 'bg-warn-100 dark:bg-amber-900/25', icon: '#b97b0d' },
  }[tone];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${subtitle}`}
      onPress={onPress}
      className="mb-3 w-[48.5%] rounded-card border border-slate-100 bg-white p-4 active:opacity-90 dark:border-slate-800 dark:bg-dark-surface-raised"
    >
      <View className={`mb-3 h-10 w-10 items-center justify-center rounded-2xl ${colours.bg}`}>
        <Icon name={icon} size={20} color={colours.icon} />
      </View>
      <Text variant="bodyStrong">{title}</Text>
      <Text variant="caption" className="mt-1">
        {subtitle}
      </Text>
    </Pressable>
  );
}
