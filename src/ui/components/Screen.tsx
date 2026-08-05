import React from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../theme/ThemeProvider';

import { Text } from './Text';

export interface ScreenProps {
  children: React.ReactNode;
  scroll?: boolean;
  title?: string;
  subtitle?: string;
  refreshing?: boolean;
  onRefresh?: () => void;
  padded?: boolean;
  footer?: React.ReactNode;
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
}

export function Screen({
  children,
  scroll = true,
  title,
  subtitle,
  refreshing = false,
  onRefresh,
  padded = true,
  footer,
  edges = ['top'],
}: ScreenProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const header =
    title || subtitle ? (
      <View className="mb-2 px-5 pt-2">
        {title ? <Text variant="display">{title}</Text> : null}
        {subtitle ? (
          <Text variant="body" className="mt-1">
            {subtitle}
          </Text>
        ) : null}
      </View>
    ) : null;

  const body = scroll ? (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ paddingBottom: 32 + insets.bottom, paddingTop: 8 }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.primary}
            colors={[theme.primary]}
          />
        ) : undefined
      }
    >
      {header}
      <View className={padded ? 'px-5' : ''}>{children}</View>
    </ScrollView>
  ) : (
    <View className="flex-1">
      {header}
      <View className={`flex-1 ${padded ? 'px-5' : ''}`}>{children}</View>
    </View>
  );

  return (
    <SafeAreaView
      edges={edges}
      className="flex-1 bg-surface-sunken dark:bg-dark-surface-sunken"
      style={{ backgroundColor: theme.background }}
    >
      {body}
      {footer}
    </SafeAreaView>
  );
}
