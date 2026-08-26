// Overtime — a gradient, cut up and shuffled.
//
// For sixty seconds a ramp of fifteen colours arrives out of order and you put
// it back: tap one chunk, tap another, they trade places. Get it exactly right
// and every cell you fill for the rest of the picture takes a second one with
// it.
//
// This module is the arithmetic and none of the drawing — building the ramp,
// shuffling it, and the swapping — plus partnerFor, which decides which cell
// the doubled brush takes along. All pure, so it runs in node the way
// points.js and abilities.js do.
//
// It replaces a first version that squinted the *picture* down to thirty
// blocks and had you paint it by number. That was a matching task where this
// is an ordering one, and no amount of tuning turns one into the other. Losing
// it took three problems with it: there is no offscreen canvas to rasterise,
// no contrast gate (a generated ramp is always playable, where some pictures
// squint into mush), and no need to skip blind pictures, because this reveals
// nothing whatever about the picture it is played over.

export const CHUNKS = 15;
export const COLS = 5;
export const SECONDS = 60;

// The ramp climbs in CIE L* — perceived lightness — and not in the L of HSL.
//
// They are not the same axis and the difference is the whole round. Void's
// tokens run at full saturation, and an even climb in HSL lightness across
// them gave L* of 18 33 51 61 68 75 83 88 89 90 91 92 93 94 94: the last eight
// chunks inside six points of each other, two of them identical. On screen
// that was a wall of near-identical green with a defensible answer that no eye
// could find, because "darkest first" was being measured on an axis the player
// does not have. Solving for L* instead makes the steps even to the eye
// whatever hue and saturation the theme brings.
//
// Both ends stay off black and white, where a ramp has nowhere left to go.
const L_FLOOR = 16;
const L_CEIL = 92;

/**
 * The least the eye may be asked to split two neighbours by, in L*. Asserted in
 * the tests: a ramp with a flat stretch has no findable answer.
 *
 * The even step is 5.4 points — several times a just-noticeable difference,
 * small enough to be a judgement and large enough not to be a coin toss. Thirty
 * chunks would halve it, which is where it stops being either. The 0.82 is
 * headroom for rounding: the solve lands on the target in floating point and
 * then the colour is quantised to three bytes, which cost up to 0.15 of a step
 * across four thousand randomised ramps.
 */
export const MIN_STEP = (L_CEIL - L_FLOOR) / (CHUNKS - 1) * 0.82;

/** CIE L* of a hex, 0..100. The one number in here that is about eyes rather
 *  than arithmetic: sRGB is gamma-encoded and green carries most of the
 *  luminance, so neither the hex bytes nor HSL's L answer "how light is this". */
