import test from 'node:test';
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';

import { decodeBuffer } from './lib/decode.mjs';
import { quantize, denoiseIndices } from '../src/pipeline/quantize.js';
import { labelRegions, mergeSmallRegions, labelAnchor } from '../src/pipeline/regions.js';
import { boundsOf, traceRegion, ringsToPath } from '../src/pipeline/contour.js';
import { nameColour, toHex, uniquifyNames } from '../src/pipeline/colour-names.js';
import { buildPuzzle } from '../src/pipeline/build.js';
import { parsePath, pointInRings, ringsBounds } from '../src/geometry.js';

const W = 64;
const H = 64;

/** Builds an RGBA buffer from a (x,y) -> [r,g,b] function. */
function image(w, h, fn) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b] = fn(x, y);
      const o = (y * w + x) * 4;
      data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = 255;
    }
  }
  return data;
}

const RED = [220, 40, 40];
const BLUE = [40, 60, 210];
const CREAM = [245, 240, 225];

test('quantize collapses near-identical shades onto one palette entry', () => {
  // Three bands, each dithered by a couple of levels the way an encoder would.
  const data = image(W, H, (x, y) => {
    const base = y < 21 ? RED : y < 42 ? BLUE : CREAM;
    const jitter = ((x + y) % 3) - 1;
    return base.map((v) => Math.max(0, Math.min(255, v + jitter)));
  });

  const { palette, indices } = quantize(data, W, H, 8);
  assert.equal(palette.length, 3, 'unused palette slots should be dropped');
  assert.equal(indices.length, W * H);
  assert.ok(indices.every((i) => i < palette.length));

  // Every pixel in a band must land on the same slot.
  const band = (y) => indices[y * W + 5];
  for (let y = 0; y < 21; y++) assert.equal(indices[y * W + 30], band(0));
  for (let y = 42; y < H; y++) assert.equal(indices[y * W + 30], band(50));
});

test('quantize marks transparent pixels as belonging to no cell', () => {
  const data = image(W, H, () => RED);
  for (let i = 0; i < W; i++) data[i * 4 + 3] = 0; // clear the top row
  const { indices } = quantize(data, W, H, 4);
  assert.ok([...indices.slice(0, W)].every((i) => i === 255));
  assert.ok([...indices.slice(W)].every((i) => i !== 255));
});

test('denoise erases isolated speckle but keeps real edges', () => {
  const indices = new Uint8Array(W * H).fill(0);
  for (let y = 0; y < H; y++) for (let x = 32; x < W; x++) indices[y * W + x] = 1;
  indices[10 * W + 10] = 1; // a lone stray pixel in the left half

  const cleaned = denoiseIndices(indices, W, H, 1, 2);
  assert.equal(cleaned[10 * W + 10], 0, 'speckle should be absorbed');
  assert.equal(cleaned[30 * W + 31], 0, 'edge should hold');
  assert.equal(cleaned[30 * W + 32], 1, 'edge should hold');
});

test('small regions are merged away and the cell budget is respected', () => {
  // A field of 1px stripes: hundreds of tiny regions, none of them viable.
  const indices = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) indices[y * W + x] = x % 2;

  const raw = labelRegions(indices, W, H);
  assert.ok(raw.count > 30, `expected many raw regions, got ${raw.count}`);

  const merged = mergeSmallRegions(raw, W, H, { minArea: 200, maxCells: 6 });
  assert.ok(merged.count <= 6, `cell budget exceeded: ${merged.count}`);
  for (const area of merged.areas) assert.ok(area >= 200, `region below floor: ${area}`);

  // Merging must not drop or duplicate coverage.
  const total = merged.areas.reduce((a, b) => a + b, 0);
  assert.equal(total, W * H);
  assert.ok([...merged.labels].every((l) => l >= 0 && l < merged.count));
});

test('contours of a ring cell carry a hole with correct winding', () => {
  // Ring of RED around a BLUE disc on CREAM: the ring region genuinely has a
  // hole, which nothing in the demo artwork happens to produce.
  const cx = 32;
  const cy = 32;
  const data = image(W, H, (x, y) => {
    const d = Math.hypot(x - cx + 0.5, y - cy + 0.5);
    if (d < 9) return BLUE;
    if (d < 24) return RED;
    return CREAM;
  });

  const { palette, indices } = quantize(data, W, H, 6);
  const labelling = labelRegions(indices, W, H);
  const merged = mergeSmallRegions(labelling, W, H, { minArea: 40, maxCells: 16 });
  assert.equal(merged.count, 3, 'disc, ring and background');

  const ring = merged.areas.map((_, i) => i).find((i) => {
    const bbox = boundsOf(merged.labels, W, H, i);
    return bbox && bbox[0] > 0 && bbox[1] > 0 && merged.labels[cy * W + cx] !== i;
  });
  assert.notEqual(ring, undefined);

  const bbox = boundsOf(merged.labels, W, H, ring);
  const rings = traceRegion(merged.labels, W, H, ring, bbox);
  assert.equal(rings.length, 2, 'outer boundary plus one hole');

  // The traced path must agree with the label map pixel for pixel.
  const parsed = parsePath(ringsToPath(rings));
  let disagreements = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const inPath = pointInRings(parsed, x + 0.5, y + 0.5);
      const inMask = merged.labels[y * W + x] === ring;
      if (inPath !== inMask) disagreements++;
    }
  }
  assert.equal(disagreements, 0, 'nonzero fill of the path must match the mask');
  assert.ok(palette.length >= 3);
});

