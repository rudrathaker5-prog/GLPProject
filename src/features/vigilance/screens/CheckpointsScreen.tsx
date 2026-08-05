import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import { View } from 'react-native';

import type { AllParamList } from '@/app/navigation/types';
import { getProfile } from '@features/profile/api/profileRepository';
import {
  completeCheckpoint,
  listCheckpoints,
  type CheckpointStatus,
} from '@features/vigilance/api/vigilanceRepository';
import { useTranslation } from '@i18n/useTranslation';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Row,
  Screen,
  SectionTitle,
  Text,
} from '@ui/components';
import { Icon } from '@ui/components/Icon';
import { useTheme } from '@ui/theme/ThemeProvider';

type Nav = NativeStackNavigationProp<AllParamList>;

/**
 * The 3, 6 and 12-month reviews.
 *
 * These were previously a line of text saying a checkpoint was coming and a
 * notification that may or may not have been scheduled. Nothing recorded
 * whether one actually happened, so a patient could pass all three and the app
 * would keep saying the first was "next". Completing one now writes down the
 * weight and the drift at that moment, which is what makes the series useful:
 * three data points a year apart tell a story that a single reading cannot.
 */
export function CheckpointsScreen() {
  const { t } = useTranslation();
  const profile = useQuery({ queryKey: ['profile'], queryFn: getProfile });

  const checkpoints = useQuery({
    queryKey: ['checkpoints', profile.data?.treatmentCompletedAt],
    queryFn: () => listCheckpoints(profile.data?.treatmentCompletedAt ?? null),
    enabled: profile.isSuccess,
  });

  const completedAt = profile.data?.treatmentCompletedAt;

  return (
    <Screen
      refreshing={checkpoints.isRefetching}
      onRefresh={() => void checkpoints.refetch()}
    >
      <Text variant="display">{t('checkpoints.title')}</Text>
      <Text variant="body" className="mt-2">
        {t('checkpoints.intro')}
      </Text>

      {!completedAt ? (
        <View className="mt-6">
          <EmptyState
            title={t('checkpoints.noDateTitle')}
            message={t('checkpoints.noDateBody')}
          />
        </View>
      ) : (
        <>
          <SectionTitle title={t('checkpoints.yourReviews')} />
          {(checkpoints.data ?? []).map((checkpoint) => (
            <CheckpointCard key={checkpoint.month} checkpoint={checkpoint} />
          ))}
        </>
      )}

      <Text variant="caption" className="mt-6">
        {t('checkpoints.footnote')}
      </Text>
    </Screen>
  );
}

function CheckpointCard({ checkpoint }: { checkpoint: CheckpointStatus }) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');

  const complete = useMutation({
    mutationFn: () =>
      completeCheckpoint({
        month: checkpoint.month,
        dueAt: checkpoint.dueAt,
        note,
      }),
    onSuccess: () => {
      setOpen(false);
      setNote('');
      void queryClient.invalidateQueries({ queryKey: ['checkpoints'] });
    },
  });

  const tone =
    checkpoint.state === 'done'
      ? 'success'
      : checkpoint.state === 'overdue'
        ? 'danger'
        : checkpoint.state === 'due'
          ? 'warning'
          : 'neutral';

  const dueText =
    checkpoint.state === 'done'
      ? t('checkpoints.doneOn', {
          date: new Date(checkpoint.completedAt!).toLocaleDateString('en-IN', {
            dateStyle: 'medium',
          }),
        })
      : checkpoint.daysUntilDue >= 0
        ? t('checkpoints.dueIn', { days: checkpoint.daysUntilDue })
        : t('checkpoints.overdueBy', { days: Math.abs(checkpoint.daysUntilDue) });

  return (
    <Card className="mb-3">
      <Row className="justify-between">
        <Row className="flex-1">
          <View
            className="h-11 w-11 items-center justify-center rounded-2xl"
            style={{
              backgroundColor:
                checkpoint.state === 'done' ? `${theme.accent}22` : `${theme.primary}18`,
            }}
          >
            <Icon
              name={checkpoint.state === 'done' ? 'check' : 'calendar'}
              size={20}
              color={checkpoint.state === 'done' ? theme.accent : theme.primary}
            />
          </View>
          <View className="ml-3 flex-1">
            <Text variant="subheading">
              {t('checkpoints.monthReview', { month: checkpoint.month })}
            </Text>
            <Text variant="caption" className="mt-0.5">
              {dueText}
            </Text>
          </View>
        </Row>
        <Badge label={t(`checkpoints.state.${checkpoint.state}`)} tone={tone} />
      </Row>

      {checkpoint.state === 'done' ? (
        <View className="mt-3">
          {checkpoint.weightKg ? (
            <Text variant="body">
              {t('checkpoints.recordedWeight', { kg: checkpoint.weightKg })}
              {checkpoint.driftPercent !== null
                ? ` · ${t('checkpoints.driftWas', { percent: checkpoint.driftPercent })}`
                : ''}
            </Text>
          ) : null}
          {checkpoint.note ? (
            <Text variant="caption" className="mt-1">
              {checkpoint.note}
            </Text>
          ) : null}
        </View>
      ) : checkpoint.state === 'upcoming' ? (
        <Text variant="body" className="mt-3">
          {t('checkpoints.upcomingBody')}
        </Text>
      ) : (
        <View className="mt-3">
          <Text variant="body">{t('checkpoints.dueBody')}</Text>

          {open ? (
            <View className="mt-3">
              <Input
                value={note}
                onChangeText={setNote}
                placeholder={t('checkpoints.notePlaceholder')}
                multiline
                accessibilityLabel={t('checkpoints.noteLabel')}
              />
              <Row className="mt-2 gap-2">
                <Button
                  label={t('checkpoints.markDone')}
                  size="sm"
                  loading={complete.isPending}
                  onPress={() => complete.mutate()}
                />
                <Button
                  label={t('common.cancel')}
                  size="sm"
                  variant="ghost"
                  onPress={() => setOpen(false)}
                />
              </Row>
            </View>
          ) : (
            <Row className="mt-3 gap-2">
              <Button
                label={t('checkpoints.doCheckIn')}
                size="sm"
                onPress={() => navigation.navigate('CheckIn', { kind: 'vigilance' })}
              />
              <Button
                label={t('checkpoints.recordIt')}
                size="sm"
                variant="secondary"
                onPress={() => setOpen(true)}
              />
            </Row>
          )}
        </View>
      )}
    </Card>
  );
}
