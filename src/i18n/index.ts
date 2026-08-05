import * as Localization from 'expo-localization';

import type { LanguageCode } from '@core/domain/types';

import { en, type TranslationShape } from './locales/en';
import { gu } from './locales/gu';
import { hi } from './locales/hi';
import { mr } from './locales/mr';
import type { PathsOf } from './types';

export type TranslationKey = PathsOf<TranslationShape>;

const bundles: Record<LanguageCode, unknown> = { en, hi, gu, mr };

export const SUPPORTED_LANGUAGES: {
  code: LanguageCode;
  nativeName: string;
  englishName: string;
}[] = [
  { code: 'en', nativeName: 'English', englishName: 'English' },
  { code: 'hi', nativeName: 'हिन्दी', englishName: 'Hindi' },
  { code: 'gu', nativeName: 'ગુજરાતી', englishName: 'Gujarati' },
  { code: 'mr', nativeName: 'मराठी', englishName: 'Marathi' },
];

function lookup(bundle: unknown, path: string): string | undefined {
  const value = path
    .split('.')
    .reduce<unknown>(
      (acc, part) =>
        acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[part] : undefined,
      bundle,
    );
  return typeof value === 'string' ? value : undefined;
}

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    key in params ? String(params[key]) : match,
  );
}

/**
 * Translate `key` into `language`, falling back to English for any key that has
 * not been localised yet. Never throws — a missing key returns the key itself
 * so a gap is visible in QA rather than crashing a screen.
 */
export function translate(
  language: LanguageCode,
  key: TranslationKey | string,
  params?: Record<string, string | number>,
): string {
  const localised = lookup(bundles[language], key);
  if (localised) return interpolate(localised, params);
  const fallback = lookup(en, key);
  if (fallback) return interpolate(fallback, params);
  return key;
}

/** Best-effort mapping of the device locale onto a supported language. */
export function detectDeviceLanguage(): LanguageCode {
  const locales = Localization.getLocales();
  for (const locale of locales) {
    const code = locale.languageCode?.toLowerCase();
    if (code === 'hi' || code === 'gu' || code === 'mr' || code === 'en') {
      return code as LanguageCode;
    }
  }
  return 'en';
}

export const languageDisplayName = (code: LanguageCode): string =>
  SUPPORTED_LANGUAGES.find((l) => l.code === code)?.nativeName ?? 'English';

/** Human readable language name used inside AI system prompts. */
export const languageInstruction = (code: LanguageCode): string =>
  ({
    en: 'Reply in clear, simple English.',
    hi: 'Reply in Hindi (Devanagari script). Keep medical terms in English where that is what patients hear in clinics.',
    gu: 'Reply in Gujarati script. Keep medical terms in English where that is what patients hear in clinics.',
    mr: 'Reply in Marathi (Devanagari script). Keep medical terms in English where that is what patients hear in clinics.',
  })[code];
