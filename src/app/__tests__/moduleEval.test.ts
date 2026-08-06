import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every module must survive being imported.
 *
 * A `throw` at module scope is the one error class this app had no defence
 * against. `ErrorBoundary` catches render errors, but module evaluation
 * happens during the initial require chain — before React mounts — so an
 * exception there kills the process with nothing on screen. On Android that is
 * indistinguishable from the app refusing to open, and it is exactly what
 * `expo-audio` did: it patches `AudioModule.AudioPlayer.prototype` at import
 * time, and the chat screen reachable from the first tab imported it, so a
 * version-mismatched native module took the whole app down at launch.
 *
 * This walks the source tree and imports every file. It is deliberately blunt:
 * the failure it guards against is not subtle, it is fatal, and it is invisible
 * until someone installs the APK.
 *
 * One caveat worth knowing: jest-expo substitutes mocks for native modules, so
 * this proves a module has no *unconditional* import-time throw. It cannot
 * prove the real native module is present on a given device — that is what the
 * `index.js` try/catch and `StartupFailure` are for.
 */

const SRC = join(__dirname, '..', '..');

/**
 * Modules that legitimately touch a native module while being evaluated, and
 * are therefore quarantined behind a guarded `require` rather than imported
 * from the launch path. Each entry needs the reason and the guard that makes
 * it safe — an unexplained entry here is how the original bug comes back.
 */
const QUARANTINED: Record<string, string> = {
  'src/features/ai/components/VoiceRecorder.tsx':
    'expo-audio patches native prototypes on import; loaded via the guarded require in VoiceInputButton',
};

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === '__tests__') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry) && !entry.endsWith('.d.ts')) out.push(full);
  }
  return out;
}

describe('module evaluation', () => {
  const files = sourceFiles(SRC);

  it('walks a meaningful part of the tree', () => {
    // Guards against the walk silently returning nothing and passing vacuously.
    expect(files.length).toBeGreaterThan(50);
  });

  for (const file of files) {
    const name = file.replace(SRC, 'src');
    if (QUARANTINED[name]) continue;

    it(`imports ${name} without throwing`, () => {
      expect(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require(file);
      }).not.toThrow();
    });
  }

  it('quarantines only files that still exist', () => {
    const names = new Set(files.map((f) => f.replace(SRC, 'src')));
    for (const quarantined of Object.keys(QUARANTINED)) {
      expect(names.has(quarantined)).toBe(true);
    }
  });

  /*
    The quarantine is only worth anything if nothing else imports `expo-audio`
    directly. One stray import from a screen puts the fatal module-scope
    prototype patch back on the launch path, and the app would again install
    and then refuse to open.
  */
  it('reaches expo-audio through the quarantined module alone', () => {
    const importers = files.filter((file) => {
      const source = readFileSync(file, 'utf8');
      return /from\s+['"]expo-audio['"]|require\(\s*['"]expo-audio['"]/.test(source);
    });

    expect(importers.map((f) => f.replace(SRC, 'src'))).toEqual(Object.keys(QUARANTINED));
  });
});
