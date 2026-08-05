import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import type { AllParamList } from '@/app/navigation/types';
import type { RefillChannel } from '@core/domain/types';
import {
  listMedications,
  listRefills,
  refillDaysRemaining,
  requestRefill,
} from '@features/medication/api/medicationRepository';
import { useTranslation } from '@i18n/useTranslation';
import {
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  Field,
  Input,
  ProgressBar,
  Row,
  Screen,
  SectionTitle,
  Text,
} from '@ui/components';
import { Icon } from '@ui/components/Icon';
import { useTheme } from '@ui/theme/ThemeProvider';

type Nav = NativeStackNavigationProp<AllParamList>;
type Props = RouteProp<AllParamList, 'Refill'>;

const CHANNELS: { value: RefillChannel; label: string; detail: string }[] = [
  {
    value: 'hospital_pharmacy',
    label: 'Hospital pharmacy',
    detail: 'Collect from the clinic where you are treated. Cold chain is handled on site.',
  },
  {
    value: 'nearby_pharmacy',
    label: 'Nearby pharmacy',
    detail: 'Fastest option. Confirm the chemist can store injectables at 2-8 °C.',
  },
  {
    value: 'home_delivery',
    label: 'Home delivery',
    detail: 'Delivered to your address. Injectable pens need a cold-chain courier.',
  },
];

export function RefillScreen() {
  const route = useRoute<Props>();
  const navigation = useNavigation<Nav>();
  const queryClient = useQueryClient();
  const { theme } = useTheme();
  const { t } = useTranslation();

  const medications = useQuery({ queryKey: ['medications'], queryFn: () => listMedications() });
  const refills = useQuery({ queryKey: ['refills'], queryFn: listRefills });

  const [selectedId, setSelectedId] = useState<string | undefined>(route.params?.medicationId);
  const [channel, setChannel] = useState<RefillChannel>('hospital_pharmacy');
  const [address, setAddress] = useState('');

  const selected =
    (medications.data ?? []).find((m) => m.id === selectedId) ?? (medications.data ?? [])[0];

  const submit = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error('Pick a medicine first');
      return requestRefill({
        medicationId: selected.id,
        channel,
        addressLine: channel === 'home_delivery' ? address.trim() || null : null,
      });
    },
    onSuccess: (refill) => {
      void queryClient.invalidateQueries({ queryKey: ['refills'] });
      Alert.alert(
        'Refill requested',
        `Expected by ${
          refill.expectedBy
            ? new Date(refill.expectedBy).toLocaleDateString('en-IN', { dateStyle: 'medium' })
            : 'soon'
        }. You will get a notification when it is confirmed.`,
      );
    },
    onError: (error) =>
      Alert.alert('Could not request', error instanceof Error ? error.message : 'Try again.'),
  });

  if ((medications.data ?? []).length === 0) {
    return (
      <Screen title={t('treatment.refillStatus')}>
        <EmptyState
          title="No medicines to refill"
          message="Add your prescription first and refill tracking starts automatically."
          action={
            <Button
              label="Add prescription"
              onPress={() => navigation.navigate('PrescriptionUpload')}
            />
          }
        />
      </Screen>
    );
  }

  return (
    <Screen title={t('medication.refillNow')}>
      <Text variant="label" className="mb-2">
        Which medicine
      </Text>
      <Row className="flex-wrap">
        {(medications.data ?? []).map((medication) => (
          <Chip
            key={medication.id}
            label={medication.name}
            selected={selected?.id === medication.id}
            onPress={() => setSelectedId(medication.id)}
          />
        ))}
      </Row>

      {selected ? (
        <Card className="mt-3">
          <Row className="justify-between">
            <View className="flex-1">
              <Text variant="subheading">
                {selected.name} {selected.strength}
              </Text>
              <Text variant="caption" className="mt-0.5">
                {t('medication.dosesRemaining', { count: selected.unitsRemaining ?? 0 })}
              </Text>
            </View>
            {selected.form === 'injection' ? <Badge label="Cold chain" tone="brand" /> : null}
          </Row>

          {refillDaysRemaining(selected) !== null ? (
            <View className="mt-3">
              <ProgressBar
                label={t('medication.refillIn', { days: refillDaysRemaining(selected) ?? 0 })}
                value={Math.min(100, ((refillDaysRemaining(selected) ?? 0) / 30) * 100)}
                tone={
                  (refillDaysRemaining(selected) ?? 99) <= selected.refillThresholdDays
                    ? 'danger'
                    : 'success'
                }
              />
            </View>
          ) : (
            <Text variant="caption" className="mt-2">
              Add how many doses you have left in the medicine details to get refill warnings.
            </Text>
          )}
        </Card>
      ) : null}

      <SectionTitle title="How would you like it" />
      {CHANNELS.map((option) => (
        <Card
          key={option.value}
          className={`mb-2 ${channel === option.value ? 'border-brand-600 bg-brand-50 dark:bg-brand-900/25' : ''}`}
          onPress={() => setChannel(option.value)}
        >
          <Row className="justify-between">
            <Text variant="subheading" className="flex-1 pr-2">
              {option.label}
            </Text>
            {channel === option.value ? (
              <Icon name="check" size={20} color={theme.primary} />
            ) : null}
          </Row>
          <Text variant="body" className="mt-1">
            {option.detail}
          </Text>
        </Card>
      ))}

      {channel === 'home_delivery' ? (
        <Field label="Delivery address">
          <Input
            value={address}
            onChangeText={setAddress}
            placeholder="Flat, street, area, city, PIN"
            multiline
          />
        </Field>
      ) : null}

      <Button
        className="mt-4"
        label="Request refill"
        fullWidth
        size="lg"
        loading={submit.isPending}
        disabled={!selected || (channel === 'home_delivery' && address.trim().length < 10)}
        onPress={() => submit.mutate()}
      />

      <Text variant="caption" className="mt-3 text-center">
        Your prescription is sent to the pharmacy along with the request. A pharmacist may call you
        to confirm before dispensing.
      </Text>

      {(refills.data ?? []).length > 0 ? (
        <>
          <SectionTitle title="Recent requests" />
          {(refills.data ?? []).map((refill) => {
            const medication = (medications.data ?? []).find((m) => m.id === refill.medicationId);
            return (
              <Card key={refill.id} className="mb-2">
                <Row className="justify-between">
                  <View className="flex-1">
                    <Text variant="bodyStrong">{medication?.name ?? 'Medicine'}</Text>
                    <Text variant="caption">
                      {CHANNELS.find((c) => c.value === refill.channel)?.label} ·{' '}
                      {new Date(refill.requestedAt).toLocaleDateString('en-IN', {
                        dateStyle: 'medium',
                      })}
                    </Text>
                  </View>
                  <Badge
                    label={refill.status}
                    tone={
                      refill.status === 'delivered' || refill.status === 'confirmed'
                        ? 'success'
                        : refill.status === 'cancelled'
                          ? 'danger'
                          : 'brand'
                    }
                  />
                </Row>
                {refill.notes ? (
                  <Text variant="caption" className="mt-2">
                    {refill.notes}
                  </Text>
                ) : null}
              </Card>
            );
          })}
        </>
      ) : null}
    </Screen>
  );
}
