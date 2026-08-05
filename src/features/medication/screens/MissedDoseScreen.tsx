import { useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { View } from 'react-native';

import type { AllParamList } from '@/app/navigation/types';
import { CallDoctorCard } from '@features/doctors/components/CallDoctorCard';
import { listMedications } from '@features/medication/api/medicationRepository';
import { useTranslation } from '@i18n/useTranslation';
import { Badge, Button, Card, Row, Screen, SectionTitle, Text } from '@ui/components';
import { Icon } from '@ui/components/Icon';
import { useTheme } from '@ui/theme/ThemeProvider';

type Nav = NativeStackNavigationProp<AllParamList>;

/**
 * What to do about a missed dose.
 *
 * This used to route to the chat screen. That is the wrong shape for this
 * question: it is asked at 11pm by someone who has just realised they missed
 * Thursday's injection, and the single most important thing to tell them —
 * *do not take two to catch up* — should not wait on a model round trip, or
 * depend on whether they have configured an API key.
 *
 * ON THE LINE THIS APP DOES NOT CROSS
 *
 * The app never gives dose advice; that rule is enforced on the AI by a
 * post-generation guard, and it would be incoherent for the app itself to break
 * it. So this screen does what a pharmacist's leaflet does and no more: it
 * states what the manufacturer's patient information says, attributes it, and
 * puts calling a human first. It does not look at which medicine the patient is
 * on and tell them what to do about their own missed dose — that is a
 * clinician's call, and the "call now" action is above the guidance for exactly
 * that reason.
 */
export function MissedDoseScreen() {
  const navigation = useNavigation<Nav>();
  const { theme } = useTheme();
  const { t } = useTranslation();

  const medications = useQuery({ queryKey: ['medications'], queryFn: () => listMedications() });

  // Only used to decide which leaflet section is relevant, never to advise.
  const hasWeekly = (medications.data ?? []).some((m) => m.frequency === 'weekly');
  const hasDaily = (medications.data ?? []).some((m) => m.frequency === 'daily');
  const showBoth = !hasWeekly && !hasDaily;

  return (
    <Screen>
      <Text variant="display">{t('missedDose.title')}</Text>

      {/* The one rule that matters most, before anything else. */}
      <Card className="mt-4 border-danger-400 bg-danger-100/40 dark:border-rose-900 dark:bg-rose-900/20">
        <Row className="mb-1">
          <Icon name="warning" size={20} color={theme.danger} />
          <Text variant="subheading" className="ml-2 flex-1">
            {t('missedDose.neverDoubleTitle')}
          </Text>
        </Row>
        <Text variant="body">{t('missedDose.neverDoubleBody')}</Text>
      </Card>

      {/* Then a human, before any guidance. */}
      <SectionTitle title={t('missedDose.askSomeone')} />
      <CallDoctorCard
        title={t('missedDose.callTitle')}
        subtitle={t('missedDose.callBody')}
        reason="missed_dose"
      />

      <SectionTitle title={t('missedDose.leafletTitle')} />
      <Text variant="body" className="mb-3">
        {t('missedDose.leafletIntro')}
      </Text>

      {hasWeekly || showBoth ? (
        <Card className="mb-2">
          <Row className="mb-1 justify-between">
            <Text variant="subheading">{t('missedDose.weeklyTitle')}</Text>
            <Badge label={t('missedDose.weeklyBadge')} tone="brand" />
          </Row>
          <Text variant="body">{t('missedDose.weeklyBody')}</Text>
          <Text variant="caption" className="mt-2">
            {t('missedDose.weeklySource')}
          </Text>
        </Card>
      ) : null}

      {hasDaily || showBoth ? (
        <Card className="mb-2">
          <Row className="mb-1 justify-between">
            <Text variant="subheading">{t('missedDose.dailyTitle')}</Text>
            <Badge label={t('missedDose.dailyBadge')} tone="brand" />
          </Row>
          <Text variant="body">{t('missedDose.dailyBody')}</Text>
          <Text variant="caption" className="mt-2">
            {t('missedDose.dailySource')}
          </Text>
        </Card>
      ) : null}

      <SectionTitle title={t('missedDose.whyTitle')} />
      <Card>
        <Text variant="body">{t('missedDose.whyBody')}</Text>
      </Card>

      <SectionTitle title={t('missedDose.nextTitle')} />
      <View className="gap-2">
        <Button
          label={t('missedDose.askCoach')}
          variant="secondary"
          fullWidth
          onPress={() =>
            navigation.navigate('Chat', { initialPrompt: t('missedDose.coachPrompt') })
          }
        />
        <Button
          label={t('missedDose.seeSchedule')}
          variant="ghost"
          fullWidth
          onPress={() => navigation.navigate('Medication')}
        />
      </View>

      <Text variant="caption" className="mt-6">
        {t('missedDose.disclaimer')}
      </Text>
    </Screen>
  );
}
