// Topology-preserving contour smoothing.
//
// contour.js walks the cracks *between* pixels, so two neighbouring cells
// trace the identical boundary from opposite sides and the finished picture
// has no hairline seams. That guarantee is also why every outline is axis
// aligned — and it is exactly why smoothing a cell at a time would be wrong.
// Round two neighbours independently and their shared border stops matching,
// which opens a gap straight down the middle of the picture.
//
// So a boundary is smoothed ONCE and both sides are handed the same polyline:
//
//   1. a lattice corner where three or more regions meet is a NODE
//   2. each traced ring is cut at its nodes into ARCS
//   3. an arc belongs to exactly two regions — one walks it forwards, the
//      other backwards — so it is keyed by its own points, smoothed once, and
//      cached
//   4. rings are rebuilt from cached arcs, reversed when walked the other way
//
// Sharing the arc IS the weld. Nothing is matched within a tolerance and
// nothing needs to be: the two sides are the same numbers.
//
// Two kinds of point are then held still inside an arc. Anything on the image
// frame, because moving it opens a gap at the edge of the picture; and a
// genuine corner, where two long straight runs meet, because a window frame
// should stay square while a one-pixel stair step rounds away.

/** Chaikin's corner-cutting fraction — the classic quarter. */
const CUT = 0.25;
/** Two passes reads as a curve; three starts visibly shrinking small cells. */
const ITERATIONS = 2;
/** A run this long is drawn detail rather than a quantisation stair step. */
const LONG_RUN = 3;
/** 2dp, rounded once on the shared arc so both sides read the same numbers. */
const PRECISION = 100;
/**
 * How far a simplified arc may stray from the smoothed one, in pixels.
 *
 * Corner cutting quadruples the vertex count, and most of what it produces is
 * a wobble of a fifth of a pixel either side of what is, after smoothing, a
 * straight diagonal — invisible under the outline stroke and enormously
 * expensive, since these paths are the bulk of a puzzle file. Run once on the
 * shared arc, so the two sides still come out identical.
 */
const TOLERANCE = 0.2;

/**
 * Lattice corners where three or more regions meet. Such a corner is shared by
 * more than one pair of cells, so it cannot belong to a single smoothed arc —
 * it stays put and the arcs meet there.
 */
function nodeTest(labels, width, height) {
  const at = (x, y) => (x < 0 || y < 0 || x >= width || y >= height ? -1 : labels[y * width + x]);
  return (x, y) => {
    const a = at(x - 1, y - 1);
    const b = at(x, y - 1);
    const c = at(x - 1, y);
    const d = at(x, y);
    let n = 1;
    if (b !== a) n++;
    if (c !== a && c !== b) n++;
    if (d !== a && d !== b && d !== c) n++;
    return n >= 3;
  };
}

/** Cuts one ring at its nodes. A ring with no node at all is a closed loop
 *  shared with exactly one neighbour — an island and the hole around it. */
function splitAtNodes(ring, isNode) {
  const n = ring.length / 2;
  const nodes = [];
  for (let i = 0; i < n; i++) if (isNode(ring[i * 2], ring[i * 2 + 1])) nodes.push(i);
  if (!nodes.length) return [{ closed: true, pts: ring.slice() }];

  const arcs = [];
  for (let k = 0; k < nodes.length; k++) {
    const from = nodes[k];
    const to = nodes[(k + 1) % nodes.length];
    const pts = [ring[from * 2], ring[from * 2 + 1]];
    let i = from;
    do {
      i = (i + 1) % n;
      pts.push(ring[i * 2], ring[i * 2 + 1]);
    } while (i !== to);
    arcs.push({ closed: false, pts });
  }
  return arcs;
}

const reversed = (pts) => {
  const out = [];
  for (let i = pts.length - 2; i >= 0; i -= 2) out.push(pts[i], pts[i + 1]);
  return out;
};

/**
 * One name for an arc regardless of which side is asking. The two regions walk
 * the same points in opposite directions, and a closed loop may additionally
 * start at a different corner, so the key is the smallest serialisation over
 * every rotation and both directions.
 */
