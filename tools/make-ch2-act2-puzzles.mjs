#!/usr/bin/env node
// Bakes PLACEHOLDER art for chapter two, act two's five stones, so the act is
// playable (in dev mode) the moment it is wired. These are flat scenes in the
// act's "nightcut" register — the colour has gone OUT of the world: solid
// blacks, a few carved greys, white, and exactly one warm light per picture
// (the thing somebody left on). A deliberate turn away from Act I's jewel
// greens. They run through the same mapify pipeline a photograph would. Swap
// any of them for real generated art whenever it is ready:
//
//   npm run mapify -- art.png --id last-lit-window --title "The Last Lit Window"
//
// and nothing in story mode changes — the stone names an id, not an image.
//
// Deliberately NOT in the `seed` chain, exactly like make-ch2-puzzles.mjs: the
// five outputs are committed static JSON, and a stray `npm run seed` must never
// overwrite whichever ones have been replaced with real art. Run this by hand,
// once, and commit the result.
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

// The nightcut register — carved darkness. One coherent grey ramp the five
// scenes share, so they quantise to a legible dozen-ish tubs and read as one
// road; and ONE warm light, the only colour left anywhere.
const BLACK = '#070708';    // the dark the world went
const SOOT = '#141416';     // near-black
const COAL = '#232326';     // deep grey
const SLATE = '#3a3a3f';    // mid-dark grey
const STONE = '#5c5c63';    // mid grey
const ASH = '#8a8a91';      // light grey
const PALE = '#bdbdc3';     // pale grey
const CHALK = '#e8e8ec';    // off-white
const WHITE = '#fbfbfd';    // the carved white
const LAMP = '#f2b544';     // the one warm light
const EMBER = '#c7801f';    // its deeper edge
const GLOW = '#fff0c2';     // its hot core

// A rectangle running from a→b at a given width, as a four-point polygon.
function bar(img, ax, ay, bx, by, w, colour) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const px = (-dy / len) * (w / 2);
  const py = (dx / len) * (w / 2);
  fillPoly(img, [[ax + px, ay + py], [ax - px, ay - py], [bx - px, by - py], [bx + px, by + py]], colour);
}

// Sparse stars: the one thing the dark road still has plenty of. Small, so they
// become small cells and give each flat sky a scatter of quick fills.
function stars(img, seed, n, yMax) {
  const rand = mulberry32(seed);
  for (let i = 0; i < n; i++) {
    const x = S(0.06) + rand() * S(0.88);
    const y = S(0.06) + rand() * S(yMax);
    fillCircle(img, x, y, S(0.004 + rand() * 0.006), hex(i % 3 ? PALE : CHALK));
  }
}

// A carved border — a row of small alternating grey tiles down every edge, a
// pale rule, white corners. As in the Act I tool its real job is the forty-odd
// small cells it adds so these flat scenes don't quantise down to a dozen
// regions and paint in a blink. Drawn last, over the scene's edges.
function frame(img) {
  const b = S(0.058);
  const tiles = [SLATE, ASH, STONE, PALE, COAL, CHALK];
  const dark = hex(SOOT);
  fillRect(img, 0, 0, SIZE, b, dark);
  fillRect(img, 0, SIZE - b, SIZE, b, dark);
  fillRect(img, 0, 0, b, SIZE, dark);
  fillRect(img, SIZE - b, 0, b, SIZE, dark);
  const g = hex(ASH);
  fillRect(img, b, b, SIZE - 2 * b, S(0.007), g);
  fillRect(img, b, SIZE - b - S(0.007), SIZE - 2 * b, S(0.007), g);
  fillRect(img, b, b, S(0.007), SIZE - 2 * b, g);
  fillRect(img, SIZE - b - S(0.007), b, S(0.007), SIZE - 2 * b, g);
  const nt = 13;
  const tw = (SIZE - 2 * b) / nt;
  for (let i = 0; i < nt; i++) {
    const x = b + i * tw + tw * 0.22;
    fillRect(img, x, S(0.016), tw * 0.56, b - S(0.032), hex(tiles[i % tiles.length]));
    fillRect(img, x, SIZE - b + S(0.016), tw * 0.56, b - S(0.032), hex(tiles[(i + 2) % tiles.length]));
  }
  const nv = 11;
  const th = (SIZE - 2 * b) / nv;
  for (let i = 0; i < nv; i++) {
    const y = b + i * th + th * 0.22;
    fillRect(img, S(0.016), y, b - S(0.032), th * 0.56, hex(tiles[(i + 1) % tiles.length]));
    fillRect(img, SIZE - b + S(0.016), y, b - S(0.032), th * 0.56, hex(tiles[(i + 3) % tiles.length]));
  }
  for (const [cx, cy] of [[0, 0], [SIZE - b, 0], [0, SIZE - b], [SIZE - b, SIZE - b]]) {
    fillRect(img, cx, cy, b, b, hex(COAL));
    fillCircle(img, cx + b / 2, cy + b / 2, b * 0.3, hex(WHITE));
    fillCircle(img, cx + b / 2, cy + b / 2, b * 0.13, hex(SLATE));
  }
}

