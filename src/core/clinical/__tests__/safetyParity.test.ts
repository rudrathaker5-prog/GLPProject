import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { screenForSafety } from '../safety';

/**
 * The device and the server must escalate identically.
 *
 * `supabase/functions/_shared/safety.ts` was documented as a mirror of
 * `src/core/clinical/safety.ts` and had quietly drifted: three whole red-flag
 * categories — hypoglycaemia, gallbladder and medication misuse — plus several
 * Hindi/Gujarati/Marathi patterns existed only on the device. Because the
 * server is the *preferred* engine, that meant the patient with the better
 * setup got the weaker protection. "The whites of my eyes have gone yellow"
 * escalated on a phone with no key and did nothing on a fully configured one.
 *
 * A comment saying "mirrors X" does not survive six months. A test does.
 */

const CLIENT = join(__dirname, '..', 'safety.ts');
const SERVER = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'supabase',
  'functions',
  '_shared',
  'safety.ts',
);

/** The shared region: types, RULES, screenForSafety, isRelapseSignal, wantsTreatment. */
function sharedRegion(path: string): string {
  const source = readFileSync(path, 'utf8');
  const start = source.indexOf('export type SafetyLevel');
  expect(start).toBeGreaterThan(-1);
  // The server file continues into the prescribing guard (covered by its own
  // parity test); the client file ends after `wantsTreatment`.
  const guard = source.indexOf('/**\n * Post-generation guard');
  const end = guard > start ? guard : source.length;
  return source.slice(start, end).trim();
}

describe('safety triage parity', () => {
  it('ships byte-identical rules on the device and the server', () => {
    expect(sharedRegion(SERVER)).toBe(sharedRegion(CLIENT));
  });

  it('covers every red-flag category on both sides', () => {
    const categories = [
      'self_harm',
      'pancreatitis',
      'allergy',
      'dehydration',
      'hypoglycaemia',
      'gallbladder',
      'pregnancy',
      'eating_disorder',
      'relapse',
      'medication_misuse',
    ];
    const server = readFileSync(SERVER, 'utf8');
    const client = readFileSync(CLIENT, 'utf8');
    for (const category of categories) {
      expect(server).toContain(`category: '${category}'`);
      expect(client).toContain(`category: '${category}'`);
    }
  });
});

describe('the categories that had gone missing server-side', () => {
  // Each of these produced an escalation on the device and nothing on the
  // server before the mirror was regenerated.
  it('escalates jaundice as a gallbladder red flag', () => {
    const signal = screenForSafety('the whites of my eyes have gone yellow');
    expect(signal.category).toBe('gallbladder');
    expect(signal.level).toBe('urgent');
  });

  it('escalates a hypo', () => {
    const signal = screenForSafety('my sugar dropped very low and I went shaky and sweating');
    expect(signal.category).toBe('hypoglycaemia');
    expect(signal.level).toBe('urgent');
  });

  it('picks up a doubled dose as medication misuse', () => {
    const signal = screenForSafety('I doubled my dose this week');
    expect(signal.category).toBe('medication_misuse');
  });
});
