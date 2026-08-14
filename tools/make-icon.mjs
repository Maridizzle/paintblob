#!/usr/bin/env node
// Draws build/icon.png, which electron-builder converts into .icns and .ico.
//
// Generated rather than committed as a binary blob so the colours stay tied to
// the app's palette and it can be re-rendered at any size. Kept to three bold
// shapes because the thing spends most of its life 32 pixels wide in a dock.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

import { createImage, fillPoly, blob, roundedRect, toPNGBuffer } from './lib/raster.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const SIZE = Number(process.argv[2]) || 1024;

const hex = (h) => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];

const img = createImage(SIZE, SIZE, [0, 0, 0, 0]);
const k = SIZE / 1024;

// Card background, matching the app chrome. macOS rounds icons itself but a
// square would look wrong everywhere else, so bake the radius in.
fillPoly(img, roundedRect(0, 0, SIZE, SIZE, 224 * k, 24), hex('#17151f'));

// Three overlapping blobs, drawn back to front. Same wobble generator the
// paint effect uses, so the icon and the thing it launches actually match.
fillPoly(img, blob(400 * k, 430 * k, 250 * k, { seed: 7, wobble: 0.16, points: 20 }), hex('#3fb0a8'));
fillPoly(img, blob(630 * k, 590 * k, 285 * k, { seed: 3, wobble: 0.18, points: 22 }), hex('#ff8f5e'));
fillPoly(img, blob(392 * k, 706 * k, 118 * k, { seed: 11, wobble: 0.2, points: 16 }), hex('#ffb35c'));

// A stray droplet, because the whole point is that paint goes everywhere.
fillPoly(img, blob(760 * k, 268 * k, 62 * k, { seed: 19, wobble: 0.22, points: 14 }), hex('#ffb35c'));

const out = path.join(ROOT, 'build', 'icon.png');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, toPNGBuffer(img, PNG));
console.log(`${path.relative(ROOT, out)}  ${SIZE}x${SIZE}  ${(fs.statSync(out).size / 1024).toFixed(1)} kB`);