/* ------------------------------------------------------------------ scenes */

// Stone 1 — a signpost at a fork in the black road. Its arms still point; the
// boards are blank. The one light is the lantern hung off its top.
function signpostThatPoints() {
  const img = createImage(SIZE, SIZE, hex(BLACK));
  stars(img, 7, 26, 0.5);
  // a low horizon of hills, grey on black
  fillPoly(img, [[0, S(0.66)], [S(0.18), S(0.56)], [S(0.38), S(0.63)], [S(0.6), S(0.54)], [S(0.82), S(0.62)], [SIZE, S(0.58)], [SIZE, S(0.72)], [0, S(0.72)]], hex(COAL));
  fillRect(img, 0, S(0.70), SIZE, S(0.30), hex(SOOT)); // ground
  // the road forking away in two pale ribbons
  fillPoly(img, [[S(0.44), SIZE], [S(0.56), SIZE], [S(0.52), S(0.72)], [S(0.48), S(0.72)]], hex(SLATE));
  fillPoly(img, [[S(0.48), S(0.74)], [S(0.52), S(0.74)], [S(0.14), S(0.66)], [S(0.10), S(0.68)]], hex(STONE));
  fillPoly(img, [[S(0.48), S(0.74)], [S(0.52), S(0.74)], [S(0.90), S(0.68)], [S(0.86), S(0.66)]], hex(STONE));
  // the post
  const px = S(0.5);
  bar(img, px, S(0.80), px, S(0.18), S(0.05), hex(ASH));
  bar(img, px - S(0.012), S(0.80), px - S(0.012), S(0.18), S(0.014), hex(STONE)); // shade
  // three pointing boards, each a blank pale arrow with no word on it
  const board = (y, dir, len) => {
    const x0 = px + dir * S(0.02);
    const x1 = px + dir * (S(0.02) + len);
    fillRect(img, Math.min(x0, x1), y - S(0.04), Math.abs(x1 - x0), S(0.08), hex(PALE));
    fillPoly(img, [[x1, y - S(0.04)], [x1 + dir * S(0.05), y], [x1, y + S(0.04)]], hex(PALE));
    fillRect(img, Math.min(x0, x1) + S(0.02), y - S(0.012), Math.abs(x1 - x0) - S(0.04), S(0.024), hex(CHALK)); // where a word would go
  };
  board(S(0.30), 1, S(0.22));
  board(S(0.42), -1, S(0.26));
  board(S(0.54), 1, S(0.17));
  // the lantern hung off the top
  bar(img, px, S(0.18), px + S(0.09), S(0.14), S(0.02), hex(ASH));
  bar(img, px + S(0.09), S(0.14), px + S(0.09), S(0.21), S(0.012), hex(STONE));
  fillRect(img, px + S(0.055), S(0.21), S(0.07), S(0.09), hex(EMBER));
  fillRect(img, px + S(0.065), S(0.225), S(0.05), S(0.06), hex(LAMP));
  fillCircle(img, px + S(0.09), S(0.255), S(0.016), hex(GLOW));
  // a pool of its light on the ground, faint
  fillEllipse(img, px + S(0.09), S(0.79), S(0.14), S(0.035), hex(COAL));
  frame(img);
  return img;
}

