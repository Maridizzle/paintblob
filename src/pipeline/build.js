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
import { smoothRings } from './smooth.js';
import { nameColour, toHex, uniquifyNames } from './colour-names.js';

export const DEFAULTS = {
  // 1400 rather than 900: working resolution is the floor on how fine a
  // shape can survive tracing, and 500 cells needs a lot more room to trace
  // validly than 110 did. Cost is linear-ish and still lands under 2s.
  size: 1400,
  maxColours: 30,   // paint tubs
  maxCells: 500,    // clickable regions
  minAreaFrac: 0.0001,
  denoise: 1,
  // Vibrance push before quantisation — see boostSaturation() below for why
  // this can run fairly hot without turning already-colourful areas neon.
  // 1 leaves colours untouched.
  saturate: 1.6,
  // Round the traced outlines. On by default because the lattice's stair steps
  // are an artefact of how tracing works rather than anything in the artwork;
  // off is for comparing against the hard-edged geometry when a boundary looks
  // wrong and the question is whether smoothing put it there.
  soften: true,
};

/**
 * Named presets for the in-app importer, which has no room for flags.
 *
 * `normal` now matches DEFAULTS: 500 cells is already well past the point
 * where every cell's number comfortably fits, so cells below the renderer's
 * legibility floor paint as a diagonal stripe of their own colour instead of
 * a number (see stripePattern in render.js) — the mechanism `insane` used to
 * be the only tier that needed. `detailed` and `insane` scale further past
 * that on the same ratio they always have over `normal`, for a picture busy
 * enough to want it. `chunky` stays deliberately minimal — raising it would
 * defeat its entire purpose as the "fewer, bigger cells" option.
 */
export const DETAIL_PRESETS = {
  chunky: { maxColours: 11, maxCells: 38, minAreaFrac: 0.0035 },
  normal: { maxColours: 30, maxCells: 500, minAreaFrac: 0.0001 },
  detailed: {
    maxColours: 32, maxCells: 650, minAreaFrac: 0.00007, size: 1600,
  },
  insane: {
    maxColours: 35, maxCells: 1200, minAreaFrac: 0.00004, size: 2000,
  },
};

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h / 6, s, l];
}

function hueToChannel(p, q, t) {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

function hslToRgb(h, s, l) {
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    hueToChannel(p, q, h + 1 / 3) * 255,
    hueToChannel(p, q, h) * 255,
    hueToChannel(p, q, h - 1 / 3) * 255,
  ];
}

/**
 * Vibrance boost, run right before quantisation so the palette picks up
 * richer colour rather than a photo's washed-out average.
 *
 * Works in HSL and only ever touches S, never H or L — an earlier version
 * pushed each RGB channel away from luma directly, which clips channels
 * unevenly once the push is strong enough to matter and quietly rotates the
 * hue (a pastel green anemone drifted towards red). Lifting S with a gamma
 * curve (S ** (1/factor)) can't rotate hue and self-limits: near-grey
 * shadow/rock/wall pixels — the ones that actually read as "muddy" — have
 * most of the curve's range to move through and jump several times over,
 * while pixels already vivid (S near 1) barely move, so nothing that was
 * already popping gets blown out to neon. A true zero-chroma pixel has no
 * hue to work with and is correctly left alone (0 ** anything is 0).
 * `factor` 1 is a no-op.
 */
export function boostSaturation(rgba, factor) {
  if (factor === 1) return rgba;
  const exponent = 1 / factor;
  const out = new Uint8ClampedArray(rgba);
  for (let i = 0; i < out.length; i += 4) {
    const [h, s, l] = rgbToHsl(out[i], out[i + 1], out[i + 2]);
    if (s === 0) continue;
    const [r, g, b] = hslToRgb(h, s ** exponent, l);
    out[i] = r;
    out[i + 1] = g;
    out[i + 2] = b;
  }
  return out;
}

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

  // The continuous-tone picture, cropped and scaled exactly like the puzzle
  // but read before despeckling and quantising touch it — for a caller that
  // wants to let a player compare their painted cells against the real
  // photo. Encoding it to a storable format is the caller's job: Node and
  // the browser have no image encoder in common, so it cannot be this
  // function's. despeckle() below always allocates a fresh output buffer
  // rather than writing back into `resized`, so handing out the reference
  // here is safe.
  const preview = { data: resized, width, height };

  // Strip grain before quantising, by however much this particular image
  // turns out to need. Flat art measures ~0 and is passed through untouched;
  // a photo of a drawing needs two or three passes before the quantiser can
  // see colour instead of noise. Measured after the downscale, since that has
  // already averaged some of it away.
  const grain = o.smooth ?? passesForGrain(estimateGrain(resized, width, height));
  const pixels = despeckle(resized, width, height, grain);
  const vivid = boostSaturation(pixels, o.saturate ?? 1);

  const { palette, indices } = quantize(vivid, width, height, o.maxColours);
  const cleaned = o.denoise > 0
    ? denoiseIndices(indices, width, height, o.denoise, palette.length)
    : indices;

  const minArea = Math.max(48, Math.round(width * height * o.minAreaFrac));
  const merged = mergeSmallRegions(
    labelRegions(cleaned, width, height),
    width,
    height,
    { minArea, maxCells: o.maxCells, palette },
  );

  // Trace everything first, then smooth in one pass over the whole map. It
  // cannot be done a region at a time: a boundary belongs to two cells, and
  // rounding it twice independently is what tears a seam open between them.
  const soften = o.soften !== false;
  const traced = new Map();
  const anchors = new Map();
  for (let id = 0; id < merged.count; id++) {
    const bbox = boundsOf(merged.labels, width, height, id);
    if (!bbox) continue;
    const rings = traceRegion(merged.labels, width, height, id, bbox, !soften);
    if (!rings.length) continue;
    traced.set(id, rings);
    anchors.set(id, labelAnchor(merged.labels, width, height, id, bbox));
  }

  const outlines = soften ? smoothRings(merged.labels, width, height, traced) : traced;

  const cells = [];
  for (const [id, rings] of outlines) {
    if (!rings.length) continue;
    const anchor = anchors.get(id);
    cells.push({
      c: merged.colours[id],
      x: Math.round(anchor.x * 10) / 10,
      y: Math.round(anchor.y * 10) / 10,
      r: Math.round(anchor.radius * 10) / 10,
      a: merged.areas[id],
      d: ringsToPath(rings),
    });
  }

  // Renumber the palette so tub 1 is the most vibrant colour, not whichever
  // happens to cover the most area — a huge flat wall of shadow or rock
  // shouldn't win first pick just because it's big. Vibrancy is saturation
  // discounted by distance from mid-lightness, so neither a near-black nor
  // a near-white tub can out-rank one with real, visible hue.
  const usage = palette.map(() => 0);
  for (const cell of cells) usage[cell.c]++;

  const vibrancy = palette.map(([r, g, b]) => {
    const [, s, l] = rgbToHsl(r, g, b);
    return s * (1 - Math.abs(l - 0.5) * 2);
  });

  const order = palette
    .map((_, i) => i)
    .filter((i) => usage[i] > 0)
    .sort((a, b) => vibrancy[b] - vibrancy[a]);

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
    preview,
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
