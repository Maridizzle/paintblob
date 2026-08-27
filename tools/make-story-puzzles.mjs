#!/usr/bin/env node
// Bakes PLACEHOLDER art for chapter one's stones three through seven, so the
// whole chapter is playable the moment it ships. These are flat jewel-tone
// scenes in the chapter's David-LaChapelle register — saturated magenta,
// cobalt, emerald, gold and violet on dark grounds — run through the same
// mapify pipeline a photograph would be. Swap any of them for real generated
// art whenever it is ready:
//
//   npm run mapify -- art.png --id thread-cupboard --title "The Thread Cupboard"
//
// and nothing in story mode changes — the stone names an id, not an image. The
// prompts to generate that art live in docs/story-art-prompts.md.
//
// Deliberately NOT in the `seed` chain. Stones one and two are committed static
// JSON baked from real art; these five are committed static JSON too, and a
// stray `npm run seed` must never overwrite whichever ones have been replaced.
// Run this by hand, once, and commit the result.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

import {
  createImage, fillRect, fillPoly, fillEllipse, fillCircle, blob, toPNGBuffer, mulberry32,
} from './lib/raster.mjs';
import { buildPuzzle, DETAIL_PRESETS } from '../src/pipeline/build.js';
import { writePuzzle } from './mapify.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const RAW = path.join(ROOT, 'puzzles', '_raw');
const SIZE = 900;
const S = (f) => SIZE * f;

const hex = (h) => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];

// A rectangle running from a→b at a given width, as a four-point polygon — the
// diagonal strokes (quills, threads, the boss's crossings) are all built from it.
function bar(img, ax, ay, bx, by, w, colour) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const px = (-dy / len) * (w / 2);
  const py = (dx / len) * (w / 2);
  fillPoly(img, [[ax + px, ay + py], [ax - px, ay - py], [bx - px, by - py], [bx + px, by + py]], colour);
}

// An ornate beaded border — a row of small alternating jewel tiles down every
// edge, a gold rule, jewelled corners. On-theme for the LaChapelle register and,
// just as usefully, forty-odd small cells per scene: without it these flat
// scenes quantise down to a dozen regions and paint in a blink. Drawn last, over
// the scene's edges, so content can run to the margins behind it.
function frame(img) {
  const b = S(0.058);
  const jewel = ['#d6249a', '#2f6fd6', '#1fbf7e', '#e0a92a', '#7a45c0', '#e56aa6'];
  const dark = hex('#150c28');
  fillRect(img, 0, 0, SIZE, b, dark);
  fillRect(img, 0, SIZE - b, SIZE, b, dark);
  fillRect(img, 0, 0, b, SIZE, dark);
  fillRect(img, SIZE - b, 0, b, SIZE, dark);
  const g = hex('#c99a3a');
  fillRect(img, b, b, SIZE - 2 * b, S(0.007), g);
  fillRect(img, b, SIZE - b - S(0.007), SIZE - 2 * b, S(0.007), g);
  fillRect(img, b, b, S(0.007), SIZE - 2 * b, g);
  fillRect(img, SIZE - b - S(0.007), b, S(0.007), SIZE - 2 * b, g);
  const nt = 13;
  const tw = (SIZE - 2 * b) / nt;
  for (let i = 0; i < nt; i++) {
    const x = b + i * tw + tw * 0.22;
    fillRect(img, x, S(0.016), tw * 0.56, b - S(0.032), hex(jewel[i % jewel.length]));
    fillRect(img, x, SIZE - b + S(0.016), tw * 0.56, b - S(0.032), hex(jewel[(i + 2) % jewel.length]));
  }
  const nv = 11;
  const th = (SIZE - 2 * b) / nv;
  for (let i = 0; i < nv; i++) {
    const y = b + i * th + th * 0.22;
    fillRect(img, S(0.016), y, b - S(0.032), th * 0.56, hex(jewel[(i + 1) % jewel.length]));
    fillRect(img, SIZE - b + S(0.016), y, b - S(0.032), th * 0.56, hex(jewel[(i + 3) % jewel.length]));
  }
  for (const [cx, cy] of [[0, 0], [SIZE - b, 0], [0, SIZE - b], [SIZE - b, SIZE - b]]) {
    fillRect(img, cx, cy, b, b, hex('#3a2358'));
    fillCircle(img, cx + b / 2, cy + b / 2, b * 0.3, hex('#e0a92a'));
    fillCircle(img, cx + b / 2, cy + b / 2, b * 0.13, hex('#d6249a'));
  }
}

/* ------------------------------------------------------------------ scenes */

