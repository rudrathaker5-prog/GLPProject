import { useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { View } from 'react-native';

import type { AllParamList } from '@/app/navigation/types';
import { CallDoctorCard } from '@features/doctors/components/CallDoctorCard';
import { getProfile } from '@features/profile/api/profileRepository';
import {
  ACTION_THRESHOLD_PERCENT,
  maintenanceStatus,
} from '@features/vigilance/api/vigilanceRepository';
import { useTranslation } from '@i18n/useTranslation';
import { Badge, Button, Card, ProgressBar, Row, Screen, SectionTitle, StatTile, Text } from '@ui/components';
import { Icon } from '@ui/components/Icon';
import { useTheme } from '@ui/theme/ThemeProvider';

type Nav = NativeStackNavigationProp<AllParamList>;

/**
 * The written maintenance plan.
 *
 * The relapse *protocol* (RelapsePlanScreen) is what to do once the threshold
 * is crossed. This is the other half: what holding steady looks like day to
 * day, and — the number that matters — the exact weight at which the protocol
 * starts. A threshold agreed in advance, in kilograms, while things are going
 * well is far easier to act on than a decision made in the middle of a regain.
 */
export function MaintenancePlanScreen() {
  const navigation = useNavigation<Nav>();
  const { theme } = useTheme();
  const { t } = useTranslation();

  const profile = useQuery({ queryKey: ['profile'], queryFn: getProfile });
  const status = useQuery({
    queryKey: ['maintenanceStatus', profile.data?.treatmentCompletedAt],
    queryFn: () => maintenanceStatus(profile.data?.treatmentCompletedAt ?? null),
    enabled: profile.isSuccess,
  });

  const crossed = status.data?.thresholdCrossed ?? false;
  const drift = status.data?.driftPercent;

  return (
    <Screen
      refreshing={status.isRefetching}
      onRefresh={() => void status.refetch()}
    >
      <Text variant="display">{t('maintenance.title')}</Text>
      <Text variant="body" className="mt-2">
        {t('maintenance.intro')}
      </Text>

      {/* The number the whole plan turns on */}
      <SectionTitle title={t('maintenance.yourThreshold')} />
      <Card
        className={
          crossed
            ? 'border-warn-400 bg-warn-100/50 dark:bg-amber-900/20'
            : 'border-vital-200 bg-vital-50 dark:border-vital-800 dark:bg-vital-900/20'
        }
      >
        <Row className="justify-between">
          <View className="flex-1 pr-3">
            <Text variant="caption">{t('maintenance.actWhenAbove')}</Text>
            <Text variant="display" className="mt-0.5">
              {status.data?.actionWeightKg ? `${status.data.actionWeightKg} kg` : '—'}
            </Text>
          </View>
          <Badge
            label={crossed ? t('maintenance.crossed') : t('maintenance.holding')}
            tone={crossed ? 'warning' : 'success'}
          />
        </Row>

        <Text variant="body" className="mt-3">
          {t('maintenance.thresholdExplainer', { percent: ACTION_THRESHOLD_PERCENT })}
        </Text>

        {status.data?.nadirKg ? (
          <Row className="mt-4 gap-2">
            <StatTile
              label={t('maintenance.lowest')}
              value={status.data.nadirKg}
              unit="kg"
              tone="success"
            />
            <StatTile
              label={t('maintenance.now')}
              value={status.data.currentWeightKg ?? '—'}
              unit="kg"
              tone="neutral"
            />
            <StatTile
              label={t('maintenance.drift')}
              value={drift === null || drift === undefined ? '—' : `${drift}`}
              unit="%"
              tone={crossed ? 'warning' : 'success'}
            />
          </Row>
        ) : null}

        {status.data?.headroomKg !== null && status.data?.headroomKg !== undefined ? (
          <View className="mt-4">
            <ProgressBar
              label={
                status.data.headroomKg >= 0
                  ? t('maintenance.headroom', { kg: status.data.headroomKg })
                  : t('maintenance.over', { kg: Math.abs(status.data.headroomKg) })
              }
              value={Math.min(100, Math.max(0, ((drift ?? 0) / ACTION_THRESHOLD_PERCENT) * 100))}
              tone={crossed ? 'danger' : 'success'}
            />
          </View>
        ) : null}
      </Card>

      {crossed ? (
        <Card className="mt-3 border-danger-400 bg-danger-100/40 dark:bg-rose-900/20">
          <Row className="mb-1">
            <Icon name="warning" size={20} color={theme.danger} />
            <Text variant="subheading" className="ml-2 flex-1">
              {t('maintenance.startProtocolTitle')}
            </Text>
          </Row>
          <Text variant="body">{t('maintenance.startProtocolBody')}</Text>
          <Button
            className="mt-3"
            label={t('maintenance.openProtocol')}
            fullWidth
            onPress={() => navigation.navigate('RelapsePlan')}
          />
        </Card>
      ) : null}

      {/* What holding steady actually involves */}
      <SectionTitle title={t('maintenance.habitsTitle')} />
      {[
        { icon: 'chart', key: 'weigh' },
        { icon: 'nutrition', key: 'protein' },
        { icon: 'heart', key: 'movement' },
        { icon: 'bell', key: 'checkin' },
        { icon: 'people', key: 'support' },
      ].map((habit) => (
        <Card key={habit.key} className="mb-2">
          <Row>
            <View
              className="h-10 w-10 items-center justify-center rounded-2xl"
              style={{ backgroundColor: `${theme.primary}18` }}
            >
              <Icon name={habit.icon as 'chart'} size={18} color={theme.primary} />
            </View>
            <View className="ml-3 flex-1">
              <Text variant="subheading">{t(`maintenance.habits.${habit.key}.title`)}</Text>
              <Text variant="body" className="mt-0.5">
                {t(`maintenance.habits.${habit.key}.body`)}
              </Text>
            </View>
          </Row>
        </Card>
      ))}

      <SectionTitle title={t('maintenance.reviewTitle')} />
      <Card>
        <Text variant="body">{t('maintenance.reviewBody')}</Text>
        <Row className="mt-3 gap-2">
          <Button
            label={t('maintenance.seeCheckpoints')}
            variant="secondary"
            size="sm"
            onPress={() => navigation.navigate('Checkpoints')}
          />
          <Button
            label={t('maintenance.logWeight')}
            size="sm"
            onPress={() => navigation.navigate('LogWeight')}
          />
        </Row>
      </Card>

      <SectionTitle title={t('maintenance.helpTitle')} />
      <CallDoctorCard
        title={t('maintenance.helpCardTitle')}
        subtitle={t('maintenance.helpCardBody')}
        urgent={crossed}
        reason="relapse"
      />

      <Text variant="caption" className="mt-6">
        {t('safety.notMedicalAdvice')}
      </Text>
    </Screen>
  );
}
