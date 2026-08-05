import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

import { env, hasBackend } from '@core/config/env';
import { secureStorage } from '@core/storage/storage';

import type { Database } from './database.types';

/**
 * Supabase client.
 *
 * `null` when the project is not configured, which lets the app run fully
 * offline against the local repositories. Every repository checks
 * `requireSupabase()` and falls back to local storage when it returns null, so
 * the product is usable before a backend exists and identical afterwards.
 */
let client: SupabaseClient<Database> | null = null;

if (hasBackend) {
  client = createClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
    auth: {
      storage: secureStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
    global: {
      headers: { 'x-client-info': 'glp-care-companion' },
    },
  });

  // Supabase recommends pausing token auto-refresh while backgrounded.
  AppState.addEventListener('change', (state) => {
    if (!client) return;
    if (state === 'active') void client.auth.startAutoRefresh();
    else void client.auth.stopAutoRefresh();
  });
}

export const supabase = client;

export function requireSupabase(): SupabaseClient<Database> {
  if (!client) {
    throw new BackendUnavailableError();
  }
  return client;
}

export class BackendUnavailableError extends Error {
  readonly code = 'BACKEND_UNAVAILABLE';
  constructor() {
    super(
      'Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.',
    );
    this.name = 'BackendUnavailableError';
  }
}

export const isBackendConfigured = hasBackend;
