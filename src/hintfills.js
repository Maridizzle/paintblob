// Hint fills: a second thing to spend hints on. A single hint still just flashes
// one cell (hints.js); a hint FILL spends a larger stack of hints to paint the
// next few cells of the colour in hand for you.
//
// The rules, all deliberate:
//   - It fills the BIGGEST unfilled cells of the held colour, the same rule a
//     plain hint uses to pick its flash, so the help lands somewhere worth it.
//   - It grants no points, no cell credit and no streak. Hints already come
//     from painting, and the shops are priced against the level curve, so a
//     fill must never become a way to turn hints into coins.
//   - It is one undo step, and undo hands the hints back.
//   - A frozen cell (a boss's lock) or one with a blob in flight is never taken.
//   - It never takes the last open cell, so the player always gets the final tap
//     and a fill can never be the move that finishes (and locks) the picture.
//
// Pure (no DOM) so it runs in node tests; game.js owns the panel and the paint.

/** The offers, cheapest first. `cost` is hints, `cells` is how many it fills. */
export const HINT_FILLS = [
  { id: 'fill-1', cost: 10, cells: 1, icon: '💧', label: 'Fill 1' },
  { id: 'fill-5', cost: 25, cells: 5, icon: '🖌️', label: 'Fill 5' },
  { id: 'fill-10', cost: 50, cells: 10, icon: '🪣', label: 'Fill 10' },
  { id: 'fill-15', cost: 75, cells: 15, icon: '🌊', label: 'Fill 15' },
  { id: 'fill-25', cost: 100, cells: 25, icon: '🌋', label: 'Fill 25' },
];

export function hintFillById(id) {
  return HINT_FILLS.find((f) => f.id === id) ?? null;
}

/**
 * What a fill costs when fewer cells than it normally fills are left to take:
 * the full price for a full fill, otherwise a fair share (rounded up, at least
 * one hint), so nobody pays for cells that were never there.
 */
export function hintFillCharge(def, available) {
  if (!def || !(available > 0)) return 0;
  if (available >= def.cells) return def.cost;
  return Math.max(1, Math.ceil((def.cost * available) / def.cells));
}

/** Cells still open to paint (not filled, none in flight), across every colour. */
export function openCellCount(cells, filled, pending) {
  let n = 0;
  for (const c of cells) if (!filled.has(c.id) && !pending.has(c.id)) n++;
  return n;
}

/**
 * The cells a fill would take: the biggest unfilled cells of `colour`, biggest
 * first (ties by id so it is stable), skipping any in flight or locked.
 *
 * A fill never takes the picture's LAST open cell (`reserve`, one by default),
 * so the player always gets the final tap. That also means a fill can never
 * finish the picture, which locks Undo, so a fill is always one the player can
 * take back for a refund.
 * @param {{id:number, colour:number, area:number}[]} cells
 * @param {Set<number>} filled
 * @param {Set<number>} pending   cells with a blob already in flight
 * @param {number} colour         the held colour (an index into the palette)
 * @param {number} n              how many to take
 * @param {(id:number)=>boolean} [isLocked]  a boss freeze, say
 * @param {number} [reserve]      open cells that must be left over
 */
export function pickFillCells(cells, filled, pending, colour, n, isLocked = () => false, reserve = 1) {
  if (!(colour >= 0) || !(n > 0)) return [];
  const cap = Math.min(n, openCellCount(cells, filled, pending) - reserve);
  if (cap <= 0) return [];
  return cells
    .filter((c) => c.colour === colour && !filled.has(c.id) && !pending.has(c.id) && !isLocked(c.id))
    .sort((a, b) => b.area - a.area || a.id - b.id)
    .slice(0, cap);
}

/** Can the player afford what is actually on the table? */
export function canAffordFill(stats, charge) {
  return charge > 0 && (stats.hints ?? 0) >= charge;
}
