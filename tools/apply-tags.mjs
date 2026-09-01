#!/usr/bin/env node
// Applies the difficulty + theme tags in puzzles/tags.json to the manifest.
//
// Unlike animations.json / lifts.json — which mapify bakes into each puzzle
// JSON — difficulty and themes belong on the *manifest* entry, because the
// Pictures list filters off the manifest and never loads the full puzzle JSON.
// mapify.manifestEntry already reads tags.json on a bake, so a re-baked
// picture keeps its tags; this tool is what backfills every already-baked
// entry (and re-syncs the whole file) without re-baking all of them.
//
//   node tools/apply-tags.mjs          # write difficulty/themes onto manifest
//   node tools/apply-tags.mjs --check  # fail if the manifest is out of sync
//
// Runs as part of `npm run seed`.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The common theme labels, and the order they sort first in the Pictures
// filter. Themes are NOT a closed set: a picture may carry any label, and a new
// one (say "Trees") becomes its own filter category automatically. This list is
// only the familiar core and its preferred order — everything else follows it,
// alphabetically.
export const THEMES = [
  'Animals', 'Flowers', 'Food', 'Fantasy', 'Space', 'Landscape', 'Spooky', 'Abstract', 'Water',
];
export const DIFFICULTIES = ['chunky', 'normal', 'detailed', 'insane'];

/**
 * Canonical spelling for a theme label. Because categories are free-form, this
 * is what stops "trees", "Trees" and " trees " from splintering into three:
 * trim, collapse inner whitespace, Title-Case each word. The nine common themes
 * above are already in this form, so normalising them changes nothing.
 */
export function normalizeTheme(raw) {
  return String(raw).trim().replace(/\s+/g, ' ')
    .replace(/\S+/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
}

/** A theme label is well-formed if it normalises to itself and reads as a short
 *  category name (letters/digits, spaces, & / -). Keeps a stray path or blob of
 *  markup out of the filter. */
export function isThemeLabel(s) {
  return typeof s === 'string' && s.length <= 24
    && /^[A-Za-z0-9][A-Za-z0-9 &/-]*$/.test(s) && normalizeTheme(s) === s;
}

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const PUZZLE_DIR = path.join(ROOT, 'puzzles');

/** The tags map, minus the underscore-prefixed readme keys. */
export function readTagsFile(dir = PUZZLE_DIR) {
  const file = path.join(dir, 'tags.json');
  if (!fs.existsSync(file)) return {};
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  return Object.fromEntries(Object.entries(raw).filter(([id]) => !id.startsWith('_')));
}

/**
 * Rewrites each manifest entry's `difficulty` and `themes` to match tags.json.
 * A picture with no tag entry defaults to difficulty "normal" and no themes.
 *
 * @returns {{ changed: string[], missing: string[] }}
 *   `missing` is tag ids with no manifest entry — a typo in the sidecar.
 */
export function applyTags({ check = false, dir = PUZZLE_DIR } = {}) {
  const tags = readTagsFile(dir);
  const manifestFile = path.join(dir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  const ids = new Set(manifest.map((p) => p.id));
  const missing = Object.keys(tags).filter((id) => !ids.has(id));

  const changed = [];
  for (const entry of manifest) {
    const tag = tags[entry.id];
    const difficulty = tag?.difficulty ?? 'normal';
    const themes = tag?.themes?.length ? tag.themes.map(normalizeTheme) : undefined;
    const before = JSON.stringify([entry.difficulty, entry.themes]);
    entry.difficulty = difficulty;
    if (themes) entry.themes = themes;
    else delete entry.themes;
    if (JSON.stringify([entry.difficulty, entry.themes]) !== before) changed.push(entry.id);
  }

  if (!check && changed.length) {
    fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
  }
  return { changed, missing };
}

// Run directly (not imported by a test).
if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check');
  const { changed, missing } = applyTags({ check });

  for (const id of missing) {
    console.error(`tags.json tags "${id}", which is not in the manifest — check the id`);
  }
  if (changed.length) {
    console.log(`${check ? 'would update' : 'updated'} manifest: ${changed.join(', ')}`);
  } else {
    console.log('the manifest already matches tags.json');
  }
  process.exit(missing.length || (check && changed.length) ? 1 : 0);
}
