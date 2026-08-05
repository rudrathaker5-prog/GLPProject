import { useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { View } from 'react-native';

import type { AllParamList } from '@/app/navigation/types';
import {
  frequencyLabel,
  listDoseEvents,
  listMedications,
  refillDaysRemaining,
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

type Nav = NativeStackNavigationProp<AllParamList>;

export function MedicationScreen() {
  const navigation = useNavigation<Nav>();
  const { theme } = useTheme();
  const { t } = useTranslation();

  const medications = useQuery({ queryKey: ['medications'], queryFn: () => listMedications() });
  const doses = useQuery({ queryKey: ['doses', 'window'], queryFn: () => listDoseEvents(7, 14) });

  const upcoming = (doses.data ?? [])
    .filter((d) => d.status === 'scheduled' && new Date(d.scheduledFor) > new Date())
    .slice(0, 6);

  return (
    <Screen
      title={t('medication.title')}
      refreshing={medications.isRefetching}
      onRefresh={() => {
        void medications.refetch();
        void doses.refetch();
      }}
    >
      {medications.isLoading ? <LoadingState /> : null}

      {(medications.data ?? []).length === 0 && !medications.isLoading ? (
        <EmptyState
          title="No medicines yet"
          message="Upload a prescription and the schedule plus reminders are created for you. You can also add a medicine by hand."
          action={
            <View className="gap-2">
              <Button
                label="Upload prescription"
                onPress={() => navigation.navigate('PrescriptionUpload')}
              />
              <Button
                label={t('medication.addMedication')}
                variant="secondary"
                onPress={() => navigation.navigate('AddMedication', {})}
              />
            </View>
          }
        />
      ) : null}

      {(medications.data ?? []).map((medication) => {
        const days = refillDaysRemaining(medication);
        const low = days !== null && days <= medication.refillThresholdDays;

        const body = (
          <Card
            key={medication.id}
            className="mb-3"
            onPress={() =>
              navigation.navigate('MedicationDetail', { medicationId: medication.id })
            }
          >
            <Row className="justify-between">
              <View className="flex-1 pr-2">
                <Text variant="subheading">
                  {medication.name} {medication.strength}
                </Text>
                <Text variant="caption" className="mt-0.5">
                  {medication.doseAmount} {medication.doseUnit} · {frequencyLabel(medication.frequency)}
                </Text>
              </View>
              <Badge
                label={medication.form}
                tone={medication.form === 'injection' ? 'brand' : 'neutral'}
              />
            </Row>

            <Row className="mt-3">
              <Icon name="bell" size={16} color={theme.textMuted} />
              <Text variant="caption" className="ml-2">
                {medication.timesOfDay.join(', ')}
                {medication.daysOfWeek?.length
                  ? ` · ${medication.daysOfWeek.map((d) => WEEKDAY_LABELS[d]).join(', ')}`
                  : ''}
              </Text>
            </Row>

            {medication.storageNote ? (
              <Row className="mt-1">
                <Icon name="shield" size={16} color={theme.textMuted} />
                <Text variant="caption" className="ml-2 flex-1">
                  {medication.storageNote}
                </Text>
              </Row>
            ) : null}

            {days !== null ? (
              <View className="mt-3">
                <ProgressBar
                  label={t('medication.refillIn', { days })}
                  value={Math.min(100, (days / 30) * 100)}
                  tone={low ? 'danger' : 'success'}
                />
              </View>
            ) : null}
          </Card>
        );

        /*
          The refill button sits *outside* the card, not inside it.

          A pressable Card is a Pressable, which defaults to accessible={true}
          and collapses its whole subtree into a single node — so a button
          nested in it is unreachable with TalkBack or VoiceOver. This one
          appears precisely when the medicine is running out, which is the worst
          moment for it to be invisible to a screen reader.
        */
        const card =
          low && days !== null ? (
            <View key={medication.id}>
              {body}
              <Button
                className="-mt-1 mb-3"
                label={t('medication.refillNow')}
                size="sm"
                fullWidth
                onPress={() => navigation.navigate('Refill', { medicationId: medication.id })}
              />
            </View>
          ) : (
            body
          );

        return card;
      })}

      {upcoming.length > 0 ? (
        <>
          <SectionTitle title="Coming up" />
          <Card>
            {upcoming.map((dose) => {
              const medication = (medications.data ?? []).find((m) => m.id === dose.medicationId);
              const when = new Date(dose.scheduledFor);
              return (
                <Row key={dose.id} className="mb-3 last:mb-0">
                  <Icon name="calendar" size={16} color={theme.textMuted} />
                  <Text variant="body" className="ml-2 flex-1">
                    {medication?.name ?? 'Dose'}
                  </Text>
                  <Text variant="caption">
                    {when.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}{' '}
                    {when.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </Row>
              );
            })}
          </Card>
        </>
      ) : null}

      {(medications.data ?? []).length > 0 ? (
        <View className="mt-6 gap-2">
          <Button
            label={t('medication.addMedication')}
            variant="secondary"
            fullWidth
            onPress={() => navigation.navigate('AddMedication', {})}
          />
          <Button
            label="Upload another prescription"
            variant="ghost"
            fullWidth
            onPress={() => navigation.navigate('PrescriptionUpload')}
          />
          <Button
            label={t('medication.missedDoseHelp')}
            variant="ghost"
            fullWidth
            // Was routing to chat. The one thing that matters here — do not
            // double up — should not wait on a model round trip, or depend on
            // whether an API key is configured.
            onPress={() => navigation.navigate('MissedDose')}
          />
        </View>
      ) : null}
    </Screen>
  );
}
