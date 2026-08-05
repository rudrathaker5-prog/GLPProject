import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
  type LinkingOptions,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';

import { useAuthStore } from '@features/auth/store/authStore';
import { useTranslation } from '@i18n/useTranslation';
import { Icon, type IconName } from '@ui/components/Icon';
import { useTheme } from '@ui/theme/ThemeProvider';

// Awareness
import { AwarenessHomeScreen } from '@features/awareness/screens/AwarenessHomeScreen';
import { LearnScreen } from '@features/awareness/screens/LearnScreen';
import { MythsScreen } from '@features/awareness/screens/MythsScreen';
import { MythDetailScreen } from '@features/awareness/screens/MythDetailScreen';
import { EducationTopicScreen } from '@features/awareness/screens/EducationTopicScreen';
import { EligibilityCheckerScreen } from '@features/awareness/screens/EligibilityCheckerScreen';

// Chat
import { ChatScreen } from '@features/ai/screens/ChatScreen';

// Doctors & appointments
import { DoctorsScreen } from '@features/doctors/screens/DoctorsScreen';
import { DoctorDetailScreen } from '@features/doctors/screens/DoctorDetailScreen';
import { BookAppointmentScreen } from '@features/appointments/screens/BookAppointmentScreen';
import { AppointmentsScreen } from '@features/appointments/screens/AppointmentsScreen';
import { AppointmentDetailScreen } from '@features/appointments/screens/AppointmentDetailScreen';

// Auth & onboarding
import { OnboardingScreen } from '@features/auth/screens/OnboardingScreen';
import { AuthScreen } from '@features/auth/screens/AuthScreen';

// Treatment
import { DashboardScreen } from '@features/treatment/screens/DashboardScreen';
import { MedicationScreen } from '@features/medication/screens/MedicationScreen';
import { MedicationDetailScreen } from '@features/medication/screens/MedicationDetailScreen';
import { AddMedicationScreen } from '@features/medication/screens/AddMedicationScreen';
import { PrescriptionUploadScreen } from '@features/medication/screens/PrescriptionUploadScreen';
import { RefillScreen } from '@features/medication/screens/RefillScreen';
import { LogWeightScreen } from '@features/tracking/screens/LogWeightScreen';
import { CheckInScreen } from '@features/tracking/screens/CheckInScreen';
import { ProgressScreen } from '@features/tracking/screens/ProgressScreen';
import { JourneyScreen } from '@features/journey/screens/JourneyScreen';
import { NutritionScreen } from '@features/nutrition/screens/NutritionScreen';
import { DoctorNotesScreen } from '@features/doctorNotes/screens/DoctorNotesScreen';
import { DoctorNoteDetailScreen } from '@features/doctorNotes/screens/DoctorNoteDetailScreen';
import { PeerSupportScreen } from '@features/peer/screens/PeerSupportScreen';
import { PeerGroupScreen } from '@features/peer/screens/PeerGroupScreen';

// Vigilance
import { VigilanceHomeScreen } from '@features/vigilance/screens/VigilanceHomeScreen';
import { AchievementsScreen } from '@features/vigilance/screens/AchievementsScreen';
import { RelapsePlanScreen } from '@features/vigilance/screens/RelapsePlanScreen';

// Doctor portal
import { PatientsScreen } from '@features/doctorPortal/screens/PatientsScreen';
import { DoctorAppointmentsScreen } from '@features/doctorPortal/screens/DoctorAppointmentsScreen';
import { DoctorProfileScreen } from '@features/doctorPortal/screens/DoctorProfileScreen';

// Settings
import { ProfileScreen } from '@features/profile/screens/ProfileScreen';
import { SettingsScreen } from '@features/settings/screens/SettingsScreen';
import { NotificationsScreen } from '@features/notifications/screens/NotificationsScreen';
import { DevicesScreen } from '@features/settings/screens/DevicesScreen';
import { AboutScreen } from '@features/settings/screens/AboutScreen';

