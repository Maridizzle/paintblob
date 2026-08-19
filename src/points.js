// Pure points economy + level curve. Mirrors hints.js's shape: a small
// grant/spend pair over a plain stats object, no DOM.
//
// Level is derived from lifetime pointsEarned via cumulativeForLevel rather
// than stored as its own field, so it can never drift out of sync with the
// number it is computed from.

export function grantPoints(stats, n = 1) {
  stats.points = (stats.points ?? 0) + n;
  stats.pointsEarned = (stats.pointsEarned ?? 0) + n;
}

/** @returns {boolean} whether the spend actually happened */
export function spendPoints(stats, cost) {
  if (!(stats.points >= cost)) return false;
  stats.points -= cost;
  return true;
}

/** Total lifetime points required to *reach* level n (n >= 1). Quadratic, so
 *  each level costs a bit more than the last — level 1 is free (0 points).
 *
 *  The coefficient sets the overall pace. It works alongside the ability
 *  unlock spread in abilities.js: those unlock one per level (L1..L8), so
 *  reaching a given ability is this curve's cost at that level. Kept light
 *  (55) because the one-per-level spread already does most of the pacing —
 *  bumping it hard would push the last ability out to a slog. */
export function cumulativeForLevel(n) {
  return 55 * n * (n - 1);
}

export function levelForPoints(pointsEarned) {
  let level = 1;
  while (cumulativeForLevel(level + 1) <= (pointsEarned ?? 0)) level++;
  return level;
}

/** For a level-progress bar: how far into the current level, and how wide it is. */
export function pointsIntoLevel(pointsEarned) {
  const level = levelForPoints(pointsEarned);
  return {
    level,
    into: (pointsEarned ?? 0) - cumulativeForLevel(level),
    span: cumulativeForLevel(level + 1) - cumulativeForLevel(level),
  };
}
