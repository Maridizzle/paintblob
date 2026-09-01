// Shade Match — spot the odd drop.
//
// A grid of paint swatches, every one the same colour but one, whose lightness
// is a hair off. Find it and the next round is a beat harder: a bigger grid and
// a smaller difference. It is the one thing paint-by-number is really about —
// seeing colour — cut down to a single decision you can make in a second.
//
// This module is the arithmetic and none of the drawing: how big the grid is
// and how far apart the two shades sit at a given level, and building one round.
// The clock, the score and the taps live at the board (game.js), the way
// Overtime's order does. Pure, so it runs in node like overtime.js and swap.js.
//
// The colour work is borrowed wholesale from Overtime: a difference measured in
// CIE L* (perceived lightness), not the L of HSL, because those are different
// axes and only the first is the one the eye actually reads (overtime.js has the
// long version). lightForL solves a hue+saturation onto an exact L* so the gap
// the round rests on is the gap the player sees, whatever colour the round wears.

import { labL, shadeHex, lightForL } from './overtime.js';

export const SECONDS = 45;

// The smallest lightness gap, in L*, the round will ever ask the eye to split.
// A just-noticeable difference between two touching patches is ~1 L*; this sits
// comfortably above it so the odd tile is always *findable*, only ever hard.
export const DELTA_FLOOR = 2.4;

// The gap at level zero, and the decay that walks it down toward the floor. 0.82
// per level is the same shrink Overtime's delta uses: gentle enough that "harder"
// is felt as a slope, not a cliff. Level 0 opens at 15 L* (obvious) and reaches
// the floor around level ten.
const DELTA_START = 15;
const DELTA_DECAY = 0.82;

// Base lightness stays well inside the range so the odd tile has room to go
// either lighter or darker by a full delta without being clamped at black/white
// (which would quietly shrink the gap). Max delta is 15, so [30,74] leaves a
// clear margin at both ends.
const L_MIN = 30;
const L_MAX = 74;

// The grid grows with the level and then holds — a 5x5 of near-identical
// swatches is already a hard scan on a phone, and past it the delta shrinking is
// what carries the difficulty. Kept as an explicit ladder rather than a formula
// so the shapes stay hand-picked and phone-friendly.
const GRIDS = [
  { cols: 2, rows: 2 }, // 4
  { cols: 3, rows: 2 }, // 6
  { cols: 3, rows: 3 }, // 9
  { cols: 4, rows: 3 }, // 12
  { cols: 4, rows: 4 }, // 16
  { cols: 5, rows: 4 }, // 20
  { cols: 5, rows: 5 }, // 25
];

/** The grid shape at a level: it grows up the ladder, then holds at the top. */
export function gridForLevel(level) {
  const i = Math.min(Math.max(0, Math.floor(level)), GRIDS.length - 1);
  return { ...GRIDS[i] };
}

/** The lightness gap (L*) between the odd tile and the rest, never below the
 *  findable floor. */
export function deltaForLevel(level) {
  return Math.max(DELTA_FLOOR, DELTA_START * DELTA_DECAY ** Math.max(0, level));
}

/**
 * One round: a grid of `cols*rows` swatches, all the base colour except `odd`,
 * which is `delta` L* lighter or darker. `rng` is injectable so the tests can
 * sweep every level deterministically.
 *
 * Hue and saturation are random per round — a fresh colour family each time,
 * like Overtime — but they are the SAME for every tile, so the only thing that
 * ever separates the odd one is lightness. That keeps the answer a matter of
 * seeing, not of a stray hue giving it away.
 */
export function buildRound(level, rng = Math.random) {
  const { cols, rows } = gridForLevel(level);
  const n = cols * rows;
  const hue = rng() * 360;
  const sat = 0.42 + rng() * 0.4;
  const baseL = L_MIN + rng() * (L_MAX - L_MIN);
  const delta = deltaForLevel(level);
  const dir = rng() < 0.5 ? -1 : 1;

  const base = shadeHex(hue, sat, lightForL(hue, sat, baseL));
  // Aim the odd tile `delta` L* away, then check what actually landed: quantising
  // both shades to three bytes can shrink the gap the eye is given below the gap
  // we asked for (worst near the floor, where the two targets are already close).
  // Nudge it further out until the RENDERED gap meets `delta`, so the guarantee
  // the round rests on is the one on screen, not the one on paper.
  let oddL = baseL + dir * delta;
  let odd = shadeHex(hue, sat, lightForL(hue, sat, oddL));
  for (let i = 0; i < 16 && Math.abs(labL(odd) - labL(base)) < delta; i++) {
    oddL += dir * 0.6;
    odd = shadeHex(hue, sat, lightForL(hue, sat, oddL));
  }
  const oddIndex = Math.floor(rng() * n);
  const swatches = Array.from({ length: n }, (_, i) => (i === oddIndex ? odd : base));
  return { swatches, base, odd, oddIndex, cols, rows, delta };
}

/** The L* gap actually rendered between the two shades of a built round, after
 *  the quantise to three bytes. What the eye is really given, for the tests to
 *  hold against DELTA_FLOOR. */
export function renderedGap(round) {
  return Math.abs(labL(round.odd) - labL(round.base));
}

/**
 * Points earned for reaching a given level. Nothing for a blank run (you tapped
 * nothing right), then a gently super-linear climb so pushing deeper is worth
 * proportionally more than coasting the easy early grids.
 */
export function scoreFor(level) {
  if (level <= 0) return 0;
  return level * 4 + level * level;
}
