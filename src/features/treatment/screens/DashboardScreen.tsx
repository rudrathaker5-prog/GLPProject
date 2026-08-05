import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { AllParamList } from '@/app/navigation/types';
import { computeAdherence } from '@core/clinical/scoring';
import type { DoseEvent, MedicationItem } from '@core/domain/types';
import { isUpcoming, listAppointments } from '@features/appointments/api/appointmentsRepository';
import { CallDoctorCard } from '@features/doctors/components/CallDoctorCard';
import { listDoctorNotes } from '@features/doctorNotes/api/doctorNotesRepository';
import {
  listDoseEvents,
  listMedications,
  refillDaysRemaining,
  setDoseStatus,
  todaysDoses,
} from '@features/medication/api/medicationRepository';
import { listMilestones } from '@features/journey/api/journeyRepository';
import { daysSinceLastCheckIn, progressSummary } from '@features/tracking/api/trackingRepository';
import { getProfile } from '@features/profile/api/profileRepository';
import { useTranslation } from '@i18n/useTranslation';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  IconButton,
  ProgressBar,
  Row,
  SectionTitle,
  StatTile,
  Text,
} from '@ui/components';
import { Icon, type IconName } from '@ui/components/Icon';
import { useTheme } from '@ui/theme/ThemeProvider';
import { WeightSparkline } from '@features/tracking/components/WeightSparkline';

type Nav = NativeStackNavigationProp<AllParamList>;