export function labL(hex) {
  const lin = (i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const y = 0.2126 * lin(1) + 0.7152 * lin(3) + 0.0722 * lin(5);
  return 116 * (y > 0.008856 ? Math.cbrt(y) : 7.787 * y + 16 / 116) - 16;
}

/**
 * The HSL lightness that puts a given hue and saturation at a given L*.
 *
 * L* rises monotonically with HSL lightness at fixed hue and saturation — l=0
 * is black and l=1 is white whatever else is set — so bisection cannot get
 * stuck, and twenty-four halvings land inside a millionth. There is no closed
 * form to reach for here: the sRGB transfer curve is piecewise.
 */
function lightForL(hue, sat, target) {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (labL(shadeHex(hue, sat, mid)) < target) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
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

/** Interpolates hue the short way round the wheel. Magenta 330 to gold 35 is
 *  65 degrees up through red, not 295 down through the entire spectrum. */
export function lerpHue(a, b, t) {
  const d = ((((b - a) % 360) + 540) % 360) - 180;
  return (((a + d * t) % 360) + 360) % 360;
}

/** Hue and saturation at `t` along a piecewise run of stops. */
function stopAt(stops, t) {
  const segs = stops.length - 1;
  // Nudged off the end so t = 1 lands inside the last segment rather than one
  // past it.
  const x = Math.max(0, Math.min(segs - 1e-9, t * segs));
  const i = Math.floor(x);
  const f = x - i;
  return {
    h: lerpHue(stops[i].h, stops[i + 1].h, f),
    s: stops[i].s + (stops[i + 1].s - stops[i].s) * f,
  };
}

/**
 * Puts the stops in the order that walks the smallest arc containing all of
 * them, so hue travels one way across the ramp instead of doubling back.
 *
 * Void declares cyan 187, green 143 and gold 20, and read in that order the
 * ramp ran cyan -> gold -> green: out and back, with chunk eight a warmer
 * orange than the chunks either side of it. Lightness still gave the answer,
 * but hue was actively lying about it, which is worse than hue saying nothing.
 * Sorted round the wheel it runs gold -> green -> cyan and the two readings
 * agree. Two stops need no sorting: the short arc between them is already
 * one-way.
 */
function orderStops(list) {
  if (list.length < 3) return list;
  const by = [...list].sort((a, b) => a.h - b.h);
  // The widest gap between neighbours is the stretch of wheel the stops do NOT
  // span; the walk starts on the far side of it.
  let cut = 0;
  let widest = -1;
  for (let i = 0; i < by.length; i++) {
    const gap = ((((by[(i + 1) % by.length].h - by[i].h) % 360) + 360) % 360);
    if (gap > widest) { widest = gap; cut = (i + 1) % by.length; }
  }
  return [...by.slice(cut), ...by.slice(0, cut)];
}

/**
 * The ramp, darkest first.
 *
 * `stops` are {h,s,l} — two or three of them, taken from the live theme, so
 * the round always looks like the room it is played in. Story mode will pass a
 * chapter's colours instead and nothing else has to change.
 *
 * The stops' own LIGHTNESS is deliberately thrown away and replaced with an
 * even climb from floor to ceiling in L*. That is the whole thing that makes
 * this a puzzle: if only hue moved there would be no defensible first chunk and
 * the "correct" order would be arbitrary. Monotonic lightness makes the answer
 * unambiguous, and the hue travelling on top of it does half the reading work.
 */
export function rampFrom(stops, n = CHUNKS) {
  const list = (stops ?? []).filter((s) => s && Number.isFinite(s.h));
  // One stop, or none, still has to give back a playable ramp rather than
  // throw: a theme missing a token is a bad look, not a crash.
  const run = list.length >= 2 ? orderStops(list)
    : [{ h: list[0]?.h ?? 320, s: list[0]?.s ?? 0.5 },
      { h: (list[0]?.h ?? 320) + 40, s: list[0]?.s ?? 0.5 }];
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = n > 1 ? i / (n - 1) : 0.5;
    const { h, s } = stopAt(run, t);
    const sat = Math.max(0, Math.min(1, s));
    const target = L_FLOOR + t * (L_CEIL - L_FLOOR);
    out.push(shadeHex(h, sat, lightForL(h, sat, target)));
  }
  return out;
}

/* --------------------------------------------------------------- ordering */

// An `order` is slot -> chunk: order[3] is the chunk currently sitting in the
// fourth slot. Solved is the identity, because chunk i belongs in slot i.

export function isSolved(order) {
  return order.every((chunk, slot) => chunk === slot);
}

export function placedCount(order) {
  return order.reduce((n, chunk, slot) => n + (chunk === slot ? 1 : 0), 0);
}

/** Trades two slots. Pure: the caller keeps the old array if it wants it. */
export function swap(order, i, j) {
  const next = [...order];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/**
 * A shuffle that is never most of the way done already. A plain Fisher-Yates
 * leaves a chunk in its correct slot about once per chunk, and a round that
 * opens with five of fifteen already right is a gift rather than a puzzle — so
 * this reshuffles until at most one is.
 *
 * `rng` is injectable so the tests can sweep it deterministically.
 */
export function scramble(n = CHUNKS, rng = Math.random) {
  for (let tries = 0; tries < 60; tries++) {
    const order = [...Array(n).keys()];
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    if (placedCount(order) <= 1 && !isSolved(order)) return order;
  }
  // A rotation is a derangement by construction — nothing is in its own slot —
  // so this can always hand back something valid however unlucky the rng is.
  return [...Array(n).keys()].map((i) => (i + 1) % n);
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
