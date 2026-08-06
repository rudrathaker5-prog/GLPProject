import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { AllParamList } from '@/app/navigation/types';
import { listAppointments, isUpcoming } from '@features/appointments/api/appointmentsRepository';
import { CallDoctorCard } from '@features/doctors/components/CallDoctorCard';
import { getDoctor } from '@features/doctors/api/doctorsRepository';
import { listMilestones } from '@features/journey/api/journeyRepository';
import {
  listScheduledReminders,
  requestNotificationPermission,
  scheduleVigilanceFollowUps,
} from '@features/notifications/service/notificationService';
import { getProfile } from '@features/profile/api/profileRepository';
import {
  currentRelapseRisk,
  daysSinceLastCheckIn,
  progressSummary,
} from '@features/tracking/api/trackingRepository';
import { WeightSparkline } from '@features/tracking/components/WeightSparkline';
import { useTranslation } from '@i18n/useTranslation';
import {
  Badge,
  Button,
  Card,
  IconButton,
  ProgressBar,
  Row,
  SectionTitle,
  StatTile,
  Text,
} from '@ui/components';
import { Icon } from '@ui/components/Icon';
import { useTheme } from '@ui/theme/ThemeProvider';

type Nav = NativeStackNavigationProp<AllParamList>;

/**
 * Stage 3 home. The whole screen is organised around one question: is weight
 * drifting back, and how early can we catch it.
 */
