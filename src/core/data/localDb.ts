import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

/**
 * On-device document store.
 *
 * The app is usable before a Supabase project exists (and while offline), so
 * every repository has a local implementation backed by this store. Records are
 * namespaced per collection and, where relevant, per user id, which keeps a
 * guest session's data separate from a signed-in one.
 */

const PREFIX = 'glpcare.db.';

/**
 * A unique id for a local record.
 *
 * `expo-crypto` first, but never only `expo-crypto`. This is called at module
 * scope by the auth store's initial state, so a missing or mismatched native
 * module here throws while the bundle is still being evaluated — before React
 * mounts, and so before any error boundary can report it. That failure mode
 * presents as an app that installs and then dies on the splash screen.
 *
 * These ids name rows in on-device storage; they are not tokens, keys or
 * anything an attacker gains from guessing. `getRandomValues` (polyfilled in
 * `index.js`) and finally `Math.random` are therefore acceptable fallbacks:
 * a v4-shaped id from a weaker source is strictly better than no app.
 */
export function newId(): string {
  try {
    return Crypto.randomUUID();
  } catch {
    return fallbackUuid();
  }
}

function fallbackUuid(): string {
  const bytes = new Uint8Array(16);
  const webCrypto = (globalThis as { crypto?: Crypto }).crypto;

  if (typeof webCrypto?.getRandomValues === 'function') {
    webCrypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }

  // Version 4, variant 10xx — the bits that make it a well-formed UUID.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

function key(collection: string): string {
  return `${PREFIX}${collection}`;
}

export async function readCollection<T>(collection: string): Promise<T[]> {
  const raw = await AsyncStorage.getItem(key(collection));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

export async function writeCollection<T>(collection: string, rows: T[]): Promise<void> {
  await AsyncStorage.setItem(key(collection), JSON.stringify(rows));
}

export async function insert<T extends { id: string }>(
  collection: string,
  row: T,
): Promise<T> {
  const rows = await readCollection<T>(collection);
  rows.push(row);
  await writeCollection(collection, rows);
  return row;
}

export async function upsert<T extends { id: string }>(
  collection: string,
  row: T,
  matchOn: (existing: T, incoming: T) => boolean = (a, b) => a.id === b.id,
): Promise<T> {
  const rows = await readCollection<T>(collection);
  const index = rows.findIndex((r) => matchOn(r, row));
  if (index >= 0) rows[index] = { ...rows[index], ...row };
  else rows.push(row);
  await writeCollection(collection, rows);
  return row;
}

export async function update<T extends { id: string }>(
  collection: string,
  id: string,
  patch: Partial<T>,
): Promise<T | null> {
  const rows = await readCollection<T>(collection);
  const index = rows.findIndex((r) => r.id === id);
  if (index < 0) return null;
  rows[index] = { ...rows[index], ...patch };
  await writeCollection(collection, rows);
  return rows[index];
}

export async function remove(collection: string, id: string): Promise<void> {
  const rows = await readCollection<{ id: string }>(collection);
  await writeCollection(
    collection,
    rows.filter((r) => r.id !== id),
  );
}

export async function findBy<T>(
  collection: string,
  predicate: (row: T) => boolean,
): Promise<T[]> {
  const rows = await readCollection<T>(collection);
  return rows.filter(predicate);
}

export async function clearCollection(collection: string): Promise<void> {
  await AsyncStorage.removeItem(key(collection));
}

export const COLLECTIONS = {
  profile: 'profile',
  conversations: 'conversations',
  messages: 'messages',
  memories: 'memories',
  weights: 'weights',
  checkIns: 'checkIns',
  medications: 'medications',
  doseEvents: 'doseEvents',
  prescriptions: 'prescriptions',
  refills: 'refills',
  appointments: 'appointments',
  journey: 'journey',
  milestones: 'milestones',
  doctorNotes: 'doctorNotes',
  nutritionPlans: 'nutritionPlans',
  nutritionLogs: 'nutritionLogs',
  reminders: 'reminders',
  notifications: 'notifications',
  peerPosts: 'peerPosts',
  deviceConnections: 'deviceConnections',
  callLog: 'callLog',
  peerMemberships: 'peerMemberships',
  vigilanceCheckpoints: 'vigilanceCheckpoints',
} as const;
