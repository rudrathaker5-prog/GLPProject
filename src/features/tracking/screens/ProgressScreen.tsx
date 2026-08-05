import { useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { View } from 'react-native';

import type { RootStackParamList } from '@/app/navigation/types';
import { computeAdherence, computeWellnessScore } from '@core/clinical/scoring';
import { listDoseEvents } from '@features/medication/api/medicationRepository';
import { listMilestones, MILESTONE_LABELS } from '@features/journey/api/journeyRepository';
import { weeklyAdherence } from '@features/nutrition/api/nutritionRepository';
import { listCheckIns, progressSummary } from '@features/tracking/api/trackingRepository';
import { WeightSparkline } from '@features/tracking/components/WeightSparkline';
import { useTranslation } from '@i18n/useTranslation';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ProgressBar,
  Row,
  Screen,
  SectionTitle,
  StatTile,
  Text,
} from '@ui/components';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function ProgressScreen() {
  const navigation = useNavigation<Nav>();
  const { t } = useTranslation();

  const progress = useQuery({ queryKey: ['progress'], queryFn: progressSummary });
  const doses = useQuery({ queryKey: ['doses', 'window'], queryFn: () => listDoseEvents(28, 7) });
  const checkIns = useQuery({ queryKey: ['checkins'], queryFn: () => listCheckIns(30) });
  const milestones = useQuery({ queryKey: ['milestones'], queryFn: listMilestones });
  const nutrition = useQuery({ queryKey: ['nutritionAdherence'], queryFn: weeklyAdherence });

  const adherence = computeAdherence(
    (doses.data ?? []).map((d) => ({ status: d.status, scheduledFor: d.scheduledFor })),
    28,
  );

  const latestWellness = checkIns.data?.[0] ? computeWellnessScore(checkIns.data[0]) : null;

  const trend = (checkIns.data ?? [])
    .filter((c) => c.wellnessScore !== null)
    .slice(0, 8)
    .reverse();

  return (
    <Screen
      title={t('treatment.progress')}
      refreshing={progress.isRefetching}
      onRefresh={() => void progress.refetch()}
    >
      <Row className="gap-2">
        <StatTile
          label="Starting"
          value={progress.data?.startingWeightKg ?? '—'}
          unit="kg"
        />
        <StatTile
          label="Now"
          value={progress.data?.currentWeightKg ?? '—'}
          unit="kg"
          tone="brand"
        />
        <StatTile
          label="Lowest"
          value={progress.data?.nadirKg ?? '—'}
          unit="kg"
          tone="success"
        />
      </Row>

      <Card className="mt-3">
        <Row className="mb-2 justify-between">
          <Text variant="subheading">{t('treatment.weightTrend')}</Text>
          <Button
            label={t('treatment.logWeight')}
            size="sm"
            variant="secondary"
            onPress={() => navigation.navigate('LogWeight')}
          />
        </Row>
        <WeightSparkline
          entries={progress.data?.entries ?? []}
          targetKg={progress.data?.targetWeightKg}
          height={160}
        />
        {progress.data?.percentLost ? (
          <View className="mt-4 rounded-2xl bg-vital-50 p-3 dark:bg-vital-900/20">
            <Text variant="bodyStrong">
              You are {progress.data.percentLost}% below your starting weight.
            </Text>
            <Text variant="caption" className="mt-1">
              {clinicalMeaning(progress.data.percentLost)}
            </Text>
          </View>
        ) : null}
      </Card>

      <SectionTitle title="Consistency" />
      <Card>
        <ProgressBar
          label="Medication, last 28 days"
          value={adherence ?? 0}
          tone={adherence !== null && adherence >= 80 ? 'success' : 'warning'}
        />
        <View className="mt-4">
          <ProgressBar
            label="Nutrition, last 7 days"
            value={nutrition.data ?? 0}
            tone={(nutrition.data ?? 0) >= 70 ? 'success' : 'warning'}
          />
        </View>
        <Text variant="caption" className="mt-3">
          Adherence above 80% is where the medicine does what it is supposed to do. Below that, the
          most common reason is side effects nobody was told about — tell your doctor, not the
          internet.
        </Text>
      </Card>

      <SectionTitle title={t('treatment.wellnessScore')} />
      {latestWellness ? (
        <Card>
          <Row className="justify-between">
            <View>
              <Text variant="display">{latestWellness.score}</Text>
              <Text variant="caption">out of 100</Text>
            </View>
            <Badge
              label={latestWellness.band.replace('_', ' ')}
              tone={
                latestWellness.band === 'thriving'
                  ? 'success'
                  : latestWellness.band === 'steady'
                    ? 'brand'
                    : latestWellness.band === 'needs_attention'
                      ? 'warning'
                      : 'danger'
              }
            />
          </Row>

          {latestWellness.drivers.length ? (
            <View className="mt-4">
              <Text variant="label" className="mb-2">
                What is pulling it
              </Text>
              {latestWellness.drivers.map((driver) => (
                <Row key={driver.label} className="mb-2 justify-between">
                  <Text variant="body">{driver.label}</Text>
                  <Badge
                    label={driver.delta >= 0 ? `+${driver.delta}` : String(driver.delta)}
                    tone={driver.delta >= 0 ? 'success' : 'warning'}
                  />
                </Row>
              ))}
            </View>
          ) : null}

          {trend.length > 1 ? (
            <View className="mt-4">
              <Text variant="label" className="mb-2">
                Recent check-ins
              </Text>
              <Row className="items-end gap-1">
                {trend.map((checkIn) => (
                  <View
                    key={checkIn.id}
                    className="flex-1 rounded-t-md bg-brand-500"
                    style={{ height: Math.max(6, ((checkIn.wellnessScore ?? 0) / 100) * 80) }}
                    accessibilityLabel={`Wellness ${checkIn.wellnessScore} on ${new Date(
                      checkIn.occurredAt,
                    ).toLocaleDateString('en-IN')}`}
                  />
                ))}
              </Row>
            </View>
          ) : null}
        </Card>
      ) : (
        <EmptyState
          title="No check-ins yet"
          message="A check-in takes a minute and produces your wellness score."
          action={<Button label="Start check-in" onPress={() => navigation.navigate('CheckIn', {})} />}
        />
      )}

      <SectionTitle title="Milestones" />
      {(milestones.data ?? []).length === 0 ? (
        <Text variant="body">
          Milestones appear as you hit them — 5%, 10%, 15% and 20% of your starting weight, plus
          consistency streaks.
        </Text>
      ) : (
        (milestones.data ?? []).map((milestone) => {
          const label = MILESTONE_LABELS[milestone.code];
          return (
            <Card key={milestone.id} className="mb-2">
              <Row className="justify-between">
                <Text variant="subheading">{label.title}</Text>
                <Text variant="caption">
                  {new Date(milestone.achievedAt).toLocaleDateString('en-IN', {
                    dateStyle: 'medium',
                  })}
                </Text>
              </Row>
              <Text variant="body" className="mt-1">
                {label.body}
              </Text>
            </Card>
          );
        })
      )}
    </Screen>
  );
}

function clinicalMeaning(percent: number): string {
  if (percent >= 20) {
    return 'This is the range usually associated with bariatric surgery — a major metabolic change.';
  }
  if (percent >= 15) {
    return 'At 15%, remission of type 2 diabetes becomes realistic for many people.';
  }
  if (percent >= 10) {
    return 'At 10%, sleep apnoea, fatty liver and cholesterol all improve measurably.';
  }
  if (percent >= 5) {
    return 'Five percent is the clinical threshold — blood sugar, blood pressure and joint load all improve from here.';
  }
  return 'Early days. The first weeks are usually the slowest; that is expected, not a sign it is failing.';
}
