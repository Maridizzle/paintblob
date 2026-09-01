// Drip Catch — catch your colour, dodge the rest.
//
// Paint drips fall from the top; slide the held tub along the bottom to catch the
// ones that are your colour and let the wrong ones fall past. The one bonus round
// with a pulse to it — a change of pace from the puzzles.
//
// This module is the geometry, none of the drawing or the clock: where a drip
// starts, how far it has fallen, and whether the paddle caught it. The field is
// abstract — x and y both run 0..1 (y = 0 at the top, 1 at the floor) — so the
// board can size the play area however it likes and the maths never changes.
// Pure, so node can sweep it.

export const SECONDS = 30;

// Fall speed in field-heights per second, and how much each five caught speeds it
// up — the round tightens the longer you keep a clean streak going.
export const FALL = 0.5;
export function fallSpeed(level) { return FALL + level * 0.06; }

// The paddle's width as a fraction of the field, and the band near the floor
// where a catch can happen (a drip is catchable for the last stretch of its fall,
// not only on the exact pixel of the floor — that would be unwinnable).
export const PADDLE_W = 0.2;
export const CATCH_BAND = 0.84;

/** A fresh drip: at the top (y = 0), a random x clear of the edges, your colour
 *  or not by chance. The board paints the actual hex from `match`. */
export function spawn(rng, matchChance = 0.45) {
  return { x: 0.09 + rng() * 0.82, y: 0, match: rng() < matchChance };
}

/** Advances a drip by one step. Pure — hands back a new drip, leaving the old. */
export function step(drip, dt, speed) {
  return { ...drip, y: drip.y + speed * dt };
}

/** Caught when it has fallen into the catch band and the paddle (centred at
 *  `paddleX`) is under it. */
export function caught(drip, paddleX, paddleW = PADDLE_W) {
  return drip.y >= CATCH_BAND && drip.y <= 1 && Math.abs(drip.x - paddleX) <= paddleW / 2;
}

/** Gone: fallen past the floor without being caught. */
export function missed(drip) {
  return drip.y > 1;
}