test('the label anchor lands inside its own cell, even for a ring', () => {
  const cx = 32;
  const cy = 32;
  const data = image(W, H, (x, y) => {
    const d = Math.hypot(x - cx + 0.5, y - cy + 0.5);
    return d < 10 ? BLUE : d < 26 ? RED : CREAM;
  });
  const { indices } = quantize(data, W, H, 6);
  const merged = mergeSmallRegions(labelRegions(indices, W, H), W, H, { minArea: 40, maxCells: 16 });

  for (let id = 0; id < merged.count; id++) {
    const bbox = boundsOf(merged.labels, W, H, id);
    const anchor = labelAnchor(merged.labels, W, H, id, bbox);
    const at = merged.labels[Math.floor(anchor.y) * W + Math.floor(anchor.x)];
    assert.equal(at, id, `anchor for cell ${id} fell outside it`);
    assert.ok(anchor.radius > 0);
  }
});

test('buildPuzzle tiles the picture with no gaps and no overlaps', () => {
  const data = image(128, 128, (x, y) => {
    if (Math.hypot(x - 40, y - 40) < 26) return RED;
    if (y > 90) return BLUE;
    if (x > 96 && y < 50) return [30, 140, 90];
    return CREAM;
  });

  const puzzle = buildPuzzle(data, 128, 128, { size: 128, maxColours: 8, maxCells: 20 });
  assert.ok(puzzle.cells.length >= 3);
  assert.ok(puzzle.palette.length >= 3);

  const coverage = new Uint8Array(puzzle.width * puzzle.height);
  for (const cell of puzzle.cells) {
    const rings = parsePath(cell.d);
    const b = ringsBounds(rings);
    for (let y = Math.floor(b.y0); y < Math.ceil(b.y1); y++) {
      for (let x = Math.floor(b.x0); x < Math.ceil(b.x1); x++) {
        if (pointInRings(rings, x + 0.5, y + 0.5)) coverage[y * puzzle.width + x]++;
      }
    }
  }
  assert.ok([...coverage].every((c) => c === 1), 'every pixel belongs to exactly one cell');

  // Tub 1 must be the colour used by the most cells.
  const usage = puzzle.palette.map(() => 0);
  for (const cell of puzzle.cells) usage[cell.c]++;
  assert.deepEqual(usage, [...usage].sort((a, b) => b - a), 'palette should be ordered by usage');
});

test('colour names are readable and unique within a puzzle', () => {
  assert.equal(nameColour([250, 250, 250]), 'Chalk');
  assert.equal(nameColour([8, 8, 9]), 'Ink');
  assert.equal(toHex([255, 0, 128]), '#ff0080');
  assert.deepEqual(uniquifyNames(['Teal', 'Teal', 'Rose']), ['Teal', 'Teal II', 'Rose']);
});

test('images are decoded by magic bytes, not by file extension', () => {
  const pixels = image(16, 16, (x) => (x < 8 ? RED : BLUE));

  const png = new PNG({ width: 16, height: 16 });
  png.data = Buffer.from(pixels.buffer.slice(0));
  const asPng = decodeBuffer(PNG.sync.write(png));
  assert.equal(asPng.width, 16);
  assert.equal(asPng.height, 16);
  assert.deepEqual([...asPng.data.slice(0, 3)], RED);

  const encoded = jpeg.encode({ data: Buffer.from(pixels), width: 16, height: 16 }, 92);
  const asJpeg = decodeBuffer(encoded.data);
  assert.equal(asJpeg.width, 16);
  assert.equal(asJpeg.data.length, 16 * 16 * 4, 'must come back as RGBA like pngjs');
  // Lossy, so only assert it is still recognisably red.
  assert.ok(asJpeg.data[0] > 180 && asJpeg.data[1] < 90);
});

test('unsupported formats fail with an actionable message', () => {
  const webp = Buffer.alloc(16);
  webp.write('RIFF', 0, 'latin1');
  webp.write('WEBP', 8, 'latin1');
  assert.throws(() => decodeBuffer(webp), /webp/i);

  assert.throws(() => decodeBuffer(Buffer.from('<svg xmlns="..."/>')), /expected PNG or JPEG/);
});

test('parsePath understands the H/V shorthand the tracer emits', () => {
  const rings = parsePath('M2 3H8V9H2Z');
  assert.equal(rings.length, 1);
  assert.deepEqual([...rings[0]], [2, 3, 8, 3, 8, 9, 2, 9]);
  assert.ok(pointInRings(rings, 5, 6));
  assert.ok(!pointInRings(rings, 1, 6));
});
