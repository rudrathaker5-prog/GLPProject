import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

/**
 * Icon set.
 *
 * Hand-drawn SVG paths rather than an icon font, so the app has no font asset
 * to download, renders identically on both platforms, and keeps the APK small.
 */

export type IconName =
  | 'chat'
  | 'home'
  | 'learn'
  | 'doctor'
  | 'calendar'
  | 'pill'
  | 'chart'
  | 'nutrition'
  | 'profile'
  | 'send'
  | 'mic'
  | 'globe'
  | 'check'
  | 'close'
  | 'chevron'
  | 'back'
  | 'plus'
  | 'bell'
  | 'phone'
  | 'video'
  | 'shield'
  | 'sparkle'
  | 'warning'
  | 'trophy'
  | 'heart'
  | 'camera'
  | 'refresh'
  | 'people'
  | 'settings'
  | 'map';

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export function Icon({ name, size = 22, color = '#405066', strokeWidth = 1.8 }: IconProps) {
  const common = {
    stroke: color,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none' as const,
  };

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {renderPaths(name, common, color)}
    </Svg>
  );
}

function renderPaths(
  name: IconName,
  common: {
    stroke: string;
    strokeWidth: number;
    strokeLinecap: 'round';
    strokeLinejoin: 'round';
    fill: 'none';
  },
  color: string,
): React.ReactNode {
  switch (name) {
    case 'chat':
      return <Path {...common} d="M21 12a8 8 0 0 1-8 8H7l-4 3v-4.5A8 8 0 0 1 11 4h2a8 8 0 0 1 8 8Z" />;
    case 'home':
      return (
        <>
          <Path {...common} d="M3 10.5 12 3l9 7.5" />
          <Path {...common} d="M5 9.5V20h14V9.5" />
          <Path {...common} d="M10 20v-5h4v5" />
        </>
      );
    case 'learn':
      return (
        <>
          <Path {...common} d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5Z" />
          <Path {...common} d="M4 20.5A2.5 2.5 0 0 1 6.5 18H19v3H6.5A2.5 2.5 0 0 1 4 20.5Z" />
        </>
      );
    case 'doctor':
      return (
        <>
          <Circle {...common} cx="12" cy="7.5" r="3.5" />
          <Path {...common} d="M5 21v-1.5A5.5 5.5 0 0 1 10.5 14h3A5.5 5.5 0 0 1 19 19.5V21" />
          <Path {...common} d="M12 16.5v3M10.5 18h3" />
        </>
      );
    case 'calendar':
      return (
        <>
          <Rect {...common} x="3.5" y="5" width="17" height="16" rx="3" />
          <Path {...common} d="M3.5 10h17M8 3v4M16 3v4" />
        </>
      );
    case 'pill':
      return (
        <>
          <Path
            {...common}
            d="M8.5 3.5a5 5 0 0 1 7 7l-4 4a5 5 0 1 1-7-7Z"
            transform="rotate(0 12 12)"
          />
          <Path {...common} d="M7 8.5 15.5 17" />
        </>
      );
    case 'chart':
      return (
        <>
          <Path {...common} d="M4 20h16" />
          <Path {...common} d="M6 16l4-5 3.5 3L19 7" />
        </>
      );
    case 'nutrition':
      return (
        <>
          <Circle {...common} cx="12" cy="13" r="8" />
          <Path {...common} d="M12 5c0-1.5 1-3 3-3-.5 2-1.5 3-3 3Z" />
          <Path {...common} d="M8.5 13a3.5 3.5 0 0 1 3.5-3.5" />
        </>
      );
    case 'profile':
      return (
        <>
          <Circle {...common} cx="12" cy="8" r="4" />
          <Path {...common} d="M4.5 21a7.5 7.5 0 0 1 15 0" />
        </>
      );
    case 'send':
      return <Path {...common} d="M4 12 20.5 4.5 13 21l-2-7-7-2Z" />;
    case 'mic':
      return (
        <>
          <Rect {...common} x="9" y="2.5" width="6" height="11" rx="3" />
          <Path {...common} d="M5 11a7 7 0 0 0 14 0M12 18v3.5M8.5 21.5h7" />
        </>
      );
    case 'globe':
      return (
        <>
          <Circle {...common} cx="12" cy="12" r="9" />
          <Path {...common} d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9S14.5 18.3 12 21c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3Z" />
        </>
      );
    case 'check':
      return <Path {...common} d="m5 12.5 4.5 4.5L19 7" />;
    case 'close':
      return <Path {...common} d="M6 6l12 12M18 6 6 18" />;
    case 'chevron':
      return <Path {...common} d="m9 5 7 7-7 7" />;
    case 'back':
      return <Path {...common} d="m15 5-7 7 7 7" />;
    case 'plus':
      return <Path {...common} d="M12 5v14M5 12h14" />;
    case 'bell':
      return (
        <>
          <Path {...common} d="M6 9a6 6 0 1 1 12 0c0 4 1.5 5.5 2 6H4c.5-.5 2-2 2-6Z" />
          <Path {...common} d="M10 19a2 2 0 0 0 4 0" />
        </>
      );
    case 'phone':
      return (
        <Path
          {...common}
          d="M5 3.5h3l1.5 4L7.5 9a11 11 0 0 0 6.5 6.5l1.5-2 4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 3 5.7 2 2 0 0 1 5 3.5Z"
        />
      );
    case 'video':
      return (
        <>
          <Rect {...common} x="3" y="6" width="12" height="12" rx="3" />
          <Path {...common} d="m15 10.5 6-3.5v10l-6-3.5Z" />
        </>
      );
    case 'shield':
      return (
        <>
          <Path {...common} d="M12 3l7 3v5.5c0 4.5-3 8-7 9.5-4-1.5-7-5-7-9.5V6Z" />
          <Path {...common} d="m9 12 2 2 4-4" />
        </>
      );
    case 'sparkle':
      return (
        <>
          <Path {...common} d="M12 3.5 13.8 9l5.5 1.8-5.5 1.8L12 18l-1.8-5.4L4.7 10.8 10.2 9Z" />
          <Path {...common} d="M18.5 16.5 19.3 19l2.5.8-2.5.8-.8 2.4" />
        </>
      );
    case 'warning':
      return (
        <>
          <Path {...common} d="M12 3.5 21.5 20H2.5Z" />
          <Path {...common} d="M12 9.5v5M12 17.5h.01" />
        </>
      );
    case 'trophy':
      return (
        <>
          <Path {...common} d="M7 4h10v5a5 5 0 0 1-10 0Z" />
          <Path {...common} d="M7 5.5H4.5V8a3 3 0 0 0 3 3M17 5.5h2.5V8a3 3 0 0 1-3 3" />
          <Path {...common} d="M12 14v4M8.5 20.5h7" />
        </>
      );
    case 'heart':
      return (
        <Path
          {...common}
          d="M12 20s-7.5-4.7-7.5-10A4.5 4.5 0 0 1 12 7.5 4.5 4.5 0 0 1 19.5 10c0 5.3-7.5 10-7.5 10Z"
        />
      );
    case 'camera':
      return (
        <>
          <Path {...common} d="M4 8h3l1.5-2.5h7L17 8h3v11H4Z" />
          <Circle {...common} cx="12" cy="13" r="3.5" />
        </>
      );
    case 'refresh':
      return (
        <>
          <Path {...common} d="M20 12a8 8 0 1 1-2.5-5.8" />
          <Path {...common} d="M20 4v4h-4" />
        </>
      );
    case 'people':
      return (
        <>
          <Circle {...common} cx="9" cy="8" r="3.5" />
          <Path {...common} d="M2.5 20a6.5 6.5 0 0 1 13 0" />
          <Path {...common} d="M16 5.2a3.5 3.5 0 0 1 0 5.6M17.5 14.2A6.5 6.5 0 0 1 21.5 20" />
        </>
      );
    case 'settings':
      return (
        <>
          <Circle {...common} cx="12" cy="12" r="3" />
          <Path
            {...common}
            d="M19.4 14a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.3a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-2.8-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3.5 13H3a2 2 0 1 1 0-4h.2a1.6 1.6 0 0 0 1.1-2.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 10 3.5V3a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7h.4a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.4 1Z"
          />
        </>
      );
    case 'map':
      return (
        <>
          <Path {...common} d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z" />
          <Circle {...common} cx="12" cy="10" r="2.5" fill={color} />
        </>
      );
    default:
      return null;
  }
}
