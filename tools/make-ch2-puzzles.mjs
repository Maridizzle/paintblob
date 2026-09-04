#!/usr/bin/env node
// Bakes PLACEHOLDER art for chapter two, act one's five stones, so the act is
// playable the moment it ships. These are flat scenes in the chapter's new
// "bloom" register — a bioluminescent jungle at dusk: jewel GREENS above all
// (deep forest shadow, emerald, jade, acid lime, teal) with gold light-source
// accents and the odd violet / magenta glint. A deliberate turn away from
// chapter one's magenta / cobalt. They run through the same mapify pipeline a
// photograph would. Swap any of them for real generated art whenever it is
// ready:
//
//   npm run mapify -- art.png --id dusk-gate --title "The Dusk Gate"
//
// and nothing in story mode changes — the stone names an id, not an image.
//
// Deliberately NOT in the `seed` chain, exactly like make-story-puzzles.mjs:
// the five outputs are committed static JSON, and a stray `npm run seed` must
// never overwrite whichever ones have been replaced with real art. Run this by
// hand, once, and commit the result.

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

// The bloom register — one coherent green-forward set the five scenes share, so
// they quantise to a legible dozen-ish tubs and read as one place.
const GROUND = '#08130d';   // forest-floor green-black
const SHADOW = '#0c2417';   // deep forest shadow
const FOREST = '#123a26';   // forest green
const MOSS = '#1a7346';     // moss
const EMERALD = '#22a05c';  // emerald
const JADE = '#2fc47a';     // jade
const SPRING = '#54d888';   // spring green
const LIME = '#9be84f';     // acid lime
const TEAL = '#159e8e';     // teal
const AQUA = '#1abfa8';     // bright teal / aqua
const DEEPTEAL = '#0d5f52'; // deep teal
const GOLD = '#e0a92a';     // gold light-source
const AMBER = '#f4c94c';    // warm amber
const GLOW = '#ffe89a';     // bright core
const VIOLET = '#7a45c0';   // violet glint
const MAGENTA = '#c94fb0';  // magenta glint
const GREY = '#6b6f6a';     // drained / hoarded grey

// A rectangle running from a→b at a given width, as a four-point polygon — every
// stem, vine, cord, vein, claw-talon and grey crossing is built from it.
function bar(img, ax, ay, bx, by, w, colour) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const px = (-dy / len) * (w / 2);
  const py = (dx / len) * (w / 2);
  fillPoly(img, [[ax + px, ay + py], [ax - px, ay - py], [bx - px, by - py], [bx + px, by + py]], colour);
}

// A leaf: a rotatable almond drawn as a simple four-point diamond, long axis at
// `ang`. Placeholder-simple and always convex, so it can never trace to a
// self-crossing region. The workhorse of every scene here.
function leaf(img, cx, cy, len, wid, ang, colour) {
  const ax = Math.cos(ang);
  const ay = Math.sin(ang);
  const px = -ay;
  const py = ax;
  fillPoly(img, [
    [cx + ax * len * 0.5, cy + ay * len * 0.5],   // tip
    [cx + px * wid * 0.5, cy + py * wid * 0.5],   // one shoulder
    [cx - ax * len * 0.5, cy - ay * len * 0.5],   // base
    [cx - px * wid * 0.5, cy - py * wid * 0.5],   // other shoulder
  ], colour);
}

// A midrib down a leaf, a shade darker — a little extra structure and a couple
// more cells per cluster.
function vein(img, cx, cy, len, ang, colour) {
  const ax = Math.cos(ang);
  const ay = Math.sin(ang);
  bar(img, cx + ax * len * 0.42, cy + ay * len * 0.42, cx - ax * len * 0.36, cy - ay * len * 0.36, S(0.006), colour);
}

// A capped thread-spool, one jewel colour to a spool — the unit of the hoard,
// borrowed from chapter one's Thread Cupboard.
function spool(img, cx, top, w, h, colour) {
  fillRect(img, cx - w / 2, top, w, S(0.016), hex('#d9b24a'));                 // top cap
  fillRect(img, cx - w / 2, top + h - S(0.016), w, S(0.016), hex('#d9b24a')); // bottom cap
  fillRect(img, cx - w / 2, top + S(0.016), w, h - S(0.032), colour);          // wound thread
  fillRect(img, cx - w / 2, top + S(0.016), S(0.012), h - S(0.032), hex(SHADOW)); // spindle shadow
}

