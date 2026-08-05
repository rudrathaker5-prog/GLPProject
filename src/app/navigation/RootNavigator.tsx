import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
  createNavigationContainerRef,
  type LinkingOptions,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';

import { AuthScreen } from '@features/auth/screens/AuthScreen';
import { OnboardingScreen } from '@features/auth/screens/OnboardingScreen';
import { useAuthStore } from '@features/auth/store/authStore';
import { DoctorAppointmentsScreen } from '@features/doctorPortal/screens/DoctorAppointmentsScreen';
import { DoctorProfileScreen } from '@features/doctorPortal/screens/DoctorProfileScreen';
import { PatientsScreen } from '@features/doctorPortal/screens/PatientsScreen';
import { Icon, type IconName } from '@ui/components/Icon';
import { useTheme } from '@ui/theme/ThemeProvider';

import { MainTabs } from './MainTabs';
import { tabForDeepLink } from './tabs';
import type { DoctorTabParamList, RootStackParamList } from './types';

const RootStack = createNativeStackNavigator<RootStackParamList>();
const DoctorTabs = createBottomTabNavigator<DoctorTabParamList>();

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

/**
 * Deep links resolve into the tab stack, so a medication reminder opens the
 * medication screen *inside* the My Journey tab rather than replacing the app.
 */
const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [Linking.createURL('/'), 'glpcare://'],
  config: {
    screens: {
      Main: {
        screens: {
          AwarenessTab: {
            screens: {
              AwarenessHome: 'home',
              Doctors: 'doctors',
              Myths: 'myths',
              Learn: 'learn',
              Chat: 'chat',
            },
          },
          JourneyTab: {
            screens: {
              JourneyHome: 'today',
              Medication: 'medication',
              Refill: 'refill/:medicationId',
              CheckIn: 'checkin',
              JourneyMap: 'journey',
              Nutrition: 'nutrition',
              DoctorNotes: 'doctor-notes',
              DoctorNoteDetail: 'doctor-notes/:noteId',
              Appointments: 'appointments',
              AppointmentDetail: 'appointment/:appointmentId',
              Notifications: 'notifications',
              Settings: 'settings',
            },
          },
          VigilanceTab: {
            screens: {
              VigilanceHome: 'vigilance',
              RelapsePlan: 'relapse',
              Achievements: 'achievements',
            },
          },
        },
      },
      Onboarding: 'start',
      Auth: 'account',
    },
  },
};

function DoctorPortal() {
  const { theme } = useTheme();
  const options = {
    headerShown: false,
    tabBarActiveTintColor: theme.primary,
    tabBarInactiveTintColor: theme.textMuted,
    tabBarStyle: {
      backgroundColor: theme.surface,
      borderTopColor: theme.border,
      height: 64,
      paddingBottom: 8,
      paddingTop: 6,
    },
  };

  const icon = (name: IconName) => {
    const render = ({ color }: { color: string }) => <Icon name={name} color={color} size={22} />;
    render.displayName = `DoctorTabIcon(${name})`;
    return render;
  };

  return (
    <DoctorTabs.Navigator screenOptions={options}>
      <DoctorTabs.Screen
        name="Patients"
        component={PatientsScreen}
        options={{ title: 'Patients', tabBarIcon: icon('people') }}
      />
      <DoctorTabs.Screen
        name="DoctorAppointments"
        component={DoctorAppointmentsScreen}
        options={{ title: 'Schedule', tabBarIcon: icon('calendar') }}
      />
      <DoctorTabs.Screen
        name="DoctorProfile"
        component={DoctorProfileScreen}
        options={{ title: 'Profile', tabBarIcon: icon('profile') }}
      />
    </DoctorTabs.Navigator>
  );
}

export function RootNavigator() {
  const { theme, isDark } = useTheme();
  const mode = useAuthStore((s) => s.mode);
  const initialised = useAuthStore((s) => s.initialised);

  // Tapping a notification lands on the right tab and screen.
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const deepLink = response.notification.request.content.data?.deepLink;
      if (typeof deepLink !== 'string') return;

      const path = deepLink.replace('glpcare://', '');
      if (!navigationRef.isReady()) return;

      navigationRef.navigate('Main', {
        screen: tabForDeepLink(path),
      } as never);

      // Let the linking config resolve the specific screen inside that tab.
      void Linking.openURL(deepLink).catch(() => undefined);
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

  if (!initialised) return null;

  return (
    <NavigationContainer ref={navigationRef} theme={navTheme} linking={linking}>
      <RootStack.Navigator
        initialRouteName={mode === 'doctor' ? 'DoctorPortal' : 'Main'}
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.background },
        }}
      >
        <RootStack.Screen name="Main" component={MainTabs} />
        <RootStack.Screen name="DoctorPortal" component={DoctorPortal} />
        <RootStack.Screen
          name="Onboarding"
          component={OnboardingScreen}
          options={{ presentation: 'modal' }}
        />
        <RootStack.Screen
          name="Auth"
          component={AuthScreen}
          options={{
            presentation: 'modal',
            headerShown: true,
            title: 'Your account',
            headerTintColor: theme.text,
            headerStyle: { backgroundColor: theme.surface },
          }}
        />
      </RootStack.Navigator>
    </NavigationContainer>
  );
}
