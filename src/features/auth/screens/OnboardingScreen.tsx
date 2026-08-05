import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { openTab } from '@/app/navigation/tabs';
import type { AllParamList } from '@/app/navigation/types';
import type { JourneyStage } from '@core/domain/types';
import { useAuthStore } from '@features/auth/store/authStore';
import { addJourneyEvent } from '@features/journey/api/journeyRepository';
import { generatePlan } from '@features/nutrition/api/nutritionRepository';
import { scheduleCheckInReminder, scheduleVigilanceFollowUps } from '@features/notifications/service/notificationService';
import { saveProfile } from '@features/profile/api/profileRepository';
import { logWeight } from '@features/tracking/api/trackingRepository';
import { Button, Card, Field, Input, ProgressBar, Row, Screen, Text } from '@ui/components';
import { Icon } from '@ui/components/Icon';
import { useTheme } from '@ui/theme/ThemeProvider';

type Nav = NativeStackNavigationProp<AllParamList>;

/**
 * Treatment onboarding.
 *
 * Runs when someone moves from awareness into treatment (or straight into
 * post-treatment vigilance if they finished elsewhere). Everything collected
 * here is used immediately: targets drive the nutrition plan, the start date
 * drives the journey map, and check-in reminders are scheduled on completion.
 */
