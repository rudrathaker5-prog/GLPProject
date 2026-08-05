import { darkTheme, lightTheme } from '../tokens';

/**
 * WCAG contrast on the pairs the app actually renders.
 *
 * Several of these shipped below AA: `textMuted` — the colour of every caption,
 * every dose time, every phone number in the directory — was 3.51:1 on white
 * and 3.27:1 on the app background. It was also the tab bar's inactive tint, so
 * two of the three permanent tabs were unreadable to anyone with reduced
 * contrast sensitivity, which in an obesity clinic means a large share of
 * patients with diabetic eye disease.
 *
 * Ratios are computed here rather than asserted from a table, so changing a
 * token fails this test instead of quietly passing a stale number.
 */

/** Relative luminance, WCAG 2.1 §1.4.3. */
function luminance(hex: string): number {
  const channels = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)];
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

const AA_TEXT = 4.5;
const AA_GRAPHIC = 3; // non-text UI: chart lines, icons carrying meaning

describe('contrast helper', () => {
  it('agrees with the reference values', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 1);
    expect(contrast('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
  });
});

describe.each([
  ['light', lightTheme],
  ['dark', darkTheme],
])('%s theme', (_name, theme) => {
  it.each([
    ['text on surface', 'text', 'surface'],
    ['text on background', 'text', 'background'],
    ['soft text on surface', 'textSoft', 'surface'],
    ['soft text on background', 'textSoft', 'background'],
    // The one that was failing, on both surfaces it is drawn on.
    ['muted text on surface', 'textMuted', 'surface'],
    ['muted text on background', 'textMuted', 'background'],
    ['primary on surface', 'primary', 'surface'],
  ] as const)('%s meets AA', (_label, fg, bg) => {
    expect(contrast(theme[fg], theme[bg])).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('draws the weight sparkline in a colour that is visible on a card', () => {
    // `accent` is the trend line in WeightSparkline — the app's main chart.
    expect(contrast(theme.accent, theme.surface)).toBeGreaterThanOrEqual(AA_GRAPHIC);
  });
});

describe('the hero gradients', () => {
  // White hero text runs across the whole sweep, so the *worst* end has to pass,
  // not the average. The light gradient's green end was 2.58:1.
  const gradients = {
    'light awareness': ['#1a63dd', '#0a8a55'],
    'light journey': ['#0a8a55', '#1a63dd'],
    'dark awareness': ['#17438c', '#0b774c'],
    'dark journey': ['#0b774c', '#17438c'],
  };

  it.each(Object.entries(gradients))('%s keeps white text readable at both ends', (_n, stops) => {
    for (const stop of stops) {
      // 3.5 rather than 4.5: this is large display text over a gradient, where
      // AA allows 3:1. The bar is set above that, not at it.
      expect(contrast('#ffffff', stop)).toBeGreaterThanOrEqual(3.5);
    }
  });
});

describe('the warning tone', () => {
  it('is readable on its own tinted background', () => {
    // warn-600 on warn-100 backs the adherence and weight-drift tiles — the two
    // warning states a patient most needs to be able to read. It was 3.17:1.
    expect(contrast('#8a5b0a', '#fdf1d6')).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrast('#8a5b0a', '#ffffff')).toBeGreaterThanOrEqual(AA_TEXT);
  });
});