import type {
  AwarenessTabParamList,
  DoctorTabParamList,
  RootStackParamList,
  TreatmentTabParamList,
  VigilanceTabParamList,
} from './types';

const RootStack = createNativeStackNavigator<RootStackParamList>();
const AwarenessTabs = createBottomTabNavigator<AwarenessTabParamList>();
const TreatmentTabs = createBottomTabNavigator<TreatmentTabParamList>();
const VigilanceTabs = createBottomTabNavigator<VigilanceTabParamList>();
const DoctorTabs = createBottomTabNavigator<DoctorTabParamList>();

const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [Linking.createURL('/'), 'glpcare://'],
  config: {
    screens: {
      Awareness: { screens: { AwarenessHome: 'home', Doctors: 'doctors', Myths: 'myths' } },
      Treatment: { screens: { Dashboard: 'today', Journey: 'journey', Nutrition: 'nutrition' } },
      Vigilance: { screens: { VigilanceHome: 'vigilance' } },
      Chat: 'chat',
      Medication: 'medication',
      CheckIn: 'checkin',
      Appointments: 'appointments',
      AppointmentDetail: 'appointment/:appointmentId',
      DoctorNotes: 'doctor-notes',
      DoctorNoteDetail: 'doctor-notes/:noteId',
      Refill: 'refill/:medicationId',
      Notifications: 'notifications',
      Settings: 'settings',
    },
  },
};

function useTabScreenOptions() {
  const { theme } = useTheme();
  return {
    headerShown: false,
    tabBarActiveTintColor: theme.primary,
    tabBarInactiveTintColor: theme.textMuted,
    tabBarStyle: {
      backgroundColor: theme.surface,
      borderTopColor: theme.border,
      height: 62,
      paddingBottom: 8,
      paddingTop: 6,
    },
    tabBarLabelStyle: { fontSize: 11, fontWeight: '600' as const },
  };
}

function tabIcon(name: IconName) {
  const render = ({ color }: { color: string; focused: boolean }) => (
    <Icon name={name} color={color} size={22} />
  );
  render.displayName = `TabIcon(${name})`;
  return render;
}

function AwarenessNavigator() {
  const options = useTabScreenOptions();
  const { t } = useTranslation();
  return (
    <AwarenessTabs.Navigator screenOptions={options}>
      <AwarenessTabs.Screen
        name="AwarenessHome"
        component={AwarenessHomeScreen}
        options={{ title: t('tabs.home'), tabBarIcon: tabIcon('home') }}
      />
      <AwarenessTabs.Screen
        name="Learn"
        component={LearnScreen}
        options={{ title: t('tabs.learn'), tabBarIcon: tabIcon('learn') }}
      />
      <AwarenessTabs.Screen
        name="Myths"
        component={MythsScreen}
        options={{ title: t('awareness.mythsVsFacts'), tabBarIcon: tabIcon('shield') }}
      />
      <AwarenessTabs.Screen
        name="Doctors"
        component={DoctorsScreen}
        options={{ title: t('tabs.doctors'), tabBarIcon: tabIcon('doctor') }}
      />
    </AwarenessTabs.Navigator>
  );
}

function TreatmentNavigator() {
  const options = useTabScreenOptions();
  const { t } = useTranslation();
  return (
    <TreatmentTabs.Navigator screenOptions={options}>
      <TreatmentTabs.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{ title: t('tabs.dashboard'), tabBarIcon: tabIcon('home') }}
      />
      <TreatmentTabs.Screen
        name="Coach"
        component={ChatScreen}
        options={{ title: t('tabs.coach'), tabBarIcon: tabIcon('chat') }}
      />
      <TreatmentTabs.Screen
        name="Journey"
        component={JourneyScreen}
        options={{ title: t('tabs.journey'), tabBarIcon: tabIcon('chart') }}
      />
      <TreatmentTabs.Screen
        name="Nutrition"
        component={NutritionScreen}
        options={{ title: t('tabs.nutrition'), tabBarIcon: tabIcon('nutrition') }}
      />
      <TreatmentTabs.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ title: t('tabs.profile'), tabBarIcon: tabIcon('profile') }}
      />
    </TreatmentTabs.Navigator>
  );
}

