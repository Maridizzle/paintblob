// Turn a per-pixel palette-index map into a small set of big, clickable cells.
//
// Raw connected components off a quantised image produce hundreds of slivers.
// A paint-by-number toy wants a few dozen fat regions, so everything below the
// area threshold is absorbed into whichever neighbour it shares the most
// border with. Merging is done with union-find so relabelling stays cheap.

export function labelRegions(indices, width, height) {
  const labels = new Int32Array(width * height).fill(-1);
  const stack = new Int32Array(width * height);
  const colours = [];
  const areas = [];
  let next = 0;

  for (let seed = 0; seed < labels.length; seed++) {
    if (labels[seed] !== -1) continue;
    const colour = indices[seed];
    if (colour === 255) continue; // transparent: not part of the picture

    const id = next++;
    colours.push(colour);
    let area = 0;

    let sp = 0;
    stack[sp++] = seed;
    labels[seed] = id;

    while (sp > 0) {
      const p = stack[--sp];
      area++;
      const x = p % width;
      const y = (p - x) / width;

      // 4-connectivity. 8-connectivity lets regions leak through diagonal
      // pinch points, which produces cells that look disconnected to a player.
      if (x > 0 && labels[p - 1] === -1 && indices[p - 1] === colour) {
        labels[p - 1] = id;
        stack[sp++] = p - 1;
      }
      if (x < width - 1 && labels[p + 1] === -1 && indices[p + 1] === colour) {
        labels[p + 1] = id;
        stack[sp++] = p + 1;
      }
      if (y > 0 && labels[p - width] === -1 && indices[p - width] === colour) {
        labels[p - width] = id;
        stack[sp++] = p - width;
      }
      if (y < height - 1 && labels[p + width] === -1 && indices[p + width] === colour) {
        labels[p + width] = id;
        stack[sp++] = p + width;
      }
    }
    areas.push(area);
  }

  return { labels, colours, areas, count: next };
}

function buildAdjacency(labels, width, height, count) {
  const adj = Array.from({ length: count }, () => new Map());
  const bump = (a, b) => {
    adj[a].set(b, (adj[a].get(b) || 0) + 1);
    adj[b].set(a, (adj[b].get(a) || 0) + 1);
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      const a = labels[p];
      if (a < 0) continue;
      if (x < width - 1) {
        const b = labels[p + 1];
        if (b >= 0 && b !== a) bump(a, b);
      }
      if (y < height - 1) {
        const b = labels[p + width];
        if (b >= 0 && b !== a) bump(a, b);
      }
    }
  }
  return adj;
}

/**
 * Absorbs undersized regions into neighbours until every surviving cell is at
 * least `minArea` pixels and there are no more than `maxCells` of them.
 */
