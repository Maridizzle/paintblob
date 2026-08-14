#!/usr/bin/env node
// Image -> playable puzzle.
//
//   node tools/mapify.mjs <image> --id koi-pond --title "Koi Pond"
//
// This is the whole reason the project works without asking a model to invent
// polygons: the picture itself is the source of truth. Quantise it, find the
// connected plateaus, fatten them until they are comfortably clickable, trace
// their exact borders. Deterministic, offline, and it never hallucinates a
// region that is not in the artwork.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeImage } from './lib/decode.mjs';
import { quantize, denoiseIndices } from './lib/quantize.mjs';
import { labelRegions, mergeSmallRegions, labelAnchor } from './lib/regions.mjs';
import { boundsOf, traceRegion, ringsToPath } from './lib/contour.mjs';
import { nameColour, toHex, uniquifyNames } from './lib/colour-names.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const PUZZLE_DIR = path.join(ROOT, 'puzzles');

const DEFAULTS = {
  size: 768,        // working resolution on the long side
  maxColours: 14,   // paint tubs
  maxCells: 64,     // clickable regions
  minAreaFrac: 0.0016,
  denoise: 1,
};

function parseArgs(argv) {
  const opts = { ...DEFAULTS, _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) {
      opts._.push(a);
      continue;
    }
    const [flag, inline] = a.slice(2).split('=');
    const value = inline !== undefined ? inline : argv[++i];
    switch (flag) {
      case 'size': opts.size = Number(value); break;
      case 'colors': case 'colours': opts.maxColours = Number(value); break;
      case 'cells': opts.maxCells = Number(value); break;
      case 'min-area': opts.minAreaFrac = Number(value); break;
      case 'denoise': opts.denoise = Number(value); break;
      case 'id': opts.id = value; break;
      case 'title': opts.title = value; break;
      default: throw new Error(`unknown flag --${flag}`);
    }
  }
  return opts;
}

/** Box-filter downscale. Averaging beats nearest here: it kills stray pixels
 *  before quantisation instead of promoting them to their own regions. */
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

function updateManifest(entry) {
  const file = path.join(PUZZLE_DIR, 'manifest.json');
  let list = [];
  if (fs.existsSync(file)) list = JSON.parse(fs.readFileSync(file, 'utf8'));
  list = list.filter((p) => p.id !== entry.id);
  list.push(entry);
  list.sort((a, b) => a.title.localeCompare(b.title));
  fs.writeFileSync(file, `${JSON.stringify(list, null, 2)}\n`);
  return file;
}

/**
 * Prints what came out and, when the result is unplayable, which knob to turn.
 * Below ~15 cells a picture is over in a few clicks; above ~80 the numbers get
 * too small to read at the default window size.
 */
export function reportPuzzle(puzzle, title, out) {
  const areas = puzzle.cells.map((c) => c.a).sort((a, b) => a - b);
  console.log(`${title}`);
  console.log(`  ${puzzle.cells.length} cells across ${puzzle.palette.length} tubs`);
  console.log(`  cell area  min ${areas[0]}  median ${areas[areas.length >> 1]}  max ${areas.at(-1)} px`);
  console.log(`  ${path.relative(ROOT, out)}  (${(fs.statSync(out).size / 1024).toFixed(1)} kB)`);

  if (puzzle.cells.length < 15) {
    console.log('\n  few cells — try --min-area 0.0008 --colours 16, or busier source art');
  } else if (puzzle.cells.length > 80) {
    console.log('\n  lots of cells — try --min-area 0.003 --colours 10 for chunkier regions');
  }
}

export function writePuzzle(puzzle, { id, title }) {
  fs.mkdirSync(PUZZLE_DIR, { recursive: true });
  const out = path.join(PUZZLE_DIR, `${id}.json`);
  fs.writeFileSync(out, JSON.stringify({ id, title, ...puzzle }));
  updateManifest({
    id,
    title,
    cells: puzzle.cells.length,
    colours: puzzle.palette.length,
    thumb: puzzle.palette.slice(0, 5).map((p) => p.hex),
  });
  return out;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const src = opts._[0];
  if (!src) {
    console.error('usage: node tools/mapify.mjs <image> [--id slug] [--title "Name"]');
    console.error('       [--size 768] [--colours 14] [--cells 64] [--min-area 0.0016]');
    console.error('accepts PNG or JPEG');
    process.exit(1);
  }

  const image = decodeImage(src);
  const id = (opts.id || path.basename(src, path.extname(src)))
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const title = opts.title || id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  const started = Date.now();
  const puzzle = buildPuzzle(image.data, image.width, image.height, opts);
  const out = writePuzzle(puzzle, { id, title });

  console.log(`  ${image.width}x${image.height} -> ${puzzle.width}x${puzzle.height} in ${Date.now() - started}ms`);
  reportPuzzle(puzzle, title, out);
}

if (process.argv[1] && import.meta.url === `file://${path.resolve(process.argv[1])}`) {
  main().catch((err) => {
    // A stack trace helps nobody decide that their WebP needs converting.
    console.error(err.message);
    process.exit(1);
  });
}
