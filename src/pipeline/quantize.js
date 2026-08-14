// Median-cut colour quantisation with a few k-means refinement passes.
//
// Generated art is already mostly flat, but PNG encoders, upscalers and any
// residual soft shading leave thousands of near-identical colours behind. We
// collapse everything down to a small paint-tub palette so that connected
// component labelling has clean plateaus to work with.

// Squared redmean distance below which two palette entries are treated as the
// same paint. Roughly an RGB gap of 12 per channel — close enough that two
// tubs side by side look identical, which is confusing rather than expressive.
const MERGE_DISTANCE = 1000;

const BITS = 5; // 32 levels per channel -> 32768 histogram buckets
const SHIFT = 8 - BITS;
const SIDE = 1 << BITS;
const BUCKETS = SIDE * SIDE * SIDE;

const bucketOf = (r, g, b) =>
  ((r >> SHIFT) << (BITS * 2)) | ((g >> SHIFT) << BITS) | (b >> SHIFT);

// Redmean: a cheap approximation of perceptual distance that behaves far
// better than raw RGB euclidean around saturated reds and blues.
export function colourDistance(r1, g1, b1, r2, g2, b2) {
  const rMean = (r1 + r2) * 0.5;
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return (
    (((512 + rMean) * dr * dr) / 256) +
    4 * dg * dg +
    (((767 - rMean) * db * db) / 256)
  );
}

function buildHistogram(rgba, pixelCount) {
  const count = new Uint32Array(BUCKETS);
  const sumR = new Float64Array(BUCKETS);
  const sumG = new Float64Array(BUCKETS);
  const sumB = new Float64Array(BUCKETS);

  for (let i = 0; i < pixelCount; i++) {
    const o = i * 4;
    if (rgba[o + 3] < 128) continue; // transparent pixels never become cells
    const r = rgba[o];
    const g = rgba[o + 1];
    const b = rgba[o + 2];
    const k = bucketOf(r, g, b);
    count[k]++;
    sumR[k] += r;
    sumG[k] += g;
    sumB[k] += b;
  }

  const ids = [];
  for (let k = 0; k < BUCKETS; k++) if (count[k]) ids.push(k);
  return { count, sumR, sumG, sumB, ids };
}

function boxFrom(hist, ids) {
  let rMin = 255, gMin = 255, bMin = 255;
  let rMax = 0, gMax = 0, bMax = 0;
  let total = 0;

  for (const k of ids) {
    const c = hist.count[k];
    const r = hist.sumR[k] / c;
    const g = hist.sumG[k] / c;
    const b = hist.sumB[k] / c;
    if (r < rMin) rMin = r;
    if (r > rMax) rMax = r;
    if (g < gMin) gMin = g;
    if (g > gMax) gMax = g;
    if (b < bMin) bMin = b;
    if (b > bMax) bMax = b;
    total += c;
  }

  return {
    ids,
    total,
    ranges: [rMax - rMin, gMax - gMin, bMax - bMin],
    // Weighting by population as well as volume stops the algorithm from
    // spending all of its splits on a handful of stray anti-aliased pixels.
    priority: Math.max(rMax - rMin, gMax - gMin, bMax - bMin) * Math.cbrt(total),
  };
}

function splitBox(hist, box) {
  const axis = box.ranges.indexOf(Math.max(...box.ranges));
  const channel = axis === 0 ? hist.sumR : axis === 1 ? hist.sumG : hist.sumB;

  const sorted = box.ids
    .slice()
    .sort((a, b) => channel[a] / hist.count[a] - channel[b] / hist.count[b]);

  // Split at the population median rather than the midpoint of the range so
  // both halves carry a meaningful number of pixels.
  const half = box.total / 2;
  let running = 0;
  let cut = 1;
  for (let i = 0; i < sorted.length; i++) {
    running += hist.count[sorted[i]];
    if (running >= half) {
      cut = Math.min(Math.max(i, 1), sorted.length - 1);
      break;
    }
  }

  return [
    boxFrom(hist, sorted.slice(0, cut)),
    boxFrom(hist, sorted.slice(cut)),
  ];
}

function averageOf(hist, ids) {
  let r = 0, g = 0, b = 0, total = 0;
  for (const k of ids) {
    r += hist.sumR[k];
    g += hist.sumG[k];
    b += hist.sumB[k];
    total += hist.count[k];
  }
  if (!total) return [0, 0, 0];
  return [r / total, g / total, b / total];
}

/**
 * @param {number} maxColours upper bound, not a quota — indistinguishable
 *   entries are collapsed afterwards, so a four-colour image yields four tubs.
 * @returns {{ palette: number[][], indices: Uint8Array }}
 *   palette entries are [r,g,b] rounded to integers; indices holds one palette
 *   slot per pixel (255 marks a transparent pixel that belongs to no cell).
 */
