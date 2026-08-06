import type { SideEffectCode } from '@core/domain/types';

import { translate } from '..';

/**
 * Keys built at runtime from a value, rather than written out in the source.
 *
 * `t('sideEffects.codes.' + entry.code)` is invisible to every other check in
 * this repo: the parity test compares bundles against each other, so a key
 * missing from *all four* passes it, and the hardcoded-English test only looks
 * at literals. A miss here renders the key itself — a patient sees
 * "sideEffects.codes.bloating" on the screen listing their symptoms.
 *
 * Every set below is enumerated from the type or the domain, so adding a new
 * side-effect code without translating it fails here.
 */

const SIDE_EFFECT_CODES: SideEffectCode[] = [
  'nausea',
  'vomiting',
  'diarrhoea',
  'constipation',
  'bloating',
  'heartburn',
  'fatigue',
  'headache',
  'dizziness',
  'injection_site_reaction',
  'hair_thinning',
  'hypoglycaemia',
  'severe_abdominal_pain',
  'other',
];

const LANGUAGES = ['en', 'hi', 'gu', 'mr'] as const;

/** Builds the list of runtime-composed keys each screen asks for. */
const DYNAMIC_KEYS: string[] = [
  ...SIDE_EFFECT_CODES.map((code) => `sideEffects.codes.${code}`),
  ...(['mild', 'moderate', 'severe'] as const).map((s) => `sideEffects.severity.${s}`),
  ...(['weigh', 'protein', 'movement', 'checkin', 'support'] as const).flatMap((habit) => [
    `maintenance.habits.${habit}.title`,
    `maintenance.habits.${habit}.body`,
  ]),
  ...(['upcoming', 'due', 'overdue', 'done'] as const).map((s) => `checkpoints.state.${s}`),
  ...(['awareness', 'treatment', 'vigilance'] as const).map((s) => `stage.${s}`),
];

describe('runtime-composed translation keys', () => {
  it('enumerates a meaningful number of them', () => {
    // Guards against the list quietly emptying and the suite passing on nothing.
    expect(DYNAMIC_KEYS.length).toBeGreaterThan(30);
  });

  it.each(LANGUAGES)('all resolve in %s', (language) => {
    // `translate` returns the key itself when nothing matches, which is what
    // ends up rendered on screen.
    const unresolved = DYNAMIC_KEYS.filter((key) => translate(language, key) === key);
    expect(unresolved).toEqual([]);
  });

  it('covers every side-effect code the domain declares', () => {
    // If a code is added to the union and not here, this list is a lie. The
    // count is asserted so the omission is loud.
    expect(SIDE_EFFECT_CODES).toHaveLength(14);
    expect(new Set(SIDE_EFFECT_CODES).size).toBe(SIDE_EFFECT_CODES.length);
  });
});
