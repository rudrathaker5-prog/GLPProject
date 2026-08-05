import { useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { View } from 'react-native';

import type { RootStackParamList } from '@/app/navigation/types';
import type { JourneyEvent, JourneyEventType } from '@core/domain/types';
import { listJourneyEvents, listMilestones } from '@features/journey/api/journeyRepository';
import { getProfile } from '@features/profile/api/profileRepository';
import { progressSummary } from '@features/tracking/api/trackingRepository';
import { useTranslation } from '@i18n/useTranslation';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  LoadingState,
  Row,
  Screen,
  SectionTitle,
  Text,
} from '@ui/components';
import { Icon, type IconName } from '@ui/components/Icon';
import { useTheme } from '@ui/theme/ThemeProvider';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const EVENT_ICON: Record<JourneyEventType, IconName> = {
  diagnosis: 'shield',
  treatment_start: 'sparkle',
  dose_escalation: 'chart',
  appointment: 'calendar',
  milestone: 'trophy',
  achievement: 'trophy',
  prescription: 'pill',
  phase_change: 'refresh',
  relapse_alert: 'warning',
  treatment_complete: 'check',
};

export function JourneyScreen() {
  const navigation = useNavigation<Nav>();
  const { theme } = useTheme();
  const { t } = useTranslation();

  const events = useQuery({ queryKey: ['journey'], queryFn: listJourneyEvents });
  const milestones = useQuery({ queryKey: ['milestones'], queryFn: listMilestones });
  const profile = useQuery({ queryKey: ['profile'], queryFn: getProfile });
  const progress = useQuery({ queryKey: ['progress'], queryFn: progressSummary });

  const phase = currentPhase(profile.data?.treatmentStartedAt ?? null);

  return (
    <Screen
      title={t('treatment.journeyMap')}
      subtitle="Everything that has happened, in order."
      refreshing={events.isRefetching}
      onRefresh={() => void events.refetch()}
    >
      {/* Current phase */}
      <Card className="border-brand-200 bg-brand-50 dark:border-brand-800 dark:bg-brand-900/20">
        <Row className="justify-between">
          <View className="flex-1 pr-2">
            <Text variant="caption">Current phase</Text>
            <Text variant="heading" className="mt-1">
              {phase.title}
            </Text>
            <Text variant="body" className="mt-1">
              {phase.description}
            </Text>
          </View>
          <Icon name="sparkle" size={22} color={theme.primary} />
        </Row>

        {progress.data?.percentLost ? (
          <Row className="mt-3 gap-2">
            <Badge label={`${progress.data.percentLost}% down`} tone="success" />
            {progress.data.lostKg ? (
              <Badge label={`${progress.data.lostKg} kg lost`} tone="brand" />
            ) : null}
          </Row>
        ) : null}
      </Card>

      {/* Milestones strip */}
      {(milestones.data ?? []).length > 0 ? (
        <>
          <SectionTitle title="Milestones" />
          <Row className="flex-wrap">
            {(milestones.data ?? []).map((milestone) => (
              <Badge
                key={milestone.id}
                label={milestone.code.replace(/_/g, ' ')}
                tone="success"
                className="mb-2 mr-2"
              />
            ))}
          </Row>
        </>
      ) : null}

      <SectionTitle title="Timeline" />

      {events.isLoading ? <LoadingState /> : null}

      {!events.isLoading && (events.data ?? []).length === 0 ? (
        <EmptyState
          title="Nothing here yet"
          message="Your journey builds itself as you add medicines, log weight, book appointments and hit milestones."
          action={
            <Button
              label="Add your prescription"
              onPress={() => navigation.navigate('PrescriptionUpload')}
            />
          }
        />
      ) : null}

      <View className="mt-1">
        {(events.data ?? []).map((event, index) => (
          <TimelineRow
            key={event.id}
            event={event}
            last={index === (events.data ?? []).length - 1}
          />
        ))}
      </View>
    </Screen>
  );
}

function TimelineRow({ event, last }: { event: JourneyEvent; last: boolean }) {
  const { theme } = useTheme();
  const tone =
    event.type === 'relapse_alert'
      ? theme.danger
      : event.type === 'milestone' || event.type === 'achievement'
        ? theme.accent
        : theme.primary;

  return (
    <Row className="items-stretch">
      <View className="w-10 items-center">
        <View
          className="h-9 w-9 items-center justify-center rounded-full"
          style={{ backgroundColor: `${tone}22` }}
        >
          <Icon name={EVENT_ICON[event.type]} size={18} color={tone} />
        </View>
        {!last ? <View className="w-px flex-1 bg-slate-200 dark:bg-slate-700" /> : null}
      </View>

      <View className="flex-1 pb-5 pl-3">
        <Text variant="caption">
          {new Date(event.occurredAt).toLocaleString('en-IN', {
            dateStyle: 'medium',
            timeStyle: 'short',
          })}
        </Text>
        <Text variant="subheading" className="mt-0.5">
          {event.title}
        </Text>
        {event.description ? (
          <Text variant="body" className="mt-1">
            {event.description}
          </Text>
        ) : null}
      </View>
    </Row>
  );
}

function currentPhase(startedAt: string | null): { title: string; description: string } {
  if (!startedAt) {
    return {
      title: 'Getting set up',
      description: 'Add your prescription and log a weight to start your timeline.',
    };
  }

  const weeks = Math.floor((Date.now() - new Date(startedAt).getTime()) / (7 * 86_400_000));

  if (weeks < 4) {
    return {
      title: `Titration — week ${weeks + 1}`,
      description:
        'Dose is being stepped up. Side effects peak in the days after each increase and settle. Weight change is often small here — that is normal.',
    };
  }
  if (weeks < 12) {
    return {
      title: `Building — week ${weeks + 1}`,
      description:
        'The dose is doing its work. This is where protein and resistance training matter most, to protect muscle while fat comes off.',
    };
  }
  if (weeks < 26) {
    return {
      title: `Steady state — month ${Math.floor(weeks / 4) + 1}`,
      description:
        'Most of the measurable health improvement happens in this stretch. Keep consistency over intensity.',
    };
  }
  return {
    title: `Long term — month ${Math.floor(weeks / 4) + 1}`,
    description:
      'Time to plan the next phase with your doctor: continue, reduce, or move into structured maintenance.',
  };
}
