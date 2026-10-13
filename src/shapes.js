// Shapes: the maths behind the "Creativist" achievements, which are judged on
// WHICH cells you fill and in what ORDER, not on how many. Pure (no DOM), so the
// whole thing runs in node tests.
//
// A shape is a predicate over a cell anchor point in the picture's own pixel
// space. A shape achievement fires when the player has filled (nearly) every
// cell inside the shape and (nearly) nothing outside it. `prepareShape` does the
// per-picture work once; `shapeMatches` is then cheap enough to call after every
// fill.

// How much of the picture's shorter side a middle shape spans.
export const SHAPE_SPAN = 0.6;
// Fewer cells than this inside a shape and it is too easy to hit by accident.
export const MIN_SHAPE_CELLS = 12;
// A shape counts once this share of its cells is filled ...
export const MIN_SHAPE_FILLED = 0.85;
// ... and no more than this share of everything filled sits outside it.
export const MAX_OUTSIDE = 0.05;

function inPolygon(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (((yi > y) !== (yj > y)) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const STAR = (() => {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 1 : 0.4;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  return pts;
})();
const TRIANGLE = [[0, -1], [1, 0.85], [-1, 0.85]];
const BOLT = [[0.25, -1], [-0.55, 0.1], [-0.05, 0.1], [-0.3, 1], [0.6, -0.2], [0.05, -0.2], [0.55, -1]];

// Unit-square predicates: x and y are in [-1, 1], y pointing DOWN (canvas space).
const UNIT = {
  // The classic implicit heart, flipped to canvas orientation and scaled to fit.
  heart: (x, y) => {
    const hx = x * 1.2;
    const hy = -y * 1.2 + 0.1;
    return (hx * hx + hy * hy - 1) ** 3 - hx * hx * hy ** 3 <= 0;
  },
  disc: (x, y) => x * x + y * y <= 1,
  ring: (x, y) => { const r = x * x + y * y; return r <= 1 && r >= 0.3; },
  diamond: (x, y) => Math.abs(x) + Math.abs(y) <= 1,
  plus: (x, y) => (Math.abs(x) <= 0.34 && Math.abs(y) <= 1) || (Math.abs(y) <= 0.34 && Math.abs(x) <= 1),
  triangle: (x, y) => inPolygon(x, y, TRIANGLE),
  star: (x, y) => inPolygon(x, y, STAR),
  moon: (x, y) => x * x + y * y <= 1 && (x - 0.5) ** 2 + y * y > 0.64,
  bolt: (x, y) => inPolygon(x, y, BOLT),
};

/** The middle-of-the-picture shapes, by achievement id. */
export const SHAPE_ACHIEVEMENTS = {
  'shape-heart': 'heart',
  'shape-disc': 'disc',
  'shape-ring': 'ring',
  'shape-diamond': 'diamond',
  'shape-plus': 'plus',
  'shape-triangle': 'triangle',
  'shape-star': 'star',
  'shape-moon': 'moon',
  'shape-bolt': 'bolt',
};

// A full-width (or full-height) band through the middle, for the clean line.
const LINE_BAND = 0.03;

/** Region predicates in picture pixels: (ax, ay, width, height) => boolean. */
function region(name) {
  if (name === 'line-h') return (ax, ay, w, h) => Math.abs(ay - h / 2) <= LINE_BAND * h;
  if (name === 'line-v') return (ax, ay, w) => Math.abs(ax - w / 2) <= LINE_BAND * w;
  const unit = UNIT[name];
  if (!unit) throw new Error(`unknown shape: ${name}`);
  return (ax, ay, w, h) => {
    const radius = (SHAPE_SPAN * Math.min(w, h)) / 2;
    return unit((ax - w / 2) / radius, (ay - h / 2) / radius);
  };
}

/**
 * Work out, once per picture, which cell ids sit inside a shape.
 * @param {string} name  a shape name, or 'line-h' / 'line-v'
 * @param {{id:number, anchor:{x:number,y:number}}[]} cells
 * @returns {{name:string, inIds:Set<number>}|null}  null when the picture is too
 *   coarse for the shape to hold MIN_SHAPE_CELLS cells
 */
export function prepareShape(name, cells, width, height) {
  const inside = region(name);
  const inIds = new Set();
  for (const c of cells) if (inside(c.anchor.x, c.anchor.y, width, height)) inIds.add(c.id);
  return inIds.size >= MIN_SHAPE_CELLS ? { name, inIds } : null;
}

/** Has the player filled this shape, and (nearly) nothing else? */
export function shapeMatches(prepared, filled) {
  if (!prepared || filled.size < MIN_SHAPE_CELLS) return false;
  let inside = 0;
  for (const id of prepared.inIds) if (filled.has(id)) inside++;
  if (inside / prepared.inIds.size < MIN_SHAPE_FILLED) return false;
  const outside = filled.size - inside;
  return outside <= MAX_OUTSIDE * filled.size;
}

/** The shape names to test for a picture: every middle shape plus both lines. */
export const ALL_SHAPE_NAMES = [...Object.values(SHAPE_ACHIEVEMENTS), 'line-h', 'line-v'];

/** Prepare every shape for a picture (skipping any it is too coarse for). */
export function prepareAllShapes(cells, width, height) {
  const out = {};
  for (const name of ALL_SHAPE_NAMES) {
    const p = prepareShape(name, cells, width, height);
    if (p) out[name] = p;
  }
  return out;
}

/** Which shape achievement ids the current fill satisfies. */
export function matchedShapeIds(prepared, filled) {
  const ids = [];
  for (const [id, name] of Object.entries(SHAPE_ACHIEVEMENTS)) {
    if (shapeMatches(prepared[name], filled)) ids.push(id);
  }
  if (shapeMatches(prepared['line-h'], filled) || shapeMatches(prepared['line-v'], filled)) ids.push('shape-line');
  return ids;
}

/* ------------------------------------------------------------------ order */

// The order rules judge a FINISHED picture of at least this many cells.
export const MIN_ORDER_CELLS = 100;
// How steady a left-to-right (or in, or out) pass has to be, 0..1.
export const MIN_ORDER_CORRELATION = 0.8;

function ranks(values) {
  const idx = values.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const out = new Array(values.length);
  for (let i = 0; i < idx.length;) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avg = (i + j) / 2;
    for (let k = i; k <= j; k++) out[idx[k][1]] = avg;
    i = j + 1;
  }
  return out;
}

/** Spearman rank correlation of fill order against a per-cell number. */
export function orderCorrelation(orderedIds, metricOf) {
  const n = orderedIds.length;
  if (n < 3) return 0;
  const rx = ranks(orderedIds.map((_, i) => i));
  const ry = ranks(orderedIds.map((id) => metricOf(id)));
  const mean = (n - 1) / 2;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const a = rx[i] - mean;
    const b = ry[i] - mean;
    num += a * b; dx += a * a; dy += b * b;
  }
  return dx && dy ? num / Math.sqrt(dx * dy) : 0;
}