export function OnboardingScreen() {
  const navigation = useNavigation<Nav>();
  const { theme } = useTheme();
  const setStage = useAuthStore((s) => s.setStage);
  const ensureIdentity = useAuthStore((s) => s.ensureIdentity);

  const [step, setStep] = useState(0);
  const [stage, setChosenStage] = useState<JourneyStage>('treatment');
  const [name, setName] = useState('');
  const [currentWeight, setCurrentWeight] = useState('');
  const [targetWeight, setTargetWeight] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [saving, setSaving] = useState(false);

  const steps = ['Where you are', 'About you', 'Your target'];

  const finish = async () => {
    const weight = Number(currentWeight);
    const target = Number(targetWeight);
    const height = Number(heightCm);

    if (!weight || weight < 25 || weight > 400) {
      Alert.alert('Check your weight', 'Enter your current weight in kilograms.');
      setStep(1);
      return;
    }

    setSaving(true);
    try {
      await ensureIdentity();

      await saveProfile({
        displayName: name.trim() || null,
        heightCm: height || null,
        startingWeightKg: weight,
        targetWeightKg: target || null,
        stage,
        onboardedAt: new Date().toISOString(),
        consentedAt: new Date().toISOString(),
        treatmentStartedAt: stage === 'treatment' ? new Date().toISOString() : null,
        treatmentCompletedAt: stage === 'vigilance' ? new Date().toISOString() : null,
      });

      await logWeight({ weightKg: weight, source: 'manual' });
      await generatePlan();

      await addJourneyEvent({
        type: stage === 'treatment' ? 'treatment_start' : 'treatment_complete',
        title: stage === 'treatment' ? 'Treatment started' : 'Moved into maintenance',
        description:
          stage === 'treatment'
            ? 'Your dashboard, reminders and coaching are now set up.'
            : 'Vigilance check-ins are scheduled for 3, 6 and 12 months.',
        stage,
      });

      if (stage === 'treatment') {
        await scheduleCheckInReminder(3);
      } else {
        await scheduleVigilanceFollowUps(new Date());
      }

      setStage(stage);

      // The tabs are always present, so finishing setup just moves the user to
      // the right one rather than rebuilding the navigator.
      navigation.goBack();
      openTab(navigation, stage === 'treatment' ? 'JourneyTab' : 'VigilanceTab');
    } catch (error) {
      Alert.alert(
        'Could not finish setup',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen title="Set up your care" subtitle={steps[step]}>
      <ProgressBar value={((step + 1) / steps.length) * 100} />

      {step === 0 ? (
        <View className="mt-6">
          <Text variant="body" className="mb-4">
            Where are you in your journey right now? This decides what your app looks like.
          </Text>

          <StageOption
            title="I am starting or already on treatment"
            body="A doctor has prescribed medicine, or is about to. You get dose reminders, a progress dashboard, nutrition coaching and refill tracking."
            selected={stage === 'treatment'}
            onPress={() => setChosenStage('treatment')}
          />
          <StageOption
            title="I have finished treatment"
            body="You have stopped the medicine and want to hold your result. You get relapse-risk monitoring, 3/6/12-month check-ins and maintenance coaching."
            selected={stage === 'vigilance'}
            onPress={() => setChosenStage('vigilance')}
          />

          <Text variant="caption" className="mt-4">
            You can change this later in your profile.
          </Text>
        </View>
      ) : null}

      {step === 1 ? (
        <View className="mt-6">
          <Card>
            <Field label="What should I call you?" hint="Optional. First name is fine.">
              <Input value={name} onChangeText={setName} placeholder="e.g. Priya" autoCapitalize="words" />
            </Field>
            <Field label="Height (cm)">
              <Input
                value={heightCm}
                onChangeText={setHeightCm}
                keyboardType="decimal-pad"
                placeholder="e.g. 165"
              />
            </Field>
            <Field
              label="Current weight (kg)"
              hint="This becomes your baseline. Percentage change from here is what matters clinically."
            >
              <Input
                value={currentWeight}
                onChangeText={setCurrentWeight}
                keyboardType="decimal-pad"
                placeholder="e.g. 88"
              />
            </Field>
          </Card>
        </View>
      ) : null}

      {step === 2 ? (
        <View className="mt-6">
          <Card>
            <Field
              label="Target weight (kg)"
              hint="Optional. A 5-10% loss already produces most of the health benefit — you do not need a dramatic number here."
            >
              <Input
                value={targetWeight}
                onChangeText={setTargetWeight}
                keyboardType="decimal-pad"
                placeholder={
                  currentWeight ? `e.g. ${Math.round(Number(currentWeight) * 0.9)}` : 'e.g. 78'
                }
              />
            </Field>
          </Card>

          <Card className="mt-3">
            <Row className="mb-2">
              <Icon name="shield" size={18} color={theme.primary} />
              <Text variant="label" className="ml-2">
                What happens next
              </Text>
            </Row>
            <Text variant="body">
              • Your nutrition plan is generated from your target{'\n'}• Reminders start once you add
              your medicines{'\n'}•{' '}
              {stage === 'treatment'
                ? 'A short check-in every few days keeps your coach useful'
                : 'Check-ins at 3, 6 and 12 months watch for early drift'}
              {'\n'}• Nothing is shared with a doctor unless you allow it
            </Text>
          </Card>
        </View>
      ) : null}

      <View className="mt-6 gap-2">
        {step < steps.length - 1 ? (
          <Button label="Continue" fullWidth size="lg" onPress={() => setStep(step + 1)} />
        ) : (
          <Button
            label="Finish setup"
            fullWidth
            size="lg"
            loading={saving}
            onPress={() => void finish()}
          />
        )}
        {step > 0 ? (
          <Button label="Back" variant="ghost" fullWidth onPress={() => setStep(step - 1)} />
        ) : (
          <Button
            label="Not now"
            variant="ghost"
            fullWidth
            onPress={() => navigation.goBack()}
          />
        )}
      </View>
    </Screen>
  );
}

function StageOption({
  title,
  body,
  selected,
  onPress,
}: {
  title: string;
  body: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Card
      onPress={onPress}
      className={`mb-3 ${selected ? 'border-brand-600 bg-brand-50 dark:bg-brand-900/25' : ''}`}
    >
      <Row className="justify-between">
        <Text variant="subheading" className="flex-1 pr-2">
          {title}
        </Text>
        {selected ? <Icon name="check" size={20} color={theme.primary} /> : null}
      </Row>
      <Text variant="body" className="mt-1">
        {body}
      </Text>
    </Card>
  );
}
