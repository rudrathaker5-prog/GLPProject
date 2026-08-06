import { useNavigation } from '@react-navigation/native';
import { useEffect, useRef, useState } from 'react';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { View } from 'react-native';

import type { AllParamList } from '@/app/navigation/types';
import type { AgentAction, AgentCard, Doctor } from '@core/domain/types';
import { PRIMARY_DOCTORS } from '@features/doctors/api/fallbackDirectory';
import { placeCall } from '@features/calls/api/callService';
import { CallButton } from '@features/calls/components/CallButton';
import { callNumber } from '@integrations/communication/communicationAdapter';
import { useTranslation } from '@i18n/useTranslation';
import { Badge, Button, Card, ProgressBar, Row, Text } from '@ui/components';
import { Icon } from '@ui/components/Icon';
import { useTheme } from '@ui/theme/ThemeProvider';

type Nav = NativeStackNavigationProp<AllParamList>;

/**
 * Renders the structured cards the agent returns alongside its prose.
 * Every action here navigates to a real screen — the agent never describes a
 * button that does not exist.
 */
export function AgentCardList({ cards }: { cards: AgentCard[] }) {
  if (!cards.length) return null;
  return (
    <View className="mt-3 gap-3">
      {cards.map((card, index) => (
        <AgentCardView key={`${card.kind}-${index}`} card={card} />
      ))}
    </View>
  );
}