export function mergeSmallRegions(labelling, width, height, { minArea, maxCells }) {
  const { labels, colours, areas, count } = labelling;
  if (count === 0) return { ...labelling, order: [] };

  const parent = new Int32Array(count);
  for (let i = 0; i < count; i++) parent[i] = i;
  const area = Int32Array.from(areas);
  const colour = Int32Array.from(colours);
  const adj = buildAdjacency(labels, width, height, count);

  const find = (i) => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };

  let live = count;

  const union = (a, b) => {
    a = find(a);
    b = find(b);
    if (a === b) return b;
    // Keep the larger region as the survivor so it also keeps its colour.
    if (area[a] > area[b]) [a, b] = [b, a];

    parent[a] = b;
    area[b] += area[a];
    live--;

    // Small-to-large map merging keeps total work near linear.
    let from = adj[a];
    let into = adj[b];
    if (from.size > into.size) {
      [from, into] = [into, from];
      adj[b] = into;
    }
    for (const [other, shared] of from) {
      const root = find(other);
      if (root === b) continue;
      into.set(root, (into.get(root) || 0) + shared);
      adj[root].set(b, (adj[root].get(b) || 0) + shared);
    }
    into.delete(a);
    into.delete(b);
    adj[a] = null;
    return b;
  };

  const bestNeighbour = (root) => {
    let best = -1;
    let bestShared = -1;
    for (const [other, shared] of adj[root]) {
      const r = find(other);
      if (r === root) continue;
      if (shared > bestShared) {
        bestShared = shared;
        best = r;
      }
    }
    return best;
  };

  // Pass 1: dissolve everything under the size floor.
  for (let guard = 0; guard < 64; guard++) {
    const tiny = [];
    for (let i = 0; i < count; i++) {
      if (find(i) !== i) continue;
      if (area[i] < minArea) tiny.push(i);
    }
    if (!tiny.length) break;
    tiny.sort((a, b) => area[a] - area[b]);

    let merged = 0;
    for (const r of tiny) {
      if (find(r) !== r || area[r] >= minArea) continue;
      const target = bestNeighbour(r);
      if (target < 0) continue;
      union(r, target);
      merged++;
    }
    if (!merged) break;
  }

  // Pass 2: enforce the cell budget by eating the smallest survivors.
  while (live > maxCells) {
    let smallest = -1;
    for (let i = 0; i < count; i++) {
      if (find(i) !== i) continue;
      if (smallest < 0 || area[i] < area[smallest]) smallest = i;
    }
    if (smallest < 0) break;
    const target = bestNeighbour(smallest);
    if (target < 0) break;
    union(smallest, target);
  }

  // Compact into a dense 0..n-1 labelling, ordered largest first.
  const survivors = [];
  for (let i = 0; i < count; i++) if (find(i) === i) survivors.push(i);
  survivors.sort((a, b) => area[b] - area[a]);

  const dense = new Int32Array(count).fill(-1);
  survivors.forEach((root, i) => {
    dense[root] = i;
  });

  const out = new Int32Array(labels.length);
  for (let i = 0; i < labels.length; i++) {
    out[i] = labels[i] < 0 ? -1 : dense[find(labels[i])];
  }

  return {
    labels: out,
    count: survivors.length,
    colours: survivors.map((r) => colour[r]),
    areas: survivors.map((r) => area[r]),
  };
}

/**
 * Pole of inaccessibility via a two-pass chamfer distance transform: the point
 * furthest from any edge of the region. A plain centroid falls outside
 * crescent- or ring-shaped cells, which would strand the number off the shape.
 */
export function labelAnchor(labels, width, height, id, bbox) {
  const [x0, y0, x1, y1] = bbox;
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const dist = new Float32Array(w * h);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      dist[y * w + x] = labels[(y + y0) * width + (x + x0)] === id ? Infinity : 0;
    }
  }

  const D1 = 1;
  const D2 = Math.SQRT2;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (dist[i] === 0) continue;
      let d = dist[i];
      if (y > 0) d = Math.min(d, dist[i - w] + D1);
      if (x > 0) d = Math.min(d, dist[i - 1] + D1);
      if (y > 0 && x > 0) d = Math.min(d, dist[i - w - 1] + D2);
      if (y > 0 && x < w - 1) d = Math.min(d, dist[i - w + 1] + D2);
      // Region pixels touching the image border are open, not enclosed, so
      // seed them from the frame edge to keep anchors away from the rim.
      if (x + x0 === 0 || y + y0 === 0) d = Math.min(d, D1);
      dist[i] = d;
    }
  }

  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (dist[i] === 0) continue;
      let d = dist[i];
      if (y < h - 1) d = Math.min(d, dist[i + w] + D1);
      if (x < w - 1) d = Math.min(d, dist[i + 1] + D1);
      if (y < h - 1 && x < w - 1) d = Math.min(d, dist[i + w + 1] + D2);
      if (y < h - 1 && x > 0) d = Math.min(d, dist[i + w - 1] + D2);
      if (x + x0 === width - 1 || y + y0 === height - 1) d = Math.min(d, D1);
      dist[i] = d;
    }
  }

  let best = 0;
  let bx = x0;
  let by = y0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = dist[y * w + x];
      if (d > best) {
        best = d;
        bx = x + x0;
        by = y + y0;
      }
    }
  }
  return { x: bx + 0.5, y: by + 0.5, radius: best };
}
