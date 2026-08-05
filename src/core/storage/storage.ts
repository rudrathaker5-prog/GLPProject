import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { StateStorage } from 'zustand/middleware';

/**
 * Two storage tiers:
 *  - `storage`   plain device storage for preferences and cached domain data.
 *  - `secureStorage` hardware-backed keystore for auth tokens and anything
 *    that must not survive an OS backup in plaintext.
 */

export const storage: StateStorage = {
  getItem: async (name) => AsyncStorage.getItem(name),
  setItem: async (name, value) => AsyncStorage.setItem(name, value),
  removeItem: async (name) => AsyncStorage.removeItem(name),
};

const SECURE_CHUNK_LIMIT = 2048;

/**
 * SecureStore rejects values above ~2KB on Android. Supabase sessions can
 * exceed that, so values are transparently chunked.
 */
export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web') return AsyncStorage.getItem(key);
    const head = await SecureStore.getItemAsync(`${key}__0`).catch(() => null);
    if (head === null) return SecureStore.getItemAsync(key).catch(() => null);
    const chunks: string[] = [head];
    for (let i = 1; ; i += 1) {
      const chunk = await SecureStore.getItemAsync(`${key}__${i}`).catch(() => null);
      if (chunk === null) break;
      chunks.push(chunk);
    }
    return chunks.join('');
  },

  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') return AsyncStorage.setItem(key, value);
    await this.removeItem(key);
    if (value.length <= SECURE_CHUNK_LIMIT) {
      await SecureStore.setItemAsync(key, value);
      return;
    }
    const parts = Math.ceil(value.length / SECURE_CHUNK_LIMIT);
    for (let i = 0; i < parts; i += 1) {
      await SecureStore.setItemAsync(
        `${key}__${i}`,
        value.slice(i * SECURE_CHUNK_LIMIT, (i + 1) * SECURE_CHUNK_LIMIT),
      );
    }
  },

  async removeItem(key: string): Promise<void> {
    if (Platform.OS === 'web') return AsyncStorage.removeItem(key);
    await SecureStore.deleteItemAsync(key).catch(() => undefined);
    for (let i = 0; i < 32; i += 1) {
      const existing = await SecureStore.getItemAsync(`${key}__${i}`).catch(() => null);
      if (existing === null) break;
      await SecureStore.deleteItemAsync(`${key}__${i}`).catch(() => undefined);
    }
  },
};

export const zustandStorage: StateStorage = storage;

/** Clears every locally cached namespace — used on sign-out and "erase my data". */
export async function clearLocalData(): Promise<void> {
  const keys = await AsyncStorage.getAllKeys();
  const owned = keys.filter((k) => k.startsWith('glpcare.'));
  if (owned.length) await AsyncStorage.multiRemove(owned);
}
