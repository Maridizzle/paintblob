#!/usr/bin/env node
// Bakes the next batch of queued source photos directly into the app's
// bundled puzzle library, marked blind — the same mechanism the 4 demo
// puzzles already ship with (puzzles/*.json + puzzles/manifest.json).
// Pictures built this way show up in the Pictures list the moment a player
// is on an app version that includes them: no download, no drag-and-drop.
//
// A queued file is only baked if it (a) builds into a paintable puzzle and
// (b) has a themes entry in puzzles/queue/tags.json — so a mystery can never
// ship without a theme for the Pictures filter. The theme is copied into the
// real puzzles/tags.json (the source of truth) before the puzzle is written,
// so its manifest entry comes out themed with no extra apply-tags run.
//
//   node tools/bake-weekly-mystery.mjs [--count 5] [--dry-run]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeImage } from './lib/decode.mjs';
import { buildPuzzle, DEFAULTS, slugify } from '../src/pipeline/build.js';
import { writePuzzle, reportPuzzle } from './mapify.mjs';
import { THEMES, DIFFICULTIES } from './apply-tags.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const QUEUE_DIR = path.join(ROOT, 'puzzles', 'queue');
const QUEUE_TAGS = path.join(QUEUE_DIR, 'tags.json');
const TAGS = path.join(ROOT, 'puzzles', 'tags.json');
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

const readJson = (file, fallback) => {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
};

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

/** Validate a queued picture's sidecar tag. Returns `{ difficulty, themes }`
 *  when usable, or `{ error }` naming what's wrong so the file can be left in
 *  the queue rather than baked untagged. */
function normalizeTag(tag) {
  if (!tag) return { error: 'no entry in puzzles/queue/tags.json' };
  const themes = Array.isArray(tag.themes) ? tag.themes : [];
  if (themes.length === 0) return { error: 'its themes list is empty' };
  if (themes.length > 3) return { error: 'more than 3 themes' };
  const unknown = themes.filter((t) => !THEMES.includes(t));
  if (unknown.length) return { error: `unknown theme(s): ${unknown.join(', ')}` };
  const difficulty = tag.difficulty ?? 'normal';
  if (!DIFFICULTIES.includes(difficulty)) return { error: `unknown difficulty "${difficulty}"` };
  return { difficulty, themes };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));

  const queued = fs.existsSync(QUEUE_DIR)
    ? fs.readdirSync(QUEUE_DIR).filter((f) => IMAGE_RE.test(f)).sort()
    : [];

  // Underscore keys (the _readme) are not picture ids; drop them from lookup.
  const queueTagsRaw = readJson(QUEUE_TAGS, {});
  const queueTags = Object.fromEntries(
    Object.entries(queueTagsRaw).filter(([k]) => !k.startsWith('_')),
  );

  const picked = [];
  const unpaintable = []; // built nothing paintable — left in the queue
  const untagged = [];    // no usable themes entry — left in the queue
  for (const name of queued) {
    if (picked.length >= opts.count) break;
    const stem = stripOrderPrefix(name).replace(IMAGE_RE, '');
    const base = slugify(stem);
    const tag = normalizeTag(queueTags[base]);
    // Refuse before building: an untagged picture can never become a baked,
    // themeless mystery. It waits in the queue until it has a theme.
    if (tag.error) { untagged.push(`${name} — ${tag.error} (key "${base}")`); continue; }
    const puzzle = tryBuild(path.join(QUEUE_DIR, name));
    if (puzzle) picked.push({ name, base, stem, puzzle, tag });
    else unpaintable.push(name);
  }

  if (unpaintable.length) {
    console.warn(`skipped (no paintable regions found), left in the queue: ${unpaintable.join(', ')}`);
  }
  if (untagged.length) {
    console.warn('skipped (add a themes entry to puzzles/queue/tags.json), left in the queue:');
    for (const line of untagged) console.warn(`  ${line}`);
  }

  if (picked.length < opts.count) {
    console.error(
      `only ${picked.length} tagged, paintable picture(s) queued, need ${opts.count} — `
      + 'add PNG/JPEG files to puzzles/queue/ and give each a themes entry in '
      + 'puzzles/queue/tags.json before this can run',
    );
    process.exit(1);
  }

  // Assign final ids up front so tags.json can be written once, before any
  // puzzle is baked: writePuzzle -> manifestEntry -> tagsFor(id) reads
  // puzzles/tags.json fresh, so the theme lands on the manifest entry.
  const taken = existingIds();
  const jobs = picked.map((p) => {
    const id = uniqueId(p.stem, taken);
    taken.add(id);
    return { ...p, id, title: titleFrom(p.stem) };
  });

  if (opts.dryRun) {
    for (const j of jobs) {
      console.log(`would bake: ${j.title} (${j.id}) [${j.tag.themes.join(', ')}] — `
        + `${j.puzzle.cells.length} cells, from ${j.name}`);
    }
    console.log(`would bake ${jobs.length} mystery picture(s) into puzzles/ — nothing written`);
    return;
  }

  const bakedTags = readJson(TAGS, {});
  for (const j of jobs) bakedTags[j.id] = { difficulty: j.tag.difficulty, themes: j.tag.themes };
  fs.writeFileSync(TAGS, `${JSON.stringify(bakedTags, null, 2)}\n`);

  for (const j of jobs) {
    const out = writePuzzle(j.puzzle, { id: j.id, title: j.title, blind: true });
    fs.rmSync(path.join(QUEUE_DIR, j.name));
    delete queueTagsRaw[j.base];
    reportPuzzle(j.puzzle, j.title, out);
  }
  fs.writeFileSync(QUEUE_TAGS, `${JSON.stringify(queueTagsRaw, null, 2)}\n`);

  console.log(`baked ${jobs.length} mystery picture(s) into puzzles/`);
}

main();
