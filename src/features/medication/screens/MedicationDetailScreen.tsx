import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Alert, View } from 'react-native';

import type { RootStackParamList } from '@/app/navigation/types';
import {
  frequencyLabel,
  getMedication,
  listDoseEvents,
  refillDaysRemaining,
  setDoseStatus,
  stopMedication,
  WEEKDAY_LABELS,
} from '@features/medication/api/medicationRepository';
import { useTranslation } from '@i18n/useTranslation';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  LoadingState,
  ProgressBar,
  Row,
  Screen,
  SectionTitle,
  Text,
} from '@ui/components';
import { Icon } from '@ui/components/Icon';
import { useTheme } from '@ui/theme/ThemeProvider';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Props = RouteProp<RootStackParamList, 'MedicationDetail'>;

export function MedicationDetailScreen() {
  const route = useRoute<Props>();
  const navigation = useNavigation<Nav>();
  const queryClient = useQueryClient();
  const { theme } = useTheme();
  const { t } = useTranslation();

  const medication = useQuery({
    queryKey: ['medication', route.params.medicationId],
    queryFn: () => getMedication(route.params.medicationId),
  });

  const history = useQuery({
    queryKey: ['doses', 'history', route.params.medicationId],
    queryFn: async () => {
      const all = await listDoseEvents(60, 14);
      return all.filter((d) => d.medicationId === route.params.medicationId);
    },
  });

  const update = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'taken' | 'missed' | 'skipped' }) =>
      setDoseStatus(id, status),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['doses'] });
      void queryClient.invalidateQueries({ queryKey: ['medications'] });
    },
  });

  const stop = useMutation({
    mutationFn: () => stopMedication(route.params.medicationId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['medications'] });
      void queryClient.invalidateQueries({ queryKey: ['doses'] });
      navigation.goBack();
    },
  });

  if (medication.isLoading) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }

  const item = medication.data;
  if (!item) {
    return (
      <Screen>
        <EmptyState
          title="Medicine not found"
          message="It may have been removed."
          action={<Button label="Back" onPress={() => navigation.goBack()} />}
        />
      </Screen>
    );
  }

  const days = refillDaysRemaining(item);
  const past = (history.data ?? [])
    .filter((d) => new Date(d.scheduledFor) <= new Date())
    .sort((a, b) => b.scheduledFor.localeCompare(a.scheduledFor))
    .slice(0, 14);

  const confirmStop = () => {
    Alert.alert(
      'Stop this medicine?',
      'Reminders will be cancelled. Only do this if your doctor has told you to stop.',
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: 'Stop', style: 'destructive', onPress: () => stop.mutate() },
      ],
    );
  };

  return (
    <Screen>
      <Row className="justify-between">
        <View className="flex-1 pr-2">
          <Text variant="title">
            {item.name} {item.strength}
          </Text>
          {item.genericName ? (
            <Text variant="caption" className="mt-1">
              {item.genericName}
            </Text>
          ) : null}
        </View>
        <Badge label={item.active ? 'Active' : 'Stopped'} tone={item.active ? 'success' : 'neutral'} />
      </Row>

      <Card className="mt-4">
        <Text variant="label">{t('medication.schedule')}</Text>
        <Text variant="bodyStrong" className="mt-1">
          {item.doseAmount} {item.doseUnit} · {frequencyLabel(item.frequency)}
        </Text>
        <Row className="mt-2">
          <Icon name="bell" size={16} color={theme.textMuted} />
          <Text variant="body" className="ml-2">
            {item.timesOfDay.join(', ')}
          </Text>
        </Row>
        {item.daysOfWeek?.length ? (
          <Row className="mt-1">
            <Icon name="calendar" size={16} color={theme.textMuted} />
            <Text variant="body" className="ml-2">
              {item.daysOfWeek.map((d) => WEEKDAY_LABELS[d]).join(', ')}
            </Text>
          </Row>
        ) : null}
        <Text variant="caption" className="mt-2">
          Started {new Date(item.startDate).toLocaleDateString('en-IN', { dateStyle: 'medium' })}
          {item.endDate
            ? ` · ends ${new Date(item.endDate).toLocaleDateString('en-IN', { dateStyle: 'medium' })}`
            : ''}
        </Text>
      </Card>

      {item.instructions ? (
        <Card className="mt-3">
          <Text variant="label">How to take it</Text>
          <Text variant="body" className="mt-1">
            {item.instructions}
          </Text>
        </Card>
      ) : null}

      {item.storageNote ? (
        <Card className="mt-3">
          <Text variant="label">{t('medication.storage')}</Text>
          <Text variant="body" className="mt-1">
            {item.storageNote}
          </Text>
        </Card>
      ) : null}

      {days !== null ? (
        <Card className="mt-3">
          <ProgressBar
            label={t('medication.refillIn', { days })}
            value={Math.min(100, (days / 30) * 100)}
            tone={days <= item.refillThresholdDays ? 'danger' : 'success'}
          />
          <Text variant="caption" className="mt-2">
            {t('medication.dosesRemaining', { count: item.unitsRemaining ?? 0 })}
          </Text>
          <Button
            className="mt-3"
            label={t('medication.refillNow')}
            variant={days <= item.refillThresholdDays ? 'primary' : 'secondary'}
            onPress={() => navigation.navigate('Refill', { medicationId: item.id })}
          />
        </Card>
      ) : null}

      <SectionTitle title="Recent doses" />
      {past.length === 0 ? (
        <Text variant="body">No doses recorded yet.</Text>
      ) : (
        <Card>
          {past.map((dose) => {
            const when = new Date(dose.scheduledFor);
            const tone =
              dose.status === 'taken'
                ? 'success'
                : dose.status === 'missed'
                  ? 'danger'
                  : dose.status === 'skipped'
                    ? 'warning'
                    : 'neutral';
            return (
              <Row key={dose.id} className="mb-3 last:mb-0 justify-between">
                <View className="flex-1">
                  <Text variant="body">
                    {when.toLocaleDateString('en-IN', {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                    })}
                  </Text>
                  <Text variant="caption">
                    {when.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
                <Badge label={dose.status} tone={tone} />
                {dose.status !== 'taken' ? (
                  <Button
                    className="ml-2"
                    label="Mark taken"
                    size="sm"
                    variant="ghost"
                    loading={update.isPending}
                    onPress={() => update.mutate({ id: dose.id, status: 'taken' })}
                  />
                ) : null}
              </Row>
            );
          })}
        </Card>
      )}

      <View className="mt-6 gap-2">
        <Button
          label="Ask the coach about this medicine"
          variant="secondary"
          fullWidth
          onPress={() =>
            navigation.navigate('Chat', {
              initialPrompt: `Tell me what I should know about taking ${item.name}.`,
            })
          }
        />
        {item.active ? (
          <Button
            label="Stop this medicine"
            variant="ghost"
            fullWidth
            loading={stop.isPending}
            onPress={confirmStop}
          />
        ) : null}
      </View>

      <Text variant="caption" className="mt-4 text-center">
        Never change a dose without your doctor.
      </Text>
    </Screen>
  );
}