/**
 * Which order achievements a finished picture earns.
 * @param {number[]} orderedIds  every cell id, in the order it was filled
 * @param {{id:number, colour:number, area:number, anchor:{x:number,y:number},
 *          bounds?:{x0:number,y0:number,x1:number,y1:number}}[]} cells
 * @returns {string[]} achievement ids
 */
export function orderAchievements(orderedIds, cells, width, height) {
  const byId = new Map(cells.map((c) => [c.id, c]));
  const n = cells.length;
  if (orderedIds.length !== n || orderedIds.some((id) => !byId.has(id))) return [];
  const earned = [];

  // One colour at a time works on any size of picture, so long as there is more
  // than one colour to take turns with.
  const colours = orderedIds.map((id) => byId.get(id).colour);
  const seen = new Set();
  let runs = 0, ok = true, prev;
  for (const c of colours) {
    if (c === prev) continue;
    if (seen.has(c)) { ok = false; break; }
    seen.add(c); runs++; prev = c;
  }
  if (ok && runs >= 3) earned.push('order-colour');

  if (n < MIN_ORDER_CELLS) return earned;

  const dist = (id) => {
    const a = byId.get(id).anchor;
    return Math.hypot(a.x - width / 2, a.y - height / 2);
  };
  const inward = orderCorrelation(orderedIds, dist);
  if (inward <= -MIN_ORDER_CORRELATION) earned.push('order-in');
  if (inward >= MIN_ORDER_CORRELATION) earned.push('order-out');
  if (orderCorrelation(orderedIds, (id) => byId.get(id).anchor.x) >= MIN_ORDER_CORRELATION) earned.push('order-sweep');
  if (orderCorrelation(orderedIds, (id) => byId.get(id).anchor.y) >= MIN_ORDER_CORRELATION) earned.push('order-curtain');

  // The twenty smallest / biggest cells come first, as a set (ties allowed).
  const FIRST = 20;
  const areas = cells.map((c) => c.area).sort((a, b) => a - b);
  const smallCut = areas[FIRST - 1];
  const bigCut = areas[n - FIRST];
  const head = orderedIds.slice(0, FIRST).map((id) => byId.get(id).area);
  if (head.every((a) => a <= smallCut)) earned.push('order-small');
  if (head.every((a) => a >= bigCut)) earned.push('order-big');

  // Every edge cell before any other cell.
  const tol = 0.01;
  const edge = cells.filter((c) => c.bounds
    && (c.bounds.x0 <= tol * width || c.bounds.y0 <= tol * height
      || c.bounds.x1 >= (1 - tol) * width || c.bounds.y1 >= (1 - tol) * height));
  if (edge.length >= MIN_SHAPE_CELLS && edge.length < n) {
    const edgeIds = new Set(edge.map((c) => c.id));
    if (orderedIds.slice(0, edge.length).every((id) => edgeIds.has(id))) earned.push('order-border');
  }

  // The whole left half before any of the right.
  const left = cells.filter((c) => c.anchor.x < width / 2);
  if (left.length >= MIN_SHAPE_CELLS && left.length < n) {
    const leftIds = new Set(left.map((c) => c.id));
    if (orderedIds.slice(0, left.length).every((id) => leftIds.has(id))) earned.push('order-half');
  }
  return earned;
}
