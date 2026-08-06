import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The rule that decides whether the app may dial a doctor unprompted must be
 * identical on the device and on the server.
 *
 * This gate was originally applied in exactly one place — the offline engine —
 * while the two LLM paths defaulted `autoDial` to true and relied on a sentence
 * in the tool description. A description is a request, not a constraint: a
 * model asked "should I call my doctor about this nausea?" can reasonably
 * decide the answer is yes and reach for the tool. The dialler then opens on a
 * question, which is the exact false positive the feature was built to avoid,
 * and it happened only to users who had configured a backend or a key.
 *
 * Both engines now run the same regex against the user's own words. This keeps
 * the two copies from drifting the way the safety rules already had.
 */

const ROOT = join(__dirname, '..', '..', '..', '..', '..');

const CLIENT = join(ROOT, 'src', 'features', 'calls', 'api', 'resolveDoctor.ts');
const SERVER = join(ROOT, 'supabase', 'functions', '_shared', 'safety.ts');

/** The gate: from its doc comment to the end of `isDirectCallRequest`. */
function gateBlock(path: string): string {
  const source = readFileSync(path, 'utf8');
  const start = source.indexOf('const APOS =');
  const marker = source.indexOf('export function isDirectCallRequest');
  expect(start).toBeGreaterThan(-1);
  expect(marker).toBeGreaterThan(start);
  const end = source.indexOf('}', marker) + 1;
  return source.slice(start, end).trim();
}

describe('the call-request gate', () => {
  it('is byte-identical on the device and the server', () => {
    expect(gateBlock(SERVER)).toBe(gateBlock(CLIENT));
  });

  it('is actually applied on every path that can auto-dial', () => {
    const clientTools = readFileSync(
      join(ROOT, 'src', 'features', 'ai', 'agent', 'clientTools.ts'),
      'utf8',
    );
    const serverTools = readFileSync(
      join(ROOT, 'supabase', 'functions', '_shared', 'tools.ts'),
      'utf8',
    );
    const localEngine = readFileSync(
      join(ROOT, 'src', 'features', 'ai', 'engine', 'localEngine.ts'),
      'utf8',
    );

    // All three engines, not just the one that shipped with it.
    for (const [name, source] of [
      ['on-device tool', clientTools],
      ['server tool', serverTools],
      ['offline engine', localEngine],
    ] as const) {
      expect({ name, gated: source.includes('isDirectCallRequest') }).toEqual({
        name,
        gated: true,
      });
    }
  });

  it('never lets the model alone decide to dial', () => {
    // `auto_dial !== false` on its own is the bug. It has to be combined with
    // the gate, on both sides.
    const clientTools = readFileSync(
      join(ROOT, 'src', 'features', 'ai', 'agent', 'clientTools.ts'),
      'utf8',
    );
    const serverTools = readFileSync(
      join(ROOT, 'supabase', 'functions', '_shared', 'tools.ts'),
      'utf8',
    );

    for (const source of [clientTools, serverTools]) {
      const index = source.indexOf('auto_dial !== false');
      expect(index).toBeGreaterThan(-1);
      // The gate must appear in the same expression or immediately around it.
      const window = source.slice(index - 400, index + 400);
      expect(window).toContain('isDirectCallRequest');
    }
  });
});
