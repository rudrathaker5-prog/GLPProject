import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PRESCRIPTION_PATTERNS, violatesPrescribingRule } from '../prescribingGuard';

/**
 * The one output guard standing between a language model and a patient
 * changing their own GLP-1 dose.
 *
 * The fixtures below are how doses are actually written: semaglutide titrates
 * 0.25 → 0.5 → 1.0 → 1.7 → 2.4 mg, so every real instruction contains a
 * decimal. The guard's first version matched `\d*`, which cannot cross a
 * decimal point, and therefore missed all of them.
 */

/** Model output that must be caught. Each one is a dose instruction. */
const MUST_CATCH = [
  'You should increase Ozempic 1 mg next week.',
  'You should take semaglutide 0.5 mg from Monday.',
  'You should start taking Wegovy 2.4 mg.',
  'Step up your dose to 1 mg.',
  'step up your dose',
  'Take 2.4 mg instead of 1.7 mg.',
  'I would start you on 0.25 mg.',
  'Go up to 1 mg next week.',
  'increase your dose to 2 mg',
  'Double your weekly dose.',
  'I recommend you increase semaglutide 1.7 mg.',
  "Let's move to 0.5 mg after four weeks.",
  'Try 1.7mg and see how the nausea goes.',
  'You can stay on 0.25 mg for another month.',
  'It is time to titrate up.',
  'You should stop taking your weekly injection.',
  'Skip the next dose and see how you feel.',
  'Reduce the dose to 0.5 mg.',
  'inject 20 units tonight',
  'I suggest you take 0.5 mg instead.',
  // Downward advice is prescribing too, and is the direction more likely to
  // cause harm if acted on alone.
  'Stop your 1 mg dose and drop back to 0.5 mg until you see your doctor.',
  'Cut back to 0.25 mg for a couple of weeks.',
  'Come off it for now.',
  'Go back to 1.7 mg.',
];

/**
 * Things the coach legitimately says. A false positive only appends a cautious
 * sentence, so this list is deliberately short — it guards against the guard
 * becoming so broad it fires on every message, not against every edge case.
 */
const MUST_NOT_CATCH = [
  'Nausea usually settles within two to three weeks.',
  'Your doctor decides when to change your dose — I cannot advise on that.',
  'How have you been feeling since your last injection?',
  'Obesity is a medical condition, not a failure of willpower.',
  'Ask your doctor whether a dose change makes sense for you.',
  'Many people notice appetite changes in the first month.',
  'I cannot tell you how much to take. Please raise it with your doctor.',
];

describe('prescribing guard', () => {
  it.each(MUST_CATCH)('catches "%s"', (text) => {
    expect(violatesPrescribingRule(text)).toBe(true);
  });

  it.each(MUST_NOT_CATCH)('leaves "%s" alone', (text) => {
    expect(violatesPrescribingRule(text)).toBe(false);
  });

  it('catches dose advice buried in a longer, friendly reply', () => {
    const reply = [
      'That is a really common experience and it does settle.',
      'Given the nausea has eased, you should take semaglutide 0.5 mg from Monday.',
      'Keep drinking water and eat smaller meals.',
    ].join(' ');
    expect(violatesPrescribingRule(reply)).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(violatesPrescribingRule('YOU SHOULD INCREASE YOUR DOSE TO 2 MG')).toBe(true);
  });

  it('uses patterns that cross a decimal point', () => {
    // The specific defect this file exists for: `\d*` cannot match "0.5".
    for (const pattern of PRESCRIPTION_PATTERNS) {
      expect(pattern.source).not.toContain(String.raw`\d*`);
    }
  });
});

describe('client and server guards stay identical', () => {
  const clientSource = readFileSync(join(__dirname, '..', 'prescribingGuard.ts'), 'utf8');
  const serverSource = readFileSync(
    join(__dirname, '..', '..', '..', '..', 'supabase', 'functions', '_shared', 'safety.ts'),
    'utf8',
  );

  /** Pulls the guard block out of a file so the two can be compared directly. */
  const guardBlock = (source: string) => {
    const start = source.indexOf('const DOSE =');
    const end = source.indexOf('export const SAFE_REWRITE_SUFFIX');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    return source.slice(start, end).trim();
  };

  it('ships the same patterns on the device and on the server', () => {
    // The server is the *preferred* engine. A guard that only exists on the
    // device means the better-connected user gets the weaker protection.
    expect(guardBlock(serverSource)).toBe(guardBlock(clientSource));
  });

  it('ships the same disclaimer', () => {
    const suffix = (source: string) =>
      source.slice(source.indexOf('export const SAFE_REWRITE_SUFFIX')).trim();
    expect(suffix(serverSource)).toBe(suffix(clientSource));
  });
});
