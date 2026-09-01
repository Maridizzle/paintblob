// The free-mode bonus-round scheduler — the "every so often, at random" cadence.
//
// A picture offers its optional rounds by dropping a single chip into the corner
// now and then as you paint. This module is the *when* and the *which*, kept pure
// so the timing can be swept in node; the board (game.js) owns the chip, the
// overlays and the rounds themselves, and asks this only "is one due, and which".
//
// The cadence is deliberately RARE — a bonus is a treat, not a metronome. The
// first comes early, so even a short picture sees one; every one after is tens of
// cells further on, jittered so it never feels scheduled.

export const ROUND_IDS = ['overtime', 'shade-match', 'mixer', 'drips', 'recall'];

// All counted in cells painted. The first offer lands in [FIRST_MIN, FIRST_MIN +
// FIRST_JITTER); each one after is [GAP_MIN, GAP_MIN + GAP_JITTER) further on.
// LINGER is how long an ignored chip hangs around before it gives up and a fresh
// gap is armed — so a bonus you don't want doesn't sit in the corner forever.
export const FIRST_MIN = 10;
export const FIRST_JITTER = 8;
export const GAP_MIN = 35;
export const GAP_JITTER = 10;
export const LINGER = 12;

/** The cell count the first bonus of a picture becomes available at. */
export function firstThreshold(rng = Math.random) {
  return FIRST_MIN + Math.floor(rng() * FIRST_JITTER);
}

/** The cell count the NEXT bonus becomes available at, measured from where the
 *  painting is now. */
export function nextThreshold(filled, rng = Math.random) {
  return filled + GAP_MIN + Math.floor(rng() * GAP_JITTER);
}

/** A round to offer from `ids`: random, but never the one offered last, so the
 *  same game never comes up twice running. With a single id it returns that one.
 *  Takes the list explicitly so the caller can offer only the rounds that exist. */
export function pickNext(ids, lastId, rng = Math.random) {
  const pool = ids.filter((id) => id !== lastId);
  const from = pool.length ? pool : ids;
  return from[Math.floor(rng() * from.length)];
}