function AgentCardView({ card }: { card: AgentCard }) {
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();

  switch (card.kind) {
    case 'eligibility': {
      const { result } = card;
      const tone =
        result.verdict === 'likely_eligible'
          ? 'success'
          : result.verdict === 'possibly_eligible'
            ? 'brand'
            : result.verdict === 'not_advisable'
              ? 'danger'
              : 'warning';
      return (
        <Card>
          <Row className="justify-between">
            <Text variant="subheading">{t('cards.eligibilityIndication')}</Text>
            <Badge label={verdictLabel(result.verdict)} tone={tone} />
          </Row>
          {result.bmi ? (
            <Text variant="body" className="mt-2">
              BMI {result.bmi} — {result.bmiCategoryIndian}
            </Text>
          ) : null}
          {result.reasons.slice(0, 3).map((reason) => (
            <Text key={reason} variant="body" className="mt-1">
              • {reason}
            </Text>
          ))}
          {result.nextSteps.length ? (
            <View className="mt-3 rounded-2xl bg-brand-50 p-3 dark:bg-brand-900/30">
              <Text variant="label" className="mb-1">
                {t('cards.nextStep')}
              </Text>
              <Text variant="body">{result.nextSteps[0]}</Text>
            </View>
          ) : null}
          <Text variant="caption" className="mt-3">
            {result.disclaimer}
          </Text>
        </Card>
      );
    }

    case 'doctor_list': {
      const doctors = card.doctors as Doctor[];
      return (
        <Card>
          <Text variant="subheading" className="mb-2">
            {t('cards.doctorsWhoHelp')}
          </Text>
          {doctors.slice(0, 3).map((doctor) => (
            <View
              key={doctor.id}
              className="mb-2 rounded-2xl border border-slate-100 p-3 dark:border-slate-700"
            >
              <Text variant="bodyStrong">{doctor.fullName}</Text>
              <Text variant="caption">
                {doctor.speciality} • {doctor.city}
                {doctor.consultationFee ? ` • ₹${doctor.consultationFee}` : ''}
              </Text>
              <Row className="mt-2 gap-2">
                {doctor.phone ? (
                  <Button
                    label={t('cards.call')}
                    size="sm"
                    icon={<Icon name="phone" size={14} color="#ffffff" />}
                    onPress={() => void callNumber(doctor.phone)}
                  />
                ) : null}
                <Button
                  label={t('cards.book')}
                  variant="secondary"
                  size="sm"
                  onPress={() => navigation.navigate('BookAppointment', { doctorId: doctor.id })}
                />
                <Button
                  label={t('cards.details')}
                  variant="ghost"
                  size="sm"
                  onPress={() => navigation.navigate('DoctorDetail', { doctorId: doctor.id })}
                />
              </Row>
            </View>
          ))}
          {doctors.length === 0 ? (
            <Text variant="body">
              {t('cards.noDoctors')}
            </Text>
          ) : null}
        </Card>
      );
    }

    case 'appointment': {
      const { appointment } = card;
      return (
        <Card>
          <Row className="justify-between">
            <Text variant="subheading">{t('cards.appointmentConfirmed')}</Text>
            <Badge label={appointment.mode.replace('_', ' ')} tone="success" />
          </Row>
          <Text variant="body" className="mt-2">
            {new Date(appointment.scheduledAt).toLocaleString('en-IN', {
              dateStyle: 'full',
              timeStyle: 'short',
            })}
          </Text>
          <Button
            className="mt-3"
            label={t('cards.viewAppointment')}
            variant="secondary"
            onPress={() =>
              navigation.navigate('AppointmentDetail', { appointmentId: appointment.id })
            }
          />
        </Card>
      );
    }

    case 'myth':
      return (
        <Card onPress={() => navigation.navigate('MythDetail', { mythId: card.myth.id })}>
          <Row className="justify-between">
            <Badge
              label={
                card.myth.verdict === 'myth'
                  ? 'Myth'
                  : card.myth.verdict === 'fact'
                    ? 'Fact'
                    : 'Partly true'
              }
              tone={card.myth.verdict === 'myth' ? 'danger' : 'brand'}
            />
            <Icon name="chevron" size={18} />
          </Row>
          <Text variant="subheading" className="mt-2">
            {card.myth.myth}
          </Text>
          <Text variant="caption" className="mt-1">
            {t('cards.tapForEvidence')}
          </Text>
        </Card>
      );

    case 'education':
      return (
        <Card onPress={() => navigation.navigate('EducationTopic', { topicId: card.topic.id })}>
          <Row className="justify-between">
            <Text variant="subheading" className="flex-1 pr-2">
              {card.topic.title}
            </Text>
            <Icon name="chevron" size={18} />
          </Row>
          <Text variant="body" className="mt-1">
            {card.topic.summary}
          </Text>
          <Text variant="caption" className="mt-2">
            {card.topic.readMinutes} min read
          </Text>
        </Card>
      );

    case 'checkin_request':
      return (
        <Card>
          <Text variant="subheading">{t('cards.quickCheckIn')}</Text>
          <Text variant="body" className="mt-1">
            {card.fields.length} question{card.fields.length === 1 ? '' : 's'} — about a minute.
          </Text>
          <Button
            className="mt-3"
            label={t('cards.startCheckIn')}
            onPress={() => navigation.navigate('CheckIn', {})}
          />
        </Card>
      );

    case 'wellness':
      return (
        <Card>
          <Text variant="subheading">{t('cards.wellnessScore')}</Text>
          <Text variant="display" className="mt-1">
            {card.wellness.score}
            <Text variant="caption"> / 100</Text>
          </Text>
          <ProgressBar
            value={card.wellness.score}
            tone={card.wellness.score >= 55 ? 'success' : 'warning'}
          />
          <Text variant="caption" className="mt-2 capitalize">
            {card.wellness.band.replace('_', ' ')}
          </Text>
        </Card>
      );

    case 'relapse':
      return (
        <Card className="border-warn-400/40 bg-warn-100/30 dark:bg-amber-900/10">
          <Row className="justify-between">
            <Text variant="subheading">{t('cards.relapseRisk')}</Text>
            <Badge
              label={card.risk.band}
              tone={card.risk.band === 'high' ? 'danger' : card.risk.band === 'moderate' ? 'warning' : 'success'}
            />
          </Row>
          <ProgressBar
            value={card.risk.score}
            tone={card.risk.band === 'high' ? 'danger' : 'warning'}
            label={t('cards.risk')}
          />
          {card.risk.signals.map((signal) => (
            <Text key={signal} variant="body" className="mt-1">
              • {signal}
            </Text>
          ))}
          <Text variant="bodyStrong" className="mt-3">
            {card.risk.recommendation}
          </Text>
          <Button
            className="mt-3"
            label={t('cards.openPreventionPlan')}
            variant="secondary"
            onPress={() => navigation.navigate('RelapsePlan')}
          />
        </Card>
      );

    case 'medication_schedule':
      return (
        <Card>
          <Text variant="subheading" className="mb-2">
            {t('cards.yourSchedule')}
          </Text>
          {card.medications.map((medication) => (
            <View key={medication.id} className="mb-2">
              <Text variant="bodyStrong">
                {medication.name} {medication.strength}
              </Text>
              <Text variant="caption">
                {medication.doseAmount} {medication.doseUnit} • {medication.timesOfDay.join(', ')}
              </Text>
            </View>
          ))}
          <Button
            label={t('cards.openMedication')}
            variant="secondary"
            onPress={() => navigation.navigate('Medication')}
          />
        </Card>
      );

    case 'nutrition_plan':
      return (
        <Card onPress={() => navigation.navigate('Nutrition')}>
          <Text variant="subheading">{t('cards.nutritionTargets')}</Text>
          <Row className="mt-2 gap-3">
            <Text variant="body">{card.plan.proteinTargetG} g protein</Text>
            <Text variant="body">{card.plan.waterTargetLitres} L water</Text>
          </Row>
        </Card>
      );

    case 'action':
      return (
        <View className="flex-row flex-wrap gap-2">
          {card.actions.map((action) => (
            <ActionButton key={action.id} action={action} />
          ))}
        </View>
      );

    case 'call':
      return <CallCard card={card} />;

    case 'escalation':
      return (
        <Card
          className={
            card.severity === 'urgent'
              ? 'border-danger-400 bg-danger-100/50 dark:bg-rose-900/20'
              : 'border-warn-400 bg-warn-100/40 dark:bg-amber-900/20'
          }
        >
          <Row className="mb-1">
            <Icon name="warning" size={20} color={card.severity === 'urgent' ? '#c62c30' : '#8a5b0a'} />
            <Text variant="subheading" className="ml-2">
              {card.severity === 'urgent' ? 'Get medical help now' : 'Please contact your doctor'}
            </Text>
          </Row>
          <Text variant="body">{card.message}</Text>

          <View className="mt-3">
            {PRIMARY_DOCTORS.map((doctor) => (
              <Row key={doctor.id} className="mb-2 justify-between">
                <View className="flex-1 pr-2">
                  <Text variant="bodyStrong">{doctor.fullName}</Text>
                  <Text variant="caption">{doctor.phone}</Text>
                </View>
                <Button
                  label={t('cards.call')}
                  size="sm"
                  variant={card.severity === 'urgent' ? 'danger' : 'primary'}
                  icon={<Icon name="phone" size={15} color="#ffffff" />}
                  onPress={() => void callNumber(doctor.phone)}
                />
              </Row>
            ))}
          </View>

          <Button
            label={t('cards.seeAllDoctors')}
            variant="secondary"
            fullWidth
            onPress={() => navigation.navigate('Doctors')}
          />
        </Card>
      );

    default:
      return null;
  }
}

