#!/usr/bin/env node
// The story-mode stones for chapter one, drawn as flat-colour scenes and run
// through the real mapify pipeline — same route as make-demo-puzzles.mjs, which
// its own header says the pipeline does not care where the pixels came from.
// Authoring the art in code (rather than hand-writing puzzle JSON) buys the
// three geometry invariants the verifier enforces — total tiling, no overlaps,
// anchor-inside-cell — for free.
//
// The look is the David LaChapelle dark-neon-pop brief: theatrical set
// construction out of resin ornaments and jewel-tone cloth, saturated magenta /
// cobalt / emerald with restrained gold, glossy and spacious. That style is
// built from placed solid props rather than texture, which is exactly what flat
// vector can render. These are placeholders with a real shape: when the Flux art
// lands, `npm run mapify -- art.png --id blue-reportedly …` swaps the pixels and
// nothing in story mode changes, because a node names an id, not an image.
//
// Wired into `npm run seed`, so CI regenerates them deterministically on every
// push — which means the draw functions must stay pure (mulberry32 for any
// scatter, never Math.random) and no hand-edit to the emitted JSON survives.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

import {
  createImage, fillRect, fillPoly, fillEllipse, fillCircle,
  blob, toPNGBuffer, mulberry32,
} from './lib/raster.mjs';
import { buildPuzzle, DETAIL_PRESETS } from '../src/pipeline/build.js';
import { writePuzzle } from './mapify.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const RAW = path.join(ROOT, 'puzzles', '_raw');

const hex = (h) => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];

// A deterministic per-square value, so the stitching varies within a band and
// reads as worked by hand rather than printed — without a single Math.random,
// which CI would make non-deterministic.
function hash(c, r) {
  let x = (c * 374761393 + r * 668265263) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}
const pick = (list, c, r) => list[hash(c, r) % list.length];

/**
 * A stitched sampler: the cloth these chapters are worked on, and the whole
 * reason a flat scene becomes hundreds of cells rather than a dozen.
 *
 * `colourAt(c, r)` returns the thread colour (a hex string) of each square.
 * Thread of colour `thread` shows in the gaps between squares, so every square
 * is separated from its neighbours on all four sides — which means two squares
 * the same colour never merge into one region, and the grid hands the pipeline
 * cols×rows cells however smooth the gradient across them. The thread itself is
 * all one connected shape, so it costs a single cell.
 */
function quilt(img, x0, y0, w, h, cols, rows, thread, colourAt) {
  fillRect(img, x0, y0, w, h, thread);
  const cw = w / cols;
  const ch = h / rows;
  const gap = Math.max(5, Math.min(cw, ch) * 0.16);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      fillRect(img, x0 + c * cw + gap, y0 + r * ch + gap, cw - gap * 2, ch - gap * 2, hex(colourAt(c, r)));
    }
  }
}

// Whether a square at normalised (u,v) is inside a rounded-top arch of radius R
// (u and v share a scale, since the images are square). A disc capping a shaft.
function inArch(u, v, cu, topV, R, floorV) {
  if (v > floorV) return false;
  if (v >= topV) return Math.abs(u - cu) < R;
  return Math.hypot(u - cu, v - topV) < R;
}

/* --------------------------------------------------------- Blue, Reportedly */

// The sky over the Sampler, which everyone agrees used to be blue. It is, of
// course, nothing of the sort any more — a cross-stitched field of violet and
// magenta and rose, a gold sun worked into it like a bead-ring, cloud patches,
// scattered star-stitches, and the cloth's own scalloped emerald hem along the
// bottom. The joke and the crisis in one picture: plainly not blue, and everyone
// certain that it was.
function blueReportedly() {
  const S = 1100;
  const COLS = 16;
  const ROWS = 16;

  const BANDS = [
    ['#3a1d6e', '#432a84', '#331a63'], // top, deep violet
    ['#5a2585', '#6a2f9a', '#4d2178'],
    ['#8a2484', '#a72491', '#7c2076'],
    ['#c0247a', '#c74a86', '#a92072'],
    ['#d24a90', '#e05a9a', '#c74a86'],
    ['#e97fa4', '#f090ac', '#e0669a'], // just above the hem
  ];
  const bandFor = (v) => BANDS[Math.min(BANDS.length - 1, Math.floor(v / 0.135))];

  // Sun, cloud and star motifs, all in normalised uv so the grid resolution can
  // change without moving them.
  const clouds = [[0.22, 0.5, 0.14], [0.78, 0.44, 0.1]];
  const stars = new Set(['2,2', '5,1', '11,3', '13,6', '3,7', '9,2']);

  const img = createImage(S, S, hex('#241046'));
  quilt(img, 0, 0, S, S, COLS, ROWS, '#241046', (c, r) => {
    const u = (c + 0.5) / COLS;
    const v = (r + 0.5) / ROWS;

    // The cloth's hem: an emerald band scalloped with magenta, gold stitch dots.
    if (v >= 0.84) {
      if (r === ROWS - 1) return c % 2 ? '#b8246e' : '#f0c66b';
      return c % 3 === 1 ? '#b8246e' : '#1f7a5a';
    }
    if (stars.has(`${c},${r}`)) return '#f4d888';

    // The sun, reportedly — concentric rings like a resin bead.
    const sd = Math.hypot(u - 0.66, v - 0.28);
    if (sd < 0.05) return '#fbeeba';
    if (sd < 0.09) return pick(['#f4d888', '#f0c66b'], c, r);
    if (sd < 0.12) return '#e7b24a';
    if (sd < 0.145) return '#2f6fd6';

    for (const [cu, cv, cr] of clouds) {
      if (Math.hypot(u - cu, v - cv) < cr) return pick(['#b877cd', '#a86cc8', '#c98ad6'], c, r);
    }

    return pick(bandFor(v), c, r);
  });

  return img;
}

