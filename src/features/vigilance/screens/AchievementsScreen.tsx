import { useQuery } from '@tanstack/react-query';
import { View } from 'react-native';

import type { MilestoneCode } from '@core/domain/types';
import { listMilestones, MILESTONE_LABELS } from '@features/journey/api/journeyRepository';
import { listCheckIns, progressSummary } from '@features/tracking/api/trackingRepository';
import { useTranslation } from '@i18n/useTranslation';
import { Badge, Card, ProgressBar, Row, Screen, SectionTitle, Text } from '@ui/components';
import { Icon } from '@ui/components/Icon';
import { useTheme } from '@ui/theme/ThemeProvider';

const ALL_CODES: MilestoneCode[] = [
  'weight_loss_5',
  'weight_loss_10',
  'weight_loss_15',
  'weight_loss_20',
  'adherence_streak_4w',
  'adherence_streak_12w',
  'exercise_streak_7d',
  'exercise_streak_30d',
  'nutrition_streak_7d',
  'nutrition_streak_30d',
  'checkin_streak_4w',
  'treatment_complete',
  'maintenance_6m',
  'maintenance_12m',
];

export function AchievementsScreen() {
  const { theme } = useTheme();
  const { t } = useTranslation();

  const milestones = useQuery({ queryKey: ['milestones'], queryFn: listMilestones });
  const progress = useQuery({ queryKey: ['progress'], queryFn: progressSummary });
  const checkIns = useQuery({ queryKey: ['checkins'], queryFn: () => listCheckIns(60) });

  const earned = new Map((milestones.data ?? []).map((m) => [m.code, m]));
  const percentLost = progress.data?.percentLost ?? 0;

  const nextWeightGoal = [5, 10, 15, 20].find((threshold) => percentLost < threshold);

  return (
    <Screen
      title={t('vigilance.achievements')}
      subtitle={`${earned.size} of ${ALL_CODES.length} unlocked`}
      refreshing={milestones.isRefetching}
      onRefresh={() => void milestones.refetch()}
    >
      {nextWeightGoal ? (
        <Card className="border-brand-200 bg-brand-50 dark:border-brand-800 dark:bg-brand-900/20">
          <Text variant="label">Next weight milestone</Text>
          <Text variant="subheading" className="mt-1">
            {nextWeightGoal}% of your starting weight
          </Text>
          <View className="mt-3">
            <ProgressBar
              value={(percentLost / nextWeightGoal) * 100}
              tone="success"
              label={`${percentLost}% so far`}
            />
          </View>
          <Text variant="caption" className="mt-2">
            {MILESTONE_LABELS[`weight_loss_${nextWeightGoal}` as MilestoneCode]?.body}
          </Text>
        </Card>
      ) : (
        <Card className="border-vital-300 bg-vital-50 dark:border-vital-800 dark:bg-vital-900/20">
          <Row>
            <Icon name="trophy" size={22} color="#0b955c" />
            <Text variant="subheading" className="ml-2 flex-1">
              Every weight milestone unlocked
            </Text>
          </Row>
          <Text variant="body" className="mt-2">
            The remaining ones are about consistency — the harder and more durable kind.
          </Text>
        </Card>
      )}

      <SectionTitle title="Consistency" />
      <Card>
        <Row className="justify-between">
          <Text variant="body">Check-ins recorded</Text>
          <Badge label={String((checkIns.data ?? []).length)} tone="brand" />
        </Row>
        <Row className="mt-3 justify-between">
          <Text variant="body">Weights logged</Text>
          <Badge label={String(progress.data?.entries.length ?? 0)} tone="brand" />
        </Row>
        <Text variant="caption" className="mt-3">
          Tracking is not vanity — it is the early-warning system that makes small corrections
          possible instead of large ones.
        </Text>
      </Card>

      <SectionTitle title="All milestones" />
      {ALL_CODES.map((code) => {
        const milestone = earned.get(code);
        const label = MILESTONE_LABELS[code];
        const unlocked = Boolean(milestone);

        return (
          <Card key={code} className={`mb-3 ${unlocked ? '' : 'opacity-60'}`}>
            <Row className="justify-between">
              <Row className="flex-1">
                <View
                  className="h-10 w-10 items-center justify-center rounded-2xl"
                  style={{
                    backgroundColor: unlocked ? `${theme.accent}22` : `${theme.textMuted}18`,
                  }}
                >
                  <Icon
                    name={unlocked ? 'trophy' : 'shield'}
                    size={20}
                    color={unlocked ? theme.accent : theme.textMuted}
                  />
                </View>
                <View className="ml-3 flex-1">
                  <Text variant="subheading">{label.title}</Text>
                  {milestone ? (
                    <Text variant="caption" className="mt-0.5">
                      {new Date(milestone.achievedAt).toLocaleDateString('en-IN', {
                        dateStyle: 'medium',
                      })}
                    </Text>
                  ) : (
                    <Text variant="caption" className="mt-0.5">
                      Not yet
                    </Text>
                  )}
                </View>
              </Row>
            </Row>
            <Text variant="body" className="mt-2">
              {label.body}
            </Text>
          </Card>
        );
      })}

      <Text variant="caption" className="mt-2 text-center">
        Milestones are awarded automatically from your logged data — nothing here is self-reported.
      </Text>
    </Screen>
  );
}
