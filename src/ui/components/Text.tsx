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

export interface TextProps extends RNTextProps {
  variant?: Variant;
  className?: string;
  children?: React.ReactNode;
}

/**
 * Typography primitive. Honours the accessibility "large text" preference by
 * scaling font size at the root instead of every call site.
 */
export function Text({ variant = 'body', className = '', style, ...rest }: TextProps) {
  const largeText = useSettingsStore((s) => s.settings.largeText);
  return (
    <RNText
      {...rest}
      allowFontScaling
      maxFontSizeMultiplier={largeText ? 2 : 1.4}
      style={[largeText ? { fontSize: undefined } : null, style]}
      className={`${variantClass[variant]} ${largeText ? 'scale-100' : ''} ${className}`}
    />
  );
}
