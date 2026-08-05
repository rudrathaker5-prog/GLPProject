import React from 'react';
import { ActivityIndicator, Pressable, TextInput, View } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';

import { Text } from './Text';

export { Button } from './Button';
export { Card, CardHeader, SectionTitle } from './Card';
export { IconButton } from './IconButton';
export { Screen } from './Screen';
export { Text } from './Text';

// ---------------------------------------------------------------------------
// Badge / Pill
// ---------------------------------------------------------------------------

type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger';

const toneClass: Record<Tone, string> = {
  neutral: 'bg-slate-100 dark:bg-slate-800',
  brand: 'bg-brand-50 dark:bg-brand-900/40',
  success: 'bg-vital-50 dark:bg-vital-900/40',
  warning: 'bg-warn-100 dark:bg-amber-900/30',
  danger: 'bg-danger-100 dark:bg-rose-900/30',
};

const toneText: Record<Tone, string> = {
  neutral: 'text-ink-soft dark:text-slate-300',
  brand: 'text-brand-700 dark:text-brand-200',
  success: 'text-vital-700 dark:text-vital-200',
  warning: 'text-warn-600 dark:text-amber-200',
  danger: 'text-danger-600 dark:text-rose-200',
};

export function Badge({
  label,
  tone = 'neutral',
  className = '',
}: {
  label: string;
  tone?: Tone;
  className?: string;
}) {
  return (
    <View className={`self-start rounded-pill px-3 py-1 ${toneClass[tone]} ${className}`}>
      <Text variant="caption" className={`font-semibold ${toneText[tone]}`}>
        {label}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Chip (selectable)
// ---------------------------------------------------------------------------

export function Chip({
  label,
  selected = false,
  onPress,
  disabled = false,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      className={`mb-2 mr-2 rounded-pill border px-4 py-2 ${
        selected
          ? 'border-brand-600 bg-brand-600'
          : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-dark-surface-raised'
      } ${disabled ? 'opacity-50' : ''}`}
    >
      <Text
        variant="label"
        className={selected ? 'text-white' : 'text-ink-soft dark:text-slate-300'}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Field wrapper + inputs
// ---------------------------------------------------------------------------

export function Field({
  label,
  error,
  hint,
  children,
}: {
  label?: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <View className="mb-4">
      {label ? (
        <Text variant="label" className="mb-1.5">
          {label}
        </Text>
      ) : null}
      {children}
      {error ? (
        <Text variant="caption" className="mt-1 text-danger-600">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" className="mt-1">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

export interface InputProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  keyboardType?:
    | 'default'
    | 'numeric'
    | 'number-pad'
    | 'email-address'
    | 'phone-pad'
    | 'decimal-pad';
  secureTextEntry?: boolean;
  multiline?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words';
  editable?: boolean;
  onBlur?: () => void;
  testID?: string;
  maxLength?: number;
  accessibilityLabel?: string;
}

export function Input({
  value,
  onChangeText,
  placeholder,
  keyboardType = 'default',
  secureTextEntry,
  multiline,
  autoCapitalize = 'sentences',
  editable = true,
  onBlur,
  testID,
  maxLength,
  accessibilityLabel,
}: InputProps) {
  const { theme } = useTheme();
  return (
    <TextInput
      testID={testID}
      accessibilityLabel={accessibilityLabel ?? placeholder}
      value={value}
      onChangeText={onChangeText}
      onBlur={onBlur}
      placeholder={placeholder}
      placeholderTextColor={theme.textMuted}
      keyboardType={keyboardType}
      secureTextEntry={secureTextEntry}
      multiline={multiline}
      autoCapitalize={autoCapitalize}
      editable={editable}
      maxLength={maxLength}
      style={{ color: theme.text }}
      className={`rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[15px] dark:border-slate-700 dark:bg-dark-surface-raised ${
        multiline ? 'min-h-[96px]' : ''
      } ${editable ? '' : 'opacity-60'}`}
      textAlignVertical={multiline ? 'top' : 'center'}
    />
  );
}

// ---------------------------------------------------------------------------
// Progress + stats
// ---------------------------------------------------------------------------

export function ProgressBar({
  value,
  tone = 'brand',
  height = 10,
  label,
}: {
  value: number;
  tone?: 'brand' | 'success' | 'warning' | 'danger';
  height?: number;
  label?: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  const fill = {
    brand: 'bg-brand-600',
    success: 'bg-vital-500',
    warning: 'bg-warn-400',
    danger: 'bg-danger-400',
  }[tone];

  return (
    <View>
      {label ? (
        <View className="mb-1 flex-row justify-between">
          <Text variant="caption">{label}</Text>
          <Text variant="caption">{Math.round(clamped)}%</Text>
        </View>
      ) : null}
      <View
        accessibilityRole="progressbar"
        accessibilityValue={{ now: Math.round(clamped), min: 0, max: 100 }}
        className="w-full overflow-hidden rounded-pill bg-slate-100 dark:bg-slate-800"
        style={{ height }}
      >
        <View className={`h-full rounded-pill ${fill}`} style={{ width: `${clamped}%` }} />
      </View>
    </View>
  );
}

export function StatTile({
  label,
  value,
  unit,
  tone = 'neutral',
  caption,
}: {
  label: string;
  value: string | number;
  unit?: string;
  tone?: Tone;
  caption?: string;
}) {
  return (
    <View
      className={`min-w-[104px] flex-1 rounded-2xl p-3 ${toneClass[tone]}`}
      accessibilityLabel={`${label}: ${value}${unit ? ` ${unit}` : ''}`}
    >
      <Text variant="caption" className={toneText[tone]}>
        {label}
      </Text>
      <View className="mt-1 flex-row items-baseline">
        <Text variant="title" className={toneText[tone]}>
          {value}
        </Text>
        {unit ? (
          <Text variant="caption" className={`ml-1 ${toneText[tone]}`}>
            {unit}
          </Text>
        ) : null}
      </View>
      {caption ? (
        <Text variant="caption" className="mt-0.5">
          {caption}
        </Text>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// States
// ---------------------------------------------------------------------------

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  const { theme } = useTheme();
  return (
    <View className="items-center justify-center py-10">
      <ActivityIndicator color={theme.primary} />
      <Text variant="caption" className="mt-2">
        {label}
      </Text>
    </View>
  );
}

export function EmptyState({
  title,
  message,
  action,
}: {
  title: string;
  message: string;
  action?: React.ReactNode;
}) {
  return (
    <View className="items-center rounded-card border border-dashed border-slate-200 px-6 py-10 dark:border-slate-700">
      <Text variant="subheading" className="text-center">
        {title}
      </Text>
      <Text variant="body" className="mt-1 text-center">
        {message}
      </Text>
      {action ? <View className="mt-4">{action}</View> : null}
    </View>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <View className="rounded-card border border-danger-100 bg-danger-100/40 p-4 dark:border-rose-900 dark:bg-rose-900/20">
      <Text variant="bodyStrong" className="text-danger-600">
        Something went wrong
      </Text>
      <Text variant="body" className="mt-1">
        {message}
      </Text>
      {onRetry ? (
        <Pressable onPress={onRetry} accessibilityRole="button" className="mt-3">
          <Text variant="label" className="text-brand-700 dark:text-brand-200">
            Try again
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Divider({ className = '' }: { className?: string }) {
  return <View className={`h-px bg-slate-100 dark:bg-slate-800 ${className}`} />;
}

export function Row({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <View className={`flex-row items-center ${className}`}>{children}</View>;
}