/* --------------------------------------------------------------- Ee's Doorway */

// The arch the old letter came in by. Mind the step; it is shorter than it was.
// A baroque doorway stitched into a denser sampler: gold-thread arch over a
// magenta wall, a warm glow worked through the opening, draped cobalt pilasters,
// luminous flora in the lower corners — and at its foot the step, one course
// short on the right, which is the whole joke and the whole grief.
function eesDoorway() {
  const S = 1400;
  const COLS = 22;
  const ROWS = 22;

  const cu = 0.5;
  const topV = 0.24;
  const innerR = 0.15;
  const outerR = 0.2;
  const floorV = 0.8;

  const WALL = ['#7a1f5e', '#8a2a6c', '#6a1a52'];
  const GLOW = ['#f7e6ad', '#f4cf72', '#f0c66b'];

  const img = createImage(S, S, hex('#5c1748'));
  quilt(img, 0, 0, S, S, COLS, ROWS, '#3a0f30', (c, r) => {
    const u = (c + 0.5) / COLS;
    const v = (r + 0.5) / ROWS;

    // The floor, and the short step. The left half carries the full two courses;
    // the right half is a course shy — it stops early, and below it is only floor.
    if (v >= floorV) {
      const onStep = Math.abs(u - cu) < innerR + 0.04;
      if (onStep) {
        if (v < 0.85) return pick(['#b8246e', '#9a2a72'], c, r);
        if (v < 0.9 && u < cu) return '#9a2a72'; // the long (left) course only
      }
      return c % 5 === 0 ? '#45183c' : '#2a0f26';
    }

    // The opening: a warm glow, brightest at its heart.
    if (inArch(u, v, cu, topV, innerR - 0.02, floorV)) {
      const d = Math.hypot(u - cu, v - 0.5);
      if (d < 0.12) return '#fbeeba';
      return pick(GLOW, c, r);
    }
    // The gold inlay frame.
    if (inArch(u, v, cu, topV, outerR, floorV)) {
      return pick(['#e7b24a', '#d9a441', '#f4cf72'], c, r);
    }

    // Keystone bead, sitting on the crown of the arch.
    if (Math.hypot(u - cu, v - (topV - outerR)) < 0.04) return '#b8246e';

    // Draped cobalt pilasters flanking the opening.
    if (v > 0.16 && v < floorV && (Math.abs(u - 0.28) < 0.035 || Math.abs(u - 0.72) < 0.035)) {
      return pick(['#1f47a0', '#3a6fd0', '#143079'], c, r);
    }

    // Luminous flora worked into the lower corners.
    for (const fu of [0.12, 0.88]) {
      if (Math.hypot(u - fu, v - 0.7) < 0.075) return pick(['#1f8a5c', '#36a86a', '#e97fa4'], c, r);
    }

    // A crown band along the top.
    if (v < 0.12) return pick(['#5c1748', '#4a123a'], c, r);
    return pick(WALL, c, r);
  });

  return img;
}

/* ------------------------------------------------------------------- driver */

const SCENES = [
  { id: 'blue-reportedly', title: 'Blue, Reportedly', draw: blueReportedly, opts: DETAIL_PRESETS.normal },
  { id: 'ees-doorway', title: 'Ee’s Doorway', draw: eesDoorway, opts: DETAIL_PRESETS.detailed },
];

fs.mkdirSync(RAW, { recursive: true });

for (const scene of SCENES) {
  const img = scene.draw();
  fs.writeFileSync(path.join(RAW, `${scene.id}.png`), toPNGBuffer(img, PNG));

  // crop:false — these are full-bleed by construction, and the border trim
  // would eat the top sky band, which is uniform across the width.
  const puzzle = buildPuzzle(img.data, img.w, img.h, { ...scene.opts, crop: false });
  const out = writePuzzle(puzzle, scene);

  const areas = puzzle.cells.map((c) => c.a).sort((a, b) => a - b);
  console.log(
    `${scene.title.padEnd(16)} ${String(puzzle.cells.length).padStart(3)} cells  ` +
    `${String(puzzle.palette.length).padStart(2)} tubs  ` +
    `min ${String(areas[0]).padStart(5)}px  median ${String(areas[areas.length >> 1]).padStart(5)}px  ` +
    `${(fs.statSync(out).size / 1024).toFixed(0)}kB`,
  );
}
