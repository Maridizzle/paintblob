// Path parsing and hit testing. Imported by the renderer and by the Node-side
// verifier, so both agree on exactly what a cell's outline means.

/**
 * Parses the M/H/V/L/Z subset that tools/lib/contour.mjs emits.
 * @returns {Float64Array[]} one flat [x,y,x,y,...] ring per closed contour
 */
export function parsePath(d) {
  const rings = [];
  let ring = [];
  let x = 0;
  let y = 0;

  const flush = () => {
    if (ring.length >= 6) rings.push(Float64Array.from(ring));
    ring = [];
  };

  const re = /([MHVLZ])([-\d.\s,]*)/gi;
  let m;
  while ((m = re.exec(d))) {
    const cmd = m[1].toUpperCase();
    const nums = m[2].trim().split(/[\s,]+/).filter(Boolean).map(Number);
    switch (cmd) {
      case 'M':
        flush();
        [x, y] = nums;
        ring.push(x, y);
        break;
      case 'H':
        x = nums[0];
        ring.push(x, y);
        break;
      case 'V':
        y = nums[0];
        ring.push(x, y);
        break;
      case 'L':
        [x, y] = nums;
        ring.push(x, y);
        break;
      case 'Z':
        flush();
        break;
      default:
        break;
    }
  }
  flush();
  return rings;
}

export function ringsBounds(rings) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i += 2) {
      if (ring[i] < x0) x0 = ring[i];
      if (ring[i] > x1) x1 = ring[i];
      if (ring[i + 1] < y0) y0 = ring[i + 1];
      if (ring[i + 1] > y1) y1 = ring[i + 1];
    }
  }
  return { x0, y0, x1, y1 };
}

/** Nonzero winding test — matches how canvas fills these paths. */
export function pointInRings(rings, px, py) {
  let winding = 0;
  for (const ring of rings) {
    const n = ring.length / 2;
    for (let i = 0; i < n; i++) {
      const ax = ring[i * 2];
      const ay = ring[i * 2 + 1];
      const bx = ring[((i + 1) % n) * 2];
      const by = ring[((i + 1) % n) * 2 + 1];
      if (ay <= py) {
        if (by > py && (bx - ax) * (py - ay) - (px - ax) * (by - ay) > 0) winding++;
      } else if (by <= py && (bx - ax) * (py - ay) - (px - ax) * (by - ay) < 0) {
        winding--;
      }
    }
  }
  return winding !== 0;
}

/**
 * Prepares the runtime view of a puzzle: a Path2D for drawing, rings for hit
 * testing, bounds for broad-phase rejection, and the anchor-to-corner distance
 * the fill animation needs to know how far to flood.
 */
export function prepareCells(puzzle, Path2DImpl = globalThis.Path2D) {
  return puzzle.cells.map((cell, id) => {
    const rings = parsePath(cell.d);
    const b = ringsBounds(rings);
    const reach = Math.max(
      Math.hypot(cell.x - b.x0, cell.y - b.y0),
      Math.hypot(cell.x - b.x1, cell.y - b.y0),
      Math.hypot(cell.x - b.x0, cell.y - b.y1),
      Math.hypot(cell.x - b.x1, cell.y - b.y1),
    );
    return {
      id,
      colour: cell.c,
      anchor: { x: cell.x, y: cell.y },
      inradius: cell.r,
      area: cell.a,
      rings,
      bounds: b,
      reach,
      path: Path2DImpl ? new Path2DImpl(cell.d) : null,
    };
  });
}

export function cellAt(cells, px, py) {
  // Small cells sit on top of large ones visually, and are the ones a player
  // is aiming at, so prefer them when bounding boxes overlap.
  let hit = null;
  for (const cell of cells) {
    const b = cell.bounds;
    if (px < b.x0 || px > b.x1 || py < b.y0 || py > b.y1) continue;
    if (!pointInRings(cell.rings, px, py)) continue;
    if (!hit || cell.area < hit.area) hit = cell;
  }
  return hit;
}
