import { useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import { View } from 'react-native';

import type { AllParamList } from '@/app/navigation/types';
import { useAuthStore } from '@features/auth/store/authStore';
import {
  GLP1_PROTEIN_G_PER_KG,
  ICMR_PROTEIN_G_PER_KG,
  proteinTargetFor,
  standardsForStage,
  type NutritionStandardSection,
} from '@features/nutrition/content/glp1Standards';
import { progressSummary } from '@features/tracking/api/trackingRepository';
import { useTranslation } from '@i18n/useTranslation';
import { Badge, Button, Card, Row, Screen, SectionTitle, Text } from '@ui/components';
import { Icon } from '@ui/components/Icon';
import { useTheme } from '@ui/theme/ThemeProvider';

type Nav = NativeStackNavigationProp<AllParamList>;

/**
 * The general nutrition standard, readable without entering anything.
 *
 * Separate from the generated plan on purpose. The plan needs a weight, a
 * target and a stage before it can say anything; this is what a dietitian would
 * tell anyone on a GLP-1, and someone deciding whether to start — or three
 * months post-treatment wondering what "eating properly" means now — should not
 * have to fill in a form to read it.
 *
 * Every figure carries its source, including where the sources disagree: the
 * 1.2–1.6 g/kg protein target comes from Western obesity medicine, while
 * ICMR-NIN's general Indian adult figure is 0.8 g/kg. Showing the higher number
 * to an Indian patient without saying where it comes from would be misleading.
 */
export function NutritionStandardsScreen() {
  const navigation = useNavigation<Nav>();
  const { theme } = useTheme();
  const { t } = useTranslation();
  const stage = useAuthStore((s) => s.stage);

  // Only used to turn g/kg into a number the reader can act on. Absent is fine.
  const progress = useQuery({ queryKey: ['progress'], queryFn: progressSummary });
  const weightKg = progress.data?.currentWeightKg ?? progress.data?.startingWeightKg ?? null;
  const personalTarget = proteinTargetFor(weightKg);

  const standards = standardsForStage(stage);

  return (
    <Screen title={t('nutritionStandards.title')} subtitle={t('nutritionStandards.intro')}>
      {/* The one number most people came for */}
      <Card className="mt-4 border-brand-200 bg-brand-50 dark:border-brand-800 dark:bg-brand-900/20">
        <Row className="mb-1">
          <Icon name="nutrition" size={20} color={theme.primary} />
          <Text variant="subheading" className="ml-2 flex-1">
            {t('nutritionStandards.proteinHeadline')}
          </Text>
        </Row>

        <Text variant="display" className="mt-1">
          {personalTarget ?? `${GLP1_PROTEIN_G_PER_KG.min}–${GLP1_PROTEIN_G_PER_KG.max} g/kg`}
        </Text>
        <Text variant="caption" className="mt-0.5">
          {personalTarget
            ? t('nutritionStandards.proteinForYou', { weight: Math.round(weightKg!) })
            : t('nutritionStandards.proteinPerKg')}
        </Text>

        <Text variant="body" className="mt-3">
          {t('nutritionStandards.proteinWhy')}
        </Text>

        {/* Where the guidance genuinely disagrees, say so. */}
        <View className="mt-3 rounded-2xl bg-white/70 p-3 dark:bg-black/20">
          <Text variant="label">{t('nutritionStandards.twoNumbersTitle')}</Text>
          <Text variant="caption" className="mt-1">
            {t('nutritionStandards.twoNumbersBody', {
              glp1: `${GLP1_PROTEIN_G_PER_KG.min}–${GLP1_PROTEIN_G_PER_KG.max}`,
              icmr: `${ICMR_PROTEIN_G_PER_KG}`,
            })}
          </Text>
        </View>
      </Card>

      {standards.map((standard) => (
        <View key={standard.phase}>
          <SectionTitle title={standard.title} />
          <Text variant="body" className="mb-3">
            {standard.intro}
          </Text>
          {standard.sections.map((section) => (
            <StandardCard key={section.id} section={section} />
          ))}
        </View>
      ))}

      <SectionTitle title={t('nutritionStandards.yoursTitle')} />
      <Card>
        <Text variant="body">{t('nutritionStandards.yoursBody')}</Text>
        <Row className="mt-3 gap-2">
          <Button
            label={t('nutritionStandards.openMyPlan')}
            size="sm"
            onPress={() => navigation.navigate('Nutrition')}
          />
          <Button
            label={t('nutritionStandards.askCoach')}
            size="sm"
            variant="secondary"
            onPress={() =>
              navigation.navigate('Chat', {
                initialPrompt: t('nutritionStandards.coachPrompt'),
              })
            }
          />
        </Row>
      </Card>

      <Text variant="caption" className="mt-6">
        {t('nutritionStandards.disclaimer')}
      </Text>
    </Screen>
  );
}

/** One topic, collapsed to its summary until opened. */
function StandardCard({ section }: { section: NutritionStandardSection }) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <Card className="mb-2">
      <Row className="justify-between">
        <View className="flex-1 pr-2">
          <Text variant="subheading">{section.title}</Text>
          <Text variant="body" className="mt-1">
            {section.summary}
          </Text>
        </View>
      </Row>

      {open ? (
        <View className="mt-3">
          {section.points.map((point, index) => (
            <Row key={index} className="mb-2 items-start">
              <View
                className="mr-2 mt-2 h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: theme.primary }}
              />
              <Text variant="body" className="flex-1">
                {point}
              </Text>
            </Row>
          ))}

          <View className="mt-2 flex-row flex-wrap gap-1">
            {section.sources.map((source) => (
              <Badge key={source} label={source} tone="neutral" />
            ))}
          </View>
        </View>
      ) : null}

      <Button
        className="mt-3 self-start"
        label={open ? t('nutritionStandards.showLess') : t('nutritionStandards.showMore')}
        size="sm"
        variant="ghost"
        onPress={() => setOpen((value) => !value)}
      />
    </Card>
  );
}
