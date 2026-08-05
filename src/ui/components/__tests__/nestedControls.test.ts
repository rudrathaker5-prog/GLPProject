import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A pressable `Card` must not contain another control.
 *
 * `Card` with an `onPress` renders a `Pressable`, and `Pressable` defaults to
 * `accessible={true}`, which collapses its entire subtree into one node. Any
 * button inside it becomes unreachable with TalkBack and VoiceOver — it is
 * still visible, still tappable by touch, and completely invisible to a screen
 * reader, so nothing about it looks wrong in review.
 *
 * This bit exactly once, on the "Request refill" button, which only renders
 * when the medicine is nearly out.
 */

const SRC = join(__dirname, '..', '..', '..');

function screenFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === '__tests__' || entry === 'node_modules') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...screenFiles(full));
    else if (entry.endsWith('.tsx')) out.push(full);
  }
  return out;
}

/** Controls that are unreachable once a parent collapses the tree. */
const NESTED_CONTROL = /<(Button|Pressable|IconButton|Chip|Switch|TouchableOpacity)\b/;

describe('pressable cards', () => {
  const offenders: string[] = [];

  for (const file of screenFiles(SRC)) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/<Card\b[^>]*onPress/g)) {
      const end = source.indexOf('</Card>', match.index! + match[0].length);
      if (end < 0) continue;
      const block = source.slice(match.index!, end);
      if (NESTED_CONTROL.test(block)) {
        const line = source.slice(0, match.index!).split('\n').length;
        offenders.push(`${file.replace(SRC, 'src')}:${line}`);
      }
    }
  }

  it('scans a meaningful number of files', () => {
    // Guards against the walk silently returning nothing.
    expect(screenFiles(SRC).length).toBeGreaterThan(30);
  });

  it('contain no nested control a screen reader cannot reach', () => {
    expect(offenders).toEqual([]);
  });
});
