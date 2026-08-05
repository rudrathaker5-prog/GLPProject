import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import type { WeightEntry } from '@core/domain/types';
import { Text } from '@ui/components/Text';
import { useTheme } from '@ui/theme/ThemeProvider';

/**
 * Weight trend chart.
 *
 * Drawn with react-native-svg rather than a charting library: the data is a
 * single series, and this keeps the bundle small and the rendering identical on
 * both platforms.
 */
export function WeightSparkline({
  entries,
  height = 120,
  targetKg,
}: {
  entries: WeightEntry[];
  height?: number;
  targetKg?: number | null;
}) {
  const { theme } = useTheme();
  const [width, setWidth] = React.useState(0);

  if (entries.length < 2) {
    return (
      <View
        className="items-center justify-center rounded-2xl bg-surface-sunken dark:bg-dark-surface-sunken"
        style={{ height }}
      >
        <Text variant="caption">
          {entries.length === 0
            ? 'Log two weights to see your trend'
            : 'One more entry and your trend appears'}
        </Text>
      </View>
    );
  }

  const values = entries.map((e) => e.weightKg);
  const min = Math.min(...values, targetKg ?? Infinity);
  const max = Math.max(...values, targetKg ?? -Infinity);
  const range = Math.max(0.5, max - min);
  const padding = 8;

  const x = (index: number) =>
    padding + (index / (entries.length - 1)) * Math.max(1, width - padding * 2);
  const y = (value: number) =>
    padding + (1 - (value - min) / range) * Math.max(1, height - padding * 2);

  const path = entries
    .map((entry, index) => `${index === 0 ? 'M' : 'L'} ${x(index)} ${y(entry.weightKg)}`)
    .join(' ');

  const areaPath = `${path} L ${x(entries.length - 1)} ${height - padding} L ${x(0)} ${
    height - padding
  } Z`;

  const first = values[0];
  const last = values[values.length - 1];
  const falling = last <= first;

  return (
    <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      {width > 0 ? (
        <Svg width={width} height={height}>
          {targetKg && targetKg >= min && targetKg <= max ? (
            <Line
              x1={padding}
              y1={y(targetKg)}
              x2={width - padding}
              y2={y(targetKg)}
              stroke={theme.accent}
              strokeWidth={1}
              strokeDasharray="4 4"
            />
          ) : null}

          <Path d={areaPath} fill={falling ? theme.accentSoft : theme.warningSoft} />
          <Path
            d={path}
            stroke={falling ? theme.accent : theme.warning}
            strokeWidth={2.5}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {entries.map((entry, index) => (
            <Circle
              key={entry.id}
              cx={x(index)}
              cy={y(entry.weightKg)}
              r={index === entries.length - 1 ? 4.5 : 2.5}
              fill={falling ? theme.accent : theme.warning}
            />
          ))}
        </Svg>
      ) : (
        <View style={{ height }} />
      )}

      <View className="mt-2 flex-row justify-between">
        <Text variant="caption">
          {new Date(entries[0].recordedOn).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
          })}{' '}
          · {first} kg
        </Text>
        <Text variant="caption">
          {new Date(entries[entries.length - 1].recordedOn).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
          })}{' '}
          · {last} kg
        </Text>
      </View>
    </View>
  );
}