function canonical(arc) {
  if (!arc.closed) {
    const fwd = arc.pts.join(',');
    const back = reversed(arc.pts).join(',');
    return fwd <= back ? { key: fwd, pts: arc.pts, flipped: false }
      : { key: back, pts: reversed(arc.pts), flipped: true };
  }

  // Closed: a traced ring is already a cycle and does not repeat its first
  // point, so every point here is a real one. Only rotations starting on the
  // smallest corner can win, and there is normally just one of those, so this
  // stays linear outside the rare pinch that visits a corner twice.
  const pts = arc.pts;
  const n = pts.length / 2;
  let bestX = Infinity;
  let bestY = Infinity;
  for (let i = 0; i < n; i++) {
    const x = pts[i * 2];
    const y = pts[i * 2 + 1];
    if (x < bestX || (x === bestX && y < bestY)) { bestX = x; bestY = y; }
  }

  let best = null;
  for (let start = 0; start < n; start++) {
    if (pts[start * 2] !== bestX || pts[start * 2 + 1] !== bestY) continue;
    for (const dir of [1, -1]) {
      const out = [];
      for (let k = 0; k < n; k++) {
        const i = ((start + dir * k) % n + n) % n;
        out.push(pts[i * 2], pts[i * 2 + 1]);
      }
      const key = out.join(',');
      if (best === null || key < best.key) best = { key, pts: out, dir, start };
    }
  }

  // Winding is not cosmetic here. contour.js emits every ring with the region
  // on its right, so an island comes out clockwise and the hole around it
  // anticlockwise, and the nonzero fill rule knocks the hole out for free.
  // Handing both sides the canonical loop in the SAME direction makes the
  // enclosing cell swallow the island whole. So when the canonical run goes
  // against this region's own traversal, hand it back reversed.
  return { key: `#${best.key}`, pts: best.pts, flipped: best.dir === -1, closed: true };
}

/** Collapses straight runs to their endpoints. Lossless, and identical from
 *  both sides because both see the same points. */
function dropCollinear(pts, closed) {
  const n = pts.length / 2;
  if (n < 3) return pts.slice();
  const out = [];
  const first = closed ? 0 : 1;
  const last = closed ? n - 1 : n - 2;
  if (!closed) out.push(pts[0], pts[1]);
  for (let i = first; i <= last; i++) {
    const p = ((i - 1) % n + n) % n;
    const q = (i + 1) % n;
    const cross = (pts[i * 2] - pts[p * 2]) * (pts[q * 2 + 1] - pts[i * 2 + 1])
      - (pts[i * 2 + 1] - pts[p * 2 + 1]) * (pts[q * 2] - pts[i * 2]);
    if (cross === 0) continue;
    out.push(pts[i * 2], pts[i * 2 + 1]);
  }
  if (!closed) out.push(pts[(n - 1) * 2], pts[(n - 1) * 2 + 1]);
  return out.length >= (closed ? 6 : 4) ? out : pts.slice();
}

/**
 * Which vertices must not move: anything sitting on the image frame, and any
 * corner where two long runs meet. Both tests read only the arc's own
 * geometry, so the two regions sharing it always agree.
 */
function pinnedIn(pts, closed, width, height) {
  const n = pts.length / 2;
  const onFrame = (i) => {
    const x = pts[i * 2];
    const y = pts[i * 2 + 1];
    return x === 0 || y === 0 || x === width || y === height;
  };
  const runLong = (a, b) =>
    Math.abs(pts[a * 2] - pts[b * 2]) + Math.abs(pts[a * 2 + 1] - pts[b * 2 + 1]) >= LONG_RUN;

  const pinned = new Array(n).fill(false);
  for (let i = 0; i < n; i++) {
    if (onFrame(i)) { pinned[i] = true; continue; }
    if (!closed && (i === 0 || i === n - 1)) { pinned[i] = true; continue; }
    const p = ((i - 1) % n + n) % n;
    const q = (i + 1) % n;
    if (runLong(p, i) && runLong(i, q)) pinned[i] = true;
  }
  return pinned;
}

/**
 * Ramer-Douglas-Peucker between two fixed ends: drops every point that is
 * within TOLERANCE of the chord.
 */
function decimate(pts, from, to, keepFlags) {
  if (to - from < 2) return;
  const ax = pts[from * 2];
  const ay = pts[from * 2 + 1];
  const dx = pts[to * 2] - ax;
  const dy = pts[to * 2 + 1] - ay;
  const len = Math.hypot(dx, dy);

  let worst = -1;
  let at = -1;
  for (let i = from + 1; i < to; i++) {
    const px = pts[i * 2] - ax;
    const py = pts[i * 2 + 1] - ay;
    // Degenerate chord (a closed loop back to its start) measures radially.
    const d = len === 0 ? Math.hypot(px, py) : Math.abs(px * dy - py * dx) / len;
    if (d > worst) { worst = d; at = i; }
  }
  if (worst <= TOLERANCE) return;
  keepFlags[at] = true;
  decimate(pts, from, at, keepFlags);
  decimate(pts, at, to, keepFlags);
}

