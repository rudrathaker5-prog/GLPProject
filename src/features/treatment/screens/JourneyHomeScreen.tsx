import { useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { AllParamList } from '@/app/navigation/types';
import { listMedications } from '@features/medication/api/medicationRepository';
import { getProfile } from '@features/profile/api/profileRepository';
import { PRIMARY_DOCTORS } from '@features/doctors/api/fallbackDirectory';
import { callNumber } from '@integrations/communication/communicationAdapter';
import { useTranslation } from '@i18n/useTranslation';
import { Button, Card, Row, SectionTitle, Text } from '@ui/components';
import { Icon, type IconName } from '@ui/components/Icon';
import { useTheme } from '@ui/theme/ThemeProvider';

import { DashboardScreen } from './DashboardScreen';

type Nav = NativeStackNavigationProp<AllParamList>;

/**
 * Root of the "My Journey" tab.
 *
 * The tab is always reachable, including before treatment starts, so this
 * decides what to show:
 *  - treatment under way  → the full dashboard
 *  - not started yet      → a warm, useful "getting ready" state that still
 *                           lets the person do real things (talk to the coach,
 *                           call a doctor, add a prescription) rather than an
 *                           empty screen behind a gate.
 */
export function JourneyHomeScreen() {
  const profile = useQuery({ queryKey: ['profile'], queryFn: getProfile });
  const medications = useQuery({ queryKey: ['medications'], queryFn: () => listMedications() });

  const hasStarted =
    Boolean(profile.data?.treatmentStartedAt) || (medications.data ?? []).length > 0;

  if (profile.isLoading) return <PreTreatment loading />;
  if (hasStarted) return <DashboardScreen />;
  return <PreTreatment />;
}

function PreTreatment({ loading = false }: { loading?: boolean }) {
  const navigation = useNavigation<Nav>();
  const { theme, isDark } = useTheme();
  const { t } = useTranslation();

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: theme.background }} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
        <View className="flex-row items-center justify-between px-5 pt-2">
          <View className="flex-1">
            <Text variant="caption">{t('tabs.myJourney')}</Text>
            <Text variant="display">Getting ready</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('tabs.profile')}
            onPress={() => navigation.navigate('Profile')}
            className="mr-3"
          >
            <Icon name="profile" size={22} color={theme.textSoft} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('settings.title')}
            onPress={() => navigation.navigate('Settings')}
          >
            <Icon name="settings" size={22} color={theme.textSoft} />
          </Pressable>
        </View>

        <View className="px-5 pt-4">
          <LinearGradient
            colors={isDark ? ['#0b774c', '#17438c'] : ['#17b871', '#1a63dd']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ borderRadius: 24, padding: 20 }}
          >
            <Row className="mb-2">
              <Icon name="heart" size={18} color="#ffffff" />
              <Text variant="label" className="ml-2 text-white/90">
                Your treatment space
              </Text>
            </Row>
            <Text variant="title" className="text-white">
              This is where your treatment lives
            </Text>
            <Text variant="body" className="mt-2 text-white/90">
              Doses, reminders, weight, nutrition and your coach — all here once you begin. Nothing
              is locked. You can set it up now or come back later.
            </Text>

            <View className="mt-4">
              <Button
                label="Set up my treatment"
                variant="secondary"
                fullWidth
                onPress={() => navigation.navigate('Onboarding')}
              />
            </View>
          </LinearGradient>
        </View>

        {/* Things that work right now, before anything is set up */}
        <View className="px-5">
          <SectionTitle title="You can do this now" />

          <ActionRow
            icon="chat"
            title="Talk to your care coach"
            body="Ask about starting treatment, side effects, cost, or whether you are ready. It handles CBT, ACT and motivational-interviewing style conversations."
            cta="Open the coach"
            onPress={() =>
              navigation.navigate('Chat', {
                initialPrompt: 'I am thinking about starting treatment. Can you help me decide?',
              })
            }
          />

          <ActionRow
            icon="camera"
            title="Already have a prescription?"
            body="Photograph it and your medicines, dose schedule and reminders are created automatically."
            cta="Add prescription"
            onPress={() => navigation.navigate('PrescriptionUpload')}
          />

          <ActionRow
            icon="doctor"
            title="Speak to a doctor"
            body="Call directly, or book an in-person or video consultation."
            cta="See doctors"
            onPress={() => navigation.navigate('Doctors')}
          />

          <ActionRow
            icon="chart"
            title="Start tracking"
            body="Log today's weight to set your baseline. Percentage change from here is what matters clinically."
            cta="Log weight"
            onPress={() => navigation.navigate('LogWeight')}
          />
        </View>

        {/* One-tap doctor calls */}
        <View className="px-5">
          <SectionTitle title="Call a doctor now" />
          {PRIMARY_DOCTORS.map((doctor) => (
            <Card key={doctor.id} className="mb-2">
              <Row className="justify-between">
                <View className="flex-1 pr-3">
                  <Text variant="subheading">{doctor.fullName}</Text>
                  <Text variant="caption" className="mt-0.5">
                    {doctor.speciality} · {doctor.phone}
                  </Text>
                </View>
                <Button
                  label="Call"
                  size="sm"
                  icon={<Icon name="phone" size={16} color="#ffffff" />}
                  onPress={() => void callNumber(doctor.phone)}
                />
              </Row>
            </Card>
          ))}
        </View>

        {loading ? null : (
          <Text variant="caption" className="mt-6 px-5 text-center">
            {t('safety.notMedicalAdvice')}
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ActionRow({
  icon,
  title,
  body,
  cta,
  onPress,
}: {
  icon: IconName;
  title: string;
  body: string;
  cta: string;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Card className="mb-3" onPress={onPress}>
      <Row>
        <View
          className="h-11 w-11 items-center justify-center rounded-2xl"
          style={{ backgroundColor: `${theme.primary}18` }}
        >
          <Icon name={icon} size={20} color={theme.primary} />
        </View>
        <View className="ml-3 flex-1">
          <Text variant="subheading">{title}</Text>
          <Text variant="body" className="mt-1">
            {body}
          </Text>
          <Row className="mt-2">
            <Text variant="label" className="text-brand-700 dark:text-brand-200">
              {cta}
            </Text>
            <View className="ml-1">
              <Icon name="chevron" size={14} color={theme.primary} />
            </View>
          </Row>
        </View>
      </Row>
    </Card>
  );
}
