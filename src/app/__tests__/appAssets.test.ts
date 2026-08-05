import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every image app.config.ts points at must actually exist.
 *
 * The release build failed for eleven minutes and then died in aapt2 with
 * "resource drawable/splashscreen_logo not found". The cause was mundane: the
 * repo had no `assets/` directory, and a `splash` block with no `image` still
 * makes Expo write `windowSplashScreenAnimatedIcon="@drawable/splashscreen_logo"`
 * into styles.xml. Nothing in typecheck, lint, tests or the Metro bundle looks
 * at native resources, so CI went green all the way to Gradle.
 *
 * This is a few milliseconds and catches it at the same moment it is introduced.
 */

const ROOT = join(__dirname, '..', '..', '..');

/** Every './assets/…' path referenced anywhere in the Expo config. */
function referencedAssets(): string[] {
  const config = readFileSync(join(ROOT, 'app.config.ts'), 'utf8');
  return [...new Set([...config.matchAll(/'(\.\/assets\/[^']+)'/g)].map((m) => m[1]))];
}

/** Reads width and height out of a PNG's IHDR chunk. */
function pngSize(path: string): { width: number; height: number } {
  const buf = readFileSync(path);
  expect(buf.subarray(0, 8)).toEqual(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  );
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

describe('app assets', () => {
  const assets = referencedAssets();

  it('references the images a build needs', () => {
    // If this drops to zero the rest of the suite silently passes on nothing.
    expect(assets.length).toBeGreaterThanOrEqual(4);
    expect(assets).toContain('./assets/icon.png');
    expect(assets).toContain('./assets/splash-icon.png');
    expect(assets).toContain('./assets/adaptive-icon.png');
  });

  it.each(referencedAssets())('%s exists and is a real PNG', (relative) => {
    const path = join(ROOT, relative);
    expect(existsSync(path)).toBe(true);
    expect(statSync(path).size).toBeGreaterThan(100);

    const { width, height } = pngSize(path);
    expect(width).toBeGreaterThan(0);
    expect(height).toBe(width); // every one of these is square by contract
  });

  it('gives the launcher icon enough resolution for xxxhdpi', () => {
    // Android wants 512+; Play Store wants 1024. A small icon upscales badly
    // and looks like a placeholder on a modern phone.
    expect(pngSize(join(ROOT, 'assets/icon.png')).width).toBeGreaterThanOrEqual(1024);
    expect(pngSize(join(ROOT, 'assets/adaptive-icon.png')).width).toBeGreaterThanOrEqual(1024);
  });

  it('declares a splash image whenever it declares a splash block', () => {
    const config = readFileSync(join(ROOT, 'app.config.ts'), 'utf8');
    const splash = config.slice(config.indexOf('splash: {'));
    const block = splash.slice(0, splash.indexOf('},'));
    // The exact shape that broke the build: backgroundColor with no image.
    expect(block).toContain('image:');
  });

  it('can regenerate every asset from source', () => {
    // The generator is the source of truth, not the binaries — otherwise a
    // future change to the palette leaves the icon stale with no way to tell.
    expect(existsSync(join(ROOT, 'scripts/generate-app-assets.mjs'))).toBe(true);
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    expect(pkg.scripts.assets).toContain('generate-app-assets');
  });
});
