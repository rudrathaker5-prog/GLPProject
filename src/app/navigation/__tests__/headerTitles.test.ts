import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { translate } from '@i18n/index';

/**
 * Navigation header titles must go through `t()`.
 *
 * They are the most visible text in the app after the tab bar, and all 31 were
 * hardcoded English: a Gujarati-speaking patient got a Gujarati reply from the
 * coach under a header reading "Log weight". Because `translate()` falls back
 * to English silently, nothing surfaced it — the app looked translated.
 */

const NAV = join(__dirname, '..');

function screenTitles(file: string): string[] {
  const source = readFileSync(join(NAV, file), 'utf8');
  return [...source.matchAll(/title: ('[^']*')/g)].map((m) => m[1]);
}

describe('AppStack header titles', () => {
  const literals = screenTitles('AppStack.tsx');

  it('uses no hardcoded English title', () => {
    // `title: ''` is legitimate: those screens set their own title at runtime
    // from the article or myth being shown.
    expect(literals.filter((l) => l !== "''")).toEqual([]);
  });

  it('routes every title through the screens namespace', () => {
    const source = readFileSync(join(NAV, 'AppStack.tsx'), 'utf8');
    const translated = [...source.matchAll(/title: t\('([\w.]+)'\)/g)].map((m) => m[1]);
    expect(translated.length).toBeGreaterThanOrEqual(30);
    for (const key of translated) expect(key.startsWith('screens.')).toBe(true);
  });

  it('resolves every key it uses to a real string in all four languages', () => {
    const source = readFileSync(join(NAV, 'AppStack.tsx'), 'utf8');
    const keys = [...new Set([...source.matchAll(/t\('([\w.]+)'\)/g)].map((m) => m[1]))];

    for (const key of keys) {
      for (const language of ['en', 'hi', 'gu', 'mr'] as const) {
        const value = translate(language, key);
        // `translate` returns the key itself when nothing matches.
        expect({ key, language, value }).not.toEqual({ key, language, value: key });
      }
    }
  });
});

describe('the patient-facing root modals', () => {
  it('translate their titles too', () => {
    const source = readFileSync(join(NAV, 'RootNavigator.tsx'), 'utf8');
    expect(source).toContain("title: t('screens.account')");
    expect(source).toContain("title: t('screens.about')");
  });
});

describe('tab bar', () => {
  it('speaks the screen reader labels in the chosen language', () => {
    // These were three hardcoded English sentences on the app's three primary
    // controls — the worst place for a TalkBack user to hit English.
    const source = readFileSync(join(NAV, 'MainTabs.tsx'), 'utf8');
    expect(source).toContain("tabBarAccessibilityLabel: t('tabs.awarenessHint')");
    expect(source).toContain("tabBarAccessibilityLabel: t('tabs.myJourneyHint')");
    expect(source).toContain("tabBarAccessibilityLabel: t('tabs.stayingWellHint')");

    for (const language of ['en', 'hi', 'gu', 'mr'] as const) {
      for (const key of ['tabs.awarenessHint', 'tabs.myJourneyHint', 'tabs.stayingWellHint']) {
        expect(translate(language, key)).not.toBe(key);
      }
    }
  });

  it('sizes itself from the safe-area inset rather than a fixed height', () => {
    // A numeric height in tabBarStyle overrides the library's inset handling,
    // which drew the labels inside the Android system nav bar.
    const source = readFileSync(join(NAV, 'MainTabs.tsx'), 'utf8');
    expect(source).toContain('useSafeAreaInsets');
    expect(source).toContain('insets.bottom');
    expect(source).not.toMatch(/height: Platform\.OS === 'ios' \? 88 : 68/);
  });
});