// A drained spool struck through in grey — the boss's mark, echoing the
// crossed-out grey cells of chapter one's Wrong-Colour Day.
function struckGrey(img, cx, top, w, h) {
  spool(img, cx, top, w, h, hex(GREY));
  const dk = hex('#4a4d49');
  bar(img, cx - w * 0.6, top + h * 0.16, cx + w * 0.6, top + h * 0.9, S(0.011), dk);
  bar(img, cx + w * 0.6, top + h * 0.16, cx - w * 0.6, top + h * 0.9, S(0.011), dk);
}

// An ornate beaded border — a row of small alternating jewel tiles down every
// edge, a gold rule, jewelled corners. Recoloured to the bloom register but,
// as in the story tool, its real job is the forty-odd small cells it adds so
// these flat scenes don't quantise down to a dozen regions and paint in a
// blink. Drawn last, over the scene's edges, so content can run to the margins.
function frame(img) {
  const b = S(0.058);
  const jewel = [EMERALD, TEAL, LIME, GOLD, JADE, VIOLET];
  const dark = hex('#06110b');
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
    fillRect(img, cx, cy, b, b, hex(FOREST));
    fillCircle(img, cx + b / 2, cy + b / 2, b * 0.3, hex(GOLD));
    fillCircle(img, cx + b / 2, cy + b / 2, b * 0.13, hex(LIME));
  }
}

/* ------------------------------------------------------------------ scenes */

// Stone 1 — the way out of the Sampler and into the wild: an archway of vines
// and leaves opening onto a glowing beyond.
function duskGate() {
  const img = createImage(SIZE, SIZE, hex(GROUND));
  fillRect(img, 0, S(0.82), SIZE, S(0.18), hex(SHADOW)); // forest floor
  const cx = S(0.5);
  // the glowing beyond — a rounded-top opening, nested light rings brightening
  // toward a hot centre.
  const bot = S(0.86);
  const arcs = [
    [DEEPTEAL, 0.215, 0.225], [TEAL, 0.185, 0.245], [EMERALD, 0.155, 0.265],
    [JADE, 0.125, 0.285], [LIME, 0.095, 0.305], [AMBER, 0.064, 0.325], [GLOW, 0.036, 0.345],
  ];
  for (const [col, hw, ty] of arcs) {
    fillRect(img, cx - S(hw), S(ty), S(hw) * 2, bot - S(ty), hex(col));
    fillEllipse(img, cx, S(ty), S(hw), S(hw) * 0.95, hex(col));
  }
  // fireflies drifting in the opening
  const rand = mulberry32(101);
  for (let i = 0; i < 9; i++) {
    const fx = cx + (rand() - 0.5) * S(0.20);
    const fy = S(0.40) + rand() * S(0.40);
    fillCircle(img, fx, fy, S(0.011 + rand() * 0.006), hex(i % 2 ? GLOW : AMBER));
  }
  // the archway of leaves over the top, splayed radially
  const ay = S(0.50);
  const R = S(0.30);
  const leafCols = [MOSS, EMERALD, JADE, SPRING, TEAL, AQUA];
  const nTop = 15;
  for (let i = 0; i <= nTop; i++) {
    const ang = Math.PI + (i / nTop) * Math.PI;        // PI..2PI, up over the top
    const lx = cx + Math.cos(ang) * R;
    const ly = ay + Math.sin(ang) * R * 0.98;
    const col = leafCols[i % leafCols.length];
    leaf(img, lx, ly, S(0.115), S(0.052), ang, hex(col));
    if (i % 2) vein(img, lx, ly, S(0.115), ang, hex(FOREST));
  }
  // vine pillars down each side, leaves splaying outward
  for (let i = 0; i < 6; i++) {
    const py = S(0.52) + i * S(0.052);
    const colL = leafCols[(i + 2) % leafCols.length];
    const colR = leafCols[(i + 4) % leafCols.length];
    leaf(img, S(0.205), py, S(0.10), S(0.048), Math.PI + 0.35, hex(colL));
    leaf(img, S(0.795), py, S(0.10), S(0.048), -0.35, hex(colR));
  }
  // grass tufts on the floor
  for (let i = 0; i < 7; i++) {
    const gx = S(0.10) + i * S(0.12);
    leaf(img, gx, S(0.90), S(0.09), S(0.03), -Math.PI / 2 + (i % 2 ? 0.2 : -0.2), hex(i % 2 ? MOSS : EMERALD));
  }
  frame(img);
  return img;
}