/**
 * A call the assistant is placing.
 *
 * When `autoDial` is set this opens the OS dialler as the card renders — the
 * user asked to be put through, so making them tap a second button is just
 * friction. It is still the dialler, not a call: the green button is theirs to
 * press, and that is Android's consent step, not something to route around.
 *
 * Two guards, for two different failures.
 *
 * The `useRef` stops it re-dialling within a session: this card lives in a chat
 * transcript that re-renders on every new message, and without it, scrolling
 * back through the conversation would re-open the dialler each time.
 *
 * The freshness window stops something worse. The chat store persists the last
 * 60 messages *including their cards*, so on the next launch this card
 * rehydrates with `autoDial` still true and mounts fresh — a new component,
 * with a new ref. Someone who opened the app to check their weight would find
 * it dialling a doctor. Auto-dial is a live action, so it only happens if the
 * request was made seconds ago.
 */

/** How long after the request auto-dial is still the right thing to do. */
const AUTO_DIAL_WINDOW_MS = 60_000;

export function shouldAutoDial(
  card: Extract<AgentCard, { kind: 'call' }>,
  now = Date.now(),
): boolean {
  if (!card.autoDial) return false;
  const requested = new Date(card.requestedAt).getTime();
  // An unparseable date is treated as stale: never dial on a value we do not
  // understand.
  if (!Number.isFinite(requested)) return false;
  const age = now - requested;
  // Negative age means a clock change, not a fresh request.
  return age >= 0 && age <= AUTO_DIAL_WINDOW_MS;
}
function CallCard({
  card,
}: {
  card: Extract<AgentCard, { kind: 'call' }>;
}) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const attempted = useRef(false);
  /*
    State, not just the ref: the label describes whether this card *dialled*,
    which is permanent, while `shouldAutoDial` describes whether it *may* dial,
    which expires after a minute. Reading the window for the label meant a card
    that had genuinely placed a call flipped to "Call when you are ready" once
    the user sent another message — telling them the call never happened.
  */
  const [hasDialled, setHasDialled] = useState(false);

  useEffect(() => {
    if (attempted.current || !shouldAutoDial(card)) return;
    attempted.current = true;
    setHasDialled(true);
    void placeCall({
      number: card.number,
      contactName: card.contactName,
      kind: 'doctor',
      reason: card.reason,
    });
  }, [card]);

  return (
    <Card className="border-brand-300 bg-brand-50 dark:border-brand-800 dark:bg-brand-900/20">
      <Row className="mb-1">
        <Icon name="phone" size={20} color={theme.primary} />
        <Text variant="subheading" className="ml-2 flex-1">
          {hasDialled ? t('cards.callingNow') : t('cards.callWhenReady')}
        </Text>
      </Row>

      <Text variant="bodyStrong" className="mt-1">
        {card.contactName}
      </Text>
      <Text variant="caption" className="mt-0.5">
        {card.number}
      </Text>

      {hasDialled ? (
        <Text variant="caption" className="mt-2">
          {t('cards.dialerNote')}
        </Text>
      ) : null}

      <View className="mt-3">
        <CallButton
          number={card.number}
          contactName={card.contactName}
          kind="doctor"
          reason={card.reason}
          label={hasDialled ? t('cards.callAgain') : t('cards.call')}
          fullWidth
        />
      </View>
    </Card>
  );
}

