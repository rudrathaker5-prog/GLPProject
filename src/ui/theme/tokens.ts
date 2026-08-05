/**
 * Design tokens. Tailwind (NativeWind) owns layout/utility styling; this file
 * exposes the same palette to code that needs raw values — charts, gradients,
 * navigation themes, status bars and native notification colours.
 */

export const palette = {
  brand: {
    50: '#eef6ff',
    100: '#d9ebff',
    200: '#bcdcff',
    300: '#8ec6ff',
    400: '#59a6ff',
    500: '#2f83f7',
    600: '#1a63dd',
    700: '#164eb2',
    800: '#17438c',
    900: '#183b70',
  },
  vital: {
    50: '#eefdf4',
    100: '#d6fae5',
    200: '#b0f3ce',
    300: '#7ae7b0',
    400: '#3fd28c',
    500: '#17b871',
    600: '#0b955c',
    700: '#0b774c',
    800: '#0d5e3f',
    900: '#0c4d35',
  },
  warn: { 100: '#fdf1d6', 400: '#f2b544', 600: '#8a5b0a' },
  danger: { 100: '#fde3e3', 400: '#f0666a', 600: '#c62c30' },
  neutral: {
    0: '#ffffff',
    50: '#f4f7fb',
    100: '#e8eef6',
    200: '#d3dde9',
    300: '#b3c1d2',
    400: '#7b8aa0',
    500: '#5a6a80',
    600: '#405066',
    700: '#2a3a4d',
    800: '#16202c',
    900: '#0d1b2a',
  },
} as const;

export interface AppTheme {
  mode: 'light' | 'dark';
  background: string;
  surface: string;
  surfaceRaised: string;
  surfaceSunken: string;
  border: string;
  text: string;
  textSoft: string;
  textMuted: string;
  primary: string;
  primarySoft: string;
  accent: string;
  accentSoft: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;
  overlay: string;
}

export const lightTheme: AppTheme = {
  mode: 'light',
  background: '#f4f7fb',
  surface: '#ffffff',
  surfaceRaised: '#ffffff',
  surfaceSunken: '#eef2f8',
  border: '#e1e8f2',
  text: '#0d1b2a',
  textSoft: '#405066',
  textMuted: '#5f7086',
  primary: palette.brand[600],
  primarySoft: palette.brand[50],
  // vital[600], not [500]: accent draws the weight sparkline on a white card,
  // and a graphical object needs 3:1. vital[500] is 2.58:1 — the app's main
  // progress chart was below the threshold. This is 3.84:1.
  accent: palette.vital[600],
  accentSoft: palette.vital[50],
  warning: palette.warn[600],
  warningSoft: palette.warn[100],
  danger: palette.danger[600],
  dangerSoft: palette.danger[100],
  overlay: 'rgba(13, 27, 42, 0.45)',
};

export const darkTheme: AppTheme = {
  mode: 'dark',
  background: '#0a1017',
  surface: '#18222e',
  surfaceRaised: '#1f2b39',
  surfaceSunken: '#111a24',
  border: '#27374a',
  text: '#eef4fb',
  textSoft: '#b5c3d4',
  textMuted: '#7d8ea3',
  primary: palette.brand[400],
  primarySoft: 'rgba(47, 131, 247, 0.16)',
  accent: palette.vital[400],
  accentSoft: 'rgba(23, 184, 113, 0.16)',
  warning: palette.warn[400],
  warningSoft: 'rgba(242, 181, 68, 0.16)',
  danger: palette.danger[400],
  dangerSoft: 'rgba(240, 102, 106, 0.16)',
  overlay: 'rgba(0, 0, 0, 0.6)',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radii = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999,
} as const;

export const stageAccent: Record<'awareness' | 'treatment' | 'vigilance', string> = {
  awareness: palette.brand[600],
  treatment: palette.vital[600],
  vigilance: palette.brand[800],
};
