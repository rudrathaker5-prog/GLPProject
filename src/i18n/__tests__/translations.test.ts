import { en } from '../locales/en';
import { gu } from '../locales/gu';
import { hi } from '../locales/hi';
import { mr } from '../locales/mr';
import { SUPPORTED_LANGUAGES, translate } from '..';

/**
 * The app ships in four languages, and the failure mode nobody notices in review
 * is a locale that *looks* translated: the file exists, the screen renders, and
 * a third of the strings are silently English because a key was renamed. These
 * tests pin coverage and shape rather than wording.
 */

type Bundle = Record<string, unknown>;

/** Flattens a nested bundle to `a.b.c` → string, ignoring non-string leaves. */
function flatten(bundle: unknown, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  if (!bundle || typeof bundle !== 'object') return out;
  for (const [key, value] of Object.entries(bundle as Bundle)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') out[path] = value;
    else if (value && typeof value === 'object') Object.assign(out, flatten(value, path));
  }
  return out;
}

const englishKeys = flatten(en);
const locales = { hi, gu, mr } as const;

describe('translation bundles', () => {
  it('declares every supported language and nothing else', () => {
    expect(SUPPORTED_LANGUAGES.map((l) => l.code)).toEqual(['en', 'hi', 'gu', 'mr']);
    for (const language of SUPPORTED_LANGUAGES) {
      expect(language.nativeName.length).toBeGreaterThan(0);
      expect(language.englishName.length).toBeGreaterThan(0);
    }
  });

  it('has a non-trivial English base to translate from', () => {
    expect(Object.keys(englishKeys).length).toBeGreaterThan(100);
  });

  for (const [code, bundle] of Object.entries(locales)) {
    describe(code, () => {
      const keys = flatten(bundle);

      it('introduces no key that does not exist in English', () => {
        // A key only present in a translation is dead weight: `translate` looks
        // up by the English path, so nothing will ever read it.
        const orphans = Object.keys(keys).filter((key) => !(key in englishKeys));
        expect(orphans).toEqual([]);
      });

      it('translates every key English declares', () => {
        // All four bundles are currently complete. Pinning full parity — rather
        // than a percentage — means adding an English string without its three
        // translations fails here, at the moment it is cheap to fix, instead of
        // shipping a screen that is half English to a Gujarati-speaking patient.
        const missing = Object.keys(englishKeys).filter((key) => !(key in keys));
        expect(missing).toEqual([]);
      });

      it('is actually translated, not English copied across', () => {
        const identical = Object.entries(keys).filter(
          ([key, value]) => englishKeys[key] === value && value.length > 3,
        );
        // `meta.name` and unit labels legitimately match English.
        const suspicious = identical.filter(([key]) => !key.startsWith('meta.'));
        expect(suspicious.length).toBeLessThan(Object.keys(keys).length * 0.1);
      });

      it('keeps every {{placeholder}} the English string declares', () => {
        const placeholders = (text: string) => (text.match(/\{\{(\w+)\}\}/g) ?? []).sort();
        for (const [key, value] of Object.entries(keys)) {
          // A dropped placeholder renders as a hole in the sentence; an invented
          // one renders as literal `{{foo}}` on screen.
          expect({ key, found: placeholders(value) }).toEqual({
            key,
            found: placeholders(englishKeys[key]),
          });
        }
      });

      it('uses the right script', () => {
        const script = code === 'gu' ? /[઀-૿]/ : /[ऀ-ॿ]/;
        const body = Object.entries(keys)
          .filter(([key]) => !key.startsWith('meta.'))
          .map(([, value]) => value)
          .join(' ');
        expect(body).toMatch(script);
      });
    });
  }
});

describe('translate()', () => {
  it('returns the localised string when one exists', () => {
    expect(translate('hi', 'common.cancel')).toBe('रद्द करें');
  });

  it('returns the key itself for an unknown path instead of throwing', () => {
    expect(translate('mr', 'no.such.key')).toBe('no.such.key');
  });

  it('never renders an object as a string', () => {
    // `common` is a namespace, not a leaf. Returning "[object Object]" into a
    // <Text> is the kind of bug that only shows up on the screen it breaks.
    expect(translate('hi', 'common')).toBe('common');
  });

  it('does not throw on a path that runs past a leaf', () => {
    expect(translate('gu', 'common.cancel.deeper')).toBe('common.cancel.deeper');
  });

  it('interpolates parameters', () => {
    const withParam = Object.entries(englishKeys).find(([, value]) => /\{\{\w+\}\}/.test(value));
    if (!withParam) return;
    const [key, template] = withParam;
    const name = template.match(/\{\{(\w+)\}\}/)![1];
    const rendered = translate('en', key, { [name]: 'XYZ' });
    expect(rendered).toContain('XYZ');
    expect(rendered).not.toContain('{{');
  });

  it('leaves an unsupplied placeholder visible rather than printing undefined', () => {
    const withParam = Object.entries(englishKeys).find(([, value]) => /\{\{\w+\}\}/.test(value));
    if (!withParam) return;
    expect(translate('en', withParam[0])).not.toContain('undefined');
  });
});
