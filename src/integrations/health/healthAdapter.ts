import { Platform } from 'react-native';

import { COLLECTIONS, findBy, newId, nowIso, upsert } from '@core/data/localDb';
import type { DeviceConnection, HealthProvider, HealthSample } from '@core/domain/types';
import { supabase } from '@core/supabase/client';
import { currentOwnerId, useAuthStore } from '@features/auth/store/authStore';
import { logWeight } from '@features/tracking/api/trackingRepository';

/**
 * Health & device integration layer.
 *
 * INTEGRATION POINT
 * -----------------
 * The provider interface below is complete and the persistence path is live —
 * samples written through `ingestSamples` flow into weight history, the
 * dashboard and the AI context exactly like manual entries.
 *
 * What each provider needs to go live:
 *
 *  google_fit    Health Connect (`react-native-health-connect`). Requires a
 *                config plugin, the `android.permission.health.*` permissions,
 *                and a Google Play Data Types declaration. Android 14+ routes
 *                Google Fit through Health Connect.
 *  apple_health  HealthKit (`@kingstinct/react-native-healthkit` or similar).
 *                Requires the HealthKit entitlement and the usage strings that
 *                are already declared in `app.config.ts`.
 *  smart_scale   BLE weight scales (`react-native-ble-plx`) reading the
 *                Bluetooth Weight Scale Service (0x181D).
 *  wearable      Vendor cloud APIs (Fitbit, Garmin, Noise, boAt) via OAuth.
 *
 * Each is a native module that cannot ship in an Expo Go build, so they are
 * declared here as adapters rather than stubbed silently. `isAvailable()`
 * returns false until the module is installed, and the UI shows an honest
 * "not connected on this build" state instead of a fake toggle.
 */

export interface HealthProviderAdapter {
  provider: HealthProvider;
  label: string;
  platforms: ('ios' | 'android')[];
  /** True once the native module is installed in this build. */
  isAvailable: () => Promise<boolean>;
  requestPermissions: () => Promise<boolean>;
  readSamples: (since: Date) => Promise<HealthSample[]>;
  writeWeight?: (weightKg: number, at: Date) => Promise<boolean>;
}

/**
 * Metro resolves `require` statically, so each optional native module has to be
 * probed by name rather than through a dynamic require. When one of these
 * packages is added to `package.json` and the app is rebuilt, flip its entry to
 * a real `require(...)` inside the try block and the adapter goes live.
 */
function moduleInstalled(moduleName: string): boolean {
  try {
    switch (moduleName) {
      case 'react-native-health-connect':
      case '@kingstinct/react-native-healthkit':
      case 'react-native-ble-plx':
        // Not bundled in this build. See docs/INTEGRATIONS.md.
        return false;
      default:
        return false;
    }
  } catch {
    return false;
  }
}

const googleFit: HealthProviderAdapter = {
  provider: 'google_fit',
  label: 'Health Connect / Google Fit',
  platforms: ['android'],
  isAvailable: async () =>
    Platform.OS === 'android' && moduleInstalled('react-native-health-connect'),
  requestPermissions: async () => false,
  readSamples: async () => [],
};

const appleHealth: HealthProviderAdapter = {
  provider: 'apple_health',
  label: 'Apple Health',
  platforms: ['ios'],
  isAvailable: async () => Platform.OS === 'ios' && moduleInstalled('@kingstinct/react-native-healthkit'),
  requestPermissions: async () => false,
  readSamples: async () => [],
};

const smartScale: HealthProviderAdapter = {
  provider: 'smart_scale',
  label: 'Bluetooth weighing scale',
  platforms: ['ios', 'android'],
  isAvailable: async () => moduleInstalled('react-native-ble-plx'),
  requestPermissions: async () => false,
  readSamples: async () => [],
};

const wearable: HealthProviderAdapter = {
  provider: 'wearable',
  label: 'Wearable (Fitbit, Garmin, Noise)',
  platforms: ['ios', 'android'],
  isAvailable: async () => false,
  requestPermissions: async () => false,
  readSamples: async () => [],
};

