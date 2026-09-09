// Replay — watch a finished picture fill back in, in the exact order it was
// painted, at warp speed. The order is FREE: game.js keeps `S.filled` as an
// insertion-ordered Set and persists it as an array, so `[...S.filled]` (or a
// reloaded `saved.filled`) *is* the order the cells were coloured in. Nothing is
// recorded ahead of time — "record mode" needs no recording.
//
// This module is only the timing: how long a replay runs, and how many cells are
// shown at a given instant. render.js does the drawing (it reveals cells onto the
// base layer without touching the shared `filled` set); game.js owns the button,
// the speed chips and the control bar. Pure (no DOM) so it runs in node tests.

// The speeds the player can pick. `mult` scales the base duration — smaller runs
// faster. "Warp" is the headline; 1× is there for anyone who wants to actually
// watch each cell land.
export const REPLAY_SPEEDS = [
  { id: 'play', label: '1×', mult: 1 },
  { id: 'fast', label: '2×', mult: 0.5 },
  { id: 'warp', label: '⚡', mult: 0.28 },
];
export const DEFAULT_REPLAY_SPEED = 'fast';

/** Resolve a speed id to its entry, falling back to the default. */
export function replaySpeed(id) {
  return REPLAY_SPEEDS.find((s) => s.id === id)
    ?? REPLAY_SPEEDS.find((s) => s.id === DEFAULT_REPLAY_SPEED);
}

/**
 * Base run time (ms) for a whole picture at 1×, scaled by a speed `mult`. A floor
 * so a tiny picture still reads as an animation rather than a blink; a gentle
 * growth with cell count so a big one isn't a blur; a cap so even a 1200-cell
 * picture stays a "watch it go" moment and not a chore.
 */
export function replayDurationMs(total, mult = 1) {
  const base = Math.min(6500, 1800 + total * 3.4);
  return Math.round(base * mult);
}

const easeOutCubic = (p) => 1 - (1 - p) ** 3;

/**
 * How many of `total` cells are revealed at `elapsedMs` into a `durationMs`
 * replay. Eased (ease-out) so the fill decelerates into the finish instead of
 * stopping dead on the last cell. Always in [0, total], and monotonic in time.
 */
export function replayReveal(elapsedMs, total, durationMs) {
  if (total <= 0) return 0;
  if (elapsedMs <= 0) return 0;
  if (durationMs <= 0 || elapsedMs >= durationMs) return total;
  const p = easeOutCubic(elapsedMs / durationMs);
  return Math.min(total, Math.round(p * total));
}
