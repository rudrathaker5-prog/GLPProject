import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { translate } from '..';

/**
 * The three tab roots must contain no hardcoded English.
 *
 * These are the screens a patient lands on — the launch screen, the treatment
 * home and the maintenance home. They carried ~65 English literals between
 * them: a Gujarati speaker got a Gujarati answer from the coach on a screen
 * that was otherwise entirely English, including the app's core "obesity is a
 * medical condition" reframe.
 *
 * `translate()` falls back to English silently, so a missing key never shows up
 * as a crash or an empty string — the app just quietly stops being translated.
 * This is the only thing that notices.
 */

const SRC = join(__dirname, '..', '..');

const TAB_ROOTS = [
  'features/awareness/screens/AwarenessHomeScreen.tsx',
  'features/treatment/screens/JourneyHomeScreen.tsx',
  'features/vigilance/screens/VigilanceHomeScreen.tsx',
  // The treatment dashboard *is* the Journey tab once treatment starts, and the
  // agent cards are the AI's own output surface — a translated reply rendered
  // under an English heading was the exact mismatch this suite exists to catch.
  'features/treatment/screens/DashboardScreen.tsx',
  'features/ai/components/AgentCards.tsx',
];

/** A capitalised run of words rendered directly as a <Text> child. */
const TEXT_CHILD = />\s*\n?\s*([A-Z][^<>{}\n]{5,})\s*\n?\s*<\/Text>/g;

/** A user-visible string prop passed as a bare literal. */
const STRING_PROP = /\b(title|label|body|subtitle|cta|placeholder|hint)=\{?"([^"]{4,})"\}?/g;

describe.each(TAB_ROOTS)('%s', (relative) => {
  const source = readFileSync(join(SRC, relative), 'utf8');

  it('renders no hardcoded English text', () => {
    const literals = [...source.matchAll(TEXT_CHILD)].map((m) => m[1].trim());
    expect(literals).toEqual([]);
  });

  it('passes no hardcoded English string prop', () => {
    const literals = [...source.matchAll(STRING_PROP)].map((m) => `${m[1]}="${m[2]}"`);
    expect(literals).toEqual([]);
  });

  it('resolves every key it uses in all four languages', () => {
    const keys = [...new Set([...source.matchAll(/t\('([\w.]+)'/g)].map((m) => m[1]))];
    expect(keys.length).toBeGreaterThan(5);

    for (const key of keys) {
      for (const language of ['en', 'hi', 'gu', 'mr'] as const) {
        // `translate` returns the key itself when it resolves to nothing.
        expect(`${language}:${key} -> ${translate(language, key)}`).not.toBe(
          `${language}:${key} -> ${key}`,
        );
      }
    }
  });
});
