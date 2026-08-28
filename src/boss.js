// The boss fight — X, the un-namer, clawing painted cells back off the board.
//
// The last stone of a chapter is not a bigger picture, it is a fight against
// one: while you paint it, X keeps taking colours back and throwing spells to
// slow you. This module is the arithmetic and the choosing — how many cells X
// takes on a tick, which cells, which attack — and nothing else. Pure, so it
// runs in node beside overtime.js and swap.js; game.js owns the clock, the
// canvas, and the health bar.
//
// The one load-bearing idea: **the picture is the health bar.** X's health is
// how much of it is still unpainted, and X is strongest at full health and
// fades as it dies. So the fight is hardest at the start and snowballs to a
// win, and — because regen reaches zero exactly as the picture completes — it
// can never strand you one tile short. You cannot lose; you can only be slowed.

export const REGEN_INTERVAL_MS = 15000;   // how often X takes cells back
export const ATTACK_INTERVAL_MS = 21000;  // how often X throws a spell
export const FIRST_ATTACK_MS = 12000;     // a grace beat before the first spell
export const COLOUR_DISABLE_MS = 12000;   // a disabled colour stays locked this long
export const CELL_LOCK_MS = 20000;        // frozen cells stay frozen this long
export const LOCK_FRACTION = 1 / 3;       // share of the unpainted board a freeze hits

// The share of the whole picture X takes on ONE full-health tick, before
// difficulty. Tuned so a healthy boss on a ~110-cell normal stone takes ~5
// cells every fifteen seconds (see REGEN_INTERVAL_MS) — a slow, legible
// drain-back you comfortably out-paint at roughly a cell a second, and less
// every tick as X weakens. An earlier ~3-cells-every-5s tuning read as X
// eating the board faster than you could hold it.
const REGEN_FRAC = 0.044;

// A picture's difficulty tag scales how hard X hits — the same tag the pipeline
// writes into the manifest. Unknown or missing → normal.
const DIFFICULTY_MULT = { chunky: 0.7, normal: 1, detailed: 1.3, insane: 1.6 };
export function difficultyMult(tag) {
  return DIFFICULTY_MULT[tag] ?? 1;
}

/** X's health, 0..1: the fraction of the picture still unpainted. 1 at the
 *  first stroke, 0 the instant the last cell is filled. */
export function healthFraction(filled, total) {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(1, (total - filled) / total));
}

/**
 * How many painted cells X takes back on one regen tick: a small share of the
 * whole picture, scaled by difficulty and by how healthy X still is, and never
 * more than are actually painted right now. Zero at zero health, so the fight
 * cannot outrun its own ending.
 */
export function regenCount(total, filled, mult = 1) {
  const health = healthFraction(filled, total);
  const n = Math.round(total * REGEN_FRAC * mult * health);
  return Math.max(0, Math.min(filled, n));
}

/**
 * n cells for X to take back, drawn at random from the painted ones — random
 * rather than "your last stroke" so it reads as the board coming un-named all
 * over, not as X reaching for the cell you just did. rng is injectable for the
 * tests.
 */
export function pickWipeTargets(filledIds, n, rng = Math.random) {
  return sample(filledIds, n, rng);
}

/** The cells a freeze attack locks: a share of what is still unpainted, at
 *  random. */
export function pickLockTargets(unfilledIds, rng = Math.random, frac = LOCK_FRACTION) {
  return sample(unfilledIds, Math.round(unfilledIds.length * frac), rng);
}

/**
 * Which spell X throws. It cannot disable a colour you are not holding (or one
 * already disabled, or your only colour left), so `canDisableColour` gates the
 * choice; when it is false X always freezes cells instead.
 */
export function chooseAttack(rng = Math.random, canDisableColour = true) {
  if (!canDisableColour) return 'cells';
  return rng() < 0.5 ? 'colour' : 'cells';
}

/** n distinct items drawn from `ids` without replacement. Clamped to the pool,
 *  so asking for more than exist just returns all of them. */
function sample(ids, n, rng) {
  const pool = [...ids];
  const take = Math.max(0, Math.min(pool.length, n));
  const out = [];
  for (let i = 0; i < take; i++) {
    const j = Math.floor(rng() * pool.length);
    out.push(pool.splice(j, 1)[0]);
  }
  return out;
}