export const HEALTH_ADAPTERS: HealthProviderAdapter[] = [
  googleFit,
  appleHealth,
  smartScale,
  wearable,
];

export function adaptersForPlatform(): HealthProviderAdapter[] {
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  return HEALTH_ADAPTERS.filter((a) => a.platforms.includes(platform));
}

// ---------------------------------------------------------------------------
// Connection state
// ---------------------------------------------------------------------------

export async function listConnections(): Promise<DeviceConnection[]> {
  const { userId } = useAuthStore.getState();

  if (userId && supabase) {
    const { data, error } = await supabase
      .from('device_connections')
      .select('*')
      .eq('user_id', userId);
    if (!error && data) {
      return data.map((row) => ({
        id: row.id,
        userId: row.user_id,
        provider: row.provider,
        connectedAt: row.connected_at,
        lastSyncAt: row.last_sync_at,
        status: row.status,
        scopes: row.scopes ?? [],
      }));
    }
  }

  const owner = currentOwnerId();
  return findBy<DeviceConnection>(COLLECTIONS.deviceConnections, (c) => c.userId === owner);
}

export async function connectProvider(provider: HealthProvider): Promise<DeviceConnection> {
  const adapter = HEALTH_ADAPTERS.find((a) => a.provider === provider);
  const available = adapter ? await adapter.isAvailable() : false;
  const granted = available ? await adapter!.requestPermissions() : false;

  const connection: DeviceConnection = {
    id: newId(),
    userId: useAuthStore.getState().userId ?? currentOwnerId(),
    provider,
    connectedAt: granted ? nowIso() : null,
    lastSyncAt: null,
    status: !available ? 'unsupported' : granted ? 'connected' : 'error',
    scopes: granted ? ['steps', 'weight', 'sleep', 'heart_rate'] : [],
  };

  const { userId } = useAuthStore.getState();
  if (userId && supabase) {
    await supabase.from('device_connections').upsert(
      {
        user_id: userId,
        provider,
        connected_at: connection.connectedAt,
        status: connection.status,
        scopes: connection.scopes,
      },
      { onConflict: 'user_id,provider' },
    );
  } else {
    await upsert(
      COLLECTIONS.deviceConnections,
      connection,
      (a, b) => a.userId === b.userId && a.provider === b.provider,
    );
  }

  return connection;
}

/**
 * Persists samples from any provider. Weight samples also update weight history
 * so the dashboard, milestones and the AI context all see them.
 */
export async function ingestSamples(samples: HealthSample[]): Promise<number> {
  if (samples.length === 0) return 0;

  const { userId } = useAuthStore.getState();

  if (userId && supabase) {
    await supabase.from('health_samples').insert(
      samples.map((s) => ({
        user_id: userId,
        provider: s.provider,
        metric: s.metric,
        value: s.value,
        recorded_at: s.recordedAt,
      })),
    );
  }

  for (const sample of samples.filter((s) => s.metric === 'weight')) {
    await logWeight({
      weightKg: sample.value,
      recordedOn: sample.recordedAt.slice(0, 10),
      source: sample.provider === 'smart_scale' ? 'smart_scale' : 'health_kit',
    });
  }

  return samples.length;
}

export async function syncProvider(provider: HealthProvider): Promise<number> {
  const adapter = HEALTH_ADAPTERS.find((a) => a.provider === provider);
  if (!adapter || !(await adapter.isAvailable())) return 0;

  const since = new Date(Date.now() - 7 * 86_400_000);
  const samples = await adapter.readSamples(since);
  const count = await ingestSamples(samples);

  const { userId } = useAuthStore.getState();
  if (userId && supabase) {
    await supabase
      .from('device_connections')
      .update({ last_sync_at: nowIso() })
      .eq('user_id', userId)
      .eq('provider', provider);
  }

  return count;
}
