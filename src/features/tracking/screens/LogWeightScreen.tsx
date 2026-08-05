import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Alert } from 'react-native';

import type { AllParamList } from '@/app/navigation/types';
import { MILESTONE_LABELS } from '@features/journey/api/journeyRepository';
import { logWeight, progressSummary } from '@features/tracking/api/trackingRepository';
import { WeightSparkline } from '@features/tracking/components/WeightSparkline';
import { useTranslation } from '@i18n/useTranslation';
import { Button, Card, Field, Input, Row, Screen, StatTile, Text } from '@ui/components';

type Nav = NativeStackNavigationProp<AllParamList>;

export function LogWeightScreen() {
  const navigation = useNavigation<Nav>();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const progress = useQuery({ queryKey: ['progress'], queryFn: progressSummary });

  const [weight, setWeight] = useState('');
  const [waist, setWaist] = useState('');

  const save = useMutation({
    mutationFn: () =>
      logWeight({
        weightKg: Number(weight),
        waistCm: waist ? Number(waist) : null,
      }),
    onSuccess: ({ milestones }) => {
      void queryClient.invalidateQueries({ queryKey: ['progress'] });
      void queryClient.invalidateQueries({ queryKey: ['milestones'] });
      void queryClient.invalidateQueries({ queryKey: ['journey'] });

      if (milestones.length > 0) {
        const label = MILESTONE_LABELS[milestones[0] as keyof typeof MILESTONE_LABELS];
        Alert.alert(label.title, label.body, [
          { text: 'See my journey', onPress: () => navigation.navigate('JourneyMap') },
          { text: 'Done', style: 'cancel', onPress: () => navigation.goBack() },
        ]);
        return;
      }
      navigation.goBack();
    },
    onError: (error) =>
      Alert.alert('Could not save', error instanceof Error ? error.message : 'Please try again.'),
  });

  const value = Number(weight);
  const valid = value >= 25 && value <= 400;

  return (
    <Screen title={t('treatment.logWeight')} subtitle="Same day each week, after the toilet, before food.">
      <Card>
        <Field label={`${t('checkin.weight')} (kg)`}>
          <Input
            value={weight}
            onChangeText={setWeight}
            keyboardType="decimal-pad"
            placeholder={progress.data?.currentWeightKg ? String(progress.data.currentWeightKg) : 'e.g. 84.5'}
            testID="log-weight-input"
          />
        </Field>

        <Field
          label="Waist (cm)"
          hint="Optional, but waist change often moves before weight does."
        >
          <Input
            value={waist}
            onChangeText={setWaist}
            keyboardType="decimal-pad"
            placeholder="e.g. 92"
          />
        </Field>
      </Card>

      {progress.data ? (
        <>
          <Row className="mt-4 gap-2">
            <StatTile
              label="Starting"
              value={progress.data.startingWeightKg ?? '—'}
              unit="kg"
              tone="neutral"
            />
            <StatTile
              label="Current"
              value={progress.data.currentWeightKg ?? '—'}
              unit="kg"
              tone="brand"
            />
            <StatTile
              label="Lost"
              value={progress.data.lostKg ?? '—'}
              unit="kg"
              tone="success"
              caption={progress.data.percentLost ? `${progress.data.percentLost}%` : undefined}
            />
          </Row>

          <Card className="mt-3">
            <Text variant="label" className="mb-2">
              {t('treatment.weightTrend')}
            </Text>
            <WeightSparkline
              entries={progress.data.entries}
              targetKg={progress.data.targetWeightKg}
              height={140}
            />
          </Card>
        </>
      ) : null}

      <Button
        className="mt-6"
        label="Save"
        fullWidth
        size="lg"
        disabled={!valid}
        loading={save.isPending}
        onPress={() => save.mutate()}
      />

      <Text variant="caption" className="mt-3 text-center">
        Weight moves in steps, not a line. Weekly is enough — daily adds noise, not information.
      </Text>
    </Screen>
  );
}
