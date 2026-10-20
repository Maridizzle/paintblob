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

// Cadence is tuned so the board is CLEAR most of the time and a spell is an
// occasional spike, not a constant wall. The freeze is the load-bearing one:
// its duration (CELL_LOCK_MS) must stay well under the gap between spells
// (ATTACK_INTERVAL_MS) or the crossings-out overlap and a third of the picture
// is locked out for half the fight — which read as "super hard". At these
// numbers a freeze crosses a fifth of the board for ten seconds roughly once a
// minute, so it thaws and the board breathes long before the next one.
export const REGEN_INTERVAL_MS = 18000;   // how often X takes cells back
export const ATTACK_INTERVAL_MS = 34000;  // how often X throws a spell
export const FIRST_ATTACK_MS = 20000;     // a grace beat before the first spell
export const COLOUR_DISABLE_MS = 9000;    // a disabled colour stays locked this long
export const CELL_LOCK_MS = 10000;        // frozen cells stay frozen this long
export const LOCK_FRACTION = 1 / 5;       // share of the unpainted board a freeze hits

// The share of the whole picture X takes on ONE full-health tick, before
// difficulty. Tuned so a healthy boss on a ~110-cell normal stone takes ~4
// cells every eighteen seconds (see REGEN_INTERVAL_MS) — a slow, legible
// drain-back you comfortably out-paint, fading to nothing as X weakens. The
// drain was never really the problem; the freeze cadence above was.
const REGEN_FRAC = 0.035;

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
export function regenCount(total, filled, mult = 1, frac = REGEN_FRAC) {
  const health = healthFraction(filled, total);
  const n = Math.round(total * frac * mult * health);
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

// -------------------------------------------------------------- the kits
//
// A boss "kit" is the tuning + the MODE that make one fight feel unlike another.
// The arithmetic above is shared by every boss; a kit only says how hard, how
// often, and — through `mode` — which shape the fight takes. game.js reads the
// kit in startBoss, sets the HUD name and the timer cadence from it, and
// branches its tick loop on `mode`. Chapter One's fight is the `attrition` kit
// (the original constants, unchanged), so nothing about it moves; later
// mini-bosses add a kit here and their own `mode` branch in game.js, and the
// shared math never has to know which boss it is serving.
//
// The three modes:
//   attrition — the original. X drains painted cells back on a timer and throws
//               one of two spells (freeze the held colour / freeze a share of
//               the board). Health is unpainted/total; regen fades to nothing as
//               you finish, so it can slow you but never strand you.
//   hoarder   — no drain at all; the interruption IS the fight. Every attack
//               freezes the colour you are CURRENTLY holding (and that colour's
//               unfilled cells), so you are forever knocked off the paint you
//               were laying and have to pick another. Faster beat, shorter hold.
//   fade      — the picture starts dark but for a strip; painting reveals a
//               swath around each cell, and the light you are not holding slowly
//               goes back out, so you paint what you can see rather than by
//               number. The maths is the fade* functions at the foot of this
//               file; game.js startFade / fadeLight / fadeRefogTick drive it and
//               render.js draws the blank (board.fog).
export const DEFAULT_KIT = 'attrition';

export const BOSS_KITS = {
  attrition: {
    id: 'attrition', mode: 'attrition', name: 'The Wrong-Colour Day',
    regenIntervalMs: REGEN_INTERVAL_MS, attackIntervalMs: ATTACK_INTERVAL_MS,
    firstAttackMs: FIRST_ATTACK_MS, colourDisableMs: COLOUR_DISABLE_MS,
    cellLockMs: CELL_LOCK_MS, lockFraction: LOCK_FRACTION, regenFrac: REGEN_FRAC,
  },
  hoarder: {
    id: 'hoarder', mode: 'hoarder', name: 'The Hoarder',
    // No regen (regenFrac 0). A shorter freeze on a faster beat than attrition,
    // aimed at whatever colour is in your hand — so it nags rather than drains.
    regenIntervalMs: REGEN_INTERVAL_MS, attackIntervalMs: 16000,
    firstAttackMs: 12000, colourDisableMs: 7000,
    cellLockMs: 7000, lockFraction: 0, regenFrac: 0,
  },
  fade: {
    id: 'fade', mode: 'fade', name: 'The Fade',
    // A reveal fight, not an attrition one. No colour/cell freezes and no drain;
    // the pressure is the re-fogging: every refogIntervalMs a refogFraction
    // share of the lit, unpainted cells goes blank again (health-scaled), the
    // light spreads revealRadius of the longer side from each stroke, and the
    // opening band is startBand of the picture's height. (Low-stim never
    // re-fogs — game.js.)
    regenIntervalMs: REGEN_INTERVAL_MS, attackIntervalMs: ATTACK_INTERVAL_MS,
    firstAttackMs: FIRST_ATTACK_MS, colourDisableMs: 0,
    cellLockMs: 0, lockFraction: 0, regenFrac: 0,
    revealRadius: 0.15, refogFraction: 0.06, refogIntervalMs: 5000, startBand: 0.22,
  },
};

/** The kit for a boss id, falling back to the original attrition fight so an
 *  unknown or missing kit can never leave a boss stone with no fight at all. */
export function bossKit(id) {
  return BOSS_KITS[id] ?? BOSS_KITS[DEFAULT_KIT];
}

// -------------------------------------------------------- the fade (fog)
//
// The Fade's fight is a reveal, not a drain: the board is BLANK (not hidden —
// blank, as if it were never coloured in) except for what is lit, and only a
// lit cell can be painted. Three pure pieces, all over cells as {x, y} anchors
// in picture units, so they run in node:
//
//   fadeStartLit   — what is lit at the first stroke: a horizontal band across
//                    the middle of the picture, `startBand` of its height.
//   fadeRevealAround — painting a cell lights everything within `revealRadius`
//                    of it (a fraction of the picture's longer side), so the
//                    light spreads out from each stroke a little.
//   fadePickRefog  — on each refog tick, a share of the lit-but-unpainted cells
//                    goes dark again. Scaled by the boss's health the same way
//                    regen is, so the re-fogging fades to nothing as the
//                    picture nears done and the fight can never strand you; and
//                    cells lit within the grace window are never taken, so the
//                    light you are working in holds while you work in it.
//
// Painted cells are never fogged: a named thing stays named. That is the whole
// premise of the game, and it is what makes the fight a snowball rather than a
// treadmill — every cell you paint is one more lamp the dark cannot put out.

/** Cell ids whose anchor lies in the central horizontal band of the picture. */
export function fadeStartLit(cells, height, band) {
  const top = height * (0.5 - band / 2);
  const bottom = height * (0.5 + band / 2);
  return cells.filter((c) => c.y >= top && c.y <= bottom).map((c) => c.id);
}

/** Cell ids within `radiusFrac` of the longer side of cell `id`, itself included. */
export function fadeRevealAround(cells, id, radiusFrac, width, height) {
  const at = cells[id];
  if (!at) return [];
  const r = radiusFrac * Math.max(width, height);
  const r2 = r * r;
  const out = [];
  for (const c of cells) {
    const dx = c.x - at.x;
    const dy = c.y - at.y;
    if (dx * dx + dy * dy <= r2) out.push(c.id);
  }
  return out;
}

/**
 * The lit, unpainted cells to put out on one refog tick. `candidates` are the
 * lit-and-unpainted ids; `litAt` maps id → the time it was lit; anything lit
 * after `graceBefore` is kept. The count is `fraction` of the candidates
 * scaled by `health` (0..1), rounded, and never the whole pool — one lit cell
 * is always left, so there is always somewhere to paint.
 */
export function fadePickRefog(candidates, litAt, graceBefore, fraction, health, rng = Math.random) {
  const pool = candidates.filter((id) => (litAt.get(id) ?? 0) <= graceBefore);
  if (!pool.length) return [];
  const n = Math.min(pool.length, candidates.length - 1, Math.round(candidates.length * fraction * health));
  return sample(pool, Math.max(0, n), rng);
}