function VigilanceNavigator() {
  const options = useTabScreenOptions();
  const { t } = useTranslation();
  return (
    <VigilanceTabs.Navigator screenOptions={options}>
      <VigilanceTabs.Screen
        name="VigilanceHome"
        component={VigilanceHomeScreen}
        options={{ title: t('vigilance.title'), tabBarIcon: tabIcon('shield') }}
      />
      <VigilanceTabs.Screen
        name="Coach"
        component={ChatScreen}
        options={{ title: t('tabs.coach'), tabBarIcon: tabIcon('chat') }}
      />
      <VigilanceTabs.Screen
        name="Achievements"
        component={AchievementsScreen}
        options={{ title: t('vigilance.achievements'), tabBarIcon: tabIcon('trophy') }}
      />
      <VigilanceTabs.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ title: t('tabs.profile'), tabBarIcon: tabIcon('profile') }}
      />
    </VigilanceTabs.Navigator>
  );
}

function DoctorNavigator() {
  const options = useTabScreenOptions();
  return (
    <DoctorTabs.Navigator screenOptions={options}>
      <DoctorTabs.Screen
        name="Patients"
        component={PatientsScreen}
        options={{ title: 'Patients', tabBarIcon: tabIcon('people') }}
      />
      <DoctorTabs.Screen
        name="DoctorAppointments"
        component={DoctorAppointmentsScreen}
        options={{ title: 'Schedule', tabBarIcon: tabIcon('calendar') }}
      />
      <DoctorTabs.Screen
        name="DoctorProfile"
        component={DoctorProfileScreen}
        options={{ title: 'Profile', tabBarIcon: tabIcon('profile') }}
      />
    </DoctorTabs.Navigator>
  );
}