/** Thins a smoothed arc, never touching a point that has to stay put. */
function simplify(pts, pinned, closed) {
  const n = pts.length / 2;
  if (n < 3) return pts;

  const keepFlags = pinned.slice();
  if (!closed) { keepFlags[0] = true; keepFlags[n - 1] = true; }
  const anchors = [];
  for (let i = 0; i < n; i++) if (keepFlags[i]) anchors.push(i);
  // A closed loop with nothing pinned has no ends to work between; two points
  // opposite each other give the recursion something to bisect.
  if (closed && anchors.length < 2) {
    for (const i of [0, Math.floor(n / 2)]) if (!keepFlags[i]) { keepFlags[i] = true; anchors.push(i); }
    anchors.sort((a, b) => a - b);
  }

  for (let k = 0; k < anchors.length; k++) {
    const from = anchors[k];
    if (k + 1 < anchors.length) { decimate(pts, from, anchors[k + 1], keepFlags); continue; }
    // An open arc ends at its last anchor. A closed one does not: the run from
    // there wraps past the end of the array and round to the FIRST anchor, and
    // every point before that anchor lives in this run and nowhere else. Ending
    // at index 0 instead leaves them covered by no run at all, so they are all
    // dropped — which folds the polygon inside out and inverts its winding.
    if (!closed) break;
    const span = ((anchors[0] - from) + n) % n;
    const map = [];
    for (let i = 0; i <= span; i++) map.push((from + i) % n);
    const tail = [];
    for (const j of map) tail.push(pts[j * 2], pts[j * 2 + 1]);
    const tailKeep = new Array(map.length).fill(false);
    decimate(tail, 0, map.length - 1, tailKeep);
    for (let i = 1; i < map.length - 1; i++) if (tailKeep[i]) keepFlags[map[i]] = true;
  }

  const out = [];
  for (let i = 0; i < n; i++) if (keepFlags[i]) out.push(pts[i * 2], pts[i * 2 + 1]);
  return out.length >= 6 ? out : pts;
}

/** Chaikin corner cutting, holding the pinned vertices exactly where they are.
 *  An open arc's two ends are always pinned: they are the nodes it welds at. */
function chaikin(pts, pinned, closed) {
  let cur = pts;
  let keep = pinned;
  for (let pass = 0; pass < ITERATIONS; pass++) {
    const n = cur.length / 2;
    if (n < 3) break;
    const out = [];
    const next = [];
    const push = (x, y, k) => { out.push(x, y); next.push(k); };

    for (let i = 0; i < n; i++) {
      const cx = cur[i * 2];
      const cy = cur[i * 2 + 1];
      if (!closed && (i === 0 || i === n - 1)) { push(cx, cy, true); continue; }
      if (keep[i]) { push(cx, cy, true); continue; }
      const p = ((i - 1) % n + n) % n;
      const q = (i + 1) % n;
      push(cx + (cur[p * 2] - cx) * CUT, cy + (cur[p * 2 + 1] - cy) * CUT, false);
      push(cx + (cur[q * 2] - cx) * CUT, cy + (cur[q * 2 + 1] - cy) * CUT, false);
    }
    cur = out;
    keep = next;
  }
  return { pts: cur, pinned: keep };
}

const round = (pts) => pts.map((v) => Math.round(v * PRECISION) / PRECISION);

/**
 * @param {Int32Array|Uint16Array} labels  the region map the rings came from
 * @param {number} width
 * @param {number} height
 * @param {Map<number, number[][]>} ringsById  RAW traced rings per region id,
 *   straight off the crack lattice with no simplification applied — collinear
 *   dropping has to happen inside an arc, or it can swallow a node and leave
 *   the two sides of a boundary disagreeing about where it is cut.
 * @returns {Map<number, number[][]>} smoothed rings, welded across neighbours
 */
export function smoothRings(labels, width, height, ringsById) {
  const isNode = nodeTest(labels, width, height);
  const cache = new Map();
  const out = new Map();

  for (const [id, rings] of ringsById) {
    const smoothed = [];
    for (const ring of rings) {
      const arcs = splitAtNodes(ring, isNode);
      let rebuilt = [];
      for (const arc of arcs) {
        const c = canonical(arc);
        let done = cache.get(c.key);
        if (!done) {
          const simple = dropCollinear(c.pts, !!c.closed);
          const soft = chaikin(simple, pinnedIn(simple, !!c.closed, width, height), !!c.closed);
          done = round(simplify(soft.pts, soft.pinned, !!c.closed));
          cache.set(c.key, done);
        }
        const piece = c.flipped ? reversed(done) : done;
        // Consecutive arcs share the node between them, so drop the repeat.
        rebuilt.push(...(rebuilt.length ? piece.slice(2) : piece));
      }
      // An open chain of arcs closes back on its first node; a single closed
      // loop is already whole.
      if (arcs.length && !arcs[0].closed && rebuilt.length >= 4
        && rebuilt[0] === rebuilt[rebuilt.length - 2]
        && rebuilt[1] === rebuilt[rebuilt.length - 1]) {
        rebuilt = rebuilt.slice(0, -2);
      }
      if (rebuilt.length >= 6) smoothed.push(rebuilt);
    }
    out.set(id, smoothed);
  }
  return out;
}
