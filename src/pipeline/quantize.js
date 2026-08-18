// Median-cut colour quantisation with a few k-means refinement passes.
//
// Generated art is already mostly flat, but PNG encoders, upscalers and any
// residual soft shading leave thousands of near-identical colours behind. We
// collapse everything down to a small paint-tub palette so that connected
// component labelling has clean plateaus to work with.

// Squared redmean distance below which two palette entries are treated as the
// same paint. Roughly an RGB gap of 8 per channel — chosen for the margin it
// leaves above the closest legitimate same-image colour pair found while
// tuning this (two deliberately different demo-art tones ~454 apart): tight
// enough that nothing genuinely distinct gets swallowed, loose enough that a
// smooth photo gradient still stops at "two tubs side by side look
// identical" instead of stopping earlier and just looking flat. Was 1000
// (an ~11-per-channel gap) — a smooth gradient's number of surviving shades
// is bounded by its colour span divided by this step, not by maxColours, so
// raising the colour budget alone barely moved photos like a monochrome
// underwater scene; this is the knob that actually does.
const MERGE_DISTANCE = 600;

// A photographically-shaded subject — a bird's wing, a cluster of anemones —
// never repeats the same exact colour twice, so its pixels scatter across
// hundreds of histogram buckets, each too lightly populated to win a
// median-cut split against a flat region's few, heavily-populated buckets.
// The palette above can end up with nothing anywhere near it, however
// visually distinct it is on screen. RESCUE_ERROR is how far (in the same
// squared-redmean units as MERGE_DISTANCE) a pixel has to sit from its
// assigned tub before it counts as flat-out wrong rather than ordinary
// same-object shading noise. RESCUE_CEILING is the hard stop on how many
// tubs rescuing is allowed to add on top of maxColours — maxColours is a
// target once rescuing is in play, not a hard cap, because losing a real
// colour outright is worse than a slightly bigger tub tray.
const RESCUE_ERROR = 4000;
const RESCUE_CEILING = 40;

/**
 * Connected 4-neighbour blobs of pixels the current palette is getting badly
 * wrong, eroded by one pixel first so a thin anti-aliased halo around an
 * ordinary edge (which sits `bad` too, being a blend of two well-represented
 * colours) can't masquerade as a real subject — only a blob wide enough to
 * survive losing its outer ring can. Returns candidates sorted biggest first,
 * each the mean colour of its own (uneroded) pixels.
 */
function findSalientClusters(rgba, width, height, indices, palette, minArea) {
  const pixelCount = width * height;
  const bad = new Uint8Array(pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    const idx = indices[i];
    if (idx === 255) continue;
    const o = i * 4;
    const p = palette[idx];
    if (colourDistance(rgba[o], rgba[o + 1], rgba[o + 2], p[0], p[1], p[2]) > RESCUE_ERROR) {
      bad[i] = 1;
    }
  }

  const core = new Uint8Array(pixelCount);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!bad[i]) continue;
      if (x === 0 || x === width - 1 || y === 0 || y === height - 1) continue;
      if (bad[i - 1] && bad[i + 1] && bad[i - width] && bad[i + width]) core[i] = 1;
    }
  }

  const seen = new Uint8Array(pixelCount);
  const stack = new Int32Array(pixelCount);
  const clusters = [];
  for (let seed = 0; seed < pixelCount; seed++) {
    if (!core[seed] || seen[seed]) continue;

    let sp = 0;
    stack[sp++] = seed;
    seen[seed] = 1;
    let sumR = 0, sumG = 0, sumB = 0, area = 0;

    while (sp > 0) {
      const p = stack[--sp];
      const o = p * 4;
      sumR += rgba[o]; sumG += rgba[o + 1]; sumB += rgba[o + 2]; area++;
      const x = p % width;
      const y = (p - x) / width;
      if (x > 0 && core[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack[sp++] = p - 1; }
      if (x < width - 1 && core[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack[sp++] = p + 1; }
      if (y > 0 && core[p - width] && !seen[p - width]) { seen[p - width] = 1; stack[sp++] = p - width; }
      if (y < height - 1 && core[p + width] && !seen[p + width]) { seen[p + width] = 1; stack[sp++] = p + width; }
    }

    if (area >= minArea) clusters.push({ area, rgb: [sumR / area, sumG / area, sumB / area] });
  }

  clusters.sort((a, b) => b.area - a.area);
  return clusters;
}

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
 * @param {number} maxColours target, not a quota — indistinguishable entries
 *   are collapsed afterwards, so a four-colour image yields four tubs, and a
 *   spatially-contiguous cluster the result would otherwise badly misrender
 *   can still earn a tub past it (see RESCUE_CEILING above).
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

  // Every pixel to its nearest current tub — bucket-level, then broadcast to
  // pixels, since there are far fewer buckets than pixels. Reused below both
  // to decide what rescuing needs to fix and to compute the final indices.
  const assignPixels = (paletteArg) => {
    const lookup = new Uint8Array(BUCKETS).fill(255);
    for (const k of hist.ids) {
      const c = hist.count[k];
      const r = hist.sumR[k] / c;
      const g = hist.sumG[k] / c;
      const b = hist.sumB[k] / c;
      let best = 0;
      let bestD = Infinity;
      for (let p = 0; p < paletteArg.length; p++) {
        const d = colourDistance(r, g, b, paletteArg[p][0], paletteArg[p][1], paletteArg[p][2]);
        if (d < bestD) {
          bestD = d;
          best = p;
        }
      }
      lookup[k] = best;
    }

    const idx = new Uint8Array(pixelCount);
    for (let i = 0; i < pixelCount; i++) {
      const o = i * 4;
      idx[i] = rgba[o + 3] < 128 ? 255 : lookup[bucketOf(rgba[o], rgba[o + 1], rgba[o + 2])];
    }
    return idx;
  };

  // --- rescue salient minority colours ---------------------------------------
  if (palette.length < RESCUE_CEILING) {
    const preRescue = assignPixels(palette);
    const minArea = Math.max(24, Math.round(pixelCount * 0.00004));
    const clusters = findSalientClusters(rgba, width, height, preRescue, palette, minArea);

    for (const cluster of clusters) {
      if (palette.length >= RESCUE_CEILING) break;
      const [r, g, b] = cluster.rgb;
      const tooClose = palette.some(
        (p) => colourDistance(r, g, b, p[0], p[1], p[2]) < MERGE_DISTANCE,
      );
      if (tooClose) continue; // already covered by a tub added earlier this pass
      palette.push(cluster.rgb);
    }
  }

  // Drop palette slots that ended up owning nothing — including a rescued
  // one that, after every pixel got a fair shot at it, nothing preferred.
  const finalIndices = assignPixels(palette);
  const liveIds = new Set();
  for (const idx of finalIndices) if (idx !== 255) liveIds.add(idx);

  const remap = new Uint8Array(palette.length).fill(255);
  const compact = [];
  for (let p = 0; p < palette.length; p++) {
    if (!liveIds.has(p)) continue;
    remap[p] = compact.length;
    compact.push(palette[p].map((v) => Math.round(Math.min(255, Math.max(0, v)))));
  }

  const indices = new Uint8Array(pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    const v = finalIndices[i];
    indices[i] = v === 255 ? 255 : remap[v];
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
