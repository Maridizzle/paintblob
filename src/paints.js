// Special paints — shimmer / rainbow / multicolour. A purchased, limited-supply
// wildcard you lay over a cell: it OVERRIDES the cell's natural colour with an
// animation that never settles (the finished picture keeps moving, and Save
// image bakes whatever frame it is on). Buy packs with coins; each cell painted
// spends one from the supply.
//
// Pure on purpose (no DOM): the catalogue and the supply economy run in node
// tests, and `fxStops` — the per-frame gradient the board paints a cell with —
// is plain maths so both the live board and the snapshot bake share it and it
// can be checked without a canvas. `paints` on the save is the inventory
// (id → count remaining); a picture's per-cell assignments live on its progress
// entry (`progress[id].fx`), like `filled`.

export const PAINTS = [
  {
    id: 'rainbow',
    label: 'Rainbow',
    mark: '🌈',
    price: 40,
    pack: 25,
    blurb: 'The whole spectrum, rolling through the cell and never stopping.',
  },
  {
    id: 'shimmer',
    label: 'Shimmer',
    mark: '✨',
    price: 40,
    pack: 25,
    blurb: 'A pearly sheen that sweeps across the cell, over and over.',
  },
  {
    id: 'multi',
    label: 'Multicolour',
    mark: '🔮',
    price: 55,
    pack: 20,
    blurb: 'A shifting oil-slick — many hues at once, drifting like petrol on water.',
  },
];

const BY_ID = new Map(PAINTS.map((p) => [p.id, p]));

export const isPaint = (id) => BY_ID.has(id);
export const paintDef = (id) => BY_ID.get(id) ?? null;

/* --------------------------------------------------------------- inventory */

export function paintCount(save, id) {
  return save?.paints?.[id] ?? 0;
}

/** The paints the player owns at least one of, in catalogue order. */
export function ownedPaints(save) {
  return PAINTS.filter((p) => paintCount(save, p.id) > 0);
}

export function grantPaint(save, id, n = 1) {
  if (!isPaint(id) || !save) return;
  save.paints ??= {};
  save.paints[id] = (save.paints[id] ?? 0) + n;
}

/** Spend one from the supply. @returns {boolean} whether it actually happened. */
export function spendPaint(save, id) {
  if (paintCount(save, id) <= 0) return false;
  save.paints[id] -= 1;
  return true;
}

/* --------------------------------------------------------------- animation */

const wrapHue = (h) => ((h % 360) + 360) % 360;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * The gradient a cell is filled with at time `t` (ms), given a per-cell `phase`
 * (0..1, so neighbouring cells are out of step rather than pulsing as one). The
 * board lays these stops along the cell's bounding box; the same call bakes the
 * saved PNG, so a still frame matches exactly what was on screen.
 *
 * @returns {{stops: Array<[number, string]>}} ascending offset (0..1) → CSS colour.
 */
export function fxStops(id, t, phase = 0) {
  if (id === 'shimmer') return shimmerStops(t, phase);
  if (id === 'multi') return multiStops(t, phase);
  return rainbowStops(t, phase); // rainbow is the default/fallback
}

// A full spectrum laid across the cell, scrolling ~one turn every 3.2s.
function rainbowStops(t, phase) {
  const n = 6;
  const drift = t * 0.112 + phase * 360; // deg
  const stops = [];
  for (let i = 0; i <= n; i++) {
    const hue = wrapHue((i / n) * 360 + drift);
    stops.push([i / n, `hsl(${hue.toFixed(1)} 92% 56%)`]);
  }
  return { stops };
}

// An oil-slick: a narrower band of hues around a slowly-turning base, the
// lightness rippling so it reads as petrol-on-water rather than a flat rainbow.
function multiStops(t, phase) {
  const n = 6;
  const base = t * 0.045 + phase * 360;
  const stops = [];
  for (let i = 0; i <= n; i++) {
    const hue = wrapHue(base + (i / n) * 170);
    const light = 52 + 13 * Math.sin(i * 1.6 + t * 0.0038);
    stops.push([i / n, `hsl(${hue.toFixed(1)} 88% ${light.toFixed(1)}%)`]);
  }
  return { stops };
}

// A pearl ground with one bright band sweeping across it (~one pass every 2.6s).
function shimmerStops(t, phase) {
  const pearl = 'hsl(214 34% 82%)';
  const pos = ((t * 0.00038 + phase) % 1 + 1) % 1; // 0..1, the band centre
  const half = 0.16;
  // Offsets must stay ascending in [0,1]; the band is clamped to the ends.
  const raw = [
    [0, pearl],
    [clamp01(pos - half), pearl],
    [clamp01(pos), 'hsl(0 0% 100%)'],
    [clamp01(pos + half), pearl],
    [1, pearl],
  ];
  const stops = [];
  let last = -1;
  for (const [o, c] of raw) {
    const off = clamp01(o);
    if (off > last) { stops.push([off, c]); last = off; }
  }
  return { stops };
}
