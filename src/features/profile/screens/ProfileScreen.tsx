import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';

import { openTab } from '@/app/navigation/tabs';
import type { AllParamList } from '@/app/navigation/types';
import { calculateBmi, bmiCategoryIndian } from '@core/clinical/eligibility';
import type { JourneyStage } from '@core/domain/types';
import { useAuthStore } from '@features/auth/store/authStore';
import { scheduleVigilanceFollowUps } from '@features/notifications/service/notificationService';
import { getProfile, saveProfile } from '@features/profile/api/profileRepository';
import { progressSummary } from '@features/tracking/api/trackingRepository';
import { useTranslation } from '@i18n/useTranslation';
import {
  Badge,
  Button,
  Card,
  Chip,
  Field,
  Input,
  Row,
  Screen,
  SectionTitle,
  StatTile,
  Text,
} from '@ui/components';

type Nav = NativeStackNavigationProp<AllParamList>;

const STAGES: { value: JourneyStage; label: string }[] = [
  { value: 'awareness', label: 'Exploring' },
  { value: 'treatment', label: 'On treatment' },
  { value: 'vigilance', label: 'Maintaining' },
];

export function ProfileScreen() {
  const navigation = useNavigation<Nav>();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const mode = useAuthStore((s) => s.mode);
  const setStage = useAuthStore((s) => s.setStage);
  const signOut = useAuthStore((s) => s.signOut);

  const profile = useQuery({ queryKey: ['profile'], queryFn: getProfile });
  const progress = useQuery({ queryKey: ['progress'], queryFn: progressSummary });

  const [name, setName] = useState('');
  const [height, setHeight] = useState('');
  const [target, setTarget] = useState('');
  const [city, setCity] = useState('');

  useEffect(() => {
    if (!profile.data) return;
    setName(profile.data.displayName ?? '');
    setHeight(profile.data.heightCm ? String(profile.data.heightCm) : '');
    setTarget(profile.data.targetWeightKg ? String(profile.data.targetWeightKg) : '');
    setCity(profile.data.city ?? '');
  }, [profile.data]);

  const save = useMutation({
    mutationFn: () =>
      saveProfile({
        displayName: name.trim() || null,
        heightCm: height ? Number(height) : null,
        targetWeightKg: target ? Number(target) : null,
        city: city.trim() || null,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['profile'] });
      Alert.alert('Saved', 'Your details are updated.');
    },
  });

  const changeStage = async (stage: JourneyStage) => {
    await saveProfile({
      stage,
      treatmentCompletedAt:
        stage === 'vigilance'
          ? (profile.data?.treatmentCompletedAt ?? new Date().toISOString())
          : profile.data?.treatmentCompletedAt ?? null,
      treatmentStartedAt:
        stage === 'treatment' && !profile.data?.treatmentStartedAt
          ? new Date().toISOString()
          : (profile.data?.treatmentStartedAt ?? null),
    });

    if (stage === 'vigilance') {
      await scheduleVigilanceFollowUps(new Date(profile.data?.treatmentCompletedAt ?? Date.now()));
    }

    setStage(stage);
    void queryClient.invalidateQueries({ queryKey: ['profile'] });

    openTab(
      navigation,
      stage === 'treatment' ? 'JourneyTab' : stage === 'vigilance' ? 'VigilanceTab' : 'AwarenessTab',
    );
  };

  const bmi = calculateBmi(
    profile.data?.heightCm ?? null,
    progress.data?.currentWeightKg ?? profile.data?.startingWeightKg ?? null,
  );

  return (
    <Screen
      title={t('tabs.profile')}
      refreshing={profile.isRefetching}
      onRefresh={() => void profile.refetch()}
    >
      <Row className="mb-4 flex-wrap gap-2">
        <Badge
          label={
            mode === 'anonymous'
              ? 'Anonymous'
              : mode === 'guest'
                ? 'Guest account'
                : mode === 'doctor'
                  ? 'Doctor'
                  : 'Patient account'
          }
          tone={mode === 'patient' || mode === 'doctor' ? 'success' : 'brand'}
        />
        {profile.data?.stage ? (
          <Badge label={t(`stage.${profile.data.stage}`)} tone="neutral" />
        ) : null}
      </Row>

      {mode === 'anonymous' || mode === 'guest' ? (
        <Card className="mb-4 border-brand-200 bg-brand-50 dark:border-brand-800 dark:bg-brand-900/20">
          <Text variant="subheading">{t('auth.upgradeTitle')}</Text>
          <Text variant="body" className="mt-1">
            {t('auth.upgradeBody')}
          </Text>
          <Button
            className="mt-3"
            label={t('auth.createAccount')}
            onPress={() => navigation.navigate('Auth', { mode: 'sign_up' })}
          />
        </Card>
      ) : null}

      <Row className="gap-2">
        <StatTile label="BMI" value={bmi ?? '—'} tone="brand" caption={bmiCategoryIndian(bmi) ?? undefined} />
        <StatTile
          label="Weight"
          value={progress.data?.currentWeightKg ?? '—'}
          unit="kg"
          tone="neutral"
        />
        <StatTile
          label="Lost"
          value={progress.data?.lostKg ?? '—'}
          unit="kg"
          tone="success"
          caption={progress.data?.percentLost ? `${progress.data.percentLost}%` : undefined}
        />
      </Row>

      <SectionTitle title="Your details" />
      <Card>
        <Field label="Name">
          <Input value={name} onChangeText={setName} placeholder="Your name" autoCapitalize="words" />
        </Field>
        <Field label="Height (cm)">
          <Input value={height} onChangeText={setHeight} keyboardType="decimal-pad" placeholder="165" />
        </Field>
        <Field label="Target weight (kg)">
          <Input value={target} onChangeText={setTarget} keyboardType="decimal-pad" placeholder="72" />
        </Field>
        <Field label="City" hint="Used to show doctors near you.">
          <Input value={city} onChangeText={setCity} placeholder="Ahmedabad" autoCapitalize="words" />
        </Field>
        <Button label={t('common.save')} fullWidth loading={save.isPending} onPress={() => save.mutate()} />
      </Card>

      <SectionTitle title="Where you are in your journey" />
      <Card>
        <Row className="flex-wrap">
          {STAGES.map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              selected={profile.data?.stage === option.value}
              onPress={() => void changeStage(option.value)}
            />
          ))}
        </Row>
        <Text variant="caption" className="mt-2">
          Changing this changes the whole app — dashboard, reminders and how your coach talks to you.
        </Text>
      </Card>

      <SectionTitle title="Quick links" />
      <View className="gap-2">
        <Button
          label={t('settings.title')}
          variant="secondary"
          fullWidth
          onPress={() => navigation.navigate('Settings')}
        />
        <Button
          label={t('appointments.title')}
          variant="secondary"
          fullWidth
          onPress={() => navigation.navigate('Appointments')}
        />
        <Button
          label={t('treatment.doctorNotes')}
          variant="secondary"
          fullWidth
          onPress={() => navigation.navigate('DoctorNotes')}
        />
        <Button
          label="Devices & health data"
          variant="secondary"
          fullWidth
          onPress={() => navigation.navigate('Devices')}
        />
        {mode === 'patient' || mode === 'doctor' ? (
          <Button
            label={t('auth.signOut')}
            variant="ghost"
            fullWidth
            onPress={() =>
              Alert.alert(t('auth.signOut'), 'Your data stays safe and returns when you sign back in.', [
                { text: t('common.cancel'), style: 'cancel' },
                {
                  text: t('auth.signOut'),
                  style: 'destructive',
                  onPress: () => {
                    void signOut();
                    navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
                  },
                },
              ])
            }
          />
        ) : null}
      </View>
    </Screen>
  );
}
