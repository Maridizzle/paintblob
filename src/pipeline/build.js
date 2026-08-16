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

import {
  estimateGrain, passesForGrain, despeckle, findContentBounds, cropTo,
} from './denoise.js';
import { quantize, denoiseIndices } from './quantize.js';
import { labelRegions, mergeSmallRegions, labelAnchor } from './regions.js';
import { boundsOf, traceRegion, ringsToPath } from './contour.js';
import { nameColour, toHex, uniquifyNames } from './colour-names.js';

export const DEFAULTS = {
  // 900 rather than 768: the working resolution sets the floor on how fine a
  // shape can survive tracing, so raising it is what actually buys detail.
  // Cost is linear-ish and still lands well under a second.
  size: 900,
  maxColours: 16,   // paint tubs
  maxCells: 90,     // clickable regions
  minAreaFrac: 0.0011,
  denoise: 1,
};

/**
 * Named presets for the in-app importer, which has no room for flags.
 *
 * The ceiling on chunky/normal/detailed is legibility, not the pipeline:
 * much past 150 cells the numbers stop fitting and you are hunting for
 * slivers rather than painting. `normal` is deliberately only a step up
 * from where it was.
 *
 * `insane` deliberately blows past that ceiling. A picture this fine has
 * cells too small for their number, so the renderer paints those as a
 * diagonal stripe of their own colour instead (see stripePattern in
 * render.js) — that is what keeps it paintable rather than illegible. The
 * bump to `size` matters more than usual here: working resolution is the
 * floor on how fine a shape survives tracing at all.
 */
export const DETAIL_PRESETS = {
  chunky: { maxColours: 11, maxCells: 38, minAreaFrac: 0.0035 },
  normal: { maxColours: 16, maxCells: 90, minAreaFrac: 0.0011 },
  detailed: { maxColours: 18, maxCells: 150, minAreaFrac: 0.00045 },
  insane: {
    maxColours: 20, maxCells: 280, minAreaFrac: 0.0002, size: 1200,
  },
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

  // Trim the desk, shadow or sketchbook edge out of a photograph first, so the
  // working resolution is spent on the artwork rather than on its surroundings.
  let source = { data: rgba, width: srcW, height: srcH };
  let cropped = false;
  if (o.crop !== false) {
    const bounds = findContentBounds(rgba, srcW, srcH);
    if (bounds.x0 > 0 || bounds.y0 > 0 || bounds.x1 < srcW - 1 || bounds.y1 < srcH - 1) {
      source = cropTo(rgba, srcW, bounds);
      cropped = true;
    }
  }

  const scale = Math.min(1, o.size / Math.max(source.width, source.height));
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const resized = resize(source.data, source.width, source.height, width, height);

  // Strip grain before quantising, by however much this particular image
  // turns out to need. Flat art measures ~0 and is passed through untouched;
  // a photo of a drawing needs two or three passes before the quantiser can
  // see colour instead of noise. Measured after the downscale, since that has
  // already averaged some of it away.
  const grain = o.smooth ?? passesForGrain(estimateGrain(resized, width, height));
  const pixels = despeckle(resized, width, height, grain);

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
    // Whether this looked like a photo of real artwork rather than flat
    // generated art — grain needed cleaning, or a border needed cropping.
    // Surfaced so the importer can credit bringing in something imperfect.
    photoLike: grain > 0 || cropped,
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
