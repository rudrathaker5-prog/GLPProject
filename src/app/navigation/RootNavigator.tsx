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
import { useEffect, useMemo } from 'react';

import { AuthScreen } from '@features/auth/screens/AuthScreen';
import { OnboardingScreen } from '@features/auth/screens/OnboardingScreen';
import { useAuthStore } from '@features/auth/store/authStore';
import { DoctorAppointmentsScreen } from '@features/doctorPortal/screens/DoctorAppointmentsScreen';
import { DoctorProfileScreen } from '@features/doctorPortal/screens/DoctorProfileScreen';
import { PatientsScreen } from '@features/doctorPortal/screens/PatientsScreen';
import { handleNotificationAction } from '@features/notifications/service/notificationActions';
import { AboutScreen } from '@features/settings/screens/AboutScreen';
import { useTranslation } from '@i18n/useTranslation';
import { Icon, type IconName } from '@ui/components/Icon';
import { useTheme } from '@ui/theme/ThemeProvider';

import { MainTabs } from './MainTabs';
import { tabForDeepLink } from './tabs';
import type { DoctorTabParamList, RootStackParamList } from './types';

const RootStack = createNativeStackNavigator<RootStackParamList>();
const DoctorTabs = createBottomTabNavigator<DoctorTabParamList>();

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

/**
 * The app's own scheme, declared in `app.config.ts` and in the manifest's
 * intent filter. Deep linking works with this alone.
 */
const APP_SCHEME_PREFIX = 'glpcare://';

/**
 * Deep-link prefixes, resolved on demand rather than at import time.
 *
 * `Linking.createURL('/')` reads the expo-constants manifest and *throws* when
 * it cannot — "expo-linking needs access to the expo-constants manifest". At
 * module scope that throw happened while the bundle was still evaluating, so
 * React never mounted and `ErrorBoundary` never existed: the app installed,
 * showed its icon, and closed again the moment it was opened, with nothing on
 * screen and nothing in the UI to explain it.
 *
 * The generated prefix only adds the development `exp://…` form. Losing it
 * costs deep links in Expo Go and nothing in the installed app, which is a
 * trade worth making unconditionally.
 */
function linkingPrefixes(): string[] {
  try {
    const generated = Linking.createURL('/');
    return generated && generated !== APP_SCHEME_PREFIX
      ? [generated, APP_SCHEME_PREFIX]
      : [APP_SCHEME_PREFIX];
  } catch (error) {
    console.warn('[linking] falling back to the declared scheme only', error);
    return [APP_SCHEME_PREFIX];
  }
}

/**
 * Deep links resolve into the tab stack, so a medication reminder opens the
 * medication screen *inside* the My Journey tab rather than replacing the app.
 */
const linkingConfig: LinkingOptions<RootStackParamList>['config'] = {
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
  const { t } = useTranslation();
  const mode = useAuthStore((s) => s.mode);
  const initialised = useAuthStore((s) => s.initialised);

  // Resolved on first render rather than at import — see `linkingPrefixes`.
  const linking = useMemo<LinkingOptions<RootStackParamList>>(
    () => ({ prefixes: linkingPrefixes(), config: linkingConfig }),
    [],
  );

  // Tapping a notification lands on the right tab and screen.
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      /*
        Action buttons come through the same listener as a body tap. They are
        handled first and then swallowed: "Taken" and "Snooze" are meant to
        work with the phone still locked, so opening the app afterwards would
        defeat the point of having them.
      */
      void handleNotificationAction(response).then((outcome) => {
        if (outcome.handled) return;
      });

      if (
        response.actionIdentifier &&
        response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER
      ) {
        return;
      }

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
            title: t('screens.account'),
            headerTintColor: theme.text,
            headerStyle: { backgroundColor: theme.surface },
          }}
        />
        {/*
          About is registered here as well as in AppStack. The doctor portal is
          a sibling subtree of Main, and React Navigation only bubbles an
          unhandled action *up* the tree — never sideways — so the doctor
          profile's "About this app" button silently did nothing. Patient
          screens still resolve About in their own stack; only the doctor's
          navigate bubbles this far.
        */}
        <RootStack.Screen
          name="About"
          component={AboutScreen}
          options={{
            headerShown: true,
            title: t('screens.about'),
            headerTintColor: theme.text,
            headerStyle: { backgroundColor: theme.surface },
          }}
        />
      </RootStack.Navigator>
    </NavigationContainer>
  );
}
