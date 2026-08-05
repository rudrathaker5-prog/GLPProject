import * as Haptics from 'expo-haptics';
import React from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { useSettingsStore } from '@features/settings/store/settingsStore';

import { Text } from './Text';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
type Size = 'sm' | 'md' | 'lg';

const base =
  'flex-row items-center justify-center rounded-pill active:opacity-80 disabled:opacity-50';

const variantClass: Record<Variant, string> = {
  primary: 'bg-brand-600',
  secondary: 'bg-brand-50 dark:bg-brand-900/40 border border-brand-100 dark:border-brand-800',
  ghost: 'bg-transparent',
  danger: 'bg-danger-600',
  success: 'bg-vital-600',
};

const labelClass: Record<Variant, string> = {
  primary: 'text-white',
  secondary: 'text-brand-700 dark:text-brand-200',
  ghost: 'text-brand-700 dark:text-brand-200',
  danger: 'text-white',
  success: 'text-white',
};

const sizeClass: Record<Size, string> = {
  sm: 'px-4 py-2',
  md: 'px-5 py-3',
  lg: 'px-6 py-4',
};

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  icon?: React.ReactNode;
  className?: string;
  testID?: string;
  accessibilityHint?: string;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  fullWidth = false,
  icon,
  className = '',
  testID,
  accessibilityHint,
}: ButtonProps) {
  const reduceMotion = useSettingsStore((s) => s.settings.reduceMotion);

  const handlePress = () => {
    if (disabled || loading || !onPress) return;
    if (!reduceMotion) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    }
    onPress();
  };

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={handlePress}
      className={`${base} ${variantClass[variant]} ${sizeClass[size]} ${
        fullWidth ? 'w-full' : ''
      } ${className}`}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'secondary' || variant === 'ghost' ? '#1a63dd' : '#ffffff'}
        />
      ) : (
        <>
          {icon ? <View className="mr-2">{icon}</View> : null}
          <Text variant="bodyStrong" className={labelClass[variant]}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}