// Stone 3 — a cabinet of thread spools, one jewel colour to a spool, the place
// the naming was kept tidiest and so came undone first.
function threadCupboard() {
  const img = createImage(SIZE, SIZE, hex('#241640'));
  fillRect(img, S(0.10), S(0.07), S(0.80), S(0.86), hex('#3a2358'));   // cabinet body
  fillRect(img, S(0.13), S(0.10), S(0.74), S(0.80), hex('#170e2c'));   // inner back
  for (const fy of [0.30, 0.52, 0.74]) fillRect(img, S(0.13), S(fy), S(0.74), S(0.028), hex('#c99a3a'));
  const cols = ['#d6249a', '#2f6fd6', '#1fbf7e', '#e0a92a', '#7a45c0', '#e56aa6', '#e83d8f', '#2246c6', '#17a069', '#b56bd0', '#f2c94c', '#d64a94'];
  let k = 0;
  for (const fy of [0.135, 0.355, 0.575]) {
    for (let i = 0; i < 5; i++) {
      const cx = S(0.19 + i * 0.135);
      const top = S(fy);
      const w = S(0.072);
      const h = S(0.145);
      fillRect(img, cx - w / 2, top, w, S(0.018), hex('#d9b24a'));                // top cap
      fillRect(img, cx - w / 2, top + h - S(0.018), w, S(0.018), hex('#d9b24a')); // bottom cap
      fillRect(img, cx - w / 2, top + S(0.018), w, h - S(0.036), hex(cols[k % cols.length])); // thread
      fillRect(img, cx - w / 2, top + S(0.018), S(0.014), h - S(0.036), hex('#170e2c')); // spindle gap (shadow)
      k++;
    }
  }
  bar(img, S(0.60), S(0.795), S(0.68), S(0.86), S(0.018), hex('#1fbf7e')); // one loose thread hanging
  frame(img);
  return img;
}

// Stone 4 — a single red on a spotlit stage. Four reds, because the whole point
// is a colour that answers to no one and so will take any name you give it.
function nobodysRed() {
  const img = createImage(SIZE, SIZE, hex('#1a1440'));
  fillRect(img, 0, S(0.62), SIZE, S(0.38), hex('#241a54'));                        // floor
  // a run of chequer tiles across the stage floor, alternating two deep violets
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 7; c++) {
      if ((r + c) % 2) continue;
      fillRect(img, S(0.06) + c * S(0.126), S(0.66) + r * S(0.10), S(0.12), S(0.09), hex('#2e2062'));
    }
  }
  fillPoly(img, [[S(0.5), 0], [S(0.88), S(0.72)], [S(0.12), S(0.72)]], hex('#3a2f78')); // spotlight
  fillPoly(img, [[S(0.5), S(0.05)], [S(0.71), S(0.66)], [S(0.29), S(0.66)]], hex('#4a3d92'));
  fillRect(img, S(0.40), S(0.62), S(0.20), S(0.17), hex('#2a1c3e'));               // pedestal
  fillEllipse(img, S(0.5), S(0.62), S(0.13), S(0.03), hex('#3a2850'));
  const rx = S(0.5);
  const ry = S(0.43);
  fillPoly(img, blob(rx, ry, S(0.185), { seed: 13, wobble: 0.14, points: 22 }), hex('#6e0f1e'));
  fillPoly(img, blob(rx, ry, S(0.155), { seed: 3, wobble: 0.16, points: 22 }), hex('#8a1226'));
  fillPoly(img, blob(rx, ry, S(0.12), { seed: 7, wobble: 0.2, points: 18 }), hex('#c81834'));
  fillPoly(img, blob(rx - S(0.03), ry - S(0.02), S(0.06), { seed: 17, wobble: 0.24, points: 15 }), hex('#e83a52'));
  fillPoly(img, blob(rx + S(0.03), ry + S(0.02), S(0.055), { seed: 19, wobble: 0.24, points: 15 }), hex('#d82840'));
  fillPoly(img, blob(rx, ry - S(0.005), S(0.045), { seed: 5, wobble: 0.25, points: 14 }), hex('#f26a7a'));
  fillPoly(img, [[rx - S(0.13), ry + S(0.09)], [rx - S(0.25), ry + S(0.03)], [rx - S(0.12), ry + S(0.14)]], hex('#1f7a52'));
  fillPoly(img, [[rx + S(0.13), ry + S(0.09)], [rx + S(0.25), ry + S(0.03)], [rx + S(0.12), ry + S(0.14)]], hex('#25966a'));
  fillRect(img, rx - S(0.012), ry + S(0.11), S(0.024), S(0.13), hex('#186040'));   // stem
  frame(img);
  return img;
}

