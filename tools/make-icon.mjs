#!/usr/bin/env node
// Renders the app icon. electron-builder turns build/icon.png into .icns and
// .ico; the web build calls renderIcon() directly for its PWA sizes.
//
// Generated rather than committed as a binary blob so the colours stay tied to
// the app's palette and it can be re-rendered at any size. Kept to three bold
// shapes because the thing spends most of its life 32 pixels wide.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

import { createImage, fillPoly, blob, roundedRect, toPNGBuffer } from './lib/raster.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

const hex = (h) => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];

/**
 * @param {number} size
 * @param {boolean} [square] true fills the whole canvas — Android maskable
 *   icons are cropped to whatever shape the launcher wants, so a baked-in
 *   radius would get clipped twice and look wrong.
 */
export function renderIcon(size, { square = false, padding = 0 } = {}) {
  const img = createImage(size, size, [0, 0, 0, 0]);
  const k = size / 1024;
  const radius = square ? 0 : 224 * k;

  fillPoly(img, roundedRect(0, 0, size, size, radius, 24), hex('#17151f'));

  // Same wobble generator the paint effect uses, so the icon and the thing it
  // launches actually match. Inset when padding is asked for, which keeps the
  // blobs inside a maskable icon's guaranteed-safe circle.
  const s = 1 - padding * 2;
  const at = (v) => (padding + (v / 1024) * s) * size;
  const r = (v) => (v / 1024) * s * size;

  fillPoly(img, blob(at(400), at(430), r(250), { seed: 7, wobble: 0.16, points: 20 }), hex('#3fb0a8'));
  fillPoly(img, blob(at(630), at(590), r(285), { seed: 3, wobble: 0.18, points: 22 }), hex('#ff8f5e'));
  fillPoly(img, blob(at(392), at(706), r(118), { seed: 11, wobble: 0.2, points: 16 }), hex('#ffb35c'));
  fillPoly(img, blob(at(760), at(268), r(62), { seed: 19, wobble: 0.22, points: 14 }), hex('#ffb35c'));

  return img;
}

export const iconBuffer = (size, opts) => toPNGBuffer(renderIcon(size, opts), PNG);

function main() {
  const size = Number(process.argv[2]) || 1024;
  const out = path.join(ROOT, 'build', 'icon.png');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, iconBuffer(size));
  console.log(`${path.relative(ROOT, out)}  ${size}x${size}  ${(fs.statSync(out).size / 1024).toFixed(1)} kB`);
}

if (process.argv[1] && import.meta.url === `file://${path.resolve(process.argv[1])}`) main();
