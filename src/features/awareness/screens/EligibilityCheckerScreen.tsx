import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import { View } from 'react-native';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import type { RootStackParamList } from '@/app/navigation/types';
import {
  comorbidityLabel,
  contraindicationLabel,
  evaluateEligibility,
} from '@core/clinical/eligibility';
import type {
  Comorbidity,
  Contraindication,
  EligibilityResult,
  Sex,
} from '@core/domain/types';
import { saveProfile } from '@features/profile/api/profileRepository';
import { useTranslation } from '@i18n/useTranslation';
import {
  Badge,
  Button,
  Card,
  Chip,
  Field,
  Input,
  Row,
  Screen,
  SectionTitle,
  Text,
} from '@ui/components';
import { Icon } from '@ui/components/Icon';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const schema = z.object({
  heightCm: z
    .string()
    .min(1, 'Height is needed')
    .refine((v) => Number(v) >= 100 && Number(v) <= 250, 'Enter height in cm (100-250)'),
  weightKg: z
    .string()
    .min(1, 'Weight is needed')
    .refine((v) => Number(v) >= 25 && Number(v) <= 400, 'Enter weight in kg (25-400)'),
  waistCm: z
    .string()
    .optional()
    .refine((v) => !v || (Number(v) >= 40 && Number(v) <= 250), 'Enter waist in cm (40-250)'),
  age: z
    .string()
    .optional()
    .refine((v) => !v || (Number(v) >= 10 && Number(v) <= 100), 'Enter an age between 10 and 100'),
});

type FormValues = z.infer<typeof schema>;

const COMORBIDITIES: Comorbidity[] = [
  'type2_diabetes',
  'prediabetes',
  'hypertension',
  'dyslipidaemia',
  'osa',
  'pcos',
  'nafld',
  'osteoarthritis',
  'cvd',
  'infertility',
];

const CONTRAINDICATIONS: Contraindication[] = [
  'pregnancy',
  'breastfeeding',
  'mtc_men2_history',
  'pancreatitis_history',
  'type1_diabetes',
  'severe_gi_disease',
  'active_eating_disorder',
];

const SEXES: { value: Sex; label: string }[] = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'other', label: 'Other' },
  { value: 'undisclosed', label: 'Prefer not to say' },
];

export function EligibilityCheckerScreen() {
  const navigation = useNavigation<Nav>();
  const { t } = useTranslation();

  const [sex, setSex] = useState<Sex>('undisclosed');
  const [comorbidities, setComorbidities] = useState<Comorbidity[]>([]);
  const [contraindications, setContraindications] = useState<Contraindication[]>([]);
  const [result, setResult] = useState<EligibilityResult | null>(null);

  const { control, handleSubmit, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { heightCm: '', weightKg: '', waistCm: '', age: '' },
  });

  const toggle = <T,>(list: T[], value: T, setter: (next: T[]) => void) => {
    setter(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  };

  const onSubmit = handleSubmit(async (values) => {
    const input = {
      heightCm: Number(values.heightCm),
      weightKg: Number(values.weightKg),
      waistCm: values.waistCm ? Number(values.waistCm) : null,
      age: values.age ? Number(values.age) : null,
      sex,
      comorbidities,
      contraindications,
    };

    setResult(evaluateEligibility(input));

    // Persist so the coach and the dashboard use the same numbers.
    await saveProfile({
      heightCm: input.heightCm,
      startingWeightKg: input.weightKg,
      waistCm: input.waistCm,
      sex,
      comorbidities,
      contraindications,
    });
  });

  return (
    <Screen title={t('eligibility.title')} subtitle={t('eligibility.subtitle')}>
      <Card>
        <Controller
          control={control}
          name="heightCm"
          render={({ field, fieldState }) => (
            <Field label={`${t('eligibility.height')} (cm)`} error={fieldState.error?.message}>
              <Input
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                keyboardType="decimal-pad"
                placeholder="e.g. 165"
                testID="height-input"
              />
            </Field>
          )}
        />

        <Controller
          control={control}
          name="weightKg"
          render={({ field, fieldState }) => (
            <Field label={`${t('eligibility.weight')} (kg)`} error={fieldState.error?.message}>
              <Input
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                keyboardType="decimal-pad"
                placeholder="e.g. 82"
                testID="weight-input"
              />
            </Field>
          )}
        />

        <Controller
          control={control}
          name="waistCm"
          render={({ field, fieldState }) => (
            <Field
              label={`${t('eligibility.waist')} (cm)`}
              error={fieldState.error?.message}
              hint="Measure at the navel, after breathing out. In Indian populations this matters as much as BMI."
            >
              <Input
                value={field.value ?? ''}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                keyboardType="decimal-pad"
                placeholder="e.g. 94"
              />
            </Field>
          )}
        />

        <Controller
          control={control}
          name="age"
          render={({ field, fieldState }) => (
            <Field label={t('eligibility.age')} error={fieldState.error?.message}>
              <Input
                value={field.value ?? ''}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                keyboardType="number-pad"
                placeholder="e.g. 38"
              />
            </Field>
          )}
        />

        <Field label={t('eligibility.sex')}>
          <View className="flex-row flex-wrap">
            {SEXES.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                selected={sex === option.value}
                onPress={() => setSex(option.value)}
              />
            ))}
          </View>
        </Field>
      </Card>

      <SectionTitle title={t('eligibility.comorbidities')} />
      <Card>
        <View className="flex-row flex-wrap">
          {COMORBIDITIES.map((code) => (
            <Chip
              key={code}
              label={comorbidityLabel(code)}
              selected={comorbidities.includes(code)}
              onPress={() => toggle(comorbidities, code, setComorbidities)}
            />
          ))}
        </View>
      </Card>

      <SectionTitle title={t('eligibility.contraindications')} />
      <Card>
        <View className="flex-row flex-wrap">
          {CONTRAINDICATIONS.map((code) => (
            <Chip
              key={code}
              label={contraindicationLabel(code)}
              selected={contraindications.includes(code)}
              onPress={() => toggle(contraindications, code, setContraindications)}
            />
          ))}
        </View>
        <Text variant="caption" className="mt-2">
          These change whether medicine is safe for you, so they matter more than BMI.
        </Text>
      </Card>

      <Button
        className="mt-6"
        label={t('eligibility.check')}
        fullWidth
        size="lg"
        loading={formState.isSubmitting}
        onPress={onSubmit}
      />

      {result ? <ResultCard result={result} onTalkToDoctor={() => navigation.navigate('Awareness', { screen: 'Doctors' })} onAsk={() => navigation.navigate('Chat', { initialPrompt: 'Can you explain my eligibility result in simple terms?' })} /> : null}
    </Screen>
  );
}

