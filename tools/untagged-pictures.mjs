#!/usr/bin/env node
// Which pictures have no living element yet?
//
//   node tools/untagged-pictures.mjs           # readable list
//   node tools/untagged-pictures.mjs --ids     # bare ids, one per line
//   node tools/untagged-pictures.mjs --json    # [{ id, title, cells, tagged }]
//
// Untagged is a perfectly good end state — plenty of pictures have nothing
// that wants to move. This only says which ones nobody has looked at yet.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const PUZZLE_DIR = path.join(ROOT, 'puzzles');

const read = (f) => JSON.parse(fs.readFileSync(path.join(PUZZLE_DIR, f), 'utf8'));
const tags = fs.existsSync(path.join(PUZZLE_DIR, 'animations.json')) ? read('animations.json') : {};
const lifts = fs.existsSync(path.join(PUZZLE_DIR, 'lifts.json')) ? read('lifts.json') : {};

const rows = read('manifest.json').map((p) => ({
  id: p.id,
  title: p.title,
  cells: p.cells,
  tagged: tags[p.id]?.effect ?? null,
  // Reported separately: a picture can reasonably have one and not the other.
  // Some subjects are textures with nothing to raise, and some things worth
  // raising do not move.
  lifted: Array.isArray(lifts[p.id]) ? lifts[p.id].length : null,
}));

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(rows, null, 2));
} else if (process.argv.includes('--ids')) {
  const want = process.argv.includes('--lift') ? (r) => !r.lifted : (r) => !r.tagged;
  for (const r of rows) if (want(r)) console.log(r.id);
} else {
  for (const r of rows) {
    console.log(`${(r.tagged ? `[${r.tagged}]` : '[ untagged ]').padEnd(12)} `
      + `${(r.lifted ? `[lift ${r.lifted}]` : '[  no lift ]').padEnd(12)} `
      + `${r.id.padEnd(30)} ${String(r.cells).padStart(4)} cells`);
  }
}
