#!/usr/bin/env node
// Bundles the next batch of queued source photos into a downloadable
// "mystery pack" zip, for the weekly-mystery workflow to publish as a
// GitHub Release.
//
// The zip needs nothing puzzle-specific inside it: it is exactly the kind of
// .zip a player already drags onto the app by hand (see imagesFromDrop in
// src/import.js), which unpacks it, builds each picture through the same
// pipeline, and marks every one of them blind. This script only has to pick
// which images go in, prove each one actually produces a paintable picture
// before anyone downloads it, and clear them out of the queue once packed.
//
//   node tools/pack-weekly-mystery.mjs [--count 5] [--tag mystery-2026-08-24] [--dry-run]

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { decodeImage } from './lib/decode.mjs';
import { buildPuzzle, DEFAULTS } from '../src/pipeline/build.js';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const QUEUE_DIR = path.join(ROOT, 'puzzles', 'queue');
const DIST_DIR = path.join(ROOT, 'dist');
const IMAGE_RE = /\.(png|jpe?g)$/i;

function parseArgs(argv) {
  const opts = { count: 5, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') { opts.dryRun = true; continue; }
    if (!a.startsWith('--')) continue;
    const [flag, inline] = a.slice(2).split('=');
    const value = inline !== undefined ? inline : argv[++i];
    if (flag === 'count') opts.count = Number(value);
    else if (flag === 'tag') opts.tag = value;
    else throw new Error(`unknown flag --${flag}`);
  }
  return opts;
}

const todayTag = () => `mystery-${new Date().toISOString().slice(0, 10)}`;

// The queue's date prefix (see puzzles/queue/README.md) exists only to
// control pick order. It must not survive into the zip: the app derives
// each picture's revealed title straight from its filename inside the
// archive (titleFrom in src/import.js), so a leftover "2026-08-24-" would
// show up as part of the title once a player finishes painting it.
const stripOrderPrefix = (name) => name.replace(/^\d{4}-\d{2}-\d{2}-/, '');

/**
 * True when the image actually produces a paintable picture — the same bar
 * the app's own import applies (src/import.js:187). A queue file that fails
 * this stays put for a human to look at, rather than shipping unattended.
 */
function isPaintable(file) {
  try {
    const image = decodeImage(file);
    const puzzle = buildPuzzle(image.data, image.width, image.height, DEFAULTS);
    return puzzle.cells.length > 0;
  } catch {
    return false;
  }
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const tag = opts.tag || todayTag();

  const queued = fs.existsSync(QUEUE_DIR)
    ? fs.readdirSync(QUEUE_DIR).filter((f) => IMAGE_RE.test(f)).sort()
    : [];

  const picked = [];
  const skipped = [];
  for (const name of queued) {
    if (picked.length >= opts.count) break;
    if (isPaintable(path.join(QUEUE_DIR, name))) picked.push(name);
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

  fs.mkdirSync(DIST_DIR, { recursive: true });
  const out = path.join(DIST_DIR, `${tag}.zip`);
  fs.rmSync(out, { force: true });

  // Stage renamed copies (prefix stripped) in a scratch dir, then zip that —
  // `zip` has no flag to give an entry a name other than its source
  // basename, and the archive's filenames are exactly what the app titles
  // the picture from.
  const stageDir = fs.mkdtempSync(path.join(DIST_DIR, '.pack-'));
  try {
    const staged = picked.map((name) => {
      const dest = path.join(stageDir, stripOrderPrefix(name));
      fs.copyFileSync(path.join(QUEUE_DIR, name), dest);
      return dest;
    });
    // -j junks the stored path, so the zip holds bare filenames at its root.
    execFileSync('zip', ['-qj', out, ...staged]);
  } finally {
    fs.rmSync(stageDir, { recursive: true, force: true });
  }

  if (!opts.dryRun) {
    for (const name of picked) fs.rmSync(path.join(QUEUE_DIR, name));
  }

  console.log(`packed ${picked.length} picture(s) into ${path.relative(ROOT, out)}`);
  picked.forEach((name) => console.log(`  - ${name}`));
  console.log(`tag: ${tag}`);
}

main();
