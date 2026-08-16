// Pure hint-economy logic: earning, spending, and picking a target cell to
// flash. No DOM, no canvas — game.js and render.js each own their half of
// what a hint actually looks like.

export const PASSIVE_HINT_INTERVAL = 15;

/** Called after stats.cells increments. Grants a hint every Nth cell. */
export function accruePassiveHint(stats) {
  if (stats.cells % PASSIVE_HINT_INTERVAL !== 0) return false;
  grantHints(stats, 1);
  return true;
}

export function grantHints(stats, n = 1) {
  stats.hints = (stats.hints ?? 0) + n;
  stats.hintsEarned = (stats.hintsEarned ?? 0) + n;
}

/** @returns {boolean} whether a hint was actually spent */
export function spendHint(stats) {
  if (!(stats.hints > 0)) return false;
  stats.hints--;
  stats.hintsUsed = (stats.hintsUsed ?? 0) + 1;
  return true;
}

/**
 * The biggest unfilled cell taking the held colour, so the flash lands
 * somewhere worth seeing rather than on a sliver. Falls back to the biggest
 * unfilled cell of any colour when nothing takes the one currently selected.
 */
export function pickHintTarget(cells, filled, selectedColour) {
  let bySelected = null;
  let anyColour = null;
  for (const cell of cells) {
    if (filled.has(cell.id)) continue;
    if (!anyColour || cell.area > anyColour.area) anyColour = cell;
    if (cell.colour === selectedColour && (!bySelected || cell.area > bySelected.area)) {
      bySelected = cell;
    }
  }
  return bySelected ?? anyColour;
}
