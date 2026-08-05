import React from 'react';
import { Text as RNText, TextProps as RNTextProps } from 'react-native';

import { useSettingsStore } from '@features/settings/store/settingsStore';

type Variant =
  | 'display'
  | 'title'
  | 'heading'
  | 'subheading'
  | 'body'
  | 'bodyStrong'
  | 'caption'
  | 'label';

const variantClass: Record<Variant, string> = {
  display: 'text-[30px] leading-9 font-bold text-ink dark:text-white',
  title: 'text-2xl font-bold text-ink dark:text-white',
  heading: 'text-lg font-semibold text-ink dark:text-white',
  subheading: 'text-base font-semibold text-ink dark:text-white',
  body: 'text-[15px] leading-6 text-ink-soft dark:text-slate-300',
  bodyStrong: 'text-[15px] leading-6 font-semibold text-ink dark:text-white',
  caption: 'text-xs text-ink-muted dark:text-slate-400',
  label: 'text-sm font-semibold text-ink-soft dark:text-slate-300',
};

/**
 * The size each variant's Tailwind class resolves to. Duplicated here because
 * "larger text" has to multiply a number, and a class name is not a number.
 * Keep in step with `variantClass` above.
 */
const variantSize: Record<Variant, { fontSize: number; lineHeight: number }> = {
  display: { fontSize: 30, lineHeight: 36 },
  title: { fontSize: 24, lineHeight: 32 },
  heading: { fontSize: 18, lineHeight: 26 },
  subheading: { fontSize: 16, lineHeight: 24 },
  body: { fontSize: 15, lineHeight: 24 },
  bodyStrong: { fontSize: 15, lineHeight: 24 },
  caption: { fontSize: 12, lineHeight: 16 },
  label: { fontSize: 14, lineHeight: 20 },
};

/**
 * How much bigger "larger text" makes everything. 1.25 is enough to matter to
 * someone who reaches for the setting without reflowing every card.
 */
const LARGE_TEXT_SCALE = 1.25;

export interface TextProps extends RNTextProps {
  variant?: Variant;
  className?: string;
  children?: React.ReactNode;
}

/**
 * Typography primitive.
 *
 * The accessibility "larger text" setting used to do nothing at all. It set
 * `maxFontSizeMultiplier` (a *cap* on the OS font scale, not a scale),
 * `fontSize: undefined` (a no-op) and the class `scale-100` (transform: scale(1),
 * also a no-op). On a phone at the default font scale — which is what most
 * people are on — flipping it changed the rendered size by exactly zero, while
 * still persisting to storage and syncing to the server.
 *
 * It now multiplies the variant's real size, so it works regardless of what the
 * OS font scale is set to, and still lets the OS scale on top of that.
 */
export function Text({ variant = 'body', className = '', style, ...rest }: TextProps) {
  const largeText = useSettingsStore((s) => s.settings.largeText);
  const size = variantSize[variant];

  return (
    <RNText
      {...rest}
      allowFontScaling
      maxFontSizeMultiplier={largeText ? 2 : 1.4}
      style={[
        largeText
          ? {
              fontSize: Math.round(size.fontSize * LARGE_TEXT_SCALE),
              lineHeight: Math.round(size.lineHeight * LARGE_TEXT_SCALE),
            }
          : null,
        // Caller styles win, so a component with its own explicit sizing (the
        // tab labels) keeps control of it.
        style,
      ]}
      className={`${variantClass[variant]} ${className}`}
    />
  );
}
