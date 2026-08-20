#!/usr/bin/env node
// Image -> playable puzzle, from the command line.
//
//   node tools/mapify.mjs <image> --id koi-pond --title "Koi Pond"
//
// The pipeline itself lives in src/pipeline/, shared with the app's own import
// button. This file is only the Node wrapper: argument parsing, decoding from
// disk, and writing the result into puzzles/.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeImage } from './lib/decode.mjs';
import { encodeSourceImage } from './lib/preview.mjs';
import { buildPuzzle, DEFAULTS, DETAIL_PRESETS, slugify } from '../src/pipeline/build.js';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const PUZZLE_DIR = path.join(ROOT, 'puzzles');

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
      // Overrides the grain-driven despeckle pass count buildPuzzle() would
      // otherwise measure automatically — for isolating whether pre-quantise
      // smoothing, not region merging, is what's eating a fine detail.
      case 'smooth': opts.smooth = Number(value); break;
      case 'id': opts.id = value; break;
      case 'title': opts.title = value; break;
      // Boolean flag — undo the lookahead above unless `--blind=...` was
      // written inline, in which case nothing was consumed to undo.
      case 'blind': opts.blind = true; if (inline === undefined) i--; break;
      // Boolean, same lookahead dance as --blind. Leaves the outlines on the
      // raw pixel lattice, stair steps and all.
      case 'no-soften': opts.soften = false; if (inline === undefined) i--; break;
      case 'detail': {
        const preset = DETAIL_PRESETS[value];
        if (!preset) throw new Error(`--detail must be one of ${Object.keys(DETAIL_PRESETS).join(', ')}`);
        Object.assign(opts, preset);
        break;
      }
      default: throw new Error(`unknown flag --${flag}`);
    }
  }
  return opts;
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

export function manifestEntry(puzzle, { id, title, blind }) {
  return {
    id,
    title,
    cells: puzzle.cells.length,
    colours: puzzle.palette.length,
    thumb: puzzle.palette.slice(0, 5).map((p) => p.hex),
    ...(blind ? { blind: true } : {}),
  };
}

/**
 * The living-element tag for a picture, if it has one.
 *
 * These live in a hand-edited sidecar rather than in the puzzle JSON because
 * this file rewrites that JSON from scratch on every bake — a field added to
 * it by hand would not survive the next `npm run seed`, which CI runs on
 * every push. Reading the sidecar here means the tag is re-injected each
 * time, and the client still only makes the one fetch it always did.
 */
export function animationFor(id, dir = PUZZLE_DIR) {
  return sidecarTag('animations.json', id, dir);
}

/**
 * The subject a picture raises off the surface while it is painted, if it has
 * one. Its own sidecar rather than a field on the animation tag: the two are
 * chosen for different reasons and are rarely the same cells, and tagging or
 * clearing one must not disturb the other.
 */
export function liftFor(id, dir = PUZZLE_DIR) {
  return sidecarTag('lifts.json', id, dir);
}

function sidecarTag(name, id, dir) {
  const file = path.join(dir, name);
  if (!fs.existsSync(file)) return null;
  const tag = JSON.parse(fs.readFileSync(file, 'utf8'))[id];
  if (!tag || id.startsWith('_')) return null;
  return tag;
}

export function writePuzzle(puzzle, { id, title, blind }) {
  fs.mkdirSync(PUZZLE_DIR, { recursive: true });
  const { preview, ...rest } = puzzle;
  const sourceImage = encodeSourceImage(preview);
  if (blind) rest.blind = true;
  const animation = animationFor(id);
  if (animation) rest.animation = animation;
  const lift = liftFor(id);
  if (lift) rest.lift = lift;
  const out = path.join(PUZZLE_DIR, `${id}.json`);
  fs.writeFileSync(out, JSON.stringify({ id, title, ...rest, sourceImage }));
  updateManifest(manifestEntry(puzzle, { id, title, blind }));
  return out;
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
    console.log('\n  few cells — try --detail detailed, or busier source art');
  } else if (puzzle.cells.length > 80) {
    console.log('\n  lots of cells — try --detail chunky for fatter regions');
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const src = opts._[0];
  if (!src) {
    console.error('usage: node tools/mapify.mjs <image> [--id slug] [--title "Name"] [--blind]');
    console.error('       [--no-soften]');
    console.error('       [--detail chunky|normal|detailed|insane]');
    console.error('       [--size 768] [--colours 14] [--cells 64] [--min-area 0.0016]');
    console.error('accepts PNG or JPEG');
    process.exit(1);
  }

  const image = decodeImage(src);
  const id = slugify(opts.id || path.basename(src, path.extname(src)));
  const title = opts.title || id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  const started = Date.now();
  const puzzle = buildPuzzle(image.data, image.width, image.height, opts);
  const out = writePuzzle(puzzle, { id, title, blind: opts.blind });

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
