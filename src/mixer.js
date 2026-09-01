// Colour Mixer — mix drops to match a target.
//
// A swatch to hit, five base paints, and a well. Each drop of a base pulls the
// mix toward that base's colour; land inside the target's tolerance before the
// clock and it's a match. It's the most paintblob of the bonus rounds — the
// whole game is a small lesson in what one colour plus another makes.
//
// This module is the colour arithmetic and none of the board: the bases, the
// mix (a drop-weighted average in RGB — not physically subtractive, but it reads
// exactly the way a child expects "red and yellow makes orange" to), the target
// generator (always a real mix of the bases, so every round is reachable), and
// the tolerance the eye is judged against. Pure, so node can sweep it.

// Vivid, well-spread bases with white and black for tint and shade. One token
// each, the squirrel-idiom way, so the drips draw themselves.
export const BASES = [
  { name: 'Red', hex: '#e23b3b' },
  { name: 'Yellow', hex: '#f2c94c' },
  { name: 'Blue', hex: '#3b6fe2' },
  { name: 'White', hex: '#f2f2f2' },
  { name: 'Black', hex: '#2a2530' },
];

export const SECONDS = 40;

// The most two colours may sit apart, in plain RGB distance (0..~441), and still
// count as a match. ~26 is a couple of shades of slack — enough that the mix need
// only be *close*, not pixel-exact, but tight enough that a lazy blob won't pass.
export const TOLERANCE = 26;

const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
const hex2 = (v) => clamp(v).toString(16).padStart(2, '0');

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
export function rgbToHex([r, g, b]) {
  return `#${hex2(r)}${hex2(g)}${hex2(b)}`;
}

/** Plain RGB Euclidean distance between two hexes. The eye is not linear in RGB,
 *  but for "are these the same paint" at this scale it is close enough, and it
 *  keeps the round honest without a lecture on colour spaces. */
export function distance(a, b) {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
}

/**
 * The current mix: a drop-weighted average of the bases. `counts` is parallel to
 * BASES. An empty well has no colour yet — returns null so the board can show it
 * blank rather than a made-up grey.
 */
export function mix(counts) {
  const total = counts.reduce((n, c) => n + c, 0);
  if (total <= 0) return null;
  const acc = [0, 0, 0];
  counts.forEach((c, i) => {
    if (!c) return;
    const rgb = hexToRgb(BASES[i].hex);
    acc[0] += rgb[0] * c;
    acc[1] += rgb[1] * c;
    acc[2] += rgb[2] * c;
  });
  return rgbToHex([acc[0] / total, acc[1] / total, acc[2] / total]);
}

export function within(mixHex, targetHex) {
  return mixHex != null && distance(mixHex, targetHex) <= TOLERANCE;
}

/**
 * A target that is always a genuine mix of the bases — two or three of them, a
 * few drops each — so a matching set of drops provably exists. Returns the hex
 * and the counts that made it (the board ignores the counts; the tests use them
 * to prove reachability).
 */
export function targetFrom(rng = Math.random) {
  const n = rng() < 0.5 ? 2 : 3;
  const idx = [];
  while (idx.length < n) {
    const i = Math.floor(rng() * BASES.length);
    if (!idx.includes(i)) idx.push(i);
  }
  const counts = BASES.map(() => 0);
  for (const i of idx) counts[i] = 1 + Math.floor(rng() * 3);
  return { hex: mix(counts), counts };
}
