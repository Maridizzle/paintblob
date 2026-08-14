#!/usr/bin/env node
// Round-trips a puzzle file back into pixels and checks the geometry.
//
// The renderer trusts three things: every pixel belongs to exactly one cell,
// the traced paths reproduce the source artwork, and the number anchor sits
// inside its own cell. All three are easy to break in the tracing code and
// impossible to eyeball, so they get checked here.
//
//   node tools/verify-puzzle.mjs [--write-png]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

// Deliberately the *same* parser the game uses. Verifying with a second
// implementation would only prove the two agree with each other.
import { parsePath } from '../src/geometry.js';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const PUZZLE_DIR = path.join(ROOT, 'puzzles');

/** Nonzero-winding scanline fill, matching what canvas does with these paths. */
function rasterise(rings, width, height, onPixel) {
  const crossings = [];
  for (let py = 0; py < height; py++) {
    const yc = py + 0.5;
    crossings.length = 0;
    for (const ring of rings) {
      const n = ring.length / 2;
      for (let i = 0; i < n; i++) {
        const ax = ring[i * 2];
        const ay = ring[i * 2 + 1];
        const bx = ring[((i + 1) % n) * 2];
        const by = ring[((i + 1) % n) * 2 + 1];
        if (ay === by) continue;
        if ((ay <= yc) === (by <= yc)) continue;
        crossings.push([ax + ((yc - ay) / (by - ay)) * (bx - ax), by > ay ? 1 : -1]);
      }
    }
    if (!crossings.length) continue;
    crossings.sort((p, q) => p[0] - q[0]);

    let winding = 0;
    for (let i = 0; i < crossings.length - 1; i++) {
      winding += crossings[i][1];
      if (winding === 0) continue;
      const x0 = Math.max(0, Math.ceil(crossings[i][0] - 0.5));
      const x1 = Math.min(width - 1, Math.ceil(crossings[i + 1][0] - 0.5) - 1);
      for (let px = x0; px <= x1; px++) onPixel(px, py);
    }
  }
}

function verify(file, writePng) {
  const puzzle = JSON.parse(fs.readFileSync(file, 'utf8'));
  const { width, height, cells, palette } = puzzle;
  const coverage = new Uint16Array(width * height);
  const owner = new Int32Array(width * height).fill(-1);

  cells.forEach((cell, id) => {
    rasterise(parsePath(cell.d), width, height, (px, py) => {
      coverage[py * width + px]++;
      owner[py * width + px] = id;
    });
  });

  let uncovered = 0;
  let overlapped = 0;
  for (let i = 0; i < coverage.length; i++) {
    if (coverage[i] === 0) uncovered++;
    else if (coverage[i] > 1) overlapped++;
  }

  let strayAnchors = 0;
  cells.forEach((cell, id) => {
    const px = Math.floor(cell.x);
    const py = Math.floor(cell.y);
    if (owner[py * width + px] !== id) strayAnchors++;
  });

  if (writePng) {
    const png = new PNG({ width, height });
    const rgb = palette.map((p) => [
      parseInt(p.hex.slice(1, 3), 16),
      parseInt(p.hex.slice(3, 5), 16),
      parseInt(p.hex.slice(5, 7), 16),
    ]);
    for (let i = 0; i < width * height; i++) {
      const id = owner[i];
      const c = id < 0 ? [255, 0, 255] : rgb[cells[id].c];
      png.data[i * 4] = c[0];
      png.data[i * 4 + 1] = c[1];
      png.data[i * 4 + 2] = c[2];
      png.data[i * 4 + 3] = 255;
    }
    const out = path.join(PUZZLE_DIR, '_raw', `${puzzle.id}.verify.png`);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, PNG.sync.write(png));
  }

  const total = width * height;
  const ok = uncovered === 0 && overlapped === 0 && strayAnchors === 0;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${puzzle.title.padEnd(14)} ` +
    `gaps ${uncovered} (${((uncovered / total) * 100).toFixed(3)}%)  ` +
    `overlaps ${overlapped}  stray anchors ${strayAnchors}/${cells.length}`,
  );
  return ok;
}

const writePng = process.argv.includes('--write-png');
const files = fs.readdirSync(PUZZLE_DIR)
  .filter((f) => f.endsWith('.json') && f !== 'manifest.json')
  .map((f) => path.join(PUZZLE_DIR, f));

let allOk = true;
for (const f of files) allOk = verify(f, writePng) && allOk;
process.exit(allOk ? 0 : 1);
