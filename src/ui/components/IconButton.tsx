import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';

import { Icon, type IconName } from './Icon';

/**
 * An icon-only button that is always big enough to hit.
 *
 * Every header control in the app was a bare `<Pressable>` wrapped around a
 * 22px `<Icon>` — a 22×22 target, half the 44pt minimum, in the corner a
 * non-technical user reaches for settings and language. There was no `hitSlop`
 * anywhere in the codebase.
 *
 * The touch target is expanded rather than the icon enlarged, so the visual
 * design is unchanged and only the tappable area grows.
 */

const MIN_TARGET = 44;

export interface IconButtonProps {
  name: IconName;
  /** Spoken by the screen reader. Required — an icon alone announces nothing. */
  accessibilityLabel: string;
  accessibilityHint?: string;
  onPress: () => void;
  color?: string;
  size?: number;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  className?: string;
}

export function IconButton({
  name,
  accessibilityLabel,
  accessibilityHint,
  onPress,
  color,
  size = 22,
  disabled = false,
  style,
  className,
}: IconButtonProps) {
  // Grow the touch area symmetrically to MIN_TARGET without moving the glyph.
  const slop = Math.max(0, Math.round((MIN_TARGET - size) / 2));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={{ top: slop, bottom: slop, left: slop, right: slop }}
      style={({ pressed }) => [{ opacity: disabled ? 0.4 : pressed ? 0.6 : 1 }, style]}
      className={className}
    >
      <View style={{ alignItems: 'center', justifyContent: 'center', width: size, height: size }}>
        <Icon name={name} size={size} color={color} />
      </View>
    </Pressable>
  );
}
