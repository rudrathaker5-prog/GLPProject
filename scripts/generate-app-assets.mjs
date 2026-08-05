#!/usr/bin/env node
/**
 * Generates the app icon and splash logo as real PNGs.
 *
 * Why this exists: the project shipped with no `assets/` directory at all. Expo
 * still wrote `windowSplashScreenAnimatedIcon="@drawable/splashscreen_logo"`
 * into styles.xml, so every release build died in aapt2 with
 * "resource drawable/splashscreen_logo not found" — after eleven minutes of
 * compiling. The app also had no launcher icon of its own.
 *
 * Written by hand rather than pulling in sharp/canvas: this runs in CI and in a
 * sandbox with no network, and a 200-line PNG encoder over node:zlib has no
 * install step and no native build.
 *
 * Run: node scripts/generate-app-assets.mjs
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BRAND = [0x1a, 0x63, 0xdd]; // brand-600, the app's primary
const VITAL = [0x17, 0xb8, 0x71]; // vital-500, the "progress" green
const WHITE = [0xff, 0xff, 0xff];

// --- PNG encoding -----------------------------------------------------------

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n += 1) {
    c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const byte of buf) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([len, typeAndData, crc]);
}

/** RGBA pixel buffer → PNG file buffer. */
function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  // 10-12: compression, filter, interlace — all 0

  // One filter byte (0 = None) per scanline.
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (1 + width * 4);
    raw[rowStart] = 0;
    rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- Drawing ----------------------------------------------------------------

function canvas(size) {
  return { size, px: Buffer.alloc(size * size * 4) };
}

/** Alpha-blends `colour` at `coverage` (0-1) onto the pixel. */
function blend(c, x, y, colour, coverage) {
  if (coverage <= 0 || x < 0 || y < 0 || x >= c.size || y >= c.size) return;
  const i = (y * c.size + x) * 4;
  const a = Math.min(1, coverage);
  const existing = c.px[i + 3] / 255;
  const out = a + existing * (1 - a);
  for (let k = 0; k < 3; k += 1) {
    c.px[i + k] = Math.round((colour[k] * a + c.px[i + k] * existing * (1 - a)) / (out || 1));
  }
  c.px[i + 3] = Math.round(out * 255);
}

/**
 * Fills wherever `sdf(x, y)` is negative, antialiased over one pixel.
 * Supersampled 3×3 so curves do not stairstep at icon sizes.
 */
function fill(c, sdf, colour) {
  const S = 3;
  for (let y = 0; y < c.size; y += 1) {
    for (let x = 0; x < c.size; x += 1) {
      let hits = 0;
      for (let sy = 0; sy < S; sy += 1) {
        for (let sx = 0; sx < S; sx += 1) {
          if (sdf(x + (sx + 0.5) / S, y + (sy + 0.5) / S) <= 0) hits += 1;
        }
      }
      if (hits) blend(c, x, y, colour, hits / (S * S));
    }
  }
}

const roundedSquare = (size, radius) => (x, y) => {
  const dx = Math.abs(x - size / 2) - (size / 2 - radius);
  const dy = Math.abs(y - size / 2) - (size / 2 - radius);
  const ox = Math.max(dx, 0);
  const oy = Math.max(dy, 0);
  return Math.min(Math.max(dx, dy), 0) + Math.hypot(ox, oy) - radius;
};

const circle = (cx, cy, r) => (x, y) => Math.hypot(x - cx, y - cy) - r;

/**
 * A heart — the app's own icon language (`Icon name="heart"`), and the right
 * symbol for a care companion rather than a weight-loss tracker.
 */
const heart = (cx, cy, scale) => (x, y) => {
  const px = (x - cx) / scale;
  // Image coordinates grow downward; the implicit curve below assumes y-up, so
  // this flips. Without it the heart renders point-up.
  const py = (cy - y) / scale;
  // Implicit heart curve; negative inside.
  const a = px * px + py * py - 1;
  return a * a * a - px * px * py * py * py;
};

/** Distance to the segment a→b, for drawing strokes. */
const segment = (ax, ay, bx, by, halfWidth) => (x, y) => {
  const vx = bx - ax;
  const vy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy)));
  return Math.hypot(x - (ax + t * vx), y - (ay + t * vy)) - halfWidth;
};

/** Union of several signed distance fields. */
const union =
  (...fields) =>
  (x, y) =>
    Math.min(...fields.map((f) => f(x, y)));

/**
 * A falling weight line under the heart — the thing the app is actually for.
 * Two segments plus a dot at the end, so it reads as a chart, not a swoosh.
 */
const trendLine = (size) => {
  const w = size * 0.028;
  const y0 = size * 0.76;
  return union(
    segment(size * 0.27, y0, size * 0.45, y0 + size * 0.055, w),
    segment(size * 0.45, y0 + size * 0.055, size * 0.62, y0 - size * 0.02, w),
    segment(size * 0.62, y0 - size * 0.02, size * 0.75, y0 + size * 0.07, w),
    circle(size * 0.75, y0 + size * 0.07, w * 1.9),
  );
};

/** The icon: brand-blue rounded square, white heart, green trend line. */
function drawIcon(size, { background = true } = {}) {
  const c = canvas(size);
  if (background) fill(c, roundedSquare(size, size * 0.22), BRAND);

  const cx = size / 2;
  const cy = size * 0.44;
  fill(c, heart(cx, cy, size * 0.26), WHITE);

  // A downward weight trend below the heart: progress, not just care.
  fill(c, trendLine(size), VITAL);

  return c;
}

/** The splash logo: no background — the splash screen supplies brand blue. */
function drawSplashLogo(size) {
  const c = canvas(size);
  fill(c, heart(size / 2, size * 0.44, size * 0.28), WHITE);
  fill(c, trendLine(size), VITAL);
  return c;
}

/** A plain brand-blue square, for the adaptive-icon background layer. */
function drawAdaptiveBackground(size) {
  const c = canvas(size);
  fill(c, () => -1, BRAND);
  return c;
}

/**
 * The adaptive-icon foreground. Android crops this to a circle or squircle and
 * only the middle ~66% is guaranteed visible, so the glyph is drawn smaller.
 */
function drawAdaptiveForeground(size) {
  const c = canvas(size);
  fill(c, heart(size / 2, size * 0.45, size * 0.17), WHITE);
  return c;
}

// --- Output -----------------------------------------------------------------

const outDir = join(process.cwd(), 'assets');
mkdirSync(outDir, { recursive: true });

const targets = [
  ['icon.png', drawIcon(1024)],
  ['adaptive-icon.png', drawAdaptiveForeground(1024)],
  ['adaptive-icon-background.png', drawAdaptiveBackground(1024)],
  ['splash-icon.png', drawSplashLogo(512)],
  ['notification-icon.png', drawSplashLogo(96)],
  ['favicon.png', drawIcon(48)],
];

for (const [name, c] of targets) {
  const png = encodePng(c.size, c.size, c.px);
  writeFileSync(join(outDir, name), png);
  console.log(`${name.padEnd(30)} ${c.size}×${c.size}  ${(png.length / 1024).toFixed(1)} kB`);
}

console.log('\nAssets written to assets/.');
