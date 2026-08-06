import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, {useEffect, useState} from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { detectDeviceLanguage } from '@i18n/index';
import { useAuthStore } from '@features/auth/store/authStore';
import {
  configureNotificationActions,
  configureNotificationChannels,
  registerForPush,
} from '@features/notifications/service/notificationService';
import { useSettingsStore } from '@features/settings/store/settingsStore';
import { ThemeProvider, useTheme } from '@ui/theme/ThemeProvider';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

/** Longest the splash may stay up, however badly startup goes. */
const SPLASH_WATCHDOG_MS = 8000;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 15 * 60_000,
      retry: (failureCount, error) => {
        const message = error instanceof Error ? error.message : '';
        if (message.includes('Authentication required')) return false;
        return failureCount < 2;
      },
      refetchOnWindowFocus: false,
    },
    mutations: { retry: 0 },
  },
});

function onAppStateChange(status: AppStateStatus) {
  focusManager.setFocused(status === 'active');
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const initialise = useAuthStore((s) => s.initialise);
  const settingsHydrated = useSettingsStore((s) => s.hydrated);
  const language = useSettingsStore((s) => s.settings.language);
  const setLanguage = useSettingsStore((s) => s.setLanguage);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', onAppStateChange);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      /*
        Each step is separately guarded, and none of them may keep the app on
        the splash screen.

        These three awaits used to be bare. A rejection in any one of them —
        a notification channel the OS refused, a session read that threw —
        skipped `setReady(true)`, so `SplashScreen.hideAsync()` never ran and
        the app sat on the splash image indefinitely. There is no timeout on
        that: to the person holding the phone it is indistinguishable from the
        app failing to open, which is exactly how it was reported.

        Notifications failing should cost you reminders, not the app.
      */
      await initialise().catch((error) =>
        console.warn('[startup] session init failed, continuing anonymously', error),
      );
      await configureNotificationChannels().catch((error) =>
        console.warn('[startup] notification channels unavailable', error),
      );
      // Must run before any notification using these categories is scheduled,
      // or the action buttons simply do not render on it.
      await configureNotificationActions().catch((error) =>
        console.warn('[startup] notification actions unavailable', error),
      );
      // Push registration is best-effort; local reminders work without it.
      void Promise.resolve(registerForPush()).catch(() => undefined);
      if (!cancelled) setReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [initialise]);

  // First launch: adopt the device language if the user has not chosen one.
  useEffect(() => {
    if (!settingsHydrated) return;
    const stored = useSettingsStore.getState().settings.language;
    if (stored === 'en' && language === 'en') {
      const detected = detectDeviceLanguage();
      if (detected !== 'en') setLanguage(detected);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsHydrated]);

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);

  /*
    Watchdog. `children` render whether or not `ready` is true, so a splash
    that never hides is covering a working app — the worst possible failure,
    because it looks identical to a crash and leaves nothing to report.

    Nothing above should hang now that every startup step is caught, but the
    guarantee worth making is "the splash always comes down", and a timer is
    the only way to make it unconditionally.
  */
  useEffect(() => {
    const timer = setTimeout(() => {
      void SplashScreen.hideAsync().catch(() => undefined);
    }, SPLASH_WATCHDOG_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <ThemedStatusBar />
          {children}
        </ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

function ThemedStatusBar() {
  const { isDark } = useTheme();
  return <StatusBar style={isDark ? 'light' : 'dark'} />;
}

export { queryClient };