// Stone 5 — an open songbook, a bird on it, notes in the air. It still reads.
// It no longer sings.
function rhymeThatStopped() {
  const img = createImage(SIZE, SIZE, hex('#17306e'));
  fillRect(img, 0, S(0.66), SIZE, S(0.34), hex('#0f2050'));
  const cx = S(0.5);
  const by = S(0.66);
  fillPoly(img, [[cx, S(0.40)], [S(0.14), S(0.50)], [S(0.14), by], [cx, by]], hex('#efe0c0')); // left page
  fillPoly(img, [[cx, S(0.40)], [S(0.86), S(0.50)], [S(0.86), by], [cx, by]], hex('#f4ead6')); // right page
  fillRect(img, cx - S(0.008), S(0.40), S(0.016), by - S(0.40), hex('#c99a3a'));   // spine
  for (let i = 0; i < 4; i++) {
    const yy = S(0.48 + i * 0.04);
    fillRect(img, S(0.20), yy, S(0.22), S(0.008), hex('#b98f6a'));
    fillRect(img, S(0.56), yy, S(0.22), S(0.008), hex('#b98f6a'));
  }
  fillRect(img, cx + S(0.10), S(0.40), S(0.02), S(0.30), hex('#d6249a'));          // ribbon
  const bx = S(0.62);
  const byy = S(0.37);
  fillPoly(img, blob(bx, byy, S(0.07), { seed: 9, wobble: 0.14, points: 18 }), hex('#1fbf7e')); // body
  fillPoly(img, blob(bx - S(0.02), byy + S(0.02), S(0.045), { seed: 2, squash: 0.5, points: 14 }), hex('#2f6fd6')); // wing
  fillCircle(img, bx + S(0.05), byy - S(0.04), S(0.035), hex('#17a069'));          // head
  fillPoly(img, [[bx + S(0.08), byy - S(0.045)], [bx + S(0.125), byy - S(0.03)], [bx + S(0.08), byy - S(0.012)]], hex('#e0a92a')); // beak
  fillCircle(img, bx + S(0.058), byy - S(0.05), S(0.009), hex('#0f0a1e'));         // eye
  for (const [nx, ny] of [[0.30, 0.30], [0.40, 0.22], [0.75, 0.27]]) {
    fillCircle(img, S(nx), S(ny), S(0.02), hex('#e0a92a'));
    fillRect(img, S(nx) + S(0.017), S(ny) - S(0.06), S(0.006), S(0.06), hex('#e0a92a'));
  }
  frame(img);
  return img;
}

// Stone 6 — a great gold E gone quiet on a writing desk, a full stop after it,
// the inkwell stopped and the quill down.
function silentE() {
  const img = createImage(SIZE, SIZE, hex('#2c1550'));
  // a shelf of books along the top, spines in jewel colours
  fillRect(img, S(0.10), S(0.10), S(0.80), S(0.14), hex('#1c0f38'));
  const spineCols = ['#d6249a', '#2f6fd6', '#1fbf7e', '#e0a92a', '#7a45c0', '#e56aa6', '#2246c6', '#17a069'];
  for (let i = 0; i < 12; i++) {
    const bx = S(0.12) + i * S(0.0635);
    const bh = S(0.10) + (i % 3) * S(0.012);
    fillRect(img, bx, S(0.22) - bh, S(0.05), bh, hex(spineCols[i % spineCols.length]));
  }
  fillRect(img, S(0.10), S(0.235), S(0.80), S(0.012), hex('#c99a3a')); // shelf lip
  fillRect(img, 0, S(0.70), SIZE, S(0.30), hex('#1e0e3a'));           // desk
  const ex = S(0.20);
  const top = S(0.20);
  const bot = S(0.70);
  const sw = S(0.075);
  fillRect(img, ex, top, sw, bot - top, hex('#e0a92a'));              // stem
  fillRect(img, ex, top, S(0.30), sw, hex('#e0a92a'));                // top bar
  fillRect(img, ex, (top + bot) / 2 - sw / 2, S(0.24), sw, hex('#e0a92a')); // mid bar
  fillRect(img, ex, bot - sw, S(0.30), sw, hex('#e0a92a'));           // bottom bar
  fillRect(img, ex, bot - sw * 0.42, S(0.30), sw * 0.42, hex('#b3822a')); // underside wash
  fillCircle(img, S(0.60), bot - sw * 0.5, sw * 0.55, hex('#e0a92a')); // full stop
  fillPoly(img, [[S(0.70), S(0.62)], [S(0.84), S(0.62)], [S(0.81), S(0.70)], [S(0.73), S(0.70)]], hex('#2246c6')); // inkwell
  fillEllipse(img, S(0.77), S(0.62), S(0.07), S(0.016), hex('#12122e'));  // ink
  bar(img, S(0.66), S(0.60), S(0.90), S(0.30), S(0.016), hex('#efe0c0')); // quill shaft
  fillPoly(img, blob(S(0.90), S(0.29), S(0.05), { seed: 4, squash: 0.42, points: 16 }), hex('#1fbf7e')); // feather
  // scattered loose type on the desk — letters that lost their word
  const typeCols = ['#e0a92a', '#d6249a', '#2f6fd6', '#1fbf7e', '#e56aa6'];
  const rand = mulberry32(23);
  for (let i = 0; i < 9; i++) {
    const tx = S(0.30) + rand() * S(0.55);
    const ty = S(0.74) + rand() * S(0.18);
    fillRect(img, tx, ty, S(0.03), S(0.04), hex('#efe0c0'));                 // type body
    fillRect(img, tx, ty + S(0.04), S(0.03), S(0.012), hex(typeCols[i % typeCols.length])); // its colour, drained onto the block
  }
  frame(img);
  return img;
}