function ActionButton({ action }: { action: AgentAction }) {
  const navigation = useNavigation<Nav>();

  const onPress = () => {
    switch (action.intent) {
      case 'open_eligibility':
        navigation.navigate('EligibilityChecker');
        break;
      case 'open_doctors':
      case 'call_doctor':
        navigation.navigate('Doctors');
        break;
      case 'book_appointment':
        navigation.navigate('Appointments');
        break;
      case 'open_education':
        navigation.navigate('Learn');
        break;
      case 'open_myths':
        navigation.navigate('Myths');
        break;
      case 'start_treatment':
        navigation.navigate('Onboarding');
        break;
      case 'log_weight':
        navigation.navigate('LogWeight');
        break;
      case 'log_checkin':
        navigation.navigate('CheckIn', {});
        break;
      case 'open_medication':
        navigation.navigate('Medication');
        break;
      case 'request_refill':
        navigation.navigate('Refill', {});
        break;
      case 'open_nutrition':
        navigation.navigate('Nutrition');
        break;
      case 'open_journey':
        navigation.navigate('JourneyMap');
        break;
      default:
        break;
    }
  };

  return <Button label={action.label} variant="secondary" size="sm" onPress={onPress} />;
}

function verdictLabel(verdict: string): string {
  return {
    likely_eligible: 'Likely eligible',
    possibly_eligible: 'Possibly eligible',
    needs_consultation: 'See a doctor',
    insufficient_information: 'Need more info',
    not_advisable: 'Not advisable',
  }[verdict] ?? verdict;
}
