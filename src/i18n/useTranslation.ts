import { useCallback } from 'react';

import type { LanguageCode } from '@core/domain/types';
import { useSettingsStore } from '@features/settings/store/settingsStore';

import { translate, type TranslationKey } from './index';

export function useTranslation() {
  const language = useSettingsStore((s) => s.settings.language);
  const setLanguage = useSettingsStore((s) => s.setLanguage);

  const t = useCallback(
    (key: TranslationKey | string, params?: Record<string, string | number>) =>
      translate(language, key, params),
    [language],
  );

  return { t, language, setLanguage: setLanguage as (l: LanguageCode) => void };
}