// Stone 2 — a path receding between banks of glowing vines and leaves, a lit
// clearing waiting at the vanishing point.
function glowvinePath() {
  const img = createImage(SIZE, SIZE, hex(GROUND));
  const cx = S(0.5);
  const topY = S(0.44);
  const botY = SIZE;
  // path edges, interpolated by depth t (0 at the far clearing, 1 at our feet)
  const leftX = (t) => S(0.47) + (S(0.27) - S(0.47)) * t;
  const rightX = (t) => S(0.53) + (S(0.73) - S(0.53)) * t;
  const yAt = (t) => topY + (botY - topY) * t;
  // the path itself
  fillPoly(img, [[leftX(0), yAt(0)], [rightX(0), yAt(0)], [rightX(1), yAt(1)], [leftX(1), yAt(1)]], hex(FOREST));
  // lit flagstone rungs, alternating tone, receding
  const rungCols = [MOSS, DEEPTEAL];
  for (let i = 0; i < 8; i++) {
    const t0 = i / 8;
    const t1 = (i + 0.62) / 8;
    fillPoly(img, [
      [leftX(t0), yAt(t0)], [rightX(t0), yAt(t0)],
      [rightX(t1), yAt(t1)], [leftX(t1), yAt(t1)],
    ], hex(rungCols[i % rungCols.length]));
  }
  // the clearing glow at the vanishing point
  const glow = [[DEEPTEAL, 0.075], [TEAL, 0.058], [EMERALD, 0.044], [JADE, 0.032], [LIME, 0.021], [AMBER, 0.013], [GLOW, 0.007]];
  for (const [col, r] of glow) fillCircle(img, cx, topY, S(r), hex(col));
  // banks of leaves down both sides, larger as they near us
  const leafCols = [MOSS, EMERALD, JADE, SPRING, TEAL, AQUA];
  for (let d = 0; d < 6; d++) {
    const t = 0.14 + d * 0.16;
    const scale = 0.5 + t * 1.1;
    const y = yAt(t);
    for (const side of [-1, 1]) {
      const edge = side < 0 ? leftX(t) : rightX(t);
      const bx = edge + side * S(0.02) * scale;
      const base = side < 0 ? Math.PI : 0;
      leaf(img, bx, y, S(0.075) * scale, S(0.036) * scale, base + side * 0.4, hex(leafCols[(d + (side < 0 ? 0 : 3)) % leafCols.length]));
      leaf(img, bx - side * S(0.03) * scale, y - S(0.03) * scale, S(0.06) * scale, S(0.03) * scale, base + side * 0.9, hex(leafCols[(d + (side < 0 ? 2 : 4)) % leafCols.length]));
      // a firefly hanging over the bank
      fillCircle(img, edge + side * S(0.075) * scale, y - S(0.05) * scale, S(0.01) * scale, hex(d % 2 ? GLOW : AMBER));
    }
  }
  frame(img);
  return img;
}