// Stone 2 — a whole black street of houses, every window dark but one.
function lastLitWindow() {
  const img = createImage(SIZE, SIZE, hex(BLACK));
  stars(img, 11, 18, 0.3);
  fillRect(img, 0, S(0.80), SIZE, S(0.20), hex(SOOT)); // the street
  fillRect(img, 0, S(0.80), SIZE, S(0.012), hex(SLATE)); // kerb
  // a terrace of five houses, stepped roofs, carved in greys
  const houses = [
    { x: 0.04, w: 0.19, top: 0.36, tone: COAL },
    { x: 0.23, w: 0.18, top: 0.30, tone: SLATE },
    { x: 0.41, w: 0.20, top: 0.26, tone: COAL },
    { x: 0.61, w: 0.17, top: 0.33, tone: SLATE },
    { x: 0.78, w: 0.18, top: 0.38, tone: COAL },
  ];
  houses.forEach((h, hi) => {
    const x = S(h.x);
    const w = S(h.w);
    const top = S(h.top);
    fillRect(img, x, top, w, S(0.80) - top, hex(h.tone));
    // roof
    fillPoly(img, [[x - S(0.01), top], [x + w / 2, top - S(0.09)], [x + w + S(0.01), top]], hex(STONE));
    // a chimney on the odd ones
    if (hi % 2) fillRect(img, x + w * 0.68, top - S(0.13), S(0.03), S(0.08), hex(STONE));
    // door
    fillRect(img, x + w * 0.4, S(0.70), w * 0.2, S(0.10), hex(SOOT));
    // two rows of dark windows
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 2; c++) {
        const wx = x + w * (0.18 + c * 0.46);
        const wy = top + S(0.06) + r * S(0.16);
        fillRect(img, wx, wy, w * 0.18, S(0.10), hex(SOOT));
        fillRect(img, wx + w * 0.02, wy + S(0.015), w * 0.14, S(0.07), hex(hi % 2 ? COAL : SLATE));
      }
    }
  });
  // THE window — middle house, upper left pane, lit
  const h = houses[2];
  const wx = S(h.x) + S(h.w) * 0.18;
  const wy = S(h.top) + S(0.06);
  fillRect(img, wx, wy, S(h.w) * 0.18, S(0.10), hex(EMBER));
  fillRect(img, wx + S(h.w) * 0.02, wy + S(0.015), S(h.w) * 0.14, S(0.07), hex(LAMP));
  fillCircle(img, wx + S(h.w) * 0.09, wy + S(0.05), S(0.014), hex(GLOW));
  // its faint spill on the wall below
  fillRect(img, wx - S(0.01), wy + S(0.10), S(h.w) * 0.2, S(0.02), hex(STONE));
  // a lamp-post, unlit, at the kerb
  bar(img, S(0.90), S(0.80), S(0.90), S(0.50), S(0.018), hex(ASH));
  fillRect(img, S(0.875), S(0.46), S(0.05), S(0.05), hex(SLATE));
  frame(img);
  return img;
}