export function DashboardScreen() {
  const navigation = useNavigation<Nav>();
  const queryClient = useQueryClient();
  const { theme } = useTheme();
  const { t } = useTranslation();

  const profile = useQuery({ queryKey: ['profile'], queryFn: getProfile });
  const medications = useQuery({ queryKey: ['medications'], queryFn: () => listMedications() });
  const doses = useQuery({ queryKey: ['doses', 'today'], queryFn: todaysDoses });
  const allDoses = useQuery({ queryKey: ['doses', 'window'], queryFn: () => listDoseEvents(28, 7) });
  const progress = useQuery({ queryKey: ['progress'], queryFn: progressSummary });
  const appointments = useQuery({ queryKey: ['appointments'], queryFn: listAppointments });
  const notes = useQuery({ queryKey: ['doctorNotes'], queryFn: listDoctorNotes });
  const milestones = useQuery({ queryKey: ['milestones'], queryFn: listMilestones });
  const checkInGap = useQuery({ queryKey: ['checkinGap'], queryFn: daysSinceLastCheckIn });

  const markTaken = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'taken' | 'skipped' }) =>
      setDoseStatus(id, status),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['doses'] });
      void queryClient.invalidateQueries({ queryKey: ['medications'] });
    },
  });

  const adherence = computeAdherence(
    (allDoses.data ?? []).map((d) => ({ status: d.status, scheduledFor: d.scheduledFor })),
    28,
  );

  const nextAppointment = (appointments.data ?? []).filter(isUpcoming).at(-1);
  const unreadNote = (notes.data ?? []).find((n) => !n.acknowledgedAt);
  const uncelebrated = (milestones.data ?? []).find((m) => !m.celebrated);

  const daysOnTreatment = profile.data?.treatmentStartedAt
    ? Math.max(
        1,
        Math.floor(
          (Date.now() - new Date(profile.data.treatmentStartedAt).getTime()) / 86_400_000,
        ),
      )
    : null;

  const refillAlerts = (medications.data ?? [])
    .map((medication) => ({ medication, days: refillDaysRemaining(medication) }))
    .filter((r) => r.days !== null && r.days <= r.medication.refillThresholdDays);

  const refreshing =
    doses.isRefetching || medications.isRefetching || progress.isRefetching;

  const onRefresh = () => {
    void queryClient.invalidateQueries();
  };

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: theme.background }} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.primary}
            colors={[theme.primary]}
          />
        }
      >
        {/* Header */}
        <View className="flex-row items-center justify-between px-5 pt-2">
          <View className="flex-1">
            <Text variant="caption">{greeting()}</Text>
            <Text variant="display">{profile.data?.displayName ?? t('treatment.todayTitle')}</Text>
          </View>
          <Row>
            <IconButton
              name="bell"
              accessibilityLabel={t('notifications.title')}
              onPress={() => navigation.navigate('Notifications')}
              color={theme.textSoft}
              className="mr-4"
            />
            <IconButton
              name="profile"
              accessibilityLabel={t('tabs.profile')}
              onPress={() => navigation.navigate('Profile')}
              color={theme.textSoft}
              className="mr-4"
            />
            <IconButton
              name="settings"
              accessibilityLabel={t('settings.title')}
              onPress={() => navigation.navigate('Settings')}
              color={theme.textSoft}
            />
          </Row>
        </View>

        <View className="px-5">
          {/* Milestone celebration */}
          {uncelebrated ? (
            <Card
              className="mt-4 border-vital-300 bg-vital-50 dark:border-vital-800 dark:bg-vital-900/20"
              onPress={() => navigation.navigate('JourneyMap')}
            >
              <Row>
                <Icon name="trophy" size={22} color="#0b955c" />
                <Text variant="subheading" className="ml-2 flex-1">
                  {t('dash.milestoneReached')}
                </Text>
              </Row>
              <Text variant="body" className="mt-1">
                {t('dash.milestoneTap')}
              </Text>
            </Card>
          ) : null}

          {/* Refill alerts */}
          {refillAlerts.map(({ medication, days }) => (
            <Card
              key={medication.id}
              className="mt-4 border-warn-400 bg-warn-100/50 dark:bg-amber-900/20"
              onPress={() => navigation.navigate('Refill', { medicationId: medication.id })}
            >
              <Row>
                <Icon name="warning" size={20} color="#8a5b0a" />
                <Text variant="subheading" className="ml-2 flex-1">
                  {medication.name} runs out in {days} day{days === 1 ? '' : 's'}
                </Text>
              </Row>
              <Text variant="body" className="mt-1">
                {t('dash.refillSoon')}
              </Text>
            </Card>
          ) )}

          {/* Doctor note */}
          {unreadNote ? (
            <Card
              className="mt-4"
              onPress={() => navigation.navigate('DoctorNoteDetail', { noteId: unreadNote.id })}
            >
              <Row className="justify-between">
                <Row className="flex-1">
                  <Icon name="doctor" size={18} color={theme.primary} />
                  <Text variant="subheading" className="ml-2">
                    {t('dash.newNote')}
                  </Text>
                </Row>
                <Icon name="chevron" size={18} color={theme.textMuted} />
              </Row>
              <Text variant="body" className="mt-1" numberOfLines={2}>
                {unreadNote.patientFriendlyText ?? unreadNote.clinicalText}
              </Text>
            </Card>
          ) : null}

          {/* Today's medication */}
          <SectionTitle
            title={t('treatment.todaysMedication')}
            action={
              <Pressable
                accessibilityRole="button"
                onPress={() => navigation.navigate('Medication')}
              >
                <Text variant="label" className="text-brand-700 dark:text-brand-200">
                  {t('common.seeAll')}
                </Text>
              </Pressable>
            }
          />

          {(doses.data ?? []).length === 0 ? (
            <EmptyState
              title={
                (medications.data ?? []).length === 0
                  ? 'No medicines added yet'
                  : 'Nothing due today'
              }
              message={
                (medications.data ?? []).length === 0
                  ? 'Upload your prescription and reminders are created automatically.'
                  : 'Your next dose is scheduled — check the medication screen for the date.'
              }
              action={
                (medications.data ?? []).length === 0 ? (
                  <Button
                    label={t('dash.addPrescription')}
                    onPress={() => navigation.navigate('PrescriptionUpload')}
                  />
                ) : undefined
              }
            />
          ) : null}

          {(doses.data ?? []).map((dose) => (
            <DoseCard
              key={dose.id}
              dose={dose}
              medication={(medications.data ?? []).find((m) => m.id === dose.medicationId)}
              onTaken={() => markTaken.mutate({ id: dose.id, status: 'taken' })}
              onSkip={() => markTaken.mutate({ id: dose.id, status: 'skipped' })}
              busy={markTaken.isPending}
            />
          ))}

          {/* Progress */}
          <SectionTitle
            title={t('treatment.progress')}
            action={
              <Pressable accessibilityRole="button" onPress={() => navigation.navigate('Progress')}>
                <Text variant="label" className="text-brand-700 dark:text-brand-200">
                  {t('common.seeAll')}
                </Text>
              </Pressable>
            }
          />

          <Row className="gap-2">
            <StatTile
              label={t('treatment.totalLost')}
              value={progress.data?.lostKg ?? '—'}
              unit="kg"
              tone="success"
              caption={
                progress.data?.percentLost ? `${progress.data.percentLost}% of start` : undefined
              }
            />
            <StatTile
              label={t('treatment.adherence')}
              value={adherence ?? '—'}
              unit="%"
              tone={adherence !== null && adherence >= 80 ? 'success' : 'warning'}
              caption="last 28 days"
            />
            <StatTile
              label={t('treatment.daysOnTreatment')}
              value={daysOnTreatment ?? '—'}
              tone="brand"
            />
          </Row>

          <Card className="mt-3">
            <CardHeader
              title={t('treatment.weightTrend')}
              subtitle={
                progress.data?.currentWeightKg
                  ? `Now ${progress.data.currentWeightKg} kg`
                  : 'Log your first weight'
              }
              right={
                <Button
                  label={t('treatment.logWeight')}
                  size="sm"
                  variant="secondary"
                  onPress={() => navigation.navigate('LogWeight')}
                />
              }
            />
            <WeightSparkline entries={progress.data?.entries ?? []} />
            {progress.data?.targetWeightKg && progress.data.currentWeightKg ? (
              <View className="mt-4">
                <ProgressBar
                  label={`To target (${progress.data.targetWeightKg} kg)`}
                  value={
                    progress.data.startingWeightKg
                      ? Math.min(
                          100,
                          Math.max(
                            0,
                            ((progress.data.startingWeightKg - progress.data.currentWeightKg) /
                              Math.max(
                                0.1,
                                progress.data.startingWeightKg - progress.data.targetWeightKg,
                              )) *
                              100,
                          ),
                        )
                      : 0
                  }
                  tone="success"
                />
              </View>
            ) : null}
          </Card>

          {/* Check-in nudge */}
          {checkInGap.data === null || (checkInGap.data ?? 0) >= 3 ? (
            <Card className="mt-4 border-brand-200 bg-brand-50 dark:border-brand-800 dark:bg-brand-900/20">
              <Text variant="subheading">{t('dash.quickCheckIn')}</Text>
              <Text variant="body" className="mt-1">
                {checkInGap.data === null
                  ? 'Your first check-in sets the baseline for your wellness score.'
                  : `It has been ${checkInGap.data} days. Takes about a minute.`}
              </Text>
              <Button
                className="mt-3"
                label={t('dash.startCheckIn')}
                onPress={() => navigation.navigate('CheckIn', {})}
              />
            </Card>
          ) : null}

          {/* Next appointment */}
          <SectionTitle
            title={t('treatment.appointments')}
            action={
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('appointments.title')}
                onPress={() => navigation.navigate('Appointments')}
              >
                <Text variant="label" className="text-brand-700 dark:text-brand-200">
                  {t('common.seeAll')}
                </Text>
              </Pressable>
            }
          />
          {nextAppointment ? (
            <Card
              onPress={() =>
                navigation.navigate('AppointmentDetail', { appointmentId: nextAppointment.id })
              }
            >
              <Row className="justify-between">
                <View className="flex-1">
                  <Text variant="subheading">
                    {nextAppointment.doctor?.fullName ?? 'Consultation'}
                  </Text>
                  <Text variant="body" className="mt-1">
                    {new Date(nextAppointment.scheduledAt).toLocaleString('en-IN', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </Text>
                </View>
                <Badge label={nextAppointment.mode.replace('_', ' ')} tone="brand" />
              </Row>
            </Card>
          ) : (
            <EmptyState
              title={t('appointments.noneUpcoming')}
              message={t('dash.bookReview')}
              action={
                <Button
                  label={t('dash.findDoctor')}
                  onPress={() => navigation.navigate('Doctors')}
                />
              }
            />
          )}

          {/* Reach a human */}
          <SectionTitle title={t('dash.speakToSomeone')} />
          <CallDoctorCard
            subtitle={t('dash.speakSubtitle')}
          />

          {/* Everything else */}
          <SectionTitle title={t('dash.yourCare')} />
          <View className="flex-row flex-wrap justify-between">
            <NavTile icon="chat" label={t('treatment.aiCoach')} onPress={() => navigation.navigate('Chat')} />
            <NavTile icon="pill" label={t('medication.title')} onPress={() => navigation.navigate('Medication')} />
            <NavTile icon="camera" label={t('treatment.prescription')} onPress={() => navigation.navigate('PrescriptionUpload')} />
            <NavTile icon="nutrition" label={t('treatment.nutrition')} onPress={() => navigation.navigate('Nutrition')} />
            <NavTile icon="doctor" label={t('treatment.doctorNotes')} onPress={() => navigation.navigate('DoctorNotes')} />
            <NavTile icon="chart" label={t('treatment.journeyMap')} onPress={() => navigation.navigate('JourneyMap')} />
            <NavTile icon="refresh" label={t('treatment.refillStatus')} onPress={() => navigation.navigate('Refill', {})} />
            <NavTile icon="people" label={t('treatment.peerSupport')} onPress={() => navigation.navigate('PeerSupport')} />
            {/*
              The check-in nudge above only appears after a 3-day gap. Without
              this tile there is no way to start one in between — someone having
              a bad week has to wait for the app to ask.
            */}
            <NavTile icon="check" label={t('checkin.title')} onPress={() => navigation.navigate('CheckIn', {})} />
            <NavTile icon="calendar" label={t('appointments.title')} onPress={() => navigation.navigate('Appointments')} />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function DoseCard({
  dose,
  medication,
  onTaken,
  onSkip,
  busy,
}: {
  dose: DoseEvent;
  medication?: MedicationItem;
  onTaken: () => void;
  onSkip: () => void;
  busy: boolean;
}) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const time = new Date(dose.scheduledFor);
  const done = dose.status === 'taken';
  const missed = dose.status === 'missed';

  return (
    <Card className={`mb-3 ${done ? 'border-vital-300 bg-vital-50 dark:bg-vital-900/20' : ''}`}>
      <Row className="justify-between">
        <Row className="flex-1">
          <View
            className={`h-11 w-11 items-center justify-center rounded-2xl ${
              done ? 'bg-vital-100 dark:bg-vital-900/40' : 'bg-brand-50 dark:bg-brand-900/30'
            }`}
          >
            <Icon name={done ? 'check' : 'pill'} size={20} color={done ? '#0b955c' : theme.primary} />
          </View>
          <View className="ml-3 flex-1">
            <Text variant="subheading">{medication?.name ?? 'Medicine'}</Text>
            <Text variant="caption">
              {medication ? `${medication.doseAmount} ${medication.doseUnit}` : ''} ·{' '}
              {time.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>
        </Row>
        {missed ? <Badge label={t('treatment.missed')} tone="danger" /> : null}
        {done ? <Badge label={t('treatment.taken')} tone="success" /> : null}
      </Row>

      {medication?.instructions ? (
        <Text variant="caption" className="mt-2">
          {medication.instructions}
        </Text>
      ) : null}

      {!done ? (
        <Row className="mt-3 gap-2">
          <View className="flex-1">
            <Button label={t('treatment.markTaken')} fullWidth loading={busy} onPress={onTaken} />
          </View>
          <Button label={t('treatment.skip')} variant="ghost" onPress={onSkip} />
        </Row>
      ) : null}
    </Card>
  );
}

function NavTile({
  icon,
  label,
  onPress,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className="mb-3 w-[48.5%] flex-row items-center rounded-card border border-slate-100 bg-white p-4 active:opacity-90 dark:border-slate-800 dark:bg-dark-surface-raised"
    >
      <Icon name={icon} size={20} color={theme.primary} />
      <Text variant="label" className="ml-2 flex-1">
        {label}
      </Text>
    </Pressable>
  );
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}
