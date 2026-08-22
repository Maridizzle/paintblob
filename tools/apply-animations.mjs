#!/usr/bin/env node
// Syncs puzzles/animations.json into every puzzle file.
//
//   node tools/apply-animations.mjs [--check]
//
// Why this exists as its own step, when tools/mapify.mjs already injects the
// tag at bake time: the weekly mystery pictures are baked exactly once, by
// .github/workflows/weekly-mystery.yml, which then deletes the source photo
// from puzzles/queue/. Their cell ids do not exist until that bake has
// happened, so a tag for one can only ever be written afterwards — and there
// is no second bake to inject it. The demo pictures are the opposite: they
// are rebuilt from code on every `npm run seed`, so anything written into
// their JSON by hand is wiped.
//
// This step covers both. It is idempotent, it is the last thing `npm run
// seed` does, and `npm test` fails if a puzzle file has drifted from the
// sidecar — so the sidecar stays the single source of truth either way.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const PUZZLE_DIR = path.join(ROOT, 'puzzles');
const SIDECAR = path.join(PUZZLE_DIR, 'animations.json');
const LIFTS = path.join(PUZZLE_DIR, 'lifts.json');

/**
 * The tag sidecars: hand-edited inputs that mapify bakes into the puzzle
 * files, so the client never fetches them and they must not ship.
 */
export const TAG_SIDECARS = new Set(['animations.json', 'lifts.json', 'tags.json']);

/**
 * Everything in puzzles/ that is not a puzzle — the tag sidecars plus the
 * index. One list, exported, because several scanners walk that directory and
 * a file missing from any one of them is a different bug each time: a crash in
 * the geometry verifier, or a "picture" with no cells.
 *
 * Not the same set the web build excludes — the manifest very much does ship.
 */
export const SIDECAR_FILES = new Set(['manifest.json', ...TAG_SIDECARS]);

/** The tags, minus the underscore-prefixed readme keys. */
export function readTags() {
  return readSidecar(SIDECAR);
}

/** The lift tags — which picture raises which of its cells. Same shape of
 *  file, separate from the animation tags because the two are chosen for
 *  different reasons and change independently. */
export function readLifts() {
  return readSidecar(LIFTS);
}

function readSidecar(file) {
  if (!fs.existsSync(file)) return {};
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  return Object.fromEntries(Object.entries(raw).filter(([id]) => !id.startsWith('_')));
}

/**
 * Writes each picture's `animation` field to match the sidecar.
 *
 * @param {boolean} check  report what would change without writing anything.
 * @returns {{ changed: string[], missing: string[] }}
 *   `missing` is ids tagged in the sidecar with no puzzle file — a typo in an
 *   id fails silently otherwise, which is the one mistake here that would
 *   leave a picture quietly unanimated.
 */
export function applyAnimations({ check = false } = {}) {
  const tags = readTags();
  const lifts = readLifts();
  const changed = [];
  const missing = [...new Set([...Object.keys(tags), ...Object.keys(lifts)])]
    .filter((id) => !fs.existsSync(path.join(PUZZLE_DIR, `${id}.json`)));

  const files = fs.readdirSync(PUZZLE_DIR)
    .filter((f) => f.endsWith('.json') && !SIDECAR_FILES.has(f));

  for (const file of files) {
    const full = path.join(PUZZLE_DIR, file);
    const puzzle = JSON.parse(fs.readFileSync(full, 'utf8'));
    const want = tags[puzzle.id] ?? null;
    const have = puzzle.animation ?? null;
    const wantLift = lifts[puzzle.id] ?? null;
    const haveLift = puzzle.lift ?? null;
    if (JSON.stringify(want) === JSON.stringify(have)
      && JSON.stringify(wantLift) === JSON.stringify(haveLift)) continue;

    changed.push(puzzle.id);
    if (check) continue;

    // Rebuilt rather than mutated so the key order stays exactly what
    // writePuzzle() emits: everything, then animation, then lift, then the
    // (huge) sourceImage last. Both tags have to be named in the destructure —
    // one left in `rest` would keep its old position and shuffle the file on
    // every run.
    const { sourceImage, animation: _drop, lift: _dropLift, ...rest } = puzzle;
    fs.writeFileSync(full, JSON.stringify({
      ...rest,
      ...(want ? { animation: want } : {}),
      ...(wantLift ? { lift: wantLift } : {}),
      sourceImage,
    }));
  }
  return { changed, missing };
}

// Run directly (not imported by the tagging tool or a test).
if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check');
  const { changed, missing } = applyAnimations({ check });

  for (const id of missing) {
    console.error(`a sidecar tags "${id}", which is not a puzzle — check the id`);
  }
  if (changed.length) {
    console.log(`${check ? 'would update' : 'updated'}: ${changed.join(', ')}`);
  } else {
    console.log('every puzzle already matches the sidecars');
  }
  process.exit(missing.length || (check && changed.length) ? 1 : 0);
}
