import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Platform, View } from 'react-native';

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

  return (
    <Tabs.Navigator
      initialRouteName={TAB_FOR_STAGE[stage]}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textMuted,
        tabBarShowLabel: true,
        tabBarStyle: {
          backgroundColor: theme.surface,
          borderTopWidth: 1,
          borderTopColor: theme.border,
          height: Platform.OS === 'ios' ? 88 : 68,
          paddingTop: 8,
          paddingBottom: Platform.OS === 'ios' ? 28 : 10,
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
          tabBarAccessibilityLabel: 'Awareness — learn and ask questions anonymously',
          tabBarIcon: tabIcon('sparkle'),
          tabBarLabel: tabLabel(t('tabs.awareness')),
        }}
      />
      <Tabs.Screen
        name="JourneyTab"
        component={JourneyStack}
        options={{
          title: t('tabs.myJourney'),
          tabBarAccessibilityLabel: 'My Journey — treatment, medication and coaching',
          tabBarIcon: tabIcon('heart'),
          tabBarLabel: tabLabel(t('tabs.myJourney')),
        }}
      />
      <Tabs.Screen
        name="VigilanceTab"
        component={VigilanceStack}
        options={{
          title: t('tabs.stayingWell'),
          tabBarAccessibilityLabel: 'Staying Well — life after treatment',
          tabBarIcon: tabIcon('shield'),
          tabBarLabel: tabLabel(t('tabs.stayingWell')),
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

function tabLabel(label: string) {
  const render = ({ color, focused }: { color: string; focused: boolean }) => (
    <Text
      numberOfLines={1}
      variant="caption"
      style={{ color, fontWeight: focused ? '700' : '500', fontSize: 11, marginTop: 2 }}
    >
      {label}
    </Text>
  );
  render.displayName = `TabLabel(${label})`;
  return render;
}