export function quantize(rgba, width, height, maxColours) {
  const pixelCount = width * height;
  const hist = buildHistogram(rgba, pixelCount);

  if (hist.ids.length === 0) {
    return { palette: [[0, 0, 0]], indices: new Uint8Array(pixelCount).fill(255) };
  }

  // --- median cut -----------------------------------------------------------
  let boxes = [boxFrom(hist, hist.ids)];
  while (boxes.length < maxColours) {
    boxes.sort((a, b) => b.priority - a.priority);
    const target = boxes.find((box) => box.ids.length > 1);
    if (!target) break;
    boxes.splice(boxes.indexOf(target), 1, ...splitBox(hist, target));
  }

  let palette = boxes.map((box) => averageOf(hist, box.ids));

  // --- k-means refinement ---------------------------------------------------
  // Median cut lands close but its centroids sit at box averages, which drift
  // off the actual ink colours. A handful of Lloyd iterations over the
  // histogram (not the pixels) snaps them onto the real flats very cheaply.
  let weights = new Float64Array(palette.length);
  for (let pass = 0; pass < 6; pass++) {
    const accR = new Float64Array(palette.length);
    const accG = new Float64Array(palette.length);
    const accB = new Float64Array(palette.length);
    const accN = new Float64Array(palette.length);

    for (const k of hist.ids) {
      const c = hist.count[k];
      const r = hist.sumR[k] / c;
      const g = hist.sumG[k] / c;
      const b = hist.sumB[k] / c;

      let best = 0;
      let bestD = Infinity;
      for (let p = 0; p < palette.length; p++) {
        const d = colourDistance(r, g, b, palette[p][0], palette[p][1], palette[p][2]);
        if (d < bestD) {
          bestD = d;
          best = p;
        }
      }
      accR[best] += r * c;
      accG[best] += g * c;
      accB[best] += b * c;
      accN[best] += c;
    }

    let moved = 0;
    for (let p = 0; p < palette.length; p++) {
      if (!accN[p]) continue;
      const next = [accR[p] / accN[p], accG[p] / accN[p], accB[p] / accN[p]];
      moved += Math.abs(next[0] - palette[p][0]) +
        Math.abs(next[1] - palette[p][1]) +
        Math.abs(next[2] - palette[p][2]);
      palette[p] = next;
    }
    weights = accN;
    if (moved < 1) break;
  }

  // --- collapse indistinguishable tubs --------------------------------------
  // Median cut always splits until it has maxColours boxes, even when the
  // artwork only contains four colours. Left alone that hands the player
  // several paint tubs they cannot tell apart, and scatters one flat area
  // across two palette slots. maxColours is an upper bound, not a quota.
  for (let guard = 0; guard < palette.length; guard++) {
    let mergeA = -1;
    let mergeB = -1;
    let closest = Infinity;
    for (let i = 0; i < palette.length; i++) {
      for (let j = i + 1; j < palette.length; j++) {
        const d = colourDistance(
          palette[i][0], palette[i][1], palette[i][2],
          palette[j][0], palette[j][1], palette[j][2],
        );
        if (d < closest) {
          closest = d;
          mergeA = i;
          mergeB = j;
        }
      }
    }
    if (closest > MERGE_DISTANCE || mergeA < 0) break;

    const wa = weights[mergeA] || 1;
    const wb = weights[mergeB] || 1;
    palette[mergeA] = palette[mergeA].map((v, k) => (v * wa + palette[mergeB][k] * wb) / (wa + wb));
    weights[mergeA] = wa + wb;
    palette.splice(mergeB, 1);
    weights = weights.filter((_, i) => i !== mergeB);
  }

  // Drop palette slots that ended up owning nothing.
  const liveIds = new Set();
  const lookup = new Uint8Array(BUCKETS).fill(255);
  for (const k of hist.ids) {
    const c = hist.count[k];
    const r = hist.sumR[k] / c;
    const g = hist.sumG[k] / c;
    const b = hist.sumB[k] / c;
    let best = 0;
    let bestD = Infinity;
    for (let p = 0; p < palette.length; p++) {
      const d = colourDistance(r, g, b, palette[p][0], palette[p][1], palette[p][2]);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    lookup[k] = best;
    liveIds.add(best);
  }

  const remap = new Uint8Array(palette.length).fill(255);
  const compact = [];
  for (let p = 0; p < palette.length; p++) {
    if (!liveIds.has(p)) continue;
    remap[p] = compact.length;
    compact.push(palette[p].map((v) => Math.round(Math.min(255, Math.max(0, v)))));
  }

  const indices = new Uint8Array(pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    const o = i * 4;
    if (rgba[o + 3] < 128) {
      indices[i] = 255;
      continue;
    }
    indices[i] = remap[lookup[bucketOf(rgba[o], rgba[o + 1], rgba[o + 2])]];
  }

  return { palette: compact, indices };
}

/**
 * Mode filter. Replaces each pixel with the most common index in its
 * neighbourhood, which erases JPEG-ish speckle and dithering without rounding
 * off the big shapes the way a blur would.
 */
export function denoiseIndices(indices, width, height, radius = 1, paletteSize = 256) {
  const out = new Uint8Array(indices);
  const tally = new Uint16Array(paletteSize + 1);
  const TRANSPARENT = paletteSize;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      tally.fill(0);
      let best = -1;
      let bestCount = 0;

      for (let dy = -radius; dy <= radius; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const raw = indices[ny * width + nx];
          const slot = raw === 255 ? TRANSPARENT : raw;
          const c = ++tally[slot];
          if (c > bestCount) {
            bestCount = c;
            best = slot;
          }
        }
      }
      out[y * width + x] = best === TRANSPARENT ? 255 : best;
    }
  }
  return out;
}
