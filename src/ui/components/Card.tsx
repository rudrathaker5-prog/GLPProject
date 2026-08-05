import React from 'react';
import { Pressable, View, ViewProps } from 'react-native';

import { Text } from './Text';

export interface CardProps extends ViewProps {
  className?: string;
  onPress?: () => void;
  children?: React.ReactNode;
  padded?: boolean;
}

export function Card({
  className = '',
  onPress,
  children,
  padded = true,
  ...rest
}: CardProps) {
  const cls = `rounded-card bg-white dark:bg-dark-surface-raised border border-slate-100 dark:border-slate-800 ${
    padded ? 'p-4' : ''
  } ${className}`;

  if (onPress) {
    return (
      <Pressable accessibilityRole="button" onPress={onPress} className={`${cls} active:opacity-90`}>
        {children}
      </Pressable>
    );
  }
  return (
    <View {...rest} className={cls}>
      {children}
    </View>
  );
}

export function CardHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <View className="mb-3 flex-row items-start justify-between">
      <View className="flex-1 pr-3">
        <Text variant="subheading">{title}</Text>
        {subtitle ? (
          <Text variant="caption" className="mt-0.5">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}

export function SectionTitle({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <View className="mb-3 mt-6 flex-row items-center justify-between">
      <Text variant="heading">{title}</Text>
      {action}
    </View>
  );
}