// Stone 3 — a mandala clearing: leaves and petals thrown into radial symmetry
// around a single bright bloom.
function mandalaClearing() {
  const img = createImage(SIZE, SIZE, hex(GROUND));
  const cx = S(0.5);
  const cy = S(0.5);
  const N = 12;
  // three rings of leaves, each spun a little against the last
  const rings = [
    { r: 0.315, len: 0.125, wid: 0.055, off: 0, cols: [EMERALD, TEAL, JADE] },
    { r: 0.215, len: 0.105, wid: 0.05, off: Math.PI / N, cols: [JADE, SPRING, AQUA] },
    { r: 0.135, len: 0.078, wid: 0.042, off: 0, cols: [SPRING, LIME, MOSS] },
  ];
  for (const ring of rings) {
    for (let k = 0; k < N; k++) {
      const ang = (k / N) * Math.PI * 2 + ring.off;
      const lx = cx + Math.cos(ang) * S(ring.r);
      const ly = cy + Math.sin(ang) * S(ring.r);
      leaf(img, lx, ly, S(ring.len), S(ring.wid), ang, hex(ring.cols[k % ring.cols.length]));
    }
  }
  // a ring of gold buds between the outer spokes
  for (let k = 0; k < N; k++) {
    const ang = (k / N) * Math.PI * 2 + Math.PI / N;
    fillCircle(img, cx + Math.cos(ang) * S(0.40), cy + Math.sin(ang) * S(0.40), S(0.017), hex(k % 2 ? GOLD : AMBER));
  }
  // a ring of petals hugging the centre
  for (let k = 0; k < 8; k++) {
    const ang = (k / 8) * Math.PI * 2;
    leaf(img, cx + Math.cos(ang) * S(0.095), cy + Math.sin(ang) * S(0.095), S(0.07), S(0.045), ang, hex(k % 2 ? LIME : SPRING));
  }
  // the bloom at the heart, brightening inward
  const heart = [[DEEPTEAL, 0.088], [EMERALD, 0.07], [JADE, 0.055], [LIME, 0.04], [AMBER, 0.026], [GLOW, 0.014]];
  for (const [col, r] of heart) fillCircle(img, cx, cy, S(r), hex(col));
  frame(img);
  return img;
}

// Stone 4 — a lantern hung in the dark canopy, moths circling its light.
function mothLantern() {
  const img = createImage(SIZE, SIZE, hex(GROUND));
  const cx = S(0.5);
  const ly = S(0.50);      // lantern centre
  // dim halo behind the lantern
  for (const [col, rx, ry] of [[SHADOW, 0.34, 0.34], [FOREST, 0.25, 0.25], [DEEPTEAL, 0.17, 0.17]]) {
    fillEllipse(img, cx, ly, S(rx), S(ry), hex(col));
  }
  // canopy leaves crowding the top corners
  const leafCols = [MOSS, EMERALD, JADE, TEAL, SPRING];
  for (let i = 0; i < 10; i++) {
    const side = i % 2 ? 1 : -1;
    const hx = cx + side * S(0.30 + (i % 3) * 0.04);
    const hy = S(0.10 + (i % 5) * 0.035);
    leaf(img, hx, hy, S(0.10), S(0.05), (side < 0 ? 0.6 : Math.PI - 0.6), hex(leafCols[i % leafCols.length]));
  }
  // the cord and top hook
  bar(img, cx, S(0.08), cx, S(0.32), S(0.012), hex(MOSS));
  fillCircle(img, cx, S(0.30), S(0.02), hex(GOLD));
  // lantern cap
  fillPoly(img, [[cx - S(0.07), S(0.34)], [cx + S(0.07), S(0.34)], [cx + S(0.045), S(0.30)], [cx - S(0.045), S(0.30)]], hex('#b3822a'));
  // lantern body — amber panes divided by dark mullions
  fillRect(img, cx - S(0.085), S(0.34), S(0.17), S(0.24), hex(GOLD));
  for (const mx of [-0.028, 0.028]) fillRect(img, cx + S(mx), S(0.34), S(0.012), S(0.24), hex(SHADOW));
  fillRect(img, cx - S(0.085), S(0.455), S(0.17), S(0.012), hex(SHADOW));
  // the flame glowing at its core
  for (const [col, r] of [[AMBER, 0.05], [GLOW, 0.03], ['#fff4cf', 0.015]]) fillCircle(img, cx, S(0.46), S(r), hex(col));
  // lantern base
  fillPoly(img, [[cx - S(0.055), S(0.58)], [cx + S(0.055), S(0.58)], [cx + S(0.078), S(0.62)], [cx - S(0.078), S(0.62)]], hex('#b3822a'));
  // moths circling the light
  const moth = (mx, my, s, col) => {
    leaf(img, mx - s * 0.55, my, s * 1.2, s * 0.85, Math.PI - 0.5, hex(col));
    leaf(img, mx + s * 0.55, my, s * 1.2, s * 0.85, 0.5, hex(col));
    fillEllipse(img, mx, my, s * 0.16, s * 0.5, hex(SHADOW));
  };
  const wings = [LIME, GLOW, SPRING, AMBER, '#d8f4a0', LIME];
  const spots = [[0.24, 0.40], [0.74, 0.38], [0.30, 0.66], [0.70, 0.68], [0.5, 0.80], [0.20, 0.55]];
  spots.forEach(([mx, my], i) => moth(S(mx), S(my), S(0.045), wings[i % wings.length]));
  frame(img);
  return img;
}

