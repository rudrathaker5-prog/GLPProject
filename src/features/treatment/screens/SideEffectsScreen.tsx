import { useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { View } from 'react-native';

import type { AllParamList } from '@/app/navigation/types';
import type { SideEffectCode } from '@core/domain/types';
import { CallDoctorCard } from '@features/doctors/components/CallDoctorCard';
import { EmergencyCallCard } from '@features/calls/components/EmergencyCallCard';
import {
  needsClinicalReview,
  sideEffectTrend,
  type SideEffectTrendEntry,
} from '@features/vigilance/api/vigilanceRepository';
import { useTranslation } from '@i18n/useTranslation';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Row,
  Screen,
  SectionTitle,
  Text,
} from '@ui/components';
import { Icon } from '@ui/components/Icon';
import { useTheme } from '@ui/theme/ThemeProvider';

type Nav = NativeStackNavigationProp<AllParamList>;

/**
 * Side effects over time, and what to do about them.
 *
 * Check-ins have always captured side effects. Nothing ever read them back, so
 * the data went in and stayed there. That matters because the signal is in the
 * pattern, not the event: one bout of nausea is expected on a GLP-1 and tells
 * you nothing, while the same symptom in four consecutive check-ins, or one
 * that is getting worse, is the thing worth a phone call — and it is precisely
 * what a patient cannot see from the inside, because each individual day feels
 * survivable.
 *
 * The escalation is deliberately one tap from the pattern that triggered it.
 */
export function SideEffectsScreen() {
  const navigation = useNavigation<Nav>();
  const { theme } = useTheme();
  const { t } = useTranslation();

  const trend = useQuery({ queryKey: ['sideEffectTrend'], queryFn: () => sideEffectTrend(60) });
  const entries = trend.data ?? [];
  const review = needsClinicalReview(entries);

  /** Anything in this set means stop reading and ring someone. */
  const emergency = entries.some(
    (entry) =>
      entry.code === 'severe_abdominal_pain' ||
      (entry.code === 'hypoglycaemia' && entry.worstSeverity === 'severe'),
  );

  return (
    <Screen refreshing={trend.isRefetching} onRefresh={() => void trend.refetch()}>
      <Text variant="display">{t('sideEffects.title')}</Text>
      <Text variant="body" className="mt-2">
        {t('sideEffects.intro')}
      </Text>

      {emergency ? (
        <View className="mt-4">
          <EmergencyCallCard title={t('sideEffects.emergencyTitle')} />
        </View>
      ) : null}

      {entries.length === 0 ? (
        <View className="mt-6">
          <EmptyState
            title={t('sideEffects.emptyTitle')}
            message={t('sideEffects.emptyBody')}
            action={
              <Button
                label={t('sideEffects.doCheckIn')}
                onPress={() => navigation.navigate('CheckIn', {})}
              />
            }
          />
        </View>
      ) : (
        <>
          {review.length > 0 ? (
            <>
              <SectionTitle title={t('sideEffects.worthACall')} />
              <Card className="border-warn-400 bg-warn-100/40 dark:bg-amber-900/20">
                <Row className="mb-1">
                  <Icon name="warning" size={20} color="#8a5b0a" />
                  <Text variant="subheading" className="ml-2 flex-1">
                    {t('sideEffects.reviewTitle', { count: review.length })}
                  </Text>
                </Row>
                <Text variant="body">{t('sideEffects.reviewBody')}</Text>
              </Card>
            </>
          ) : null}

          <SectionTitle title={t('sideEffects.last60Days')} />
          {entries.map((entry) => (
            <SideEffectRow key={entry.code} entry={entry} flagged={review.includes(entry)} />
          ))}
        </>
      )}

      <SectionTitle title={t('sideEffects.talkTitle')} />
      <CallDoctorCard
        title={t('sideEffects.callTitle')}
        subtitle={t('sideEffects.callBody')}
        urgent={review.length > 0}
        reason="side_effect"
      />

      <Card className="mt-3" onPress={() => navigation.navigate('Chat', {
        initialPrompt: entries.length
          ? t('sideEffects.coachPrompt', { effect: t(`sideEffects.codes.${entries[0].code}`) })
          : undefined,
      })}>
        <Row className="justify-between">
          <Row className="flex-1">
            <Icon name="chat" size={18} color={theme.primary} />
            <Text variant="subheading" className="ml-2 flex-1">
              {t('sideEffects.askCoach')}
            </Text>
          </Row>
          <Icon name="chevron" size={18} color={theme.textMuted} />
        </Row>
        <Text variant="body" className="mt-1">
          {t('sideEffects.askCoachBody')}
        </Text>
      </Card>

      <Text variant="caption" className="mt-6">
        {t('safety.notMedicalAdvice')}
      </Text>
    </Screen>
  );
}

function SideEffectRow({
  entry,
  flagged,
}: {
  entry: SideEffectTrendEntry;
  flagged: boolean;
}) {
  const { t } = useTranslation();

  const tone =
    entry.worstSeverity === 'severe'
      ? 'danger'
      : entry.worstSeverity === 'moderate'
        ? 'warning'
        : 'neutral';

  const since = Math.floor(
    (Date.now() - new Date(entry.lastReportedAt).getTime()) / 86_400_000,
  );

  return (
    <Card className={`mb-2 ${flagged ? 'border-warn-400' : ''}`}>
      <Row className="justify-between">
        <View className="flex-1 pr-2">
          <Text variant="subheading">
            {t(`sideEffects.codes.${entry.code}` as `sideEffects.codes.${SideEffectCode}`)}
          </Text>
          <Text variant="caption" className="mt-0.5">
            {t('sideEffects.reportedTimes', { count: entry.occurrences })} ·{' '}
            {since === 0 ? t('common.today') : t('sideEffects.daysAgo', { days: since })}
          </Text>
        </View>
        <View className="items-end">
          <Badge label={t(`sideEffects.severity.${entry.worstSeverity}`)} tone={tone} />
          {entry.worsening ? (
            <View className="mt-1">
              <Badge label={t('sideEffects.worsening')} tone="warning" />
            </View>
          ) : null}
        </View>
      </Row>
    </Card>
  );
}
