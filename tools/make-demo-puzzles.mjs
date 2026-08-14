#!/usr/bin/env node
// Draws a few flat-colour scenes and runs them through the real mapify
// pipeline, so `npm run seed && npm start` gives you something to play
// immediately. Swap these for generated art whenever you like — the pipeline
// does not care where the pixels came from.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

import {
  createImage, fillRect, fillPoly, fillEllipse, fillCircle, fillCapsule,
  blob, toPNGBuffer, mulberry32,
} from './lib/raster.mjs';
import { buildPuzzle, writePuzzle } from './mapify.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const RAW = path.join(ROOT, 'puzzles', '_raw');
const SIZE = 900;

const hex = (h) => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];

/* ------------------------------------------------------------------ scenes */

function duskHarbour() {
  const img = createImage(SIZE, SIZE, hex('#f7c56b'));
  const horizon = SIZE * 0.58;

  fillRect(img, 0, 0, SIZE, SIZE * 0.22, hex('#2e3d6b'));
  fillRect(img, 0, SIZE * 0.22, SIZE, SIZE * 0.16, hex('#6a4a86'));
  fillRect(img, 0, SIZE * 0.38, SIZE, horizon - SIZE * 0.38, hex('#e8825b'));

  fillCircle(img, SIZE * 0.66, SIZE * 0.44, SIZE * 0.13, hex('#ffd98a'));

  for (const [cx, cy, r, seed] of [
    [SIZE * 0.22, SIZE * 0.2, SIZE * 0.1, 3],
    [SIZE * 0.34, SIZE * 0.17, SIZE * 0.07, 7],
    [SIZE * 0.78, SIZE * 0.26, SIZE * 0.09, 11],
  ]) {
    fillPoly(img, blob(cx, cy, r, { seed, squash: 0.55, wobble: 0.3 }), hex('#8f6aa4'));
  }

  // Water, banded so the reflection reads as flat shapes not a gradient.
  fillRect(img, 0, horizon, SIZE, SIZE * 0.1, hex('#3f5d8c'));
  fillRect(img, 0, horizon + SIZE * 0.1, SIZE, SIZE * 0.14, hex('#2b4470'));
  fillRect(img, 0, horizon + SIZE * 0.24, SIZE, SIZE, hex('#1d2f52'));

  // Headland silhouettes.
  fillPoly(img, [
    [0, horizon], [SIZE * 0.13, SIZE * 0.44], [SIZE * 0.26, SIZE * 0.52],
    [SIZE * 0.38, horizon],
  ], hex('#432f5e'));
  fillPoly(img, [
    [SIZE * 0.72, horizon], [SIZE * 0.86, SIZE * 0.47], [SIZE, SIZE * 0.53], [SIZE, horizon],
  ], hex('#533a70'));

  // Sailboat.
  const bx = SIZE * 0.42;
  const by = horizon + SIZE * 0.02;
  fillPoly(img, [[bx - 70, by], [bx + 78, by], [bx + 52, by + 34], [bx - 44, by + 34]], hex('#1a1526'));
  fillPoly(img, [[bx + 4, by - 150], [bx + 4, by - 6], [bx - 66, by - 6]], hex('#fbf1de'));
  fillPoly(img, [[bx + 16, by - 128], [bx + 70, by - 6], [bx + 16, by - 6]], hex('#f3d3b3'));

  // Reflection dashes.
  const rand = mulberry32(19);
  for (let i = 0; i < 9; i++) {
    const w = SIZE * (0.06 + rand() * 0.12);
    fillRect(img, bx - w / 2 + (rand() * 60 - 30), by + 58 + i * 26, w, 11, hex('#f7c56b'));
  }

  return img;
}

function koiPond() {
  const img = createImage(SIZE, SIZE, hex('#123b45'));

  fillPoly(img, blob(SIZE * 0.5, SIZE * 0.52, SIZE * 0.46, { seed: 5, wobble: 0.12, points: 30 }), hex('#1c5a63'));
  fillPoly(img, blob(SIZE * 0.46, SIZE * 0.5, SIZE * 0.3, { seed: 9, wobble: 0.16, points: 26 }), hex('#2b7d81'));

  // Lily pads: a disc with a wedge cut back to the pond colour.
  for (const [cx, cy, r, seed] of [
    [SIZE * 0.2, SIZE * 0.24, SIZE * 0.11, 21],
    [SIZE * 0.82, SIZE * 0.34, SIZE * 0.09, 22],
    [SIZE * 0.72, SIZE * 0.79, SIZE * 0.12, 23],
    [SIZE * 0.24, SIZE * 0.74, SIZE * 0.08, 24],
  ]) {
    fillPoly(img, blob(cx, cy, r, { seed, wobble: 0.08, points: 24 }), hex('#4f9f52'));
    fillPoly(img, [[cx, cy], [cx + r * 1.2, cy - r * 0.42], [cx + r * 1.2, cy + r * 0.42]], hex('#2b7d81'));
  }

  const koi = (cx, cy, len, tilt, body, fin) => {
    const c = Math.cos(tilt);
    const s = Math.sin(tilt);
    const at = (dx, dy) => [cx + dx * c - dy * s, cy + dx * s + dy * c];
    fillPoly(img, [at(-len, 0), at(-len * 1.7, -len * 0.5), at(-len * 1.55, 0), at(-len * 1.7, len * 0.5)], fin);
    fillPoly(img, blob(0, 0, len, { seed: 31, wobble: 0.06, squash: 0.42, points: 24 })
      .map(([x, y]) => at(x, y)), body);
    fillPoly(img, [at(len * 0.1, -len * 0.35), at(len * 0.55, -len * 0.9), at(len * 0.6, -len * 0.3)], fin);
  };

  koi(SIZE * 0.4, SIZE * 0.42, SIZE * 0.13, 0.4, hex('#ef6d3b'), hex('#f6a978'));
  koi(SIZE * 0.62, SIZE * 0.62, SIZE * 0.11, -2.5, hex('#f2ede4'), hex('#d7cfc0'));
  koi(SIZE * 0.36, SIZE * 0.68, SIZE * 0.09, 2.2, hex('#d8353a'), hex('#f08a6b'));

  return img;
}