// Stone 7, the boss — the Sampler itself: a woven field of every jewel colour,
// several of them crossed out in drained grey, threads coming loose at the hem.
function wrongColourDay() {
  const img = createImage(SIZE, SIZE, hex('#0f0a1e'));
  const cols = ['#d6249a', '#2f6fd6', '#1fbf7e', '#e0a92a', '#7a45c0', '#e56aa6'];
  const n = 6;
  const m = S(0.09);
  const cell = (SIZE - 2 * m) / n;
  const rand = mulberry32(41);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      fillRect(img, m + c * cell + 3, m + r * cell + 3, cell - 6, cell - 6, hex(cols[Math.floor(rand() * cols.length)]));
    }
  }
  const grey = hex('#6b6675');
  for (const [r, c] of [[1, 2], [2, 4], [3, 1], [4, 3], [0, 5], [5, 0], [2, 0]]) {
    const x0 = m + c * cell;
    const y0 = m + r * cell;
    bar(img, x0 + cell * 0.16, y0 + cell * 0.16, x0 + cell * 0.84, y0 + cell * 0.84, cell * 0.13, grey);
    bar(img, x0 + cell * 0.84, y0 + cell * 0.16, x0 + cell * 0.16, y0 + cell * 0.84, cell * 0.13, grey);
  }
  for (let i = 0; i < 6; i++) {
    const tx = m + (i + 0.5) * cell;
    bar(img, tx, SIZE - m, tx + (rand() - 0.5) * cell * 0.8, SIZE, cell * 0.09, hex(cols[i % cols.length]));
  }
  frame(img);
  return img;
}

/* ------------------------------------------------------------------- driver */

// A little under the normal 500-cell ceiling and capped hard at 18 tubs, so the
// stones stay chunky and low-fuss, matching the two that shipped before them.
const OPTS = { ...DETAIL_PRESETS.normal, maxColours: 18, strictColours: true };

const SCENES = [
  { id: 'thread-cupboard', title: 'The Thread Cupboard', draw: threadCupboard },
  { id: 'nobodys-red', title: 'Nobody’s Red', draw: nobodysRed },
  { id: 'rhyme-that-stopped', title: 'The Rhyme That Stopped', draw: rhymeThatStopped },
  { id: 'silent-e', title: 'Silent E Has The Last Word', draw: silentE },
  { id: 'wrong-colour-day', title: 'The Wrong-Colour Day', draw: wrongColourDay },
];

fs.mkdirSync(RAW, { recursive: true });

for (const scene of SCENES) {
  const img = scene.draw();
  fs.writeFileSync(path.join(RAW, `${scene.id}.png`), toPNGBuffer(img, PNG));

  const puzzle = buildPuzzle(img.data, img.w, img.h, OPTS);
  const out = writePuzzle(puzzle, scene);

  const areas = puzzle.cells.map((c) => c.a).sort((a, b) => a - b);
  console.log(
    `${scene.title.padEnd(28)} ${String(puzzle.cells.length).padStart(3)} cells  ` +
    `${String(puzzle.palette.length).padStart(2)} tubs  ` +
    `min ${String(areas[0]).padStart(5)}px  median ${String(areas[areas.length >> 1]).padStart(5)}px  ` +
    `${(fs.statSync(out).size / 1024).toFixed(0)}kB`,
  );
}
