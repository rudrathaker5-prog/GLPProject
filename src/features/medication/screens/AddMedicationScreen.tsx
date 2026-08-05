import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import type { AllParamList } from '@/app/navigation/types';
import type { DoseFrequency, MedicationForm } from '@core/domain/types';
import {
  addMedication,
  frequencyLabel,
  WEEKDAY_LABELS,
} from '@features/medication/api/medicationRepository';
import { useTranslation } from '@i18n/useTranslation';
import { Button, Card, Chip, Field, Input, Row, Screen, Text } from '@ui/components';

type Nav = NativeStackNavigationProp<AllParamList>;
type Props = RouteProp<AllParamList, 'AddMedication'>;

const FORMS: MedicationForm[] = ['injection', 'tablet', 'capsule', 'syrup', 'other'];
const FREQUENCIES: DoseFrequency[] = [
  'weekly',
  'daily',
  'twice_daily',
  'thrice_daily',
  'as_needed',
];

const DEFAULT_TIMES: Record<DoseFrequency, string[]> = {
  weekly: ['09:00'],
  daily: ['09:00'],
  twice_daily: ['09:00', '21:00'],
  thrice_daily: ['09:00', '14:00', '21:00'],
  as_needed: [],
};

export function AddMedicationScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Props>();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const [name, setName] = useState('');
  const [strength, setStrength] = useState('');
  const [form, setForm] = useState<MedicationForm>('injection');
  const [doseAmount, setDoseAmount] = useState('1');
  const [doseUnit, setDoseUnit] = useState('mg');
  const [frequency, setFrequency] = useState<DoseFrequency>('weekly');
  const [times, setTimes] = useState<string[]>(['09:00']);
  const [weekday, setWeekday] = useState<number>(new Date().getDay());
  const [durationDays, setDurationDays] = useState('');
  const [unitsRemaining, setUnitsRemaining] = useState('');
  const [instructions, setInstructions] = useState('');

  const save = useMutation({
    mutationFn: () =>
      addMedication({
        name: name.trim(),
        form,
        strength: strength.trim(),
        doseAmount: Number(doseAmount) || 1,
        doseUnit: doseUnit.trim() || 'mg',
        frequency,
        timesOfDay: frequency === 'as_needed' ? [] : times,
        daysOfWeek: frequency === 'weekly' ? [weekday] : null,
        durationDays: durationDays ? Number(durationDays) : null,
        unitsRemaining: unitsRemaining ? Number(unitsRemaining) : null,
        instructions: instructions.trim() || null,
        prescriptionId: route.params?.prescriptionId ?? null,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['medications'] });
      void queryClient.invalidateQueries({ queryKey: ['doses'] });
      Alert.alert(
        'Medicine added',
        frequency === 'as_needed'
          ? 'Saved. No reminders were created for an as-needed medicine.'
          : 'Reminders are scheduled for every dose.',
        [{ text: 'Done', onPress: () => navigation.goBack() }],
      );
    },
    onError: (error) =>
      Alert.alert('Could not save', error instanceof Error ? error.message : 'Please try again.'),
  });

  const changeFrequency = (next: DoseFrequency) => {
    setFrequency(next);
    setTimes(DEFAULT_TIMES[next]);
  };

  const updateTime = (index: number, value: string) => {
    setTimes((current) => current.map((time, i) => (i === index ? value : time)));
  };

  const valid = name.trim().length > 1 && (frequency === 'as_needed' || times.length > 0);

  return (
    <Screen
      title={t('medication.addMedication')}
      subtitle="Enter exactly what your prescription says. Reminders are built from this."
    >
      <Card>
        <Field label="Medicine name">
          <Input
            value={name}
            onChangeText={setName}
            placeholder="e.g. Semaglutide pen"
            autoCapitalize="words"
          />
        </Field>

        <Field label="Strength" hint="As printed on the pack.">
          <Input value={strength} onChangeText={setStrength} placeholder="e.g. 0.5 mg / dose" />
        </Field>

        <Field label="Form">
          <Row className="flex-wrap">
            {FORMS.map((option) => (
              <Chip
                key={option}
                label={option}
                selected={form === option}
                onPress={() => setForm(option)}
              />
            ))}
          </Row>
        </Field>

        <Row className="gap-3">
          <View className="flex-1">
            <Field label="Dose">
              <Input value={doseAmount} onChangeText={setDoseAmount} keyboardType="decimal-pad" />
            </Field>
          </View>
          <View className="flex-1">
            <Field label="Unit">
              <Input value={doseUnit} onChangeText={setDoseUnit} placeholder="mg" autoCapitalize="none" />
            </Field>
          </View>
        </Row>
      </Card>

      <Card className="mt-3">
        <Field label="How often">
          <Row className="flex-wrap">
            {FREQUENCIES.map((option) => (
              <Chip
                key={option}
                label={frequencyLabel(option)}
                selected={frequency === option}
                onPress={() => changeFrequency(option)}
              />
            ))}
          </Row>
        </Field>

        {frequency === 'weekly' ? (
          <Field label="Which day">
            <Row className="flex-wrap">
              {WEEKDAY_LABELS.map((label, index) => (
                <Chip
                  key={label}
                  label={label}
                  selected={weekday === index}
                  onPress={() => setWeekday(index)}
                />
              ))}
            </Row>
          </Field>
        ) : null}

        {times.map((time, index) => (
          <Field key={index} label={`Time ${times.length > 1 ? index + 1 : ''}`.trim()}>
            <Input
              value={time}
              onChangeText={(value) => updateTime(index, value)}
              placeholder="HH:MM"
              keyboardType="default"
            />
          </Field>
        ))}

        {frequency === 'as_needed' ? (
          <Text variant="caption">No reminders are created for as-needed medicines.</Text>
        ) : null}
      </Card>

      <Card className="mt-3">
        <Field label="Duration (days)" hint="Optional — leave blank if ongoing.">
          <Input
            value={durationDays}
            onChangeText={setDurationDays}
            keyboardType="number-pad"
            placeholder="e.g. 28"
          />
        </Field>

        <Field
          label="Doses left in hand"
          hint="Lets the app work out when you need a refill and warn you in advance."
        >
          <Input
            value={unitsRemaining}
            onChangeText={setUnitsRemaining}
            keyboardType="number-pad"
            placeholder="e.g. 4"
          />
        </Field>

        <Field label="Instructions" hint="Anything your doctor told you about taking it.">
          <Input
            value={instructions}
            onChangeText={setInstructions}
            placeholder="e.g. Inject into the abdomen, rotate the site each week"
            multiline
          />
        </Field>
      </Card>

      <Button
        className="mt-6"
        label="Save and create reminders"
        fullWidth
        size="lg"
        disabled={!valid}
        loading={save.isPending}
        onPress={() => save.mutate()}
      />
    </Screen>
  );
}