export function RootNavigator() {
  const { theme, isDark } = useTheme();
  const stage = useAuthStore((s) => s.stage);
  const mode = useAuthStore((s) => s.mode);
  const initialised = useAuthStore((s) => s.initialised);

  // Notification taps deep-link into the right screen.
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const deepLink = response.notification.request.content.data?.deepLink;
      if (typeof deepLink === 'string') {
        void Linking.openURL(deepLink).catch(() => undefined);
      }
    });
    return () => subscription.remove();
  }, []);

  const navTheme = {
    ...(isDark ? DarkTheme : DefaultTheme),
    colors: {
      ...(isDark ? DarkTheme : DefaultTheme).colors,
      primary: theme.primary,
      background: theme.background,
      card: theme.surface,
      text: theme.text,
      border: theme.border,
    },
  };

  const initialRoute: keyof RootStackParamList =
    mode === 'doctor'
      ? 'DoctorPortal'
      : stage === 'treatment'
        ? 'Treatment'
        : stage === 'vigilance'
          ? 'Vigilance'
          : 'Awareness';

  if (!initialised) return null;

  return (
    <NavigationContainer theme={navTheme} linking={linking}>
      <RootStack.Navigator
        initialRouteName={initialRoute}
        screenOptions={{
          headerShown: true,
          headerTintColor: theme.text,
          headerStyle: { backgroundColor: theme.surface },
          headerTitleStyle: { fontWeight: '600' },
          contentStyle: { backgroundColor: theme.background },
        }}
      >
        <RootStack.Screen
          name="Awareness"
          component={AwarenessNavigator}
          options={{ headerShown: false }}
        />
        <RootStack.Screen
          name="Treatment"
          component={TreatmentNavigator}
          options={{ headerShown: false }}
        />
        <RootStack.Screen
          name="Vigilance"
          component={VigilanceNavigator}
          options={{ headerShown: false }}
        />
        <RootStack.Screen
          name="DoctorPortal"
          component={DoctorNavigator}
          options={{ headerShown: false }}
        />

        <RootStack.Screen name="Chat" component={ChatScreen} options={{ title: 'AI care coach' }} />
        <RootStack.Screen
          name="EligibilityChecker"
          component={EligibilityCheckerScreen}
          options={{ title: 'Eligibility check' }}
        />
        <RootStack.Screen
          name="EducationTopic"
          component={EducationTopicScreen}
          options={{ title: '' }}
        />
        <RootStack.Screen name="MythDetail" component={MythDetailScreen} options={{ title: '' }} />
        <RootStack.Screen
          name="DoctorDetail"
          component={DoctorDetailScreen}
          options={{ title: 'Doctor' }}
        />
        <RootStack.Screen
          name="BookAppointment"
          component={BookAppointmentScreen}
          options={{ title: 'Book appointment' }}
        />
        <RootStack.Screen
          name="Appointments"
          component={AppointmentsScreen}
          options={{ title: 'Appointments' }}
        />
        <RootStack.Screen
          name="AppointmentDetail"
          component={AppointmentDetailScreen}
          options={{ title: 'Appointment' }}
        />

        <RootStack.Screen
          name="Onboarding"
          component={OnboardingScreen}
          options={{ headerShown: false }}
        />
        <RootStack.Screen name="Auth" component={AuthScreen} options={{ title: 'Your account' }} />

        <RootStack.Screen
          name="Medication"
          component={MedicationScreen}
          options={{ title: 'Medication' }}
        />
        <RootStack.Screen
          name="MedicationDetail"
          component={MedicationDetailScreen}
          options={{ title: 'Medicine' }}
        />
        <RootStack.Screen
          name="AddMedication"
          component={AddMedicationScreen}
          options={{ title: 'Add medicine' }}
        />
        <RootStack.Screen
          name="PrescriptionUpload"
          component={PrescriptionUploadScreen}
          options={{ title: 'Prescription' }}
        />
        <RootStack.Screen name="Refill" component={RefillScreen} options={{ title: 'Refill' }} />

        <RootStack.Screen
          name="LogWeight"
          component={LogWeightScreen}
          options={{ title: 'Log weight' }}
        />
        <RootStack.Screen name="CheckIn" component={CheckInScreen} options={{ title: 'Check-in' }} />
        <RootStack.Screen
          name="Progress"
          component={ProgressScreen}
          options={{ title: 'Progress' }}
        />
        <RootStack.Screen
          name="DoctorNotes"
          component={DoctorNotesScreen}
          options={{ title: 'Doctor notes' }}
        />
        <RootStack.Screen
          name="DoctorNoteDetail"
          component={DoctorNoteDetailScreen}
          options={{ title: 'Note' }}
        />
        <RootStack.Screen
          name="PeerSupport"
          component={PeerSupportScreen}
          options={{ title: 'Peer support' }}
        />
        <RootStack.Screen
          name="PeerGroup"
          component={PeerGroupScreen}
          options={{ title: 'Group' }}
        />
        <RootStack.Screen
          name="RelapsePlan"
          component={RelapsePlanScreen}
          options={{ title: 'Relapse prevention' }}
        />

        <RootStack.Screen
          name="Settings"
          component={SettingsScreen}
          options={{ title: 'Settings' }}
        />
        <RootStack.Screen
          name="Notifications"
          component={NotificationsScreen}
          options={{ title: 'Notifications' }}
        />
        <RootStack.Screen
          name="Devices"
          component={DevicesScreen}
          options={{ title: 'Devices & health data' }}
        />
        <RootStack.Screen name="About" component={AboutScreen} options={{ title: 'About' }} />
      </RootStack.Navigator>
    </NavigationContainer>
  );
}
