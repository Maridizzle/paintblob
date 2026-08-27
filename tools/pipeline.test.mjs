import test from 'node:test';
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';

import { decodeBuffer } from './lib/decode.mjs';
import { quantize, denoiseIndices, colourDistance } from '../src/pipeline/quantize.js';
import {
  estimateGrain, passesForGrain, despeckle, findContentBounds,
} from '../src/pipeline/denoise.js';
import { labelRegions, mergeSmallRegions, labelAnchor } from '../src/pipeline/regions.js';
import { boundsOf, traceRegion, ringsToPath } from '../src/pipeline/contour.js';
import { smoothRings } from '../src/pipeline/smooth.js';
import { nameColour, toHex, uniquifyNames } from '../src/pipeline/colour-names.js';
import { buildPuzzle, DETAIL_PRESETS } from '../src/pipeline/build.js';
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

test('rescue:false makes maxColours a hard cap', () => {
  // A gently graded field — many near-neighbours the way a photograph shades a
  // subject — is what makes the rescue want to add tubs past the target: no
  // single median-cut slot represents the far end of the ramp well. Eight
  // horizontal bands of a red→blue sweep.
  const data = image(W, H, (x, y) => {
    const t = Math.floor(y / (H / 8)) / 7; // 0..1 in eight steps
    return [Math.round(220 - 180 * t), 40, Math.round(40 + 180 * t)];
  });

  // The contract that was broken: with rescue off, the count asked for is the
  // ceiling — never more, whatever the picture wants.
  for (const cap of [2, 3, 5]) {
    const hard = quantize(data, W, H, cap, { rescue: false });
    assert.ok(hard.palette.length <= cap, `hard cap of ${cap} gave ${hard.palette.length}`);
    assert.ok(hard.indices.every((i) => i < hard.palette.length));
  }

  // The default stays a soft target, so it can meet or exceed the hard result —
  // never come out under it — which is the whole reason a photo keeps rescue on.
  assert.ok(
    quantize(data, W, H, 3).palette.length >= quantize(data, W, H, 3, { rescue: false }).palette.length,
    'the soft target must never yield fewer tubs than the hard cap',
  );

  // buildPuzzle threads the cap through from opts.strictColours (mapify's
  // --colours sets it); without it, the preset/importer path keeps the rescue.
  const capped = buildPuzzle(data, W, H, { maxColours: 4, strictColours: true, minAreaFrac: 0.002, soften: false, crop: false });
  assert.ok(capped.palette.length <= 4, `strictColours should cap the tubs; got ${capped.palette.length}`);
});

test('quantize marks transparent pixels as belonging to no cell', () => {
  const data = image(W, H, () => RED);
  for (let i = 0; i < W; i++) data[i * 4 + 3] = 0; // clear the top row
  const { indices } = quantize(data, W, H, 4);
  assert.ok([...indices.slice(0, W)].every((i) => i === 255));
  assert.ok([...indices.slice(W)].every((i) => i !== 255));
});

test('quantize rescues a small but vivid cluster a tight budget would otherwise miss', () => {
  const MAGENTA = [230, 40, 200]; // nothing like either background half
  const data = image(W, H, (x, y) => {
    if (x >= 20 && x < 32 && y >= 20 && y < 32) return MAGENTA; // 12x12, well past the floor
    return x < W / 2 ? [30, 30, 30] : [220, 220, 220]; // wide range keeps the 2-tub budget busy
  });

  const { palette, indices } = quantize(data, W, H, 2);
  assert.ok(palette.length > 2, `expected a rescued tub past the budget, got ${palette.length}`);

  const hasMagenta = palette.some((p) => colourDistance(...p, ...MAGENTA) < 2000);
  assert.ok(hasMagenta, `no tub near the rescued colour: ${JSON.stringify(palette)}`);

  const at = palette[indices[26 * W + 26]];
  assert.ok(colourDistance(...at, ...MAGENTA) < 2000, `cluster pixel landed on ${at} instead`);
});

