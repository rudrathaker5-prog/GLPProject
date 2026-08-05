import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { ChatScreen } from '@features/ai/screens/ChatScreen';
import { AppointmentDetailScreen } from '@features/appointments/screens/AppointmentDetailScreen';
import { AppointmentsScreen } from '@features/appointments/screens/AppointmentsScreen';
import { BookAppointmentScreen } from '@features/appointments/screens/BookAppointmentScreen';
import { AwarenessHomeScreen } from '@features/awareness/screens/AwarenessHomeScreen';
import { EducationTopicScreen } from '@features/awareness/screens/EducationTopicScreen';
import { EligibilityCheckerScreen } from '@features/awareness/screens/EligibilityCheckerScreen';
import { LearnScreen } from '@features/awareness/screens/LearnScreen';
import { MythDetailScreen } from '@features/awareness/screens/MythDetailScreen';
import { MythsScreen } from '@features/awareness/screens/MythsScreen';
import { DoctorNoteDetailScreen } from '@features/doctorNotes/screens/DoctorNoteDetailScreen';
import { DoctorNotesScreen } from '@features/doctorNotes/screens/DoctorNotesScreen';
import { DoctorDetailScreen } from '@features/doctors/screens/DoctorDetailScreen';
import { DoctorsScreen } from '@features/doctors/screens/DoctorsScreen';
import { JourneyScreen } from '@features/journey/screens/JourneyScreen';
import { AddMedicationScreen } from '@features/medication/screens/AddMedicationScreen';
import { MedicationDetailScreen } from '@features/medication/screens/MedicationDetailScreen';
import { MedicationScreen } from '@features/medication/screens/MedicationScreen';
import { PrescriptionUploadScreen } from '@features/medication/screens/PrescriptionUploadScreen';
import { RefillScreen } from '@features/medication/screens/RefillScreen';
import { NotificationsScreen } from '@features/notifications/screens/NotificationsScreen';
import { NutritionScreen } from '@features/nutrition/screens/NutritionScreen';
import { PeerGroupScreen } from '@features/peer/screens/PeerGroupScreen';
import { PeerSupportScreen } from '@features/peer/screens/PeerSupportScreen';
import { ProfileScreen } from '@features/profile/screens/ProfileScreen';
import { AboutScreen } from '@features/settings/screens/AboutScreen';
import { AiSettingsScreen } from '@features/settings/screens/AiSettingsScreen';
import { DevicesScreen } from '@features/settings/screens/DevicesScreen';
import { SettingsScreen } from '@features/settings/screens/SettingsScreen';
import { CheckInScreen } from '@features/tracking/screens/CheckInScreen';
import { LogWeightScreen } from '@features/tracking/screens/LogWeightScreen';
import { ProgressScreen } from '@features/tracking/screens/ProgressScreen';
import { JourneyHomeScreen } from '@features/treatment/screens/JourneyHomeScreen';
import { AchievementsScreen } from '@features/vigilance/screens/AchievementsScreen';
import { RelapsePlanScreen } from '@features/vigilance/screens/RelapsePlanScreen';
import { VigilanceHomeScreen } from '@features/vigilance/screens/VigilanceHomeScreen';
import { useTheme } from '@ui/theme/ThemeProvider';

import type { AppStackParamList } from './types';

const Stack = createNativeStackNavigator<AppStackParamList>();

/**
 * Every tab renders this same stack with a different initial route.
 *
 * Registering all pushable screens in each tab is deliberate: it keeps the tab
 * bar visible while drilling down, keeps the back stack scoped to the tab the
 * user is in, and means a screen reached from two different tabs behaves
 * identically in both. React Navigation instantiates screens lazily, so the
 * cost of registering them is a route definition, not a mounted component.
 */
