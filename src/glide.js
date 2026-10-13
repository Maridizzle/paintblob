// Glide — the arrow pad that slides a zoomed picture around so nobody has to
// grab and drag every couple of inches. This module is only the maths: how fast
// each speed setting is, and how the velocity eases toward its target so a glide
// starts and stops softly instead of lurching. game.js owns the buttons and the
// frame loop; render.js's Board.panBy does the moving. Pure (no DOM) so it runs
// in node tests.

// Picture speed in CSS px per second. Slow is deliberately gentle.
export const GLIDE_SPEEDS = [
  { id: 'slow', label: 'Slow', pxPerSec: 110 },
  { id: 'medium', label: 'Medium', pxPerSec: 230 },
  { id: 'fast', label: 'Fast', pxPerSec: 420 },
];
export const DEFAULT_GLIDE_SPEED = 'medium';

/** Resolve a speed id to its entry, falling back to the default. */
export function glideSpeed(id) {
  return GLIDE_SPEEDS.find((s) => s.id === id)
    ?? GLIDE_SPEEDS.find((s) => s.id === DEFAULT_GLIDE_SPEED);
}

// Unit direction for each arrow. "right" means the VIEW moves right, so the
// picture itself slides left; game.js negates when it calls panBy.
export const GLIDE_DIRS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

/** Ease of the velocity toward its target. ~170ms to settle: soft start and stop. */
export const GLIDE_EASE_MS = 170;

/**
 * Move `current` toward `target` by an exponential ease over `dtMs`.
 * Frame-rate independent; snaps to the target once it is within 0.5px/s.
 */
export function easeVelocity(current, target, dtMs, easeMs = GLIDE_EASE_MS) {
  const k = 1 - Math.exp(-Math.max(0, dtMs) / easeMs);
  const next = current + (target - current) * k;
  return Math.abs(target - next) < 0.5 ? target : next;
}

/** Target velocity {x,y} (px/s) for a set of held arrow names. Opposites cancel. */
export function targetVelocity(held, speedId) {
  const v = glideSpeed(speedId).pxPerSec;
  let x = 0, y = 0;
  for (const name of held) {
    const d = GLIDE_DIRS[name];
    if (d) { x += d.x; y += d.y; }
  }
  return { x: Math.sign(x) * v, y: Math.sign(y) * v };
}

/** Clamp a saved pad position (fractions of the stage) so it can never be lost
 *  off-screen; anything unusable falls back to null (the default corner). */
export function sanitisePadPos(pos) {
  if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) return null;
  return { x: Math.min(1, Math.max(0, pos.x)), y: Math.min(1, Math.max(0, pos.y)) };
}