export function VigilanceHomeScreen() {
  const navigation = useNavigation<Nav>();
  const queryClient = useQueryClient();
  const { theme } = useTheme();
  const { t } = useTranslation();

  const profile = useQuery({ queryKey: ['profile'], queryFn: getProfile });
  const progress = useQuery({ queryKey: ['progress'], queryFn: progressSummary });
  const risk = useQuery({ queryKey: ['relapseRisk'], queryFn: currentRelapseRisk });
  const milestones = useQuery({ queryKey: ['milestones'], queryFn: listMilestones });
  const checkInGap = useQuery({ queryKey: ['checkinGap'], queryFn: daysSinceLastCheckIn });
  const appointments = useQuery({ queryKey: ['appointments'], queryFn: listAppointments });

  const doctor = useQuery({
    queryKey: ['primaryDoctor', profile.data?.primaryDoctorId],
    queryFn: () =>
      profile.data?.primaryDoctorId ? getDoctor(profile.data.primaryDoctorId) : Promise.resolve(null),
    enabled: Boolean(profile.data?.primaryDoctorId),
  });

  const completedAt = profile.data?.treatmentCompletedAt
    ? new Date(profile.data.treatmentCompletedAt)
    : null;
  const monthsSince = completedAt
    ? Math.floor((Date.now() - completedAt.getTime()) / (30 * 86_400_000))
    : null;

  const regainKg =
    progress.data?.currentWeightKg && progress.data?.nadirKg
      ? Math.round((progress.data.currentWeightKg - progress.data.nadirKg) * 10) / 10
      : null;

  const riskBand = risk.data?.band ?? 'low';
  const riskTone = riskBand === 'high' ? 'danger' : riskBand === 'moderate' ? 'warning' : 'success';

  /*
    Only a real completion date produces checkpoints.

    `(monthsSince ?? 0) < m` yielded 3 even when the date was unset, so the
    "Remind me at 3, 6 and 12 months" button appeared and armed reminders
    counted from today — while the Checkpoints screen told the same patient they
    had no completion date and listed nothing. Two screens, two different
    answers about whether a schedule exists.
  */
  const nextCheckpoint =
    monthsSince === null ? undefined : [3, 6, 12].find((m) => monthsSince < m);

  /*
    The 3/6/12-month follow-ups used to be armed in exactly one place: choosing
    "I have finished treatment" during first-run onboarding. Anyone who moved
    through treatment inside the app and arrived here had no way to schedule
    them — the checkpoint text below said a follow-up was coming when no
    notification existed. This reads the real schedule and offers to arm it.
  */
  const followUps = useQuery({
    queryKey: ['vigilanceFollowUps'],
    queryFn: async () => {
      const reminders = await listScheduledReminders();
      return reminders.filter(
        (r) => r.category === 'checkin' && r.referenceId === 'vigilance' && r.active,
      );
    },
  });

  const armFollowUps = useMutation({
    mutationFn: async () => {
      const granted = await requestNotificationPermission();
      if (!granted) throw new Error('permission');
      await scheduleVigilanceFollowUps(completedAt ?? new Date());
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['vigilanceFollowUps'] });
      Alert.alert(
        'Follow-ups scheduled',
        'You will be reminded at the 3, 6 and 12-month marks. Checkpoints already past are skipped.',
      );
    },
    onError: () =>
      Alert.alert(
        'Notifications are off',
        'Follow-up reminders need notification permission. Turn it on for GLP Care in your phone settings.',
      ),
  });

  const followUpsArmed = (followUps.data ?? []).length > 0;

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: theme.background }} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
        <View className="flex-row items-center justify-between px-5 pt-2">
          <View className="flex-1">
            <Text variant="caption">{t('vigilance.title')}</Text>
            <Text variant="display">{profile.data?.displayName ?? 'Staying well'}</Text>
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
          {/* Completion badge */}
          <Card className="mt-4 border-vital-300 bg-vital-50 dark:border-vital-800 dark:bg-vital-900/20">
            <Row>
              <View className="h-12 w-12 items-center justify-center rounded-full bg-vital-100 dark:bg-vital-900/50">
                <Icon name="trophy" size={24} color="#0b955c" />
              </View>
              <View className="ml-3 flex-1">
                <Text variant="subheading">{t('vigilance.completionBadge')}</Text>
                <Text variant="caption" className="mt-0.5">
                  {completedAt
                    ? `${t('vigilance.timeSince')}: ${formatSince(completedAt)}`
                    : 'Set your completion date in your profile'}
                </Text>
              </View>
            </Row>
            {progress.data?.percentLost ? (
              <Text variant="body" className="mt-3">
                You finished {progress.data.percentLost}% below where you started. Holding that is a
                clinical achievement in its own right — most people are never told this.
              </Text>
            ) : null}
          </Card>

          {/* Risk score */}
          <SectionTitle title={t('vigilance.riskScore')} />
          <Card>
            <Row className="justify-between">
              <View>
                <Text variant="display">{risk.data?.score ?? 0}</Text>
                <Text variant="caption">out of 100</Text>
              </View>
              <Badge
                label={
                  riskBand === 'high'
                    ? t('vigilance.riskHigh')
                    : riskBand === 'moderate'
                      ? t('vigilance.riskModerate')
                      : t('vigilance.riskLow')
                }
                tone={riskTone}
              />
            </Row>

            <View className="mt-3">
              <ProgressBar value={risk.data?.score ?? 0} tone={riskTone === 'success' ? 'success' : riskTone} />
            </View>

            {(risk.data?.signals ?? []).length > 0 ? (
              <View className="mt-4">
                <Text variant="label" className="mb-1">
                  {t('vigilanceHome.drivingIt')}
                </Text>
                {(risk.data?.signals ?? []).map((signal) => (
                  <Row key={signal} className="mb-1">
                    <Icon name="warning" size={14} color={theme.warning} />
                    <Text variant="body" className="ml-2 flex-1">
                      {signal}
                    </Text>
                  </Row>
                ))}
              </View>
            ) : (
              <Text variant="body" className="mt-3">
                No warning signals right now. Keep the weekly weigh-in going — that is what makes
                early detection possible.
              </Text>
            )}

            {risk.data?.recommendation ? (
              <View className="mt-4 rounded-2xl bg-brand-50 p-3 dark:bg-brand-900/25">
                <Text variant="bodyStrong">{risk.data.recommendation}</Text>
              </View>
            ) : null}

            <Button
              className="mt-4"
              label={t('vigilance.relapsePrevention')}
              variant="secondary"
              fullWidth
              onPress={() => navigation.navigate('RelapsePlan')}
            />
            <Row className="mt-2 gap-2">
              <Button
                label={t('vigilanceHome.myPlan')}
                size="sm"
                variant="secondary"
                onPress={() => navigation.navigate('MaintenancePlan')}
              />
              <Button
                label={t('vigilanceHome.myCheckpoints')}
                size="sm"
                variant="secondary"
                onPress={() => navigation.navigate('Checkpoints')}
              />
            </Row>
          </Card>

          {/* Weight watch */}
          <SectionTitle title={t('vigilanceHome.weightWatch')} />
          <Row className="gap-2">
            <StatTile label={t('vigilanceHome.lowest')} value={progress.data?.nadirKg ?? '—'} unit="kg" tone="success" />
            <StatTile label="Now" value={progress.data?.currentWeightKg ?? '—'} unit="kg" tone="brand" />
            <StatTile
              label={t('vigilanceHome.drift')}
              value={regainKg !== null ? (regainKg > 0 ? `+${regainKg}` : regainKg) : '—'}
              unit="kg"
              tone={regainKg !== null && regainKg > 2 ? 'warning' : 'neutral'}
            />
          </Row>

          <Card className="mt-3">
            <Row className="mb-2 justify-between">
              <Text variant="subheading">Trend</Text>
              <Button
                label={t('treatment.logWeight')}
                size="sm"
                variant="secondary"
                onPress={() => navigation.navigate('LogWeight')}
              />
            </Row>
            <WeightSparkline entries={progress.data?.entries ?? []} height={140} />
            <Text variant="caption" className="mt-3">
              {t('vigilanceHome.thresholdNote')}
            </Text>
          </Card>

          {/* Check-in */}
          <SectionTitle title={t('vigilance.monthlyCheckin')} />
          <Card>
            <Text variant="body">
              {checkInGap.data === null
                ? 'You have not done a check-in yet. It takes a minute and sets your baseline.'
                : (checkInGap.data ?? 0) > 30
                  ? `It has been ${checkInGap.data} days. This is exactly the gap where drift goes unnoticed.`
                  : `Last check-in ${checkInGap.data ?? 0} day${checkInGap.data === 1 ? '' : 's'} ago. You are on track.`}
            </Text>
            {nextCheckpoint ? (
              <Text variant="caption" className="mt-2">
                {followUpsArmed
                  ? `Next scheduled follow-up: ${nextCheckpoint}-month checkpoint.`
                  : `Your ${nextCheckpoint}-month checkpoint is not set as a reminder yet.`}
              </Text>
            ) : null}
            <Button
              className="mt-3"
              label={t('vigilanceHome.doCheckIn')}
              fullWidth
              onPress={() => navigation.navigate('CheckIn', { kind: 'vigilance' })}
            />
            {nextCheckpoint && !followUpsArmed ? (
              <Button
                className="mt-2"
                label={t('vigilanceHome.remindMe')}
                variant="secondary"
                fullWidth
                loading={armFollowUps.isPending}
                onPress={() => armFollowUps.mutate()}
              />
            ) : null}
          </Card>

          {/* Doctor */}
          <SectionTitle title={t('vigilance.callDoctor')} />
          <CallDoctorCard
            title={t('vigilanceHome.somethingOff')}
            subtitle={t('vigilanceHome.somethingOffBody')}
            urgent={riskBand === 'high'}
          />
          {doctor.data ? (
            <Card className="mt-2">
              <Row className="justify-between">
                <View className="flex-1 pr-2">
                  <Text variant="caption">{t('vigilanceHome.primaryDoctor')}</Text>
                  <Text variant="bodyStrong" className="mt-0.5">
                    {doctor.data.fullName} — {doctor.data.speciality}
                  </Text>
                </View>
                <Button
                  label={t('vigilanceHome.bookReview')}
                  size="sm"
                  variant="secondary"
                  onPress={() =>
                    navigation.navigate('BookAppointment', { doctorId: doctor.data!.id })
                  }
                />
              </Row>
            </Card>
          ) : null}

          {/* Upcoming appointment */}
          {(appointments.data ?? []).filter(isUpcoming).length > 0 ? (
            <Card className="mt-3">
              <Text variant="label">{t('vigilanceHome.nextAppointment')}</Text>
              <Text variant="body" className="mt-1">
                {new Date(
                  (appointments.data ?? []).filter(isUpcoming).at(-1)!.scheduledAt,
                ).toLocaleString('en-IN', { dateStyle: 'full', timeStyle: 'short' })}
              </Text>
            </Card>
          ) : null}

          {/* Achievements */}
          <SectionTitle
            title={t('vigilance.achievements')}
            action={
              <Pressable
                accessibilityRole="button"
                onPress={() => navigation.navigate('Achievements')}
              >
                <Text variant="label" className="text-brand-700 dark:text-brand-200">
                  {t('common.seeAll')}
                </Text>
              </Pressable>
            }
          />
          <Row className="flex-wrap">
            {(milestones.data ?? []).slice(0, 6).map((milestone) => (
              <Badge
                key={milestone.id}
                label={milestone.code.replace(/_/g, ' ')}
                tone="success"
                className="mb-2 mr-2"
              />
            ))}
            {(milestones.data ?? []).length === 0 ? (
              <Text variant="body">
                {t('vigilanceHome.milestonesLocked')}
              </Text>
            ) : null}
          </Row>

          <SectionTitle title={t('vigilanceHome.warningSigns')} />
          {/*
            Not a pressable Card: it holds its own buttons, and a Pressable
            collapses its subtree for screen readers, which would make them
            unreachable. The buttons carry the navigation instead.
          */}
          <Card>
            <Row className="justify-between">
              <Row className="flex-1">
                <Icon name="warning" size={18} color={theme.warning} />
                <Text variant="subheading" className="ml-2 flex-1">
                  {t('vigilanceHome.adverseEvents')}
                </Text>
              </Row>
              <Icon name="chevron" size={18} color={theme.textMuted} />
            </Row>
            <Text variant="body" className="mt-2">
              {t('vigilanceHome.adverseEventsBody')}
            </Text>
            <Row className="mt-3 gap-2">
              <Button
                label={t('vigilanceHome.mySideEffects')}
                size="sm"
                variant="secondary"
                onPress={() => navigation.navigate('SideEffects')}
              />
              <Button
                label={t('vigilanceHome.callLog')}
                size="sm"
                variant="ghost"
                onPress={() => navigation.navigate('CallHistory')}
              />
            </Row>
            <Button
              className="mt-2"
              label={t('vigilanceHome.readAbout')}
              size="sm"
              variant="ghost"
              fullWidth
              onPress={() => navigation.navigate('EducationTopic', { topicId: 'side-effects' })}
            />
          </Card>

          <Card
            className="mt-2"
            onPress={() => navigation.navigate('MaintenancePlan')}
          >
            <Row className="justify-between">
              <Row className="flex-1">
                <Icon name="shield" size={18} color={theme.primary} />
                <Text variant="subheading" className="ml-2 flex-1">
                  {t('vigilanceHome.maintenancePlan')}
                </Text>
              </Row>
              <Icon name="chevron" size={18} color={theme.textMuted} />
            </Row>
          </Card>

          <Button
            className="mt-6"
            label={t('vigilanceHome.talkToCoach')}
            variant="secondary"
            fullWidth
            onPress={() => navigation.navigate('Chat')}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function formatSince(date: Date): string {
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days < 31) return `${days} day${days === 1 ? '' : 's'}`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'}`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return `${years} year${years === 1 ? '' : 's'}${rest ? ` ${rest} mo` : ''}`;
}