export function AppStack({
  initialRouteName,
}: {
  initialRouteName: keyof AppStackParamList;
}) {
  const { theme } = useTheme();

  return (
    <Stack.Navigator
      initialRouteName={initialRouteName}
      screenOptions={{
        headerShown: true,
        headerTintColor: theme.text,
        headerStyle: { backgroundColor: theme.surface },
        headerTitleStyle: { fontWeight: '600' },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: theme.background },
        animation: 'slide_from_right',
      }}
    >
      {/* Tab roots — these draw their own headers */}
      <Stack.Screen
        name="AwarenessHome"
        component={AwarenessHomeScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="JourneyHome"
        component={JourneyHomeScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="VigilanceHome"
        component={VigilanceHomeScreen}
        options={{ headerShown: false }}
      />

      {/* Conversation */}
      <Stack.Screen name="Chat" component={ChatScreen} options={{ title: 'Saathi' }} />

      {/* Awareness */}
      <Stack.Screen
        name="EligibilityChecker"
        component={EligibilityCheckerScreen}
        options={{ title: 'Eligibility check' }}
      />
      <Stack.Screen name="Learn" component={LearnScreen} options={{ title: 'Learn' }} />
      <Stack.Screen name="EducationTopic" component={EducationTopicScreen} options={{ title: '' }} />
      <Stack.Screen name="Myths" component={MythsScreen} options={{ title: 'Myths vs facts' }} />
      <Stack.Screen name="MythDetail" component={MythDetailScreen} options={{ title: '' }} />

      {/* Care team */}
      <Stack.Screen name="Doctors" component={DoctorsScreen} options={{ title: 'Talk to a doctor' }} />
      <Stack.Screen name="DoctorDetail" component={DoctorDetailScreen} options={{ title: 'Doctor' }} />
      <Stack.Screen
        name="BookAppointment"
        component={BookAppointmentScreen}
        options={{ title: 'Book appointment' }}
      />
      <Stack.Screen
        name="Appointments"
        component={AppointmentsScreen}
        options={{ title: 'Appointments' }}
      />
      <Stack.Screen
        name="AppointmentDetail"
        component={AppointmentDetailScreen}
        options={{ title: 'Appointment' }}
      />

      {/* Treatment */}
      <Stack.Screen name="Medication" component={MedicationScreen} options={{ title: 'Medication' }} />
      <Stack.Screen
        name="MedicationDetail"
        component={MedicationDetailScreen}
        options={{ title: 'Medicine' }}
      />
      <Stack.Screen
        name="AddMedication"
        component={AddMedicationScreen}
        options={{ title: 'Add medicine' }}
      />
      <Stack.Screen
        name="PrescriptionUpload"
        component={PrescriptionUploadScreen}
        options={{ title: 'Prescription' }}
      />
      <Stack.Screen name="Refill" component={RefillScreen} options={{ title: 'Refill' }} />
      <Stack.Screen name="LogWeight" component={LogWeightScreen} options={{ title: 'Log weight' }} />
      <Stack.Screen name="CheckIn" component={CheckInScreen} options={{ title: 'Check-in' }} />
      <Stack.Screen name="Progress" component={ProgressScreen} options={{ title: 'Progress' }} />
      <Stack.Screen name="JourneyMap" component={JourneyScreen} options={{ title: 'Journey map' }} />
      <Stack.Screen name="Nutrition" component={NutritionScreen} options={{ title: 'Nutrition' }} />
      <Stack.Screen
        name="DoctorNotes"
        component={DoctorNotesScreen}
        options={{ title: 'Doctor notes' }}
      />
      <Stack.Screen
        name="DoctorNoteDetail"
        component={DoctorNoteDetailScreen}
        options={{ title: 'Note' }}
      />
      <Stack.Screen
        name="PeerSupport"
        component={PeerSupportScreen}
        options={{ title: 'Peer support' }}
      />
      <Stack.Screen name="PeerGroup" component={PeerGroupScreen} options={{ title: 'Group' }} />

      {/* Vigilance */}
      <Stack.Screen
        name="RelapsePlan"
        component={RelapsePlanScreen}
        options={{ title: 'Relapse prevention' }}
      />
      <Stack.Screen
        name="Achievements"
        component={AchievementsScreen}
        options={{ title: 'Achievements' }}
      />

      {/* Account & settings */}
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profile' }} />
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
      <Stack.Screen
        name="AiSettings"
        component={AiSettingsScreen}
        options={{ title: 'AI settings' }}
      />
      <Stack.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{ title: 'Reminders' }}
      />
      <Stack.Screen name="Devices" component={DevicesScreen} options={{ title: 'Devices' }} />
      <Stack.Screen name="About" component={AboutScreen} options={{ title: 'About' }} />
    </Stack.Navigator>
  );
}

export function AwarenessStack() {
  return <AppStack initialRouteName="AwarenessHome" />;
}

export function JourneyStack() {
  return <AppStack initialRouteName="JourneyHome" />;
}

export function VigilanceStack() {
  return <AppStack initialRouteName="VigilanceHome" />;
}
