import React, {createContext, useContext, useEffect, useMemo} from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';
import { colorScheme as nwColorScheme } from 'nativewind';

import { useSettingsStore } from '@features/settings/store/settingsStore';

import { AppTheme, darkTheme, lightTheme } from './tokens';

interface ThemeContextValue {
  theme: AppTheme;
  isDark: boolean;
  preference: 'system' | 'light' | 'dark';
  setPreference: (value: 'system' | 'light' | 'dark') => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useRNColorScheme();
  const preference = useSettingsStore((s) => s.settings.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);

  const isDark = preference === 'system' ? systemScheme === 'dark' : preference === 'dark';

  useEffect(() => {
    nwColorScheme.set(preference === 'system' ? 'system' : preference);
  }, [preference]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme: (isDark ? darkTheme : lightTheme) as AppTheme,
      isDark,
      preference,
      setPreference: setTheme,
    }),
    [isDark, preference, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
