// Overtime — the picture, squinted.
//
// For sixty seconds a puzzle collapses into about thirty blocks of a single
// hue and you paint that instead of the real thing. Win it and every cell you
// fill for the rest of the picture takes a second one with it.
//
// This module is the arithmetic and none of the drawing: how big the grid is,
// how the tiles' brightnesses become a small tray of tubs, whether a picture
// is worth offering it on at all, and which cell a doubled fill should take
// with it. Rasterising lives with the canvas, because only the canvas has
// pixels — everything here is pure, so the whole thing is testable in node
// the way points.js and abilities.js are.
//
// Two numbers below were measured rather than guessed, and both had a wrong
// answer first:
//
//   * RUNGS. Downsampling the picture is only half of it. Thirty tiles can
//     carry thirty different brightnesses, and the first build did exactly
//     that — eight distinct shades on one picture, eighteen on another, which
//     is not a tray, it is a gradient. Nobody can pick the ninth rung from the
//     tenth. Snapping the tiles to a fixed five is what makes it paintable.
//   * MAX_RUNG_SHARE. The gate started out trying to measure whether the
//     blocks still LOOKED like the picture, and neither candidate metric
//     (spread, then how much neighbouring tiles differ) agreed with the eye.
//     Which was the tell: a player never has to recognise the whale. They have
//     to tell the tubs apart and have enough tiles of each to be worth
//     painting. That is what this measures instead.

export const TILE_TARGET = 30;
export const RUNGS = 5;
export const SECONDS = 60;

// Both ends stay off pure black and pure white, where a value ladder has
// nowhere left to go and the darkest two rungs stop being separable.
const L_FLOOR = 0.14;
const L_CEIL = 0.86;

/** Saturation of the flooded hue. Muted: a tray of five fully saturated
 *  shades reads as five different colours rather than one colour's ladder. */
export const SATURATION = 0.42;

/**
 * A picture whose tiles pile into a single rung is a tray with nothing to
 * choose from. Across the 45 built pictures this share runs 0.27 to 0.73, sits
 * at 0.40 in the middle, and only one picture — 32 cells of mostly sky — comes
 * anywhere near the top. The gate is set to catch that shape and nothing else,
 * which is the point: it is a safety net, not a curator.
 */
export const MAX_RUNG_SHARE = 0.65;

/** Rec. 601 luma, matching readableOn() in game.js so "how light is this"
 *  means one thing across the app. */
export const luma = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

/** The grid closest to `target` tiles at the picture's aspect ratio. Never
 *  fewer than two either way — a single column is a stripe, not a picture. */
export function gridFor(width, height, target = TILE_TARGET) {
  if (!(width > 0) || !(height > 0)) return { cols: 2, rows: 2 };
  const cols = Math.max(2, Math.round(Math.sqrt((target * width) / height)));
  const rows = Math.max(2, Math.round(target / cols));
  return { cols, rows };
}

/**
 * The ladder a set of tile brightnesses becomes. Stretched to whatever range
 * the picture actually uses rather than to 0..255: a picture living entirely
 * in the midtones would otherwise hand back five rungs that are all the same
 * midtone.
 */
export function ladderFor(values, rungs = RUNGS) {
  const list = [...values];
  const lo = list.length ? Math.min(...list) : 0;
  const hi = list.length ? Math.max(...list) : 0;
  return { lo, hi, rungs: Math.max(2, rungs) };
}

/** Which rung of the ladder a brightness lands on, 0 (darkest) upward. */
export function rungOf(value, ladder) {
  const { lo, hi, rungs } = ladder;
  const t = hi > lo ? (value - lo) / (hi - lo) : 0.5;
  return Math.max(0, Math.min(rungs - 1, Math.round(t * (rungs - 1))));
}

/** A rung's lightness, 0..1. */
export function lightnessOf(rung, rungs = RUNGS) {
  const span = Math.max(2, rungs) - 1;
  return L_FLOOR + (Math.max(0, Math.min(span, rung)) / span) * (L_CEIL - L_FLOOR);
}

const hex2 = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');

/** HSL to hex. Hue in degrees; saturation and lightness 0..1. */
export function shadeHex(hue, sat, light) {
  const h = ((hue % 360) + 360) % 360 / 360;
  const a = sat * Math.min(light, 1 - light);
  const f = (n) => {
    const k = (n + h * 12) % 12;
    return 255 * (light - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)));
  };
  return `#${hex2(f(0))}${hex2(f(8))}${hex2(f(4))}`;
}

/**
 * The tray, dark to light. Only rungs the picture actually uses get a tub —
 * the real game derives its palette from the picture too, and an empty tub is
 * a tub you can waste a tap on.
 *
 * @returns {{rung:number, hex:string, count:number}[]}
 */
export function trayFor(values, { hue = 0, sat = SATURATION, rungs = RUNGS } = {}) {
  const ladder = ladderFor(values, rungs);
  const counts = new Map();
  for (const v of values) {
    const r = rungOf(v, ladder);
    counts.set(r, (counts.get(r) ?? 0) + 1);
  }
  return [...counts.keys()].sort((a, b) => a - b).map((rung) => ({
    rung,
    hex: shadeHex(hue, sat, lightnessOf(rung, ladder.rungs)),
    count: counts.get(rung),
  }));
}

/** Every tile's rung, in the order the values came in. */
export function rungsFor(values, rungs = RUNGS) {
  const ladder = ladderFor(values, rungs);
  return values.map((v) => rungOf(v, ladder));
}

/** The share of tiles sitting on the single most crowded rung, 0..1. */
export function rungShare(values, rungs = RUNGS) {
  if (!values.length) return 1;
  const counts = new Map();
  for (const r of rungsFor(values, rungs)) counts.set(r, (counts.get(r) ?? 0) + 1);
  return Math.max(...counts.values()) / values.length;
}

/** Whether this picture makes a puzzle worth offering. */
export function worthOffering(values, { rungs = RUNGS, maxShare = MAX_RUNG_SHARE } = {}) {
  if (values.length < 8) return false;
  const tray = trayFor(values, { rungs });
  if (tray.length < 3) return false;   // two tubs is a coin toss, not a picture
  return rungShare(values, rungs) <= maxShare;
}

/* ------------------------------------------------------------------- bogo */

/**
 * The cell a doubled fill takes with it: the nearest unfilled cell of the same
 * colour. Nearest rather than random because the blob is a splat — a second
 * one landing beside the first reads as the paint spreading, where one landing
 * across the picture reads as a bug.
 *
 * Deliberately a plain scan rather than geometry.js's cellNear(), which ring-
 * samples a small radius to forgive a near miss and would step straight over
 * the only candidate at any distance worth calling "the rest of the picture".
 */
export function partnerFor(cells, from, { colour, filled, pending } = {}) {
  if (!from) return null;
  let best = null;
  let bestD = Infinity;
  for (const cell of cells) {
    if (cell === from || cell.id === from.id) continue;
    if (cell.colour !== colour) continue;
    if (filled?.has(cell.id) || pending?.has(cell.id)) continue;
    const dx = cell.anchor.x - from.anchor.x;
    const dy = cell.anchor.y - from.anchor.y;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = cell; }
  }
  return best;
}