// Stone 3 — a stone bridge over black water that STOPS halfway across. The
// one light is a lantern on the last finished pier.
function halfBridge() {
  const img = createImage(SIZE, SIZE, hex(BLACK));
  stars(img, 23, 22, 0.42);
  // far bank, a dark shelf
  fillRect(img, S(0.78), S(0.48), S(0.22), S(0.10), hex(COAL));
  // the water
  fillRect(img, 0, S(0.58), SIZE, S(0.42), hex(SOOT));
  // ripples of pale grey across it
  for (let i = 0; i < 9; i++) {
    const y = S(0.63 + i * 0.038);
    const x = S(0.08 + (i % 3) * 0.12);
    bar(img, x, y, x + S(0.22 + (i % 2) * 0.1), y, S(0.008), hex(i % 2 ? SLATE : STONE));
  }
  // near bank
  fillPoly(img, [[0, S(0.46)], [S(0.22), S(0.50)], [S(0.22), SIZE], [0, SIZE]], hex(COAL));
  // the deck, running from the near bank and stopping
  const deckY = S(0.44);
  fillRect(img, S(0.12), deckY, S(0.44), S(0.05), hex(ASH));
  fillRect(img, S(0.12), deckY + S(0.05), S(0.44), S(0.02), hex(STONE));
  // parapet
  fillRect(img, S(0.12), deckY - S(0.035), S(0.44), S(0.035), hex(PALE));
  // three arches and piers, the last pier bare with no arch after it
  for (let i = 0; i < 3; i++) {
    const ax = S(0.16 + i * 0.14);
    fillRect(img, ax, deckY + S(0.07), S(0.06), S(0.22), hex(SLATE)); // pier
    fillEllipse(img, ax + S(0.10), deckY + S(0.07), S(0.045), S(0.12), hex(BLACK)); // the arch void
  }
  fillRect(img, S(0.52), deckY + S(0.07), S(0.05), S(0.24), hex(SLATE)); // the last pier
  // the ragged stopped end — a few loose blocks
  fillRect(img, S(0.56), deckY + S(0.005), S(0.04), S(0.035), hex(ASH));
  fillRect(img, S(0.57), deckY - S(0.03), S(0.03), S(0.03), hex(PALE));
  fillRect(img, S(0.60), deckY + S(0.02), S(0.025), S(0.025), hex(STONE));
  // the lantern on the last pier
  bar(img, S(0.545), deckY - S(0.035), S(0.545), deckY - S(0.14), S(0.014), hex(ASH));
  fillRect(img, S(0.515), deckY - S(0.21), S(0.06), S(0.075), hex(EMBER));
  fillRect(img, S(0.523), deckY - S(0.198), S(0.044), S(0.05), hex(LAMP));
  fillCircle(img, S(0.545), deckY - S(0.172), S(0.013), hex(GLOW));
  // its reflection, broken, in the water
  for (let i = 0; i < 3; i++) {
    bar(img, S(0.53), S(0.66 + i * 0.05), S(0.56), S(0.66 + i * 0.05), S(0.012), hex(i ? EMBER : LAMP));
  }
  frame(img);
  return img;
}

// Stone 4 — a stone well in a clearing, a bucket on its rope, the one light a
// candle set on its rim. Rings of grey spread from it like an echo.
function wellOfEchoes() {
  const img = createImage(SIZE, SIZE, hex(BLACK));
  stars(img, 31, 20, 0.35);
  const cx = S(0.5);
  const cy = S(0.62);
  // echo rings on the ground, concentric, darker outward
  for (const [tone, r] of [[COAL, 0.46], [SOOT, 0.40], [COAL, 0.33], [SLATE, 0.26], [COAL, 0.20]]) {
    fillEllipse(img, cx, cy + S(0.10), S(r), S(r) * 0.42, hex(tone));
  }
  // the well's shaft — a dark oval we look down into
  fillEllipse(img, cx, cy, S(0.17), S(0.07), hex(BLACK));
  // the rim: a ring of stones
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const sx = cx + Math.cos(a) * S(0.18);
    const sy = cy + Math.sin(a) * S(0.075);
    fillPoly(img, blob(sx, sy, S(0.034), { seed: 50 + i, wobble: 0.2, points: 10, squash: 0.7 }), hex(i % 2 ? STONE : ASH));
  }
  // the frame over it and the windlass
  bar(img, cx - S(0.16), cy, cx - S(0.16), cy - S(0.34), S(0.025), hex(SLATE));
  bar(img, cx + S(0.16), cy, cx + S(0.16), cy - S(0.34), S(0.025), hex(SLATE));
  fillPoly(img, [[cx - S(0.20), cy - S(0.34)], [cx, cy - S(0.44)], [cx + S(0.20), cy - S(0.34)], [cx + S(0.20), cy - S(0.31)], [cx, cy - S(0.41)], [cx - S(0.20), cy - S(0.31)]], hex(STONE));
  bar(img, cx - S(0.16), cy - S(0.27), cx + S(0.16), cy - S(0.27), S(0.03), hex(ASH)); // the roller
  bar(img, cx, cy - S(0.27), cx, cy - S(0.06), S(0.008), hex(PALE)); // the rope
  // the bucket, hanging
  fillPoly(img, [[cx - S(0.045), cy - S(0.06)], [cx + S(0.045), cy - S(0.06)], [cx + S(0.035), cy + S(0.01)], [cx - S(0.035), cy + S(0.01)]], hex(ASH));
  fillRect(img, cx - S(0.045), cy - S(0.065), S(0.09), S(0.012), hex(PALE));
  // the candle on the rim, front right
  fillRect(img, cx + S(0.10), cy + S(0.04), S(0.022), S(0.06), hex(CHALK));
  fillEllipse(img, cx + S(0.111), cy + S(0.028), S(0.016), S(0.026), hex(LAMP));
  fillCircle(img, cx + S(0.111), cy + S(0.032), S(0.007), hex(GLOW));
  fillEllipse(img, cx + S(0.111), cy + S(0.105), S(0.05), S(0.012), hex(EMBER)); // its pool
  frame(img);
  return img;
}

