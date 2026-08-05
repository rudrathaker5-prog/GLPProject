import Constants from 'expo-constants';

/**
 * Single source of truth for runtime configuration.
 *
 * Values come from `app.config.ts` -> `extra`, which itself reads from the
 * process environment at build time. Nothing in `src/` may read
 * `process.env` directly.
 */

type Extra = {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  aiGatewayUrl?: string;
  aiModel?: string;
  appVariant?: string;
};

const extra = (Constants.expoConfig?.extra ?? {}) as Extra;

function read(key: keyof Extra, fallback = ''): string {
  const value = extra[key];
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  return fallback;
}

export const env = {
  supabaseUrl: read('supabaseUrl'),
  supabaseAnonKey: read('supabaseAnonKey'),
  /**
   * URL of the `ai-agent` Supabase Edge Function. When empty the app falls back
   * to the on-device deterministic care engine (see `features/ai/engine`).
   */
  aiGatewayUrl: read('aiGatewayUrl'),
  aiModel: read('aiModel', 'gpt-4o-mini'),
  appVariant: read('appVariant', 'production'),
} as const;

/** True when a real Supabase project is configured. */
export const hasBackend = Boolean(env.supabaseUrl && env.supabaseAnonKey);

/** True when a hosted LLM gateway is configured. */
export const hasRemoteAi = Boolean(env.aiGatewayUrl) || hasBackend;

export const appInfo = {
  name: Constants.expoConfig?.name ?? 'GLP Care',
  version: Constants.expoConfig?.version ?? '1.0.0',
  variant: env.appVariant,
} as const;

/**
 * Describes which capabilities are live in this build. Screens use this to show
 * an honest status instead of silently pretending a service is connected.
 */
export const capabilities = {
  backend: hasBackend,
  remoteAi: hasRemoteAi,
  localAi: true,
  pushNotifications: true,
  localNotifications: true,
} as const;