// Stone 5, the mid-boss — the Hoarder: a grasping mark hunched over a pile of
// stolen colour-spools, several of them drained to grey where its claws grip,
// echoing the crossed-out grey cells of chapter one's boss.
function theHoarder() {
  const img = createImage(SIZE, SIZE, hex('#0a120c'));
  const cx = S(0.5);
  // the hoarder's dark bulk, hunched over the pile
  fillPoly(img, blob(cx, S(0.44), S(0.40), { seed: 31, wobble: 0.15, points: 26 }), hex(SHADOW));
  fillPoly(img, blob(cx, S(0.34), S(0.24), { seed: 12, wobble: 0.18, points: 22 }), hex(FOREST)); // hunched shoulders
  // two greedy eyes
  for (const ex of [0.43, 0.57]) {
    fillCircle(img, S(ex), S(0.30), S(0.03), hex(AMBER));
    fillCircle(img, S(ex), S(0.30), S(0.014), hex(MAGENTA));
  }
  // the hoard — a rough pile of stolen spools, jewel colours, a few tucked
  // leaves poking out, and the gripped ones drained grey.
  const loot = [EMERALD, JADE, LIME, TEAL, AQUA, GOLD, AMBER, VIOLET, MAGENTA, SPRING];
  const rand = mulberry32(41);
  let idx = 0;
  const gripped = new Set(['0-0', '1-0', '2-0', '0-4', '1-4', '2-4']); // columns each claw crushes
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 5; c++) {
      const px = S(0.30 + c * 0.10) + (rand() - 0.5) * S(0.018);
      const top = S(0.55 + r * 0.09) + (rand() - 0.5) * S(0.012);
      const w = S(0.052);
      const h = S(0.115);
      if (gripped.has(`${r}-${c}`)) struckGrey(img, px, top, w, h);
      else spool(img, px, top, w, h, hex(loot[idx % loot.length]));
      idx++;
    }
  }
  // a couple of leaves spilling out of the top of the pile
  for (let i = 0; i < 4; i++) {
    leaf(img, S(0.36 + i * 0.09), S(0.53), S(0.075), S(0.038), -Math.PI / 2 + (i - 1.5) * 0.3, hex(i % 2 ? JADE : EMERALD));
  }
  // the claws — a palm and three talons gripping down each flank, dark and
  // menacing, over the grey columns.
  const claw = (bx, by, dir, seed) => {
    fillPoly(img, blob(bx, by, S(0.075), { seed, wobble: 0.22, points: 14 }), hex('#07130c'));
    for (let t = -1; t <= 1; t++) {
      const ang = (dir < 0 ? 0.15 : Math.PI - 0.15) + t * 0.5;
      const tx = bx + Math.cos(ang) * S(0.17);
      const ty = by + Math.sin(ang) * S(0.17);
      bar(img, bx, by, tx, ty, S(0.028), hex('#07130c'));
      fillCircle(img, tx, ty, S(0.017), hex(FOREST)); // talon tip glint
    }
  };
  claw(S(0.235), S(0.56), -1, 5);  // left claw grips the left grey column
  claw(S(0.765), S(0.56), 1, 9);   // right claw grips the right grey column
  frame(img);
  return img;
}

/* ------------------------------------------------------------------- driver */

// A little under the normal 500-cell ceiling and capped hard at 18 tubs, so the
// stones stay chunky and low-fuss, matching chapter one's.
const OPTS = { ...DETAIL_PRESETS.normal, maxColours: 18, strictColours: true };

const SCENES = [
  { id: 'dusk-gate', title: 'The Dusk Gate', draw: duskGate },
  { id: 'glowvine-path', title: 'The Glowvine Path', draw: glowvinePath },
  { id: 'mandala-clearing', title: 'The Mandala Clearing', draw: mandalaClearing },
  { id: 'moth-lantern', title: 'The Moth Lantern', draw: mothLantern },
  { id: 'the-hoarder', title: 'The Hoarder', draw: theHoarder },
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
