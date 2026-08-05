import type { JourneyStage } from '@core/domain/types';

import type { AppStackParamList, MainTabParamList } from './types';

/** Any navigation object that can perform a `navigate` call. */
interface Navigator {
  navigate: (...args: never[]) => void;
}

/**
 * Cross-tab navigation.
 *
 * Within a tab, `navigation.navigate('Doctors')` pushes onto that tab's stack.
 * Jumping to a *different* tab needs the nested form, which is verbose enough
 * to be worth a helper.
 */
export function openTab(
  navigation: Navigator,
  tab: keyof MainTabParamList,
  screen?: keyof AppStackParamList,
): void {
  (navigation.navigate as (name: string, params?: unknown) => void)('Main', {
    screen: tab,
    ...(screen ? { params: { screen } } : {}),
  });
}

export const TAB_FOR_STAGE: Record<JourneyStage, keyof MainTabParamList> = {
  awareness: 'AwarenessTab',
  treatment: 'JourneyTab',
  vigilance: 'VigilanceTab',
};

/** Which tab a notification category should land on. */
export function tabForDeepLink(path: string): keyof MainTabParamList {
  if (path.startsWith('vigilance') || path.startsWith('relapse')) return 'VigilanceTab';
  if (
    path.startsWith('medication') ||
    path.startsWith('refill') ||
    path.startsWith('checkin') ||
    path.startsWith('journey') ||
    path.startsWith('nutrition') ||
    path.startsWith('doctor-notes')
  ) {
    return 'JourneyTab';
  }
  return 'AwarenessTab';
}
