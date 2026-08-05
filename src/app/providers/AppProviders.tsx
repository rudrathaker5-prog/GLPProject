import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, {useEffect, useState} from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { detectDeviceLanguage } from '@i18n/index';
import { useAuthStore } from '@features/auth/store/authStore';
import {
  configureNotificationChannels,
  registerForPush,
} from '@features/notifications/service/notificationService';
import { useSettingsStore } from '@features/settings/store/settingsStore';
import { ThemeProvider, useTheme } from '@ui/theme/ThemeProvider';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

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
      await initialise();
      await configureNotificationChannels();
      // Push registration is best-effort; local reminders work without it.
      void registerForPush();
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
