import { Platform, ScrollView, Text, View } from 'react-native';

/**
 * The screen of last resort.
 *
 * `ErrorBoundary` catches errors thrown while React renders. It cannot catch
 * errors thrown while the bundle is still being *evaluated* — a module-scope
 * `throw` during the initial require chain happens before any component
 * exists, so React never gets far enough to have a boundary. On Android that
 * failure is completely silent: the app installs, the icon appears, tapping it
 * shows the splash and then returns to the launcher with nothing logged
 * anywhere the person holding the phone can see.
 *
 * `index.js` wraps the import of `App` and falls back to this, so the failure
 * arrives as readable text on screen instead of a disappearing window. It
 * imports nothing but React Native — every project module is suspect at the
 * point this renders, including the design system.
 */
export function StartupFailure({ error }: { error: unknown }) {
  const message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : String(error);
  const stack = error instanceof Error && error.stack ? error.stack : null;

  return (
    <View style={{ flex: 1, backgroundColor: '#0d1b2a' }}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 72, gap: 16 }}>
        <Text style={{ color: '#ffffff', fontSize: 22, fontWeight: '700' }}>
          GLP Care could not start
        </Text>
        <Text style={{ color: '#c8d6e5', fontSize: 15, lineHeight: 22 }}>
          Something failed while the app was loading, before any screen could be shown. The details
          below are what a developer needs — a screenshot of this is enough.
        </Text>

        <View style={{ backgroundColor: '#132a43', borderRadius: 12, padding: 14 }}>
          <Text style={{ color: '#ff9aa2', fontSize: 13, fontWeight: '600' }}>{message}</Text>
        </View>

        {stack ? (
          <View style={{ backgroundColor: '#132a43', borderRadius: 12, padding: 14 }}>
            <Text selectable style={{ color: '#8fa6bd', fontSize: 11, lineHeight: 16 }}>
              {stack}
            </Text>
          </View>
        ) : null}

        <Text style={{ color: '#6f8199', fontSize: 12 }}>
          {Platform.OS} {String(Platform.Version)}
        </Text>
      </ScrollView>
    </View>
  );
}