// Stone 5, the chapter boss — The Fade. A form with every line blank: rows of
// low flat lines where words should be, one of them starting to fill in. The
// one light is the pen-nib's worth of lamp at the top, barely there.
function theFade() {
  const img = createImage(SIZE, SIZE, hex(BLACK));
  // the page, a pale sheet in the dark, slightly askew
  fillPoly(img, [[S(0.16), S(0.12)], [S(0.85), S(0.10)], [S(0.86), S(0.90)], [S(0.15), S(0.92)]], hex(CHALK));
  fillPoly(img, [[S(0.17), S(0.13)], [S(0.84), S(0.11)], [S(0.85), S(0.89)], [S(0.16), S(0.91)]], hex(WHITE));
  // the blank lines, rows of them, each a low flat bar
  for (let r = 0; r < 9; r++) {
    const y = S(0.22 + r * 0.075);
    const lead = S(0.22 + (r % 3) * 0.06);
    fillRect(img, lead, y, S(0.06), S(0.012), hex(ASH)); // the label stub
    fillRect(img, lead + S(0.08), y, S(0.78) - lead - S(0.02), S(0.012), hex(SLATE)); // the blank
  }
  // one line part-filled: the word that got started
  fillRect(img, S(0.30), S(0.355), S(0.16), S(0.028), hex(COAL));
  fillRect(img, S(0.30), S(0.355), S(0.03), S(0.028), hex(SOOT));
  fillRect(img, S(0.35), S(0.355), S(0.02), S(0.028), hex(SOOT));
  fillRect(img, S(0.39), S(0.355), S(0.025), S(0.028), hex(SOOT));
  // the Fade itself: a long low bar lying across the bottom of the page, the
  // blank line made flesh, with two small dark eyes set in it
  fillRect(img, S(0.22), S(0.80), S(0.56), S(0.035), hex(STONE));
  fillRect(img, S(0.22), S(0.80), S(0.56), S(0.010), hex(ASH));
  fillCircle(img, S(0.44), S(0.818), S(0.009), hex(BLACK));
  fillCircle(img, S(0.56), S(0.818), S(0.009), hex(BLACK));
  // the pen, laid down mid-word, and the nib's worth of light
  bar(img, S(0.62), S(0.42), S(0.80), S(0.30), S(0.022), hex(COAL));
  bar(img, S(0.62), S(0.42), S(0.65), S(0.405), S(0.014), hex(PALE)); // the nib
  fillCircle(img, S(0.615), S(0.425), S(0.012), hex(LAMP));
  fillCircle(img, S(0.615), S(0.425), S(0.005), hex(GLOW));
  // the dark pressing in at the page's corners
  for (const [x, y] of [[0.17, 0.13], [0.84, 0.11], [0.85, 0.89], [0.16, 0.91]]) {
    fillPoly(img, blob(S(x), S(y), S(0.09), { seed: 70 + Math.round(x * 10), wobble: 0.3, points: 14 }), hex(SOOT));
  }
  frame(img);
  return img;
}

/* ------------------------------------------------------------------- driver */

// A little under the normal 500-cell ceiling and capped hard at 18 tubs, so the
// stones stay chunky and low-fuss, matching the rest of the chapter's.
const OPTS = { ...DETAIL_PRESETS.normal, maxColours: 18, strictColours: true };

const SCENES = [
  { id: 'signpost-that-points', title: 'The Signpost That Points', draw: signpostThatPoints },
  { id: 'last-lit-window', title: 'The Last Lit Window', draw: lastLitWindow },
  { id: 'half-bridge', title: 'The Half-Bridge', draw: halfBridge },
  { id: 'well-of-echoes', title: 'The Well of Echoes', draw: wellOfEchoes },
  { id: 'the-fade', title: 'The Fade', draw: theFade },
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
