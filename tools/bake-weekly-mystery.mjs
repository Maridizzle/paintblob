#!/usr/bin/env node
// Bakes the next batch of queued source photos directly into the app's
// bundled puzzle library, marked blind — the same mechanism the 4 demo
// puzzles already ship with (puzzles/*.json + puzzles/manifest.json).
// Pictures built this way show up in the Pictures list the moment a player
// is on an app version that includes them: no download, no drag-and-drop.
//
//   node tools/bake-weekly-mystery.mjs [--count 5] [--dry-run]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeImage } from './lib/decode.mjs';
import { buildPuzzle, DEFAULTS, slugify } from '../src/pipeline/build.js';
import { writePuzzle, reportPuzzle } from './mapify.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const QUEUE_DIR = path.join(ROOT, 'puzzles', 'queue');
const MANIFEST = path.join(ROOT, 'puzzles', 'manifest.json');
const IMAGE_RE = /\.(png|jpe?g)$/i;

function parseArgs(argv) {
  const opts = { count: 5, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') { opts.dryRun = true; continue; }
    if (a === '--count') { opts.count = Number(argv[++i]); continue; }
    throw new Error(`unknown flag ${a}`);
  }
  return opts;
}

// The queue's date prefix (see puzzles/queue/README.md) exists only to
// control pick order — it must not survive into the id or the revealed
// title.
const stripOrderPrefix = (name) => name.replace(/^\d{4}-\d{2}-\d{2}-/, '');

function titleFrom(stem) {
  return stem.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()
    .replace(/\b\w/g, (c) => c.toUpperCase()) || 'Untitled';
}

function existingIds() {
  try {
    return new Set(JSON.parse(fs.readFileSync(MANIFEST, 'utf8')).map((p) => p.id));
  } catch {
    return new Set();
  }
}

function uniqueId(base, taken) {
  const id = slugify(base);
  if (!taken.has(id)) return id;
  for (let n = 2; n < 999; n++) {
    if (!taken.has(`${id}-${n}`)) return `${id}-${n}`;
  }
  throw new Error(`could not find a free id for "${base}"`);
}

/** Decode + build once; returns the puzzle, or null if it isn't paintable —
 *  the same bar the app's own import applies (src/import.js:187). A queue
 *  file that fails this stays put for a human to look at. */
function tryBuild(file) {
  try {
    const image = decodeImage(file);
    const puzzle = buildPuzzle(image.data, image.width, image.height, DEFAULTS);
    return puzzle.cells.length > 0 ? puzzle : null;
  } catch {
    return null;
  }
}

function main() {
  const opts = parseArgs(process.argv.slice(2));

  const queued = fs.existsSync(QUEUE_DIR)
    ? fs.readdirSync(QUEUE_DIR).filter((f) => IMAGE_RE.test(f)).sort()
    : [];

  const picked = [];
  const skipped = [];
  for (const name of queued) {
    if (picked.length >= opts.count) break;
    const puzzle = tryBuild(path.join(QUEUE_DIR, name));
    if (puzzle) picked.push({ name, puzzle });
    else skipped.push(name);
  }

  if (skipped.length) {
    console.warn(`skipped (no paintable regions found), left in the queue: ${skipped.join(', ')}`);
  }

  if (picked.length < opts.count) {
    console.error(
      `only ${picked.length} usable picture(s) queued, need ${opts.count} — `
      + 'add more PNG/JPEG files to puzzles/queue/ before this can run',
    );
    process.exit(1);
  }

  const taken = existingIds();
  for (const { name, puzzle } of picked) {
    const stem = stripOrderPrefix(name).replace(IMAGE_RE, '');
    const id = uniqueId(stem, taken);
    taken.add(id);
    const title = titleFrom(stem);

    if (opts.dryRun) {
      console.log(`would bake: ${title} (${id}) — ${puzzle.cells.length} cells, from ${name}`);
      continue;
    }
    const out = writePuzzle(puzzle, { id, title, blind: true });
    fs.rmSync(path.join(QUEUE_DIR, name));
    reportPuzzle(puzzle, title, out);
  }

  console.log(opts.dryRun
    ? `would bake ${picked.length} mystery picture(s) into puzzles/ — nothing written`
    : `baked ${picked.length} mystery picture(s) into puzzles/`);
}

main();
