import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { storage } from '@core/storage/storage';
import type { LanguageCode, UserSettings } from '@core/domain/types';

export type SettingsState = Omit<UserSettings, 'userId'>;

const defaultSettings: SettingsState = {
  language: 'en',
  theme: 'system',
  medicationRemindersEnabled: true,
  refillRemindersEnabled: true,
  appointmentRemindersEnabled: true,
  motivationNudgesEnabled: true,
  checkInRemindersEnabled: true,
  whatsappOptIn: false,
  whatsappNumber: null,
  quietHoursStart: '22:00',
  quietHoursEnd: '07:00',
  shareDataWithDoctor: true,
  largeText: false,
  reduceMotion: false,
};

interface SettingsStore {
  settings: SettingsState;
  hydrated: boolean;
  setLanguage: (language: LanguageCode) => void;
  setTheme: (theme: SettingsState['theme']) => void;
  update: (patch: Partial<SettingsState>) => void;
  reset: () => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      settings: defaultSettings,
      hydrated: false,
      setLanguage: (language) =>
        set((state) => ({ settings: { ...state.settings, language } })),
      setTheme: (theme) => set((state) => ({ settings: { ...state.settings, theme } })),
      update: (patch) => set((state) => ({ settings: { ...state.settings, ...patch } })),
      reset: () => set({ settings: defaultSettings }),
    }),
    {
      name: 'glpcare.settings',
      storage: createJSONStorage(() => storage),
      partialize: (state) => ({ settings: state.settings }),
      onRehydrateStorage: () => (state) => {
        if (state) state.hydrated = true;
      },
    },
  ),
);

export const selectLanguage = (s: SettingsStore) => s.settings.language;
