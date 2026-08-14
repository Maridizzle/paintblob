// The image -> puzzle pipeline, with no Node dependencies.
//
// Lives under src/ rather than tools/ because it runs in three places: the
// mapify CLI, the demo-art generator, and the app itself when you add a
// picture through the button. Keeping one implementation means an imported
// picture is identical however it got here.
//
// Everything downstream of this file is pure arithmetic over an RGBA buffer.
// Decoding is the caller's job — Node hands us pngjs/jpeg-js output, the
// renderer hands us pixels Chromium decoded.

import { quantize, denoiseIndices } from './quantize.js';
import { labelRegions, mergeSmallRegions, labelAnchor } from './regions.js';
import { boundsOf, traceRegion, ringsToPath } from './contour.js';
import { nameColour, toHex, uniquifyNames } from './colour-names.js';

export const DEFAULTS = {
  size: 768,        // working resolution on the long side
  maxColours: 14,   // paint tubs
  maxCells: 64,     // clickable regions
  minAreaFrac: 0.0016,
  denoise: 1,
};

/** Named presets for the in-app importer, which has no room for flags. */
export const DETAIL_PRESETS = {
  chunky: { maxColours: 10, maxCells: 34, minAreaFrac: 0.004 },
  normal: { maxColours: 14, maxCells: 64, minAreaFrac: 0.0016 },
  detailed: { maxColours: 18, maxCells: 110, minAreaFrac: 0.0007 },
};

/**
 * Box-filter downscale. Averaging beats nearest here: it kills stray pixels
 * before quantisation instead of promoting them to their own regions.
 */
export function resize(rgba, sw, sh, dw, dh) {
  if (sw === dw && sh === dh) return rgba;
  const out = new Uint8ClampedArray(dw * dh * 4);
  const xRatio = sw / dw;
  const yRatio = sh / dh;

  for (let y = 0; y < dh; y++) {
    const sy0 = Math.floor(y * yRatio);
    const sy1 = Math.max(sy0 + 1, Math.floor((y + 1) * yRatio));
    for (let x = 0; x < dw; x++) {
      const sx0 = Math.floor(x * xRatio);
      const sx1 = Math.max(sx0 + 1, Math.floor((x + 1) * xRatio));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let sy = sy0; sy < sy1 && sy < sh; sy++) {
        for (let sx = sx0; sx < sx1 && sx < sw; sx++) {
          const o = (sy * sw + sx) * 4;
          r += rgba[o]; g += rgba[o + 1]; b += rgba[o + 2]; a += rgba[o + 3];
          n++;
        }
      }
      const o = (y * dw + x) * 4;
      out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = a / n;
    }
  }
  return out;
}

export function buildPuzzle(rgba, srcW, srcH, opts = {}) {
  const o = { ...DEFAULTS, ...opts };

  const scale = Math.min(1, o.size / Math.max(srcW, srcH));
  const width = Math.max(1, Math.round(srcW * scale));
  const height = Math.max(1, Math.round(srcH * scale));
  const pixels = resize(rgba, srcW, srcH, width, height);

  const { palette, indices } = quantize(pixels, width, height, o.maxColours);
  const cleaned = o.denoise > 0
    ? denoiseIndices(indices, width, height, o.denoise, palette.length)
    : indices;

  const minArea = Math.max(48, Math.round(width * height * o.minAreaFrac));
  const merged = mergeSmallRegions(
    labelRegions(cleaned, width, height),
    width,
    height,
    { minArea, maxCells: o.maxCells },
  );

  const cells = [];
  for (let id = 0; id < merged.count; id++) {
    const bbox = boundsOf(merged.labels, width, height, id);
    if (!bbox) continue;
    const rings = traceRegion(merged.labels, width, height, id, bbox);
    if (!rings.length) continue;
    const anchor = labelAnchor(merged.labels, width, height, id, bbox);
    cells.push({
      c: merged.colours[id],
      x: Math.round(anchor.x * 10) / 10,
      y: Math.round(anchor.y * 10) / 10,
      r: Math.round(anchor.radius * 10) / 10,
      a: merged.areas[id],
      d: ringsToPath(rings),
    });
  }

  // Renumber the palette so tub 1 is the colour used by the most cells. Players
  // work top-down through the tubs, and starting on the dominant colour makes
  // the picture appear fastest — which is the whole hook.
  const usage = palette.map(() => 0);
  for (const cell of cells) usage[cell.c]++;

  const order = palette
    .map((_, i) => i)
    .filter((i) => usage[i] > 0)
    .sort((a, b) => usage[b] - usage[a]);

  const remap = new Map(order.map((from, to) => [from, to]));
  for (const cell of cells) cell.c = remap.get(cell.c);

  const names = uniquifyNames(order.map((i) => nameColour(palette[i])));

  return {
    width,
    height,
    palette: order.map((i, slot) => ({
      hex: toHex(palette[i]),
      name: names[slot],
      cells: usage[i],
    })),
    cells,
  };
}

/** Turns a title into a filesystem- and IPC-safe puzzle id. */
export function slugify(text, fallback = 'picture') {
  const slug = String(text).toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
  return slug || fallback;
}
