import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every screen the app registers must be reachable by tapping.
 *
 * Two screens were once registered and orphaned — `Profile` and, behind it,
 * `Devices`. Nothing navigated to either, so profile editing, stage switching,
 * device pairing and (for a signed-in patient) *sign-out* existed in the bundle
 * but could not be opened from any tab. Nothing failed; the screens were simply
 * unreachable, which is the quietest way for a feature to not ship.
 *
 * This reads the navigators and the whole source tree rather than rendering
 * anything, so it stays fast and does not need a navigation container.
 */

const SRC = join(__dirname, '..', '..', '..');
const NAV = join(SRC, 'app', 'navigation');

/** Screens that open as the initial route of a tab, so nothing navigates to them. */
const TAB_ROOTS = new Set(['AwarenessHome', 'JourneyHome', 'VigilanceHome']);

/**
 * Reached without a `navigate` call: the root navigator's own initialRouteName,
 * and the doctor portal's tabs, which are opened by tapping the tab bar. (The
 * doctor tabs are declared in RootNavigator.tsx, so they show up in the same
 * scrape as the root stack.)
 */
const ROOT_ENTRIES = new Set([
  'Main',
  'DoctorPortal',
  'Patients',
  'DoctorAppointments',
  'DoctorProfile',
]);

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === '__tests__' || entry === 'node_modules') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const files = sourceFiles(SRC);
const allSource = files.map((file) => readFileSync(file, 'utf8')).join('\n');

function registeredRoutes(file: string): string[] {
  const source = readFileSync(join(NAV, file), 'utf8');
  return [...source.matchAll(/<(?:Stack|RootStack|DoctorTabs|Tabs)\.Screen\s+name="(\w+)"/g)].map(
    (match) => match[1],
  );
}

/** Every `navigate('X')` / `reset({ … name: 'X' })` target anywhere in src. */
const navigationTargets = new Set<string>([
  ...[...allSource.matchAll(/navigate(?:Deprecated)?\(\s*'(\w+)'/g)].map((m) => m[1]),
  ...[...allSource.matchAll(/name:\s*'(\w+)'/g)].map((m) => m[1]),
  ...[...allSource.matchAll(/screen:\s*'(\w+)'/g)].map((m) => m[1]),
]);

describe('navigation reachability', () => {
  const appRoutes = registeredRoutes('AppStack.tsx');
  const rootRoutes = registeredRoutes('RootNavigator.tsx');

  it('registers a substantial stack, so the scrape is not silently empty', () => {
    expect(appRoutes.length).toBeGreaterThan(25);
    expect(rootRoutes.length).toBeGreaterThan(3);
  });

  it('registers the three tab roots', () => {
    for (const root of TAB_ROOTS) expect(appRoutes).toContain(root);
  });

  it.each(
    registeredRoutes('AppStack.tsx').filter((route) => !TAB_ROOTS.has(route)),
  )('can reach %s', (route) => {
    expect(navigationTargets.has(route)).toBe(true);
  });

  it.each(registeredRoutes('RootNavigator.tsx').filter((route) => !ROOT_ENTRIES.has(route)))(
    'can reach %s on the root stack',
    (route) => {
      expect(navigationTargets.has(route)).toBe(true);
    },
  );

  it('never navigates to a name no navigator registers', () => {
    const registered = new Set([
      ...appRoutes,
      ...rootRoutes,
      ...registeredRoutes('MainTabs.tsx'),
      // Tab names, and the doctor portal's own tabs.
      'AwarenessTab',
      'JourneyTab',
      'VigilanceTab',
      'Patients',
      'DoctorAppointments',
      'DoctorProfile',
    ]);

    // Only check `navigation.navigate('X')` calls — object `name:` keys appear
    // in plenty of unrelated code (styles, seed data, tool schemas).
    const navigated = [...allSource.matchAll(/navigation\.navigate\(\s*'(\w+)'/g)].map(
      (m) => m[1],
    );
    const unknown = [...new Set(navigated)].filter((name) => !registered.has(name));
    expect(unknown).toEqual([]);
  });

  it('keeps About on the root stack so the doctor portal can open it', () => {
    // The doctor tabs are a sibling of Main, and React Navigation bubbles an
    // unhandled action up the tree, never sideways — so a route only present
    // inside AppStack is invisible to the doctor portal.
    expect(rootRoutes).toContain('About');
    expect(readFileSync(join(SRC, 'features/doctorPortal/screens/DoctorProfileScreen.tsx'), 'utf8'))
      .toContain("navigate('About')");
  });
});
