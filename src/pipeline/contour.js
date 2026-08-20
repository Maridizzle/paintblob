// Boundary tracing on the pixel-crack lattice.
//
// Contours run along the gaps *between* pixels rather than through pixel
// centres. That matters: two neighbouring cells trace the exact same crack
// from opposite sides, so their borders line up perfectly and the finished
// picture has no hairline seams. The cost is stair-stepped diagonals, which
// disappear under the outline stroke at display scale.
//
// Every edge is emitted with the region interior on its right-hand side (in
// y-down screen coordinates), so outer rings come out clockwise and holes come
// out anticlockwise. Canvas' default nonzero fill rule then knocks the holes
// out for free.

export function boundsOf(labels, width, height, id) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (labels[row + x] !== id) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x0 === Infinity ? null : [x0, y0, x1, y1];
}

/**
 * @param {boolean} simplify  collapse straight runs before returning. Off when
 *   the caller is about to smooth: dropping collinear points can swallow a
 *   corner where three regions meet, and smooth.js needs those to decide where
 *   one shared boundary ends and the next begins. It does its own dropping
 *   inside each arc instead, where it is safe.
 */
export function traceRegion(labels, width, height, id, bbox, simplify = true) {
  const [bx0, by0, bx1, by1] = bbox;
  const stride = width + 1;
  const at = (x, y) =>
    x < 0 || y < 0 || x >= width || y >= height ? -1 : labels[y * width + x];

  /** @type {Map<number, number[]>} start corner -> end corners */
  const edges = new Map();
  const push = (sx, sy, ex, ey) => {
    const k = sy * stride + sx;
    const v = ey * stride + ex;
    const list = edges.get(k);
    if (list) list.push(v);
    else edges.set(k, [v]);
  };

  for (let y = by0; y <= by1; y++) {
    for (let x = bx0; x <= bx1; x++) {
      if (at(x, y) !== id) continue;
      if (at(x, y - 1) !== id) push(x, y, x + 1, y);         // top,    →
      if (at(x + 1, y) !== id) push(x + 1, y, x + 1, y + 1); // right,  ↓
      if (at(x, y + 1) !== id) push(x + 1, y + 1, x, y + 1); // bottom, ←
      if (at(x - 1, y) !== id) push(x, y + 1, x, y);         // left,   ↑
    }
  }

  const rings = [];
  const starts = [...edges.keys()];

  for (const startKey of starts) {
    while (edges.get(startKey)?.length) {
      const ring = [];
      let current = startKey;
      let prevDx = 0;
      let prevDy = 0;

      for (let guard = 0; guard < 1 << 24; guard++) {
        const outgoing = edges.get(current);
        if (!outgoing || !outgoing.length) break;

        const cx = current % stride;
        const cy = (current - cx) / stride;

        // At a diagonal pinch two edges leave the same corner. Taking the
        // sharpest clockwise turn keeps the ring hugging this region instead
        // of hopping across the gap into the one touching it corner-to-corner.
        let pick = 0;
        if (outgoing.length > 1 && (prevDx || prevDy)) {
          let bestScore = -Infinity;
          outgoing.forEach((v, i) => {
            const nx = v % stride;
            const ny = (v - nx) / stride;
            const dx = nx - cx;
            const dy = ny - cy;
            const cross = prevDx * dy - prevDy * dx; // >0 is a clockwise turn
            const dot = prevDx * dx + prevDy * dy;
            const score = cross > 0 ? 2 : cross < 0 ? 0 : dot > 0 ? 1 : -1;
            if (score > bestScore) {
              bestScore = score;
              pick = i;
            }
          });
        }

        const nextKey = outgoing.splice(pick, 1)[0];
        if (!outgoing.length) edges.delete(current);

        const nx = nextKey % stride;
        const ny = (nextKey - nx) / stride;
        prevDx = nx - cx;
        prevDy = ny - cy;
        ring.push(cx, cy);
        current = nextKey;

        if (current === startKey) break;
      }

      if (ring.length >= 6) rings.push(simplify ? dropCollinear(ring) : ring);
    }
  }

  return rings;
}

/** Removes vertices that sit on a straight run. Lossless, so borders still match. */
function dropCollinear(flat) {
  const n = flat.length / 2;
  const out = [];
  for (let i = 0; i < n; i++) {
    const px = flat[((i - 1 + n) % n) * 2];
    const py = flat[((i - 1 + n) % n) * 2 + 1];
    const cx = flat[i * 2];
    const cy = flat[i * 2 + 1];
    const nx = flat[((i + 1) % n) * 2];
    const ny = flat[((i + 1) % n) * 2 + 1];
    if ((cx - px) * (ny - cy) - (cy - py) * (nx - cx) === 0) continue;
    out.push(cx, cy);
  }
  return out.length >= 6 ? out : flat;
}

/**
 * SVG path data. H/V shorthands roughly halve the emitted values versus L, and
 * these paths are the bulk of a puzzle file — so it is worth checking for them
 * even after smoothing, where most segments are no longer axis aligned but the
 * pinned runs along the image frame and through real corners still are.
 */
export function ringsToPath(rings) {
  const parts = [];
  for (const ring of rings) {
    const n = ring.length / 2;
    if (n < 3) continue;
    let d = `M${ring[0]} ${ring[1]}`;
    let px = ring[0];
    let py = ring[1];
    for (let i = 1; i < n; i++) {
      const x = ring[i * 2];
      const y = ring[i * 2 + 1];
      if (y === py) d += `H${x}`;
      else if (x === px) d += `V${y}`;
      else d += `L${x} ${y}`;
      px = x;
      py = y;
    }
    parts.push(`${d}Z`);
  }
  return parts.join('');
}
