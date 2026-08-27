// The Swap — give the colours back their names.
//
// The chapter's own minigame, and the one that makes painting a story stone
// play differently from free mode. Six colours you could not mistake for one
// another arrive each wearing the wrong name — not one of them will answer to
// itself — and you trade the names back, two at a time, until every colour is
// itself again. That is the whole crisis of the chapter in one board.
//
// Pure arithmetic and none of the drawing, so it runs in node the way
// overtime.js and points.js do: the colours, the shuffle that leaves nothing
// already right, and the swapping. game.js draws the board and runs the clock.
//
// It is Overtime's sibling, not its twin. Overtime SORTS a gradient by an axis
// the eye reads; the Swap MATCHES a name to a colour, which is knowledge rather
// than perception — a red is a red whatever the light. So the two never feel
// like the same round with a reskin.

export const PAIRS = 6;
export const COLS = 3; // the board is three swatches across, two down
export const SECONDS = 120;

// Unmistakable members of a family each, so the name is always judgeable by
// eye — the point is that you CAN tell which colour this is, and the horror is
// that it has forgotten. Fixed rather than drawn from the theme (Overtime does
// that): a themed "red" that came out magenta would make the one round in the
// game about names ambiguous about them.
export const COLOURS = [
  { name: 'Red', hex: '#d83a2e' },
  { name: 'Gold', hex: '#e3a52a' },
  { name: 'Green', hex: '#2f9e4f' },
  { name: 'Blue', hex: '#2f6fd6' },
  { name: 'Rose', hex: '#e56aa6' },
  { name: 'Violet', hex: '#7a45c0' },
];

// An `order` is swatch -> name: order[2] is the NAME index currently pinned to
// the third colour. Solved is the identity — colour i wears name i, its own.

export function isSolved(order) {
  return order.every((name, swatch) => name === swatch);
}

export function placedCount(order) {
  return order.reduce((n, name, swatch) => n + (name === swatch ? 1 : 0), 0);
}

/** Trades the names on two swatches. Pure: the caller keeps the old array. */
export function swap(order, i, j) {
  const next = [...order];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/**
 * A full derangement: NOT ONE colour starts wearing its own name. Overtime
 * allows a chunk or two to open already in place; the Swap must not, because
 * "every colour is wearing the wrong name" is the premise the how-to panel
 * states and the story the round tells — a red that opened already labelled Red
 * would quietly contradict both.
 *
 * `rng` is injectable so the tests can sweep it deterministically.
 */
export function scramble(n = PAIRS, rng = Math.random) {
  for (let tries = 0; tries < 80; tries++) {
    const order = [...Array(n).keys()];
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    if (placedCount(order) === 0) return order;
  }
  // A rotation is a derangement by construction — nothing is in its own slot —
  // so this always hands back something valid however unlucky the rng is.
  return [...Array(n).keys()].map((i) => (i + 1) % n);
}