test('quantize leaves a too-small fleck unrescued', () => {
  const MAGENTA = [230, 40, 200];
  const data = image(W, H, (x, y) => {
    if (x === 26 && y === 26) return MAGENTA; // a single stray pixel
    return x < W / 2 ? [30, 30, 30] : [220, 220, 220];
  });

  const { palette } = quantize(data, W, H, 2);
  assert.equal(palette.length, 2, 'a lone pixel should not earn its own tub');
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

test('a tiny region merges into a same-hue neighbour over a bigger, wrong-hue one', () => {
  // Three regions: a big dark "rock" filling most of the grid, a big
  // "variant" strip along the left edge that is a slightly different shade
  // of yellow, and a tiny "bird" block sitting in rock territory but abutting
  // the variant strip on one side. The bird shares far more border with rock
  // (top, right, bottom) than with the variant (left only) — plain
  // border-length picks rock; colour-awareness should flip that, since rock
  // is nothing like the bird's colour and the variant is.
  const ROCK = [30, 30, 30];
  const BIRD = [230, 200, 30];
  const VARIANT = [210, 190, 45]; // close to BIRD, unrelated to ROCK
  const palette = [ROCK, VARIANT, BIRD];

  const indices = new Uint8Array(W * H).fill(0); // rock everywhere
  for (let y = 0; y < H; y++) for (let x = 0; x < 6; x++) indices[y * W + x] = 1; // variant strip
  for (let y = 28; y < 33; y++) for (let x = 6; x < 11; x++) indices[y * W + x] = 2; // bird block

  const raw = labelRegions(indices, W, H);
  assert.equal(raw.count, 3, 'rock, variant strip, bird block');

  const aware = mergeSmallRegions(raw, W, H, { minArea: 50, maxCells: 16, palette });
  const awareColour = palette[aware.colours[aware.labels[30 * W + 8]]];
  assert.ok(
    colourDistance(...awareColour, ...BIRD) < colourDistance(...awareColour, ...ROCK),
    `expected the bird to land near its own hue, got ${awareColour}`,
  );

  // Same geometry, no palette: today's border-length-only fallback must be
  // unchanged, and still picks rock.
  const blind = mergeSmallRegions(raw, W, H, { minArea: 50, maxCells: 16 });
  const blindColour = palette[blind.colours[blind.labels[30 * W + 8]]];
  assert.deepEqual(blindColour, ROCK, 'without a palette, longest border still wins');
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

test('insane preset yields substantially more cells than detailed on a busy image, with the same tiling guarantee', () => {
  // A grid of small blocks, each independently coloured by a deterministic
  // PRNG. Two more obvious constructions both turn out pathological for a
  // 4-connectivity pipeline: a *periodic* mosaic lets same-colour blocks
  // chain into a handful of giant sprawling regions (bounding boxes tens of
  // times their pixel count), and isolated dots on one flat background force
  // every merge in Pass 2 to share that one background as a neighbour,
  // leaving it riddled with hundreds of holes. Random-but-contiguous blocks
  // avoid both: clusters stay small (well under the site-percolation
  // threshold at 6 colours), so regions end up with varied neighbours —
  // which is also what actually forces both presets to trim via maxCells.
  const W = 300;
  const H = 300;
  const block = 8; // block area (64px) clears the pipeline's 48px minimum-cell floor
  const palette = [RED, BLUE, CREAM, [30, 140, 90], [200, 120, 20], [120, 40, 160]];
  const cols = Math.ceil(W / block);
  const rows = Math.ceil(H / block);
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const blockColour = Array.from({ length: cols * rows }, () => palette[Math.floor(rnd() * palette.length)]);
  const data = image(W, H, (x, y) => blockColour[Math.floor(y / block) * cols + Math.floor(x / block)]);

  const detailedPuzzle = buildPuzzle(data, W, H, { ...DETAIL_PRESETS.detailed, size: W });
  const insanePuzzle = buildPuzzle(data, W, H, { ...DETAIL_PRESETS.insane, size: W });

  assert.ok(
    insanePuzzle.cells.length > detailedPuzzle.cells.length,
    `insane (${insanePuzzle.cells.length} cells) should exceed detailed (${detailedPuzzle.cells.length})`,
  );

  // Same tiling guarantee the ordinary buildPuzzle test checks: no gaps, no
  // overlaps, even on a picture dense enough to need the stripe fallback.
  const coverage = new Uint8Array(insanePuzzle.width * insanePuzzle.height);
  for (const cell of insanePuzzle.cells) {
    const rings = parsePath(cell.d);
    const b = ringsBounds(rings);
    for (let y = Math.floor(b.y0); y < Math.ceil(b.y1); y++) {
      for (let x = Math.floor(b.x0); x < Math.ceil(b.x1); x++) {
        if (pointInRings(rings, x + 0.5, y + 0.5)) coverage[y * insanePuzzle.width + x]++;
      }
    }
  }
  assert.ok([...coverage].every((c) => c === 1), 'every pixel belongs to exactly one cell');
});

test('colour names are readable and unique within a puzzle', () => {
  assert.equal(nameColour([250, 250, 250]), 'Chalk');
  assert.equal(nameColour([8, 8, 9]), 'Ink');
  assert.equal(toHex([255, 0, 128]), '#ff0080');
  assert.deepEqual(uniquifyNames(['Teal', 'Teal', 'Rose']), ['Teal', 'Teal II', 'Rose']);
});

/** Adds uniform noise to every channel, the way paper texture does. */
function grainy(data, amplitude, seed = 5) {
  let s = seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const out = new Uint8ClampedArray(data);
  for (let i = 0; i < out.length; i += 4) {
    const n = (rnd() - 0.5) * amplitude;
    out[i] += n; out[i + 1] += n; out[i + 2] += n;
  }
  return out;
}

test('grain is measured as zero on flat art and high on a photo', () => {
  const flat = image(W, H, (x) => (x < 32 ? RED : BLUE));
  assert.equal(estimateGrain(flat, W, H), 0);
  assert.equal(passesForGrain(estimateGrain(flat, W, H)), 0, 'flat art must not be touched');

  const photo = grainy(flat, 26);
  assert.ok(estimateGrain(photo, W, H) > 3, 'noise should register');
  assert.ok(passesForGrain(estimateGrain(photo, W, H)) >= 2);
});

test('despeckle clears grain without moving a real edge', () => {
  const flat = image(W, H, (x) => (x < 32 ? RED : BLUE));
  const cleaned = despeckle(grainy(flat, 26), W, H, 2);

  // Interiors come back to the original flat colour.
  const at = (x, y) => [...cleaned.subarray((y * W + x) * 4, (y * W + x) * 4 + 3)];
  for (const [x, y, want] of [[10, 10, RED], [50, 40, BLUE], [20, 55, RED]]) {
    at(x, y).forEach((v, i) => assert.ok(Math.abs(v - want[i]) <= 6,
      `(${x},${y}) drifted: ${at(x, y)} vs ${want}`));
  }
  // And the boundary is still exactly where it was. Asserted by which side
  // each pixel belongs to rather than by its exact value: a median of nine
  // noisy samples leans a few levels toward whichever side is in the
  // minority, which is fine — the edge has not moved.
  const nearer = (px, a, b) => {
    const dist = (c) => Math.abs(px[0] - c[0]) + Math.abs(px[1] - c[1]) + Math.abs(px[2] - c[2]);
    return dist(a) < dist(b);
  };
  assert.ok(nearer(at(31, 30), RED, BLUE), 'last red pixel turned blue — edge moved left');
  assert.ok(nearer(at(32, 30), BLUE, RED), 'first blue pixel turned red — edge moved right');
});

test('grain no longer fractures a picture into slivers', () => {
  // A shallow gradient: the case where noise, not the artwork, decides where
  // a quantisation boundary falls.
  const gentle = image(128, 128, (x, y) => [
    150 + (x / 128) * 30, 150 + (y / 128) * 26, 170 - (x / 128) * 24,
  ]);
  const photo = grainy(gentle, 26);

  const raw = buildPuzzle(photo, 128, 128, { size: 128, maxCells: 60, smooth: 0 });
  const fixed = buildPuzzle(photo, 128, 128, { size: 128, maxCells: 60 });

  const slivers = (p) => p.cells.filter((c) => c.r < 4).length;
  assert.ok(slivers(fixed) <= slivers(raw),
    `smoothing should not add slivers (${slivers(raw)} -> ${slivers(fixed)})`);

  const median = (p) => p.cells.map((c) => c.r).sort((a, b) => a - b)[p.cells.length >> 1];
  assert.ok(median(fixed) > median(raw),
    `cells should get chunkier (inradius ${median(raw)} -> ${median(fixed)})`);
});

test('a dark photo border is cropped, dark artwork is not', () => {
  // A picture inside a near-black frame, as a phone photo of paper has.
  const framed = image(120, 120, (x, y) => (
    x < 12 || y < 12 || x > 107 || y > 107 ? [6, 6, 8] : [210, 190, 160]
  ));
  const bounds = findContentBounds(framed, 120, 120);
  assert.ok(bounds.x0 >= 12 && bounds.y0 >= 12, `left/top not cropped: ${JSON.stringify(bounds)}`);
  assert.ok(bounds.x1 <= 107 && bounds.y1 <= 107, `right/bottom not cropped: ${JSON.stringify(bounds)}`);

  // Deliberately dark artwork — a night sky over a lit foreground — must
  // survive intact, even though its edges are far darker than its middle.
  const night = image(120, 120, (x, y) => (y < 50 ? [20, 26, 52] : [200, 180, 150]));
  assert.deepEqual(findContentBounds(night, 120, 120), { x0: 0, y0: 0, x1: 119, y1: 119 });
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

/* ------------------------------------------------------------- smoothing */

/**
 * A little map with everything smoothing has to survive: a diagonal (stair
 * steps to round away), an axis-aligned block (right angles to keep), a
 * three-region junction, an island fully enclosed by one region, and regions
 * running off all four edges of the frame.
 */
function testMap(w = 48, h = 48) {
  const labels = new Int32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let id = 0;
      if (y > x) id = 1;                                        // diagonal split
      if (x >= 30 && x < 42 && y >= 4 && y < 16) id = 2;        // square block
      if (x >= 8 && x < 14 && y >= 30 && y < 36) id = 3;        // island inside 1
      labels[y * w + x] = id;
    }
  }
  return { labels, w, h };
}

function traceAll({ labels, w, h }, simplify) {
  const rings = new Map();
  for (let id = 0; id < 4; id++) {
    const bbox = boundsOf(labels, w, h, id);
    if (!bbox) continue;
    rings.set(id, traceRegion(labels, w, h, id, bbox, simplify));
  }
  return rings;
}

/** Every directed edge in every ring, counted. */
function edgeUse(ringsById) {
  const uses = new Map();
  for (const rings of ringsById.values()) {
    for (const ring of rings) {
      const n = ring.length / 2;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const key = `${ring[i * 2]},${ring[i * 2 + 1]}|${ring[j * 2]},${ring[j * 2 + 1]}`;
        uses.set(key, (uses.get(key) ?? 0) + 1);
      }
    }
  }
  return uses;
}

test('smoothing keeps every interior boundary welded, walked once from each side', () => {
  // This is the whole point of smoothing arcs rather than rings. If the two
  // sides of a boundary are rounded independently they stop matching, and the
  // mismatch is a gap running down the middle of the picture. Sharing the arc
  // makes them the same numbers, which shows up here as every directed edge
  // appearing exactly once and its reverse appearing too.
  const map = testMap();
  const smoothed = smoothRings(map.labels, map.w, map.h, traceAll(map, false));
  const uses = edgeUse(smoothed);

  const onFrame = (p) => {
    const [x, y] = p.split(',').map(Number);
    return x === 0 || y === 0 || x === map.w || y === map.h;
  };

  let interior = 0;
  for (const [edge, count] of uses) {
    assert.equal(count, 1, `${edge} is walked twice in the same direction`);
    const [a, b] = edge.split('|');
    if (onFrame(a) && onFrame(b)) continue; // the frame has no far side
    interior++;
    assert.ok(uses.has(`${b}|${a}`),
      `${edge} has no partner from the other side — that is a gap in the picture`);
  }
  assert.ok(interior > 100, `only ${interior} interior edges; the map is not exercising much`);
});

test('smoothing rounds a stair-stepped diagonal and leaves right angles alone', () => {
  const map = testMap();
  const hard = traceAll(map, true);
  const soft = smoothRings(map.labels, map.w, map.h, traceAll(map, false));

  // The square block is axis aligned with runs far longer than a stair step,
  // so every one of its corners is a real corner and must survive untouched.
  const block = soft.get(2).flat();
  for (const [x, y] of [[30, 4], [42, 4], [42, 16], [30, 16]]) {
    const found = block.some((_, i) => i % 2 === 0 && block[i] === x && block[i + 1] === y);
    assert.ok(found, `the block lost its corner at ${x},${y}`);
  }

  // The diagonal, by contrast, should have stopped being a staircase: no
  // axis-aligned unit steps left along it.
  const diagonalSteps = (rings) => {
    let steps = 0;
    for (const ring of rings) {
      const n = ring.length / 2;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const dx = Math.abs(ring[j * 2] - ring[i * 2]);
        const dy = Math.abs(ring[j * 2 + 1] - ring[i * 2 + 1]);
        if ((dx === 1 && dy === 0) || (dx === 0 && dy === 1)) steps++;
      }
    }
    return steps;
  };
  assert.ok(diagonalSteps(hard.get(0)) > 40,
    'the unsmoothed diagonal should be full of single-pixel steps');
  assert.ok(diagonalSteps(soft.get(0)) < diagonalSteps(hard.get(0)) / 4,
    'smoothing barely touched the staircase');
});

test('an island and the hole around it keep opposite windings', () => {
  // Region 3 sits entirely inside region 1, so neither ring has a junction to
  // cut at and both are one closed loop. Handing them the same loop in the
  // same direction stops the nonzero fill rule knocking the hole out, and the
  // enclosing cell swallows the island whole.
  const map = testMap();
  const soft = smoothRings(map.labels, map.w, map.h, traceAll(map, false));

  const area = (ring) => {
    let a = 0;
    const n = ring.length / 2;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      a += ring[i * 2] * ring[j * 2 + 1] - ring[j * 2] * ring[i * 2 + 1];
    }
    return a / 2;
  };

  const island = soft.get(3)[0];
  // The hole in region 1 is the ring whose points match the island's.
  const hole = soft.get(1).find((r) => r !== island && r.length === island.length
    && r.includes(island[0]) && r.includes(island[1]));
  assert.ok(hole, 'region 1 has no ring matching the island it encloses');
  assert.ok(Math.sign(area(island)) !== Math.sign(area(hole)),
    'the island and its hole wind the same way, so the hole will not be knocked out');
});

/**
 * The firefly that broke smoothing, lifted straight out of the picture it
 * broke on. A blob this convoluted is the point: it is one closed loop with no
 * junction anywhere on it, its outline runs to 324 lattice corners, and the
 * first corner worth pinning sits a long way into that ring.
 */
const FIREFLY = [
  '.........................................',
  '.........................................',
  '.....#...................................',
  '....###..................................',
  '...#####.................................',
  '...######................................',
  '....######...............................',
  '....########......###....................',
  '.....########.....####...................',
  '.....########.....#####..............##..',
  '....########......#####.............###..',
  '...#########.....######............###...',
  '...#########.....#######..........###....',
  '...#########.....#######..........###....',
  '..###########....#######.........###.....',
  '..###########....#######........####.....',
  '..###########....########.......####.....',
  '..#######........########.......###......',
  '..######.........#########......###......',
  '..######........###########....###.......',
  '..######........############..####.......',
  '..#####.........#################........',
  '..####....###...###############..........',
  '..####...#####.###############...........',
  '..#####.#####################............',
  '..###########################............',
  '...##########################............',
  '......#######################............',
  '.......######################............',
  '.......#####################.............',
  '.......#####################.............',
  '.......####################..............',
  '.......###################...............',
  '........################.................',
  '.........######...#####..................',
  '.........#####.....####..................',
  '..........####.....####..................',
  '...........##.....######.................',
  '..................######.................',
  '.......##........#######.................',
  '......###.......#######..................',
  '.....#####......######...................',
  '.....######....#####.....................',
  '....#######....####......................',
  '....#######....###.......................',
  '....########..###........................',
  '...#############.........................',
  '...############..........................',
  '..###########............................',
  '..##########.............................',
  '..#########..............................',
  '...########..............................',
  '...#######...............................',
  '.....####................................',
  '.....####................................',
  '......##.................................',
  '.........................................',
  '.........................................',
];

test('smoothing never turns a ring inside out', () => {
  // Winding is what tells a hole from an outline. contour.js emits outer rings
  // one way round and holes the other, and canvas' nonzero fill rule knocks
  // holes out on that basis alone — so a ring that comes back wound the other
  // way is a hole that no longer subtracts, and the cell around it swallows
  // whatever was inside.
  //
  // What broke it: on a closed loop the run from the last pinned point wraps
  // past the end of the array and round to the FIRST one, and every point
  // before that first anchor lives in that run and nowhere else. End it at
  // index 0 instead and those points belong to no run at all, so every one of
  // them is dropped — which folds the polygon inside out. Here that took the
  // firefly from 759 square pixels to 39, with the sign reversed.
  const h = FIREFLY.length;
  const w = FIREFLY[0].length;
  const labels = new Int32Array(w * h);
  FIREFLY.forEach((row, y) => [...row].forEach((c, x) => {
    labels[y * w + x] = c === '#' ? 1 : 0;
  }));

  const raw = new Map();
  for (const id of [0, 1]) {
    raw.set(id, traceRegion(labels, w, h, id, boundsOf(labels, w, h, id), false));
  }
  const soft = smoothRings(labels, w, h, raw);

  const area = (ring) => {
    let sum = 0;
    const n = ring.length / 2;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      sum += ring[i * 2] * ring[j * 2 + 1] - ring[j * 2] * ring[i * 2 + 1];
    }
    return sum / 2;
  };

  for (const [id, before] of raw) {
    const after = soft.get(id);
    assert.equal(after.length, before.length, `cell ${id} lost or gained a ring`);
    before.forEach((ring, i) => {
      const was = area(ring);
      const now = area(after[i]);
      assert.equal(Math.sign(now), Math.sign(was),
        `cell ${id} ring ${i} came back wound the other way (${was} -> ${now})`);
      // Rounding a staircase costs a sliver, never most of the shape.
      assert.ok(Math.abs(now) > Math.abs(was) * 0.9,
        `cell ${id} ring ${i} lost its area (${was} -> ${now})`);
    });
  }
});

test('a smoothed puzzle still covers every pixel exactly once', () => {
  // The same guarantee verify-puzzle.mjs enforces across the shipped puzzles,
  // asserted here on a picture built from scratch so a failure is diagnosable.
  const data = image(W, H, (x, y) => (y > x ? [230, 60, 60] : [40, 90, 200]));
  const puzzle = buildPuzzle(data, W, H, { title: 'Split', size: 64, maxCells: 8, maxColours: 4 });
  const coverage = new Int32Array(puzzle.width * puzzle.height).fill(-1);
  let overlaps = 0;
  puzzle.cells.forEach((cell, id) => {
    const rings = parsePath(cell.d);
    for (let y = 0; y < puzzle.height; y++) {
      for (let x = 0; x < puzzle.width; x++) {
        if (!pointInRings(rings, x + 0.5, y + 0.5)) continue;
        if (coverage[y * puzzle.width + x] !== -1) overlaps++;
        coverage[y * puzzle.width + x] = id;
      }
    }
  });
  assert.equal(overlaps, 0, 'cells overlap after smoothing');
  assert.equal([...coverage].filter((v) => v === -1).length, 0, 'pixels left uncovered');
});
