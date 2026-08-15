// Undoing what a camera adds: grain, and the frame around the picture.
//
// Generated flat art has no noise: inside a region every pixel is identical.
// A photo or scan of real artwork is the opposite — paper texture, sensor
// noise and pencil grain mean neighbouring pixels differ by several levels
// everywhere. That breaks the pipeline in two compounding ways:
//
//   * Median cut splits boxes along whichever channel has the widest spread.
//     When grain is wider than the artwork's local colour change, it splits
//     along noise, and every centroid lands near the image's average — which
//     is why a vivid drawing comes back grey.
//
//   * Where a shallow gradient crosses a quantisation threshold, the boundary
//     follows the noise rather than the picture, producing the fractal
//     contours that look like tree rings.
//
// A median filter fixes both. Blur would too, but blurring across a real edge
// invents intermediate colours that then become their own sliver cell, so the
// filter has to be edge-preserving.

/**
 * Finds the artwork inside a photograph of it.
 *
 * A picture taken of paper carries the desk, a shadow, or the dark edge of a
 * sketchbook around the outside. Those become their own cells — a player ends
 * up painting the photographer's table. This walks in from each edge while the
 * rows are both much darker than the picture as a whole and flat enough to be
 * a border rather than part of the drawing.
 *
 * @returns {{x0:number, y0:number, x1:number, y1:number}} inclusive bounds
 */
export function findContentBounds(rgba, width, height) {
  const luma = (o) => 0.299 * rgba[o] + 0.587 * rgba[o + 1] + 0.114 * rgba[o + 2];

  // Reference brightness from the middle of the frame, which is where the
  // artwork is in any photo somebody bothered to take.
  const samples = [];
  for (let y = (height * 0.3) | 0; y < height * 0.7; y += 3) {
    for (let x = (width * 0.3) | 0; x < width * 0.7; x += 3) {
      samples.push(luma((y * width + x) * 4));
    }
  }
  samples.sort((a, b) => a - b);
  const reference = samples[samples.length >> 1] || 0;

  // Darkness alone cannot tell a shadow from a night sky — both are far darker
  // than the middle of their own picture. What separates them is that a border
  // *ends*: it is a thin band around the outside, while dark artwork carries on
  // into the picture. So a side is only cropped if its dark run stops before
  // this limit; a run that reaches the limit is treated as part of the drawing
  // and left completely alone.
  const threshold = Math.min(reference * 0.45, 55);
  const limitX = Math.floor(width * 0.12);
  const limitY = Math.floor(height * 0.12);

  const lineIsBorder = (get, count) => {
    let dark = 0;
    for (let i = 0; i < count; i++) if (get(i) < threshold) dark++;
    // Most of the line, not all: a border often has a lighter bevel or glare.
    return dark > count * 0.82;
  };

  /** Depth of the dark run inward from one side, or 0 if it never ends. */
  const runDepth = (limit, lineAt, count) => {
    let depth = 0;
    while (depth <= limit && lineIsBorder((i) => lineAt(depth, i), count)) depth++;
    return depth > limit ? 0 : depth; // reached the limit: artwork, not a frame
  };

  let x0 = runDepth(limitX, (d, i) => luma((i * width + d) * 4), height);
  let y0 = runDepth(limitY, (d, i) => luma((d * width + i) * 4), width);
  let x1 = width - 1 - runDepth(limitX, (d, i) => luma((i * width + (width - 1 - d)) * 4), height);
  let y1 = height - 1 - runDepth(limitY, (d, i) => luma(((height - 1 - d) * width + i) * 4), width);

  // A couple more pixels past the last dark row, since borders fade rather
  // than stop and the transition would otherwise survive as a thin cell.
  const pad = Math.round(Math.min(width, height) * 0.004);
  if (y0 > 0) y0 = Math.min(y0 + pad, height - 1);
  if (x0 > 0) x0 = Math.min(x0 + pad, width - 1);
  if (y1 < height - 1) y1 = Math.max(y1 - pad, 0);
  if (x1 < width - 1) x1 = Math.max(x1 - pad, 0);

  if (x1 - x0 < width * 0.4 || y1 - y0 < height * 0.4) {
    return { x0: 0, y0: 0, x1: width - 1, y1: height - 1 };
  }
  return { x0, y0, x1, y1 };
}

