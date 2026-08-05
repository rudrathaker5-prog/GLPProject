import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import type { AllParamList } from '@/app/navigation/types';
import type { SideEffectReport, SideEffectSeverity } from '@core/domain/types';
import { useAuthStore } from '@features/auth/store/authStore';
import { scheduleCheckInReminder } from '@features/notifications/service/notificationService';
import {
  SIDE_EFFECT_OPTIONS,
  saveCheckIn,
} from '@features/tracking/api/trackingRepository';
import { useTranslation } from '@i18n/useTranslation';
import {
  Badge,
  Button,
  Card,
  Chip,
  Field,
  Input,
  ProgressBar,
  Row,
  Screen,
  Text,
} from '@ui/components';
import { useTheme } from '@ui/theme/ThemeProvider';

type Nav = NativeStackNavigationProp<AllParamList>;
type Props = RouteProp<AllParamList, 'CheckIn'>;

/**
 * Passive tracking.
 *
 * The scale questions map directly onto the wellness score, and the side-effect
 * section drives safety triage — a severe symptom routes the patient to care
 * before the check-in is even saved.
 */
export function CheckInScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Props>();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const stage = useAuthStore((s) => s.stage);

  const kind = route.params?.kind ?? (stage === 'vigilance' ? 'vigilance' : 'passive');

  const [weight, setWeight] = useState('');
  const [mood, setMood] = useState<number | null>(null);
  const [appetite, setAppetite] = useState<number | null>(null);
  const [energy, setEnergy] = useState<number | null>(null);
  const [sleepHours, setSleepHours] = useState('');
  const [sleepQuality, setSleepQuality] = useState<number | null>(null);
  const [stress, setStress] = useState<number | null>(null);
  const [cravings, setCravings] = useState<number | null>(null);
  const [water, setWater] = useState('');
  const [exercise, setExercise] = useState('');
  const [nutrition, setNutrition] = useState<number | null>(null);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [sideEffects, setSideEffects] = useState<SideEffectReport[]>([]);
  const [notes, setNotes] = useState('');

  const answered = [
    mood,
    appetite,
    energy,
    sleepQuality,
    stress,
    cravings,
    nutrition,
    confidence,
  ].filter((v) => v !== null).length;
  const completion = Math.round((answered / 8) * 100);

  const toggleSideEffect = (code: SideEffectReport['code']) => {
    setSideEffects((current) =>
      current.some((s) => s.code === code)
        ? current.filter((s) => s.code !== code)
        : [...current, { code, severity: 'mild' }],
    );
  };

  const setSeverity = (code: SideEffectReport['code'], severity: SideEffectSeverity) => {
    setSideEffects((current) =>
      current.map((s) => (s.code === code ? { ...s, severity } : s)),
    );
  };

  const save = useMutation({
    mutationFn: () =>
      saveCheckIn({
        kind,
        weightKg: weight ? Number(weight) : null,
        moodScore: mood,
        appetiteScore: appetite,
        energyScore: energy,
        sleepHours: sleepHours ? Number(sleepHours) : null,
        sleepQuality,
        stressScore: stress,
        cravingScore: cravings,
        waterLitres: water ? Number(water) : null,
        exerciseMinutes: exercise ? Number(exercise) : null,
        nutritionAdherence: nutrition !== null ? nutrition * 10 : null,
        confidenceScore: confidence,
        sideEffects,
        freeText: notes.trim() || null,
      }),
    onSuccess: async ({ wellness }) => {
      void queryClient.invalidateQueries({ queryKey: ['checkins'] });
      void queryClient.invalidateQueries({ queryKey: ['checkinGap'] });
      void queryClient.invalidateQueries({ queryKey: ['progress'] });
      void queryClient.invalidateQueries({ queryKey: ['relapseRisk'] });

      await scheduleCheckInReminder(stage === 'vigilance' ? 30 : 3);

      const severe = sideEffects.filter((s) => s.severity === 'severe');
      if (severe.length > 0) {
        Alert.alert(
          'Please contact your doctor',
          'You reported a severe symptom. Severe or persistent symptoms need to be assessed — do not wait for your next appointment.',
          [
            {
              text: 'Find a doctor',
              onPress: () => navigation.navigate('Doctors'),
            },
            { text: 'Understood', style: 'cancel', onPress: () => navigation.goBack() },
          ],
        );
        return;
      }

      Alert.alert(
        t('checkin.thanks'),
        wellness
          ? `Your wellness score is ${wellness.score}/100 (${wellness.band.replace('_', ' ')}).`
          : 'Logged.',
        [
          {
            text: 'Talk it through',
            onPress: () =>
              navigation.navigate('Chat', {
                initialPrompt: 'I just did a check-in. What should I focus on?',
              }),
          },
          { text: 'Done', style: 'cancel', onPress: () => navigation.goBack() },
        ],
      );
    },
    onError: (error) =>
      Alert.alert('Could not save', error instanceof Error ? error.message : 'Please try again.'),
  });

  return (
    <Screen title={t('checkin.title')} subtitle={t('checkin.prompt')}>
      <ProgressBar value={completion} label="Answered" />

      <Card className="mt-4">
        <Field label={`${t('checkin.weight')} (kg)`} hint="Optional — skip if you weighed recently.">
          <Input
            value={weight}
            onChangeText={setWeight}
            keyboardType="decimal-pad"
            placeholder="e.g. 84.5"
          />
        </Field>
      </Card>

      <Card className="mt-3">
        <Scale label={t('checkin.mood')} value={mood} onChange={setMood} low="Very low" high="Great" />
        <Scale
          label={t('checkin.energy')}
          value={energy}
          onChange={setEnergy}
          low="Exhausted"
          high="Energetic"
        />
        <Scale
          label={t('checkin.appetite')}
          value={appetite}
          onChange={setAppetite}
          low="None"
          high="Very hungry"
        />
        <Scale
          label={t('checkin.cravings')}
          value={cravings}
          onChange={setCravings}
          low="None"
          high="Constant"
        />
        <Scale
          label={t('checkin.stress')}
          value={stress}
          onChange={setStress}
          low="Calm"
          high="Overwhelmed"
        />
        <Scale
          label="Sleep quality"
          value={sleepQuality}
          onChange={setSleepQuality}
          low="Terrible"
          high="Restful"
        />
        <Scale
          label="Sticking to your nutrition plan"
          value={nutrition}
          onChange={setNutrition}
          low="Not at all"
          high="Fully"
        />
        <Scale
          label="Confidence you can keep this going"
          value={confidence}
          onChange={setConfidence}
          low="None"
          high="Certain"
        />
      </Card>

      <Card className="mt-3">
        <Row className="gap-3">
          <View className="flex-1">
            <Field label={`${t('checkin.sleep')} (hours)`}>
              <Input
                value={sleepHours}
                onChangeText={setSleepHours}
                keyboardType="decimal-pad"
                placeholder="7"
              />
            </Field>
          </View>
          <View className="flex-1">
            <Field label={`${t('checkin.water')} (L)`}>
              <Input
                value={water}
                onChangeText={setWater}
                keyboardType="decimal-pad"
                placeholder="2.5"
              />
            </Field>
          </View>
        </Row>
        <Field label={`${t('checkin.exercise')} (minutes this week)`}>
          <Input
            value={exercise}
            onChangeText={setExercise}
            keyboardType="number-pad"
            placeholder="150"
          />
        </Field>
      </Card>

      <Card className="mt-3">
        <Text variant="label" className="mb-2">
          {t('checkin.sideEffects')}
        </Text>
        <Row className="flex-wrap">
          {SIDE_EFFECT_OPTIONS.map((option) => (
            <Chip
              key={option.code}
              label={option.label}
              selected={sideEffects.some((s) => s.code === option.code)}
              onPress={() => toggleSideEffect(option.code)}
            />
          ))}
        </Row>

        {sideEffects.map((effect) => (
          <View key={effect.code} className="mt-3">
            <Text variant="caption" className="mb-1">
              {SIDE_EFFECT_OPTIONS.find((o) => o.code === effect.code)?.label} — how bad?
            </Text>
            <Row>
              {(['mild', 'moderate', 'severe'] as SideEffectSeverity[]).map((severity) => (
                <Chip
                  key={severity}
                  label={severity}
                  selected={effect.severity === severity}
                  onPress={() => setSeverity(effect.code, severity)}
                />
              ))}
            </Row>
          </View>
        ))}

        {sideEffects.some((s) => s.severity === 'severe') ? (
          <View className="mt-3 rounded-2xl bg-danger-100 p-3 dark:bg-rose-900/30">
            <Badge label="Needs attention" tone="danger" />
            <Text variant="body" className="mt-2">
              Severe symptoms should be assessed by a doctor, not waited out. We will show you how to
              reach one after you save.
            </Text>
          </View>
        ) : null}
      </Card>

      <Card className="mt-3">
        <Field label="Anything else?" hint="Your coach reads this.">
          <Input
            value={notes}
            onChangeText={setNotes}
            placeholder="e.g. Nausea was bad the day after my dose but settled by evening"
            multiline
          />
        </Field>
      </Card>

      <Button
        className="mt-6"
        label={t('checkin.submit')}
        fullWidth
        size="lg"
        loading={save.isPending}
        disabled={answered === 0 && !weight && sideEffects.length === 0}
        onPress={() => save.mutate()}
      />
    </Screen>
  );
}

function Scale({
  label,
  value,
  onChange,
  low,
  high,
}: {
  label: string;
  value: number | null;
  onChange: (value: number) => void;
  low: string;
  high: string;
}) {
  const { theme } = useTheme();
  return (
    <View className="mb-5">
      <Text variant="label" className="mb-2">
        {label}
      </Text>
      <Row className="justify-between">
        {Array.from({ length: 11 }, (_, index) => index).map((score) => {
          const selected = value === score;
          return (
            <Pressable
              key={score}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={`${label}: ${score} out of 10`}
              onPress={() => onChange(score)}
              className={`h-8 w-[8%] items-center justify-center rounded-lg ${
                selected ? 'bg-brand-600' : 'bg-slate-100 dark:bg-slate-700'
              }`}
            >
              <Text
                variant="caption"
                className={selected ? 'font-bold text-white' : ''}
                style={{ color: selected ? '#ffffff' : theme.textSoft }}
              >
                {score}
              </Text>
            </Pressable>
          );
        })}
      </Row>
      <Row className="mt-1 justify-between">
        <Text variant="caption">{low}</Text>
        <Text variant="caption">{high}</Text>
      </Row>
    </View>
  );
}
