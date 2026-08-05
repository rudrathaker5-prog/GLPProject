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

export function newId(): string {
  return Crypto.randomUUID();
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
} as const;