function cactusMesa() {
  const img = createImage(SIZE, SIZE, hex('#f6a26a'));

  fillRect(img, 0, 0, SIZE, SIZE * 0.2, hex('#3b2a55'));
  fillRect(img, 0, SIZE * 0.2, SIZE, SIZE * 0.14, hex('#8a4b74'));
  fillRect(img, 0, SIZE * 0.34, SIZE, SIZE * 0.16, hex('#d9666a'));

  fillCircle(img, SIZE * 0.3, SIZE * 0.46, SIZE * 0.115, hex('#ffe0a1'));

  fillPoly(img, [
    [0, SIZE * 0.62], [SIZE * 0.1, SIZE * 0.5], [SIZE * 0.32, SIZE * 0.5],
    [SIZE * 0.42, SIZE * 0.62],
  ], hex('#7c3f63'));
  fillPoly(img, [
    [SIZE * 0.52, SIZE * 0.6], [SIZE * 0.64, SIZE * 0.44], [SIZE * 0.88, SIZE * 0.44],
    [SIZE, SIZE * 0.58], [SIZE, SIZE * 0.62],
  ], hex('#5e2f52'));

  fillRect(img, 0, SIZE * 0.62, SIZE, SIZE * 0.14, hex('#c96b4b'));
  fillRect(img, 0, SIZE * 0.76, SIZE, SIZE * 0.24, hex('#9c4c3c'));

  const cactus = (x, base, w, h, arms, colour) => {
    fillCapsule(img, x - w / 2, base - h, w, h, colour);
    for (const [side, at, len] of arms) {
      const y = base - h * at;
      fillCapsule(img, x + side * (w * 0.5) - (side < 0 ? w * 0.62 : 0), y, w * 0.62, w * 0.5, colour);
      const ax = x + side * (w * 0.72) - w * 0.31;
      fillCapsule(img, ax, y - len, w * 0.62, len + w * 0.5, colour);
    }
  };

  cactus(SIZE * 0.68, SIZE * 0.82, SIZE * 0.085, SIZE * 0.3, [[1, 0.62, SIZE * 0.1], [-1, 0.44, SIZE * 0.06]], hex('#2f6b4f'));
  cactus(SIZE * 0.2, SIZE * 0.94, SIZE * 0.1, SIZE * 0.36, [[-1, 0.7, SIZE * 0.13]], hex('#27573f'));
  fillEllipse(img, SIZE * 0.45, SIZE * 0.9, SIZE * 0.09, SIZE * 0.035, hex('#7d3a30'));

  return img;
}

/* ------------------------------------------------------------------- driver */

const SCENES = [
  { id: 'dusk-harbour', title: 'Dusk Harbour', draw: duskHarbour, opts: { maxColours: 13, maxCells: 52 } },
  { id: 'koi-pond', title: 'Koi Pond', draw: koiPond, opts: { maxColours: 12, maxCells: 46 } },
  { id: 'cactus-mesa', title: 'Cactus Mesa', draw: cactusMesa, opts: { maxColours: 14, maxCells: 54 } },
];

fs.mkdirSync(RAW, { recursive: true });

for (const scene of SCENES) {
  const img = scene.draw();
  fs.writeFileSync(path.join(RAW, `${scene.id}.png`), toPNGBuffer(img, PNG));

  const puzzle = buildPuzzle(img.data, img.w, img.h, scene.opts);
  const out = writePuzzle(puzzle, scene);

  const areas = puzzle.cells.map((c) => c.a).sort((a, b) => a - b);
  console.log(
    `${scene.title.padEnd(14)} ${String(puzzle.cells.length).padStart(3)} cells  ` +
    `${String(puzzle.palette.length).padStart(2)} tubs  ` +
    `min ${String(areas[0]).padStart(5)}px  median ${String(areas[areas.length >> 1]).padStart(5)}px  ` +
    `${(fs.statSync(out).size / 1024).toFixed(0)}kB`,
  );
}