function ResultCard({
  result,
  onTalkToDoctor,
  onAsk,
}: {
  result: EligibilityResult;
  onTalkToDoctor: () => void;
  onAsk: () => void;
}) {
  const { t } = useTranslation();

  const tone =
    result.verdict === 'likely_eligible'
      ? 'success'
      : result.verdict === 'possibly_eligible'
        ? 'brand'
        : result.verdict === 'not_advisable'
          ? 'danger'
          : 'warning';

  return (
    <View className="mt-6">
      <Card>
        <Row className="justify-between">
          <Text variant="heading">Your result</Text>
          <Badge label={t(`eligibility.verdict.${result.verdict}`)} tone={tone} />
        </Row>

        {result.bmi ? (
          <View className="mt-3 rounded-2xl bg-surface-sunken p-4 dark:bg-dark-surface-sunken">
            <Row className="justify-between">
              <View>
                <Text variant="caption">BMI</Text>
                <Text variant="display">{result.bmi}</Text>
              </View>
              <View className="flex-1 pl-4">
                <Text variant="caption">Category (Asian-Indian)</Text>
                <Text variant="bodyStrong">{result.bmiCategoryIndian}</Text>
              </View>
            </Row>
            {result.waistFlag !== null ? (
              <Row className="mt-3">
                <Icon
                  name={result.waistFlag ? 'warning' : 'check'}
                  size={16}
                  color={result.waistFlag ? '#b97b0d' : '#0b955c'}
                />
                <Text variant="caption" className="ml-2 flex-1">
                  {result.waistFlag
                    ? 'Waist is at or above the Indian risk threshold'
                    : 'Waist is below the Indian risk threshold'}
                </Text>
              </Row>
            ) : null}
          </View>
        ) : null}

        <Text variant="label" className="mt-4">
          Why
        </Text>
        {result.reasons.map((reason) => (
          <Text key={reason} variant="body" className="mt-1">
            • {reason}
          </Text>
        ))}

        {result.missing.length ? (
          <Text variant="caption" className="mt-3">
            Missing: {result.missing.join(', ')}. Adding these makes the result more accurate.
          </Text>
        ) : null}

        <Text variant="label" className="mt-4">
          What to do next
        </Text>
        {result.nextSteps.map((step) => (
          <Text key={step} variant="body" className="mt-1">
            • {step}
          </Text>
        ))}

        <View className="mt-4 rounded-2xl bg-warn-100/60 p-3 dark:bg-amber-900/20">
          <Text variant="caption">{result.disclaimer}</Text>
        </View>

        <Text variant="caption" className="mt-3">
          Based on: {result.guidelineRefs.join(' · ')}
        </Text>
      </Card>

      <View className="mt-3 gap-2">
        <Button label={t('awareness.talkToDoctor')} fullWidth onPress={onTalkToDoctor} />
        <Button
          label="Ask the coach about this"
          variant="secondary"
          fullWidth
          onPress={onAsk}
        />
      </View>
    </View>
  );
}
