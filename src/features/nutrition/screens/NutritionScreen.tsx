import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import { View } from 'react-native';

import type { RootStackParamList } from '@/app/navigation/types';
import {
  generatePlan,
  getActivePlan,
  listNutritionLogs,
  logNutrition,
  weeklyAdherence,
} from '@features/nutrition/api/nutritionRepository';
import { useTranslation } from '@i18n/useTranslation';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  ProgressBar,
  Row,
  Screen,
  SectionTitle,
  StatTile,
  Text,
} from '@ui/components';
import { Icon } from '@ui/components/Icon';
import { useTheme } from '@ui/theme/ThemeProvider';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function NutritionScreen() {
  const navigation = useNavigation<Nav>();
  const queryClient = useQueryClient();
  const { theme } = useTheme();
  const { t } = useTranslation();

  const plan = useQuery({ queryKey: ['nutritionPlan'], queryFn: getActivePlan });
  const logs = useQuery({ queryKey: ['nutritionLogs'], queryFn: () => listNutritionLogs(7) });
  const adherence = useQuery({ queryKey: ['nutritionAdherence'], queryFn: weeklyAdherence });

  const [protein, setProtein] = useState('');
  const [water, setWater] = useState('');
  const [vegetables, setVegetables] = useState('');

  const today = (logs.data ?? []).find(
    (log) => log.loggedOn === new Date().toISOString().slice(0, 10),
  );

  const create = useMutation({
    mutationFn: generatePlan,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['nutritionPlan'] }),
  });

  const save = useMutation({
    mutationFn: () =>
      logNutrition({
        proteinG: protein ? Number(protein) : null,
        waterLitres: water ? Number(water) : null,
        vegetableServings: vegetables ? Number(vegetables) : null,
      }),
    onSuccess: () => {
      setProtein('');
      setWater('');
      setVegetables('');
      void queryClient.invalidateQueries({ queryKey: ['nutritionLogs'] });
      void queryClient.invalidateQueries({ queryKey: ['nutritionAdherence'] });
    },
  });

  if (!plan.data && !plan.isLoading) {
    return (
      <Screen title={t('treatment.nutrition')}>
        <EmptyState
          title="No plan yet"
          message="Your plan is generated from your target weight using ICMR guidance — protein, water, fibre and a meal-by-meal structure built around Indian food."
          action={
            <Button
              label="Create my plan"
              loading={create.isPending}
              onPress={() => create.mutate()}
            />
          }
        />
      </Screen>
    );
  }

  return (
    <Screen
      title={t('treatment.nutrition')}
      subtitle="Built from your target weight, not a generic diet."
      refreshing={plan.isRefetching}
      onRefresh={() => void plan.refetch()}
    >
      {plan.data ? (
        <>
          <Row className="gap-2">
            <StatTile
              label="Protein"
              value={plan.data.proteinTargetG}
              unit="g/day"
              tone="brand"
              caption={today?.proteinG ? `${today.proteinG} g today` : 'not logged'}
            />
            <StatTile
              label="Water"
              value={plan.data.waterTargetLitres}
              unit="L/day"
              tone="success"
              caption={today?.waterLitres ? `${today.waterLitres} L today` : 'not logged'}
            />
            <StatTile label="Fibre" value={plan.data.fibreTargetG} unit="g/day" tone="neutral" />
          </Row>

          <Card className="mt-3">
            <Text variant="label">Weekly adherence</Text>
            <View className="mt-2">
              <ProgressBar
                value={adherence.data ?? 0}
                tone={(adherence.data ?? 0) >= 70 ? 'success' : 'warning'}
              />
            </View>
            <Text variant="caption" className="mt-2">
              {adherence.data === null || adherence.data === undefined
                ? 'Log a day to start tracking adherence.'
                : adherence.data >= 70
                  ? 'Solid. Consistency here is what protects muscle while you lose fat.'
                  : 'Protein is the one to fix first — it does more than anything else on this list.'}
            </Text>
          </Card>

          <SectionTitle title="Log today" />
          <Card>
            <Row className="gap-3">
              <View className="flex-1">
                <Field label="Protein (g)">
                  <Input
                    value={protein}
                    onChangeText={setProtein}
                    keyboardType="number-pad"
                    placeholder={String(plan.data.proteinTargetG)}
                  />
                </Field>
              </View>
              <View className="flex-1">
                <Field label="Water (L)">
                  <Input
                    value={water}
                    onChangeText={setWater}
                    keyboardType="decimal-pad"
                    placeholder={String(plan.data.waterTargetLitres)}
                  />
                </Field>
              </View>
              <View className="flex-1">
                <Field label="Veg servings">
                  <Input
                    value={vegetables}
                    onChangeText={setVegetables}
                    keyboardType="number-pad"
                    placeholder="5"
                  />
                </Field>
              </View>
            </Row>
            <Button
              label="Save today"
              fullWidth
              loading={save.isPending}
              disabled={!protein && !water && !vegetables}
              onPress={() => save.mutate()}
            />
          </Card>

          <SectionTitle title="Meal guidance" />
          {plan.data.mealGuidance.map((meal) => (
            <Card key={meal.meal} className="mb-3">
              <Row className="justify-between">
                <Text variant="subheading" className="capitalize">
                  {meal.meal}
                </Text>
                <Badge label={`~${meal.proteinG} g protein`} tone="brand" />
              </Row>
              <Text variant="body" className="mt-1">
                {meal.guidance}
              </Text>
              <View className="mt-3">
                {meal.examples.map((example) => (
                  <Row key={example} className="mb-1">
                    <Icon name="check" size={14} color={theme.accent} />
                    <Text variant="body" className="ml-2 flex-1">
                      {example}
                    </Text>
                  </Row>
                ))}
              </View>
            </Card>
          ))}

          <SectionTitle title="Behaviour goals" />
          <Card>
            {plan.data.behaviourGoals.map((goal) => (
              <Row key={goal} className="mb-2">
                <Icon name="check" size={16} color={theme.primary} />
                <Text variant="body" className="ml-2 flex-1">
                  {goal}
                </Text>
              </Row>
            ))}
          </Card>

          {plan.data.notes ? (
            <Card className="mt-3">
              <Text variant="caption">{plan.data.notes}</Text>
            </Card>
          ) : null}

          <View className="mt-6 gap-2">
            <Button
              label="Ask the coach about my food"
              variant="secondary"
              fullWidth
              onPress={() =>
                navigation.navigate('Chat', {
                  initialPrompt: 'Can you help me hit my protein target with Indian food?',
                })
              }
            />
            <Button
              label="Regenerate plan from my current target"
              variant="ghost"
              fullWidth
              loading={create.isPending}
              onPress={() => create.mutate()}
            />
          </View>
        </>
      ) : null}
    </Screen>
  );
}