/** Copies a sub-rectangle out into its own tightly packed RGBA buffer. */
export function cropTo(rgba, width, { x0, y0, x1, y1 }) {
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const from = ((y + y0) * width + x0) * 4;
    out.set(rgba.subarray(from, from + w * 4), y * w * 4);
  }
  return { data: out, width: w, height: h };
}

/**
 * Typical per-channel difference between adjacent pixels.
 *
 * Near zero for flat art — neighbours are identical inside a region — and
 * several levels for anything photographed. Sampled on a grid; an exact answer
 * would cost as much as the filtering it is deciding about.
 */
export function estimateGrain(rgba, width, height) {
  const step = Math.max(1, Math.round(Math.sqrt((width * height) / 20000)));
  const diffs = [];

  for (let y = 1; y < height - 1; y += step) {
    for (let x = 1; x < width - 2; x += step) {
      const a = (y * width + x) * 4;
      const b = a + 4;
      if (rgba[a + 3] < 128 || rgba[b + 3] < 128) continue;
      diffs.push(
        (Math.abs(rgba[a] - rgba[b])
          + Math.abs(rgba[a + 1] - rgba[b + 1])
          + Math.abs(rgba[a + 2] - rgba[b + 2])) / 3,
      );
    }
  }
  if (!diffs.length) return 0;

  // The median, not the mean: real edges are a small minority of pairs but
  // enormous in magnitude, and would drag an average up on any artwork.
  diffs.sort((p, q) => p - q);
  return diffs[diffs.length >> 1];
}

/** How much smoothing a given grain level needs. Flat art gets none. */
export function passesForGrain(grain) {
  if (grain < 0.75) return 0;
  if (grain < 3) return 1;
  if (grain < 7) return 2;
  return 3;
}

// Median of 9 via a sorting network — 19 comparisons, no allocation, no loop
// overhead. This runs three times per pixel, so the constant matters.
function median9(a0, a1, a2, a3, a4, a5, a6, a7, a8) {
  let t;
  if (a1 < a0) { t = a0; a0 = a1; a1 = t; }
  if (a4 < a3) { t = a3; a3 = a4; a4 = t; }
  if (a7 < a6) { t = a6; a6 = a7; a7 = t; }
  if (a2 < a1) { t = a1; a1 = a2; a2 = t; }
  if (a5 < a4) { t = a4; a4 = a5; a5 = t; }
  if (a8 < a7) { t = a7; a7 = a8; a8 = t; }
  if (a1 < a0) { t = a0; a0 = a1; a1 = t; }
  if (a4 < a3) { t = a3; a3 = a4; a4 = t; }
  if (a7 < a6) { t = a6; a6 = a7; a7 = t; }
  if (a3 < a0) { a3 = a0; }
  if (a5 > a8) { a5 = a8; }
  if (a4 < a1) { t = a1; a1 = a4; a4 = t; }
  if (a7 < a4) { a4 = a7; }
  if (a4 < a1) { a4 = a1; }
  if (a3 > a4) { a4 = a3; }
  if (a5 < a4) { a4 = a5; }
  return a4;
}

/**
 * 3x3 median, applied `passes` times. Repeating a small window is both faster
 * and gentler than one large one: it clears grain without rounding off the
 * corners of genuine shapes.
 */
export function despeckle(rgba, width, height, passes = 1) {
  if (passes <= 0) return rgba;
  let src = rgba;
  let dst = new Uint8ClampedArray(rgba.length);

  for (let pass = 0; pass < passes; pass++) {
    for (let y = 0; y < height; y++) {
      const y0 = (y > 0 ? y - 1 : 0) * width;
      const y1 = y * width;
      const y2 = (y < height - 1 ? y + 1 : height - 1) * width;

      for (let x = 0; x < width; x++) {
        const x0 = x > 0 ? x - 1 : 0;
        const x2 = x < width - 1 ? x + 1 : width - 1;
        const o = (y1 + x) * 4;

        for (let c = 0; c < 3; c++) {
          dst[o + c] = median9(
            src[(y0 + x0) * 4 + c], src[(y0 + x) * 4 + c], src[(y0 + x2) * 4 + c],
            src[(y1 + x0) * 4 + c], src[o + c], src[(y1 + x2) * 4 + c],
            src[(y2 + x0) * 4 + c], src[(y2 + x) * 4 + c], src[(y2 + x2) * 4 + c],
          );
        }
        dst[o + 3] = src[o + 3];
      }
    }
    const swap = src === rgba ? new Uint8ClampedArray(rgba.length) : src;
    src = dst;
    dst = swap;
  }
  return src;
}
