import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuthStore } from '@features/auth/store/authStore';
import { useTranslation } from '@i18n/useTranslation';
import { Icon, type IconName } from '@ui/components/Icon';
import { Text } from '@ui/components/Text';
import { useTheme } from '@ui/theme/ThemeProvider';

import { AwarenessStack, JourneyStack, VigilanceStack } from './AppStack';
import { TAB_FOR_STAGE } from './tabs';
import type { MainTabParamList } from './types';

const Tabs = createBottomTabNavigator<MainTabParamList>();

/**
 * The permanent three-tab bar.
 *
 * All three tabs are always present and always reachable — no stage gate, no
 * login wall. The patient's stage only decides which tab opens on launch.
 */
export function MainTabs() {
  const { theme, isDark } = useTheme();
  const { t } = useTranslation();
  const stage = useAuthStore((s) => s.stage);
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();

  /*
    The bar used to be a flat 68dp (Android) / 88dp (iOS).

    A numeric `height` in tabBarStyle short-circuits the library's own
    `49 + insets.bottom` calculation *and* overrides its `paddingBottom:
    insets.bottom`. With edge-to-edge on and a 3-button navigation bar
    (insets.bottom ≈ 48dp), the label row was being drawn inside the system
    nav-bar strip — clipped, with its lower half untappable.

    It also did not grow with the OS font size, so the Devanagari and Gujarati
    labels — which carry marks above and below the baseline — lost their matras
    first. Height is now derived from content, insets and the real font scale.
  */
  const labelHeight = Math.ceil(16 * Math.min(fontScale, 2));
  const contentHeight = 30 /* icon pill */ + 2 /* gap */ + labelHeight;
  const barHeight = contentHeight + 18 + insets.bottom;

  return (
    <Tabs.Navigator
      initialRouteName={TAB_FOR_STAGE[stage]}
      screenOptions={{
        headerShown: false,
        // The manifest uses adjustResize, so without this the bar rides above
        // the keyboard and steals height from an already-shrunk chat screen.
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textMuted,
        tabBarShowLabel: true,
        tabBarStyle: {
          backgroundColor: theme.surface,
          borderTopWidth: 1,
          borderTopColor: theme.border,
          height: barHeight,
          paddingTop: 8,
          paddingBottom: insets.bottom + 10,
          elevation: 0,
          shadowOpacity: isDark ? 0 : 0.05,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: -2 },
        },
        tabBarItemStyle: { paddingTop: 2 },
      }}
    >
      <Tabs.Screen
        name="AwarenessTab"
        component={AwarenessStack}
        options={{
          title: t('tabs.awareness'),
          tabBarAccessibilityLabel: t('tabs.awarenessHint'),
          tabBarIcon: tabIcon('sparkle'),
          tabBarLabel: tabLabel(t('tabs.awareness'), labelHeight),
        }}
      />
      <Tabs.Screen
        name="JourneyTab"
        component={JourneyStack}
        options={{
          title: t('tabs.myJourney'),
          tabBarAccessibilityLabel: t('tabs.myJourneyHint'),
          tabBarIcon: tabIcon('heart'),
          tabBarLabel: tabLabel(t('tabs.myJourney'), labelHeight),
        }}
      />
      <Tabs.Screen
        name="VigilanceTab"
        component={VigilanceStack}
        options={{
          title: t('tabs.stayingWell'),
          tabBarAccessibilityLabel: t('tabs.stayingWellHint'),
          tabBarIcon: tabIcon('shield'),
          tabBarLabel: tabLabel(t('tabs.stayingWell'), labelHeight),
        }}
      />
    </Tabs.Navigator>
  );
}

/**
 * Active tabs get a filled pill behind the icon — the visual cue that makes a
 * flat tab bar readable at a glance.
 */
function tabIcon(name: IconName) {
  const render = ({ color, focused }: { color: string; focused: boolean }) => (
    <View
      style={{
        width: 46,
        height: 30,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: focused ? `${color}1F` : 'transparent',
      }}
    >
      <Icon name={name} color={color} size={focused ? 23 : 22} strokeWidth={focused ? 2.1 : 1.8} />
    </View>
  );
  render.displayName = `TabIcon(${name})`;
  return render;
}

/**
 * `lineHeight` has to be passed in rather than inherited: the caption variant
 * fixes it at 16px, and React Native scales `fontSize` by the OS font scale but
 * never an explicit `lineHeight`. At "Largest" that put a 22px Devanagari glyph
 * in a 16px box and cropped the matras off `स्वस्थ रहें`.
 */
function tabLabel(label: string, lineHeight: number) {
  const render = ({ color, focused }: { color: string; focused: boolean }) => (
    <Text
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.85}
      variant="caption"
      style={{
        color,
        fontWeight: focused ? '700' : '500',
        fontSize: 11,
        lineHeight,
        marginTop: 2,
        textAlign: 'center',
      }}
    >
      {label}
    </Text>
  );
  render.displayName = `TabLabel(${label})`;
  return render;
}
