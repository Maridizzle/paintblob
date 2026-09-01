// Palette Memory — repeat the sequence.
//
// Four colour pads flash a pattern; play it back. Get it right and the next
// pattern is one longer. Simon, in paint. Cheap and familiar — the steady one in
// the set, a rest between the harder rounds.
//
// This module is only the sequence and the checking; the flashing, the taps and
// the clock live at the board. Pure, so node can sweep it.

export const PADS = 4;
export const SECONDS = 45;

/** The pattern length at a level: three to start, one longer each round. */
export function seqLength(level) {
  return 3 + level;
}

/** A fresh pattern for a level — random pads, repeats allowed (Simon does), so it
 *  can't be read off as "no two the same". */
export function buildSequence(level, rng = Math.random) {
  return Array.from({ length: seqLength(level) }, () => Math.floor(rng() * PADS));
}

/** Is what's been tapped so far a correct start of the pattern? (The board ends
 *  the round the moment this goes false.) */
export function prefixOk(seq, taps) {
  return taps.every((t, i) => t === seq[i]);
}

/** Tapped the whole pattern back, correctly. */
export function complete(seq, taps) {
  return taps.length === seq.length && prefixOk(seq, taps);
}
