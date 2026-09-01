// Bonus-round perks — the boon a won round hands you for a stretch of painting.
//
// Free mode's five bonus rounds each grant a *perk*: for its next N fills, every
// cell you paint also lays down ONE more, chosen a different way per perk. This
// is the "every time you fill a cell, it also does X" the rounds were missing —
// points alone never felt like a reward you could feel.
//
// The perk itself (the charge count, the HUD pill, spending a charge) lives at
// the board in game.js — the same session-only shape as the old single Overtime
// perk. THIS module is only the pure question "given the cell just filled, which
// one more cell does this perk take?", so node can sweep every picker without a
// DOM. Each returns a cell to fill, or null when there is nothing to take (an
// edge cell with nothing below it, a colour already exhausted) — a null just
// means the perk sits this fill out, it does not spend a charge.

import { partnerFor } from './overtime.js';        // nearest same-colour twin — Overtime's original perk
import { distance } from './mixer.js';             // plain RGB distance, for the opposite colour

// One entry per perk. `mark` matches the round's own bonus-chip glyph so the
// pill reads as "the thing that round gave you". `blurb` is the toast line.
export const PERKS = {
  twin:     { name: 'Doubled Brush', mark: '◑', blurb: 'every fill takes its nearest twin with it' },
  overflow: { name: 'Overflow',      mark: '◒', blurb: 'every fill drips into the cell below' },
  contrast: { name: 'Contrast',      mark: '◧', blurb: 'every fill lays down its opposite colour' },
  bleed:    { name: 'Bleed',         mark: '⬗', blurb: 'every fill bleeds into a neighbour' },
  recall:   { name: 'Recall',        mark: '◇', blurb: 'every fill remembers a forgotten cell' },
};

export const PERK_KINDS = Object.keys(PERKS);

/** Paintable right now: a real cell, not already filled, not mid-burst. */
const open = (cell, filled, pending) => !!cell && !filled.has(cell.id) && !pending.has(cell.id);

/** Every cell that could still be painted, minus `from` itself. */
function openCells(cells, from, filled, pending) {
  return cells.filter((c) => c !== from && open(c, filled, pending));
}

/**
 * Overflow (Drip Catch): the cell directly below. "Below" is larger y (the
 * board's y grows downward). Among open cells lower than `from`, the one that
 * sits most nearly straight under it — horizontal drift is penalised hard so a
 * drip falls, it doesn't slide. Null near the floor, which is exactly a drip
 * running out of picture.
 */
export function pickBelow(cells, from, { filled, pending }) {
  const HORIZONTAL_PENALTY = 3; // a cell off to the side is 3× as "far" as one straight down
  let best = null;
  let bestScore = Infinity;
  for (const c of openCells(cells, from, filled, pending)) {
    const dy = c.anchor.y - from.anchor.y;
    if (dy <= 0) continue; // must be below
    const dx = Math.abs(c.anchor.x - from.anchor.x);
    const score = dx * HORIZONTAL_PENALTY + dy;
    if (score < bestScore) { bestScore = score; best = c; }
  }
  return best;
}

/**
 * Bleed (Colour Mixer): the nearest open cell of ANY colour — paint bleeding
 * into whatever region it touches. Like partnerFor without the colour filter.
 */
export function pickBleed(cells, from, { filled, pending }) {
  let best = null;
  let bestD = Infinity;
  for (const c of openCells(cells, from, filled, pending)) {
    const dx = c.anchor.x - from.anchor.x;
    const dy = c.anchor.y - from.anchor.y;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

/**
 * Contrast (Shade Match): an open cell of the colour most OPPOSITE the one just
 * laid down — maximum RGB distance across the palette. Ties break to the nearest,
 * so the opposite colour still lands somewhere you can see it. `palette` is the
 * puzzle palette (array of { hex }); cell.colour indexes it.
 */
export function pickContrast(cells, from, palette, { filled, pending }) {
  const fromHex = palette[from.colour]?.hex;
  if (!fromHex) return null;
  let best = null;
  let bestGap = -1;
  let bestD = Infinity;
  for (const c of openCells(cells, from, filled, pending)) {
    const hex = palette[c.colour]?.hex;
    if (!hex) continue;
    const gap = distance(fromHex, hex);
    const dx = c.anchor.x - from.anchor.x;
    const dy = c.anchor.y - from.anchor.y;
    const d = dx * dx + dy * dy;
    if (gap > bestGap + 1e-6 || (Math.abs(gap - bestGap) <= 1e-6 && d < bestD)) {
      bestGap = gap; bestD = d; best = c;
    }
  }
  return best;
}

/**
 * Recall (Palette Memory): a random open cell anywhere — a forgotten corner of
 * the picture, remembered. rng injected so tests are deterministic.
 */
export function pickRecall(cells, { filled, pending }, rng = Math.random) {
  // No `from` to exclude — the cell just filled is already in `filled`.
  const pool = cells.filter((c) => open(c, filled, pending));
  return pool.length ? pool[Math.floor(rng() * pool.length)] : null;
}

/**
 * The one dispatch the board calls: given a perk kind and the cell just filled,
 * hand back the extra cell to take (or null). `twin` reuses Overtime's own
 * partnerFor so the two stay identical.
 */
export function perkTarget(kind, cells, from, { filled, pending, palette, rng } = {}) {
  switch (kind) {
    case 'twin':     return partnerFor(cells, from, { colour: from.colour, filled, pending });
    case 'overflow': return pickBelow(cells, from, { filled, pending });
    case 'contrast': return pickContrast(cells, from, palette, { filled, pending });
    case 'bleed':    return pickBleed(cells, from, { filled, pending });
    case 'recall':   return pickRecall(cells, { filled, pending }, rng);
    default:         return null;
  }
}
