#!/usr/bin/env node
// Pick the one thing in a picture that comes alive, and tag it.
//
// The tagging itself is a judgement call — which element should move, and
// which of the five effects suits it — so this tool's job is to put the
// picture in front of you with its cell ids legible, let you name a region,
// and then show you the result moving before you commit it.
//
//   node tools/tag-animation.mjs koi-pond                     # map the cells
//   node tools/tag-animation.mjs koi-pond --colour 3          # which cells are that tub?
//   node tools/tag-animation.mjs koi-pond --box 200,600,700,880
//   node tools/tag-animation.mjs koi-pond --set ripple --cells 11,13 --speed 0.8
//   node tools/tag-animation.mjs koi-pond --play              # frames across the window
//   node tools/tag-animation.mjs koi-pond --clear
//
// Writes into puzzles/animations.json, which tools/mapify.mjs injects back
// into the puzzle JSON on every bake — see animationFor() there for why the
// tags cannot simply live in the puzzle file.

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

import { findChromium } from './lib/chromium.mjs';
import { LIVING_EFFECTS } from '../src/render.js';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const PUZZLE_DIR = path.join(ROOT, 'puzzles');
const SIDECAR = path.join(PUZZLE_DIR, 'animations.json');

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png',
};

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i < 0 ? fallback : args[i + 1];
};
const has = (name) => args.includes(`--${name}`);

const manifest = JSON.parse(fs.readFileSync(path.join(PUZZLE_DIR, 'manifest.json'), 'utf8'));
const id = args.find((a) => !a.startsWith('--') && manifest.some((p) => p.id === a));
if (!id) {
  console.error('usage: node tools/tag-animation.mjs <puzzle-id> [--set effect --cells 1,2] ...');
  console.error(`  puzzles: ${manifest.map((p) => p.id).join(', ')}`);
  console.error(`  effects: ${LIVING_EFFECTS.join(', ')}`);
  process.exit(1);
}

const puzzle = JSON.parse(fs.readFileSync(path.join(PUZZLE_DIR, `${id}.json`), 'utf8'));
const outDir = path.resolve(flag('out', path.join(PUZZLE_DIR, '_raw', 'tag', id)));

/* ------------------------------------------------------------ the sidecar */

function readSidecar() {
  return fs.existsSync(SIDECAR) ? JSON.parse(fs.readFileSync(SIDECAR, 'utf8')) : {};
}

function writeSidecar(tags) {
  // Underscore keys (the embedded readme) sort first and stay first.
  const ordered = Object.fromEntries(Object.entries(tags)
    .sort(([a], [b]) => (a.startsWith('_') === b.startsWith('_') ? a.localeCompare(b) : a.startsWith('_') ? -1 : 1)));
  fs.writeFileSync(SIDECAR, `${JSON.stringify(ordered, null, 2)}\n`);
}

/* ------------------------------------------- picking cells without a browser */

/** Cells whose anchor falls inside a picture-unit box. */
function cellsInBox(box) {
  const [x0, y0, x1, y1] = box;
  return puzzle.cells
    .map((c, i) => ({ ...c, i }))
    .filter((c) => c.x >= x0 && c.x <= x1 && c.y >= y0 && c.y <= y1)
    .map((c) => c.i);
}

const cellsOfColour = (n) => puzzle.cells.map((c, i) => (c.c === n ? i : -1)).filter((i) => i >= 0);

function describe(ids) {
  for (const i of ids) {
    const c = puzzle.cells[i];
    const p = puzzle.palette[c.c];
    console.log(`  ${String(i).padStart(3)}  tub ${String(c.c + 1).padStart(2)} ${p.hex} ${p.name.padEnd(22)}`
      + ` at ${Math.round(c.x)},${Math.round(c.y)}  area ${c.a}`);
  }
}

if (has('colour') || has('color')) {
  const n = Number(flag('colour', flag('color')));
  console.log(`tub ${n + 1} — ${puzzle.palette[n]?.name ?? '?'}`);
  describe(cellsOfColour(n));
}

let selected = null;
if (has('cells')) selected = flag('cells').split(',').map((s) => Number(s.trim()));
else if (has('box')) selected = cellsInBox(flag('box').split(',').map(Number));

if (has('box') && !has('set')) {
  console.log(`cells with an anchor inside ${flag('box')}:`);
  describe(selected);
}

if (has('clear')) {
  const tags = readSidecar();
  delete tags[id];
  writeSidecar(tags);
  console.log(`cleared the animation tag for ${id}`);
}

if (has('set')) {
  const effect = flag('set');
  if (!LIVING_EFFECTS.includes(effect)) {
    console.error(`--set must be one of ${LIVING_EFFECTS.join(', ')}`);
    process.exit(1);
  }
  if (!selected?.length) {
    console.error('--set needs --cells 1,2,3 or --box x0,y0,x1,y1 to say what moves');
    process.exit(1);
  }
  const bad = selected.filter((i) => !Number.isInteger(i) || i < 0 || i >= puzzle.cells.length);
  if (bad.length) {
    console.error(`cell ids out of range for ${id} (0..${puzzle.cells.length - 1}): ${bad.join(', ')}`);
    process.exit(1);
  }
  const tags = readSidecar();
  tags[id] = {
    effect,
    cells: [...new Set(selected)].sort((a, b) => a - b),
    speed: Number(flag('speed', 1)),
    amplitude: Number(flag('amplitude', 1)),
  };
  writeSidecar(tags);
  console.log(`${id}: ${effect} on ${tags[id].cells.length} cell(s)`);
  describe(tags[id].cells);
  console.log('\nrun `npm run seed` to bake it into the puzzle JSON');
}

const tag = readSidecar()[id] ?? null;
const highlight = selected ?? tag?.cells ?? [];

/* -------------------------------------------------------------- the pictures */

function serve() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]);
    const file = path.join(ROOT, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

const { server, port } = await serve();
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: findChromium(chromium),
  headless: !has('head'),
  args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 720, height: 820 } });
page.on('pageerror', (err) => console.error(`pageerror: ${err.message}`));

// Same virtual clock the burst previewer uses: headless Chromium throttles
// rAF hard, so stepping the clock by hand is the only way to land on an
// exact moment of the animation.
await page.addInitScript(() => {
  let vnow = 0;
  let pending = [];
  window.requestAnimationFrame = (cb) => pending.push(cb);
  window.cancelAnimationFrame = () => {};
  performance.now = () => vnow;
  window.__clock = { step(ms) { vnow += ms; const due = pending; pending = []; for (const cb of due) cb(vnow); } };
});

// Open the picture already finished, which is the only state the photo view
// exists in.
await page.addInitScript((data) => {
  const save = {
    version: 1,
    progress: { [data.id]: { filled: data.filled, done: true, seconds: 300 } },
    stats: { hints: 3, hintsEarned: 3, daysVisited: 1 },
    unlocked: [],
    settings: { sound: false, volume: 0, lastPuzzle: data.id },
    bounds: null,
  };
  window.blob = {
    readSave: async () => save,
    writeSave: async () => true,
    listPuzzles: async () => data.manifest,
    loadPuzzle: async (pid) => (pid === data.id ? data.puzzle : null),
    pickImage: async () => [],
    savePuzzle: async () => ({ id: data.id }),
    deletePuzzle: async () => true,
    minimise() {}, close() {},
    toggleAlwaysOnTop: async () => true,
    resizeBy() {},
  };
}, { id, puzzle, manifest, filled: puzzle.cells.map((_, i) => i) });

await page.goto(`http://127.0.0.1:${port}/src/index.html`);
await page.waitForFunction(() => window.__paintblobTest?.board?.puzzle, null, { timeout: 10000, polling: 100 });
// The photo is decoded asynchronously; without it there is no photo view.
await page.waitForFunction(() => window.__paintblobTest.board.sourceBitmap, null, { timeout: 10000, polling: 100 });

const step = (ms) => page.evaluate((m) => window.__clock.step(m), ms);

/** Redraw at the current virtual time, then label every cell over the top. */
async function shoot(file, { photo, labels = true, ids = [] }) {
  await page.evaluate(({ photo: p, labels: l, ids: on }) => {
    const { board } = window.__paintblobTest;
    board.setShowSource(p);
    board.draw([], performance.now());
    if (!l) return;
    const ctx = board.canvas.getContext('2d');
    ctx.save();
    board.applyTransform(ctx);
    ctx.lineJoin = 'round';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const cell of board.cells) {
      const picked = on.includes(cell.id);
      ctx.lineWidth = (picked ? 3 : 1) / board.scale;
      ctx.strokeStyle = picked ? 'rgba(0, 224, 255, 0.95)' : 'rgba(255, 255, 255, 0.45)';
      ctx.stroke(cell.path);
      if (picked) {
        ctx.fillStyle = 'rgba(0, 224, 255, 0.18)';
        ctx.fill(cell.path);
      }
      ctx.font = `700 ${17 / board.scale}px system-ui, sans-serif`;
      ctx.lineWidth = 4 / board.scale;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
      ctx.strokeText(String(cell.id), cell.anchor.x, cell.anchor.y);
      ctx.fillStyle = picked ? '#00e0ff' : '#ffffff';
      ctx.fillText(String(cell.id), cell.anchor.x, cell.anchor.y);
    }
    ctx.restore();
  }, { photo, labels, ids });
  await page.locator('#board').screenshot({ path: path.join(outDir, file) });
}

await shoot('map-painting.png', { photo: false, ids: highlight });
await shoot('map-photo.png', { photo: true, ids: highlight });
console.log(`\nmap: ${path.relative(ROOT, outDir)}/map-painting.png, map-photo.png`);

// --- the effect actually moving -------------------------------------------
// Nothing else in the loop tells you whether the motion reads as the thing
// it is meant to be, or whether it tears at the silhouette's edge.
if (tag) {
  const frames = path.join(outDir, 'frames');
  fs.rmSync(frames, { recursive: true, force: true });
  fs.mkdirSync(frames, { recursive: true });

  await page.evaluate(() => {
    const { board } = window.__paintblobTest;
    board.setShowSource(true);
    board.draw([], performance.now());
  });
  await page.evaluate((spec) => {
    const { board } = window.__paintblobTest;
    board.startLiving(spec, performance.now());
  }, tag);

  // Tight on the tagged region, so the motion is big enough to judge.
  const clip = await page.evaluate((ids) => {
    const { board } = window.__paintblobTest;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const i of ids) {
      const b = board.cells[i].bounds;
      x0 = Math.min(x0, b.x0); y0 = Math.min(y0, b.y0);
      x1 = Math.max(x1, b.x1); y1 = Math.max(y1, b.y1);
    }
    const a = board.toScreen(x0, y0);
    const b = board.toScreen(x1, y1);
    const pad = 12;
    return {
      x: Math.max(0, a.x - pad), y: Math.max(0, a.y - pad),
      width: b.x - a.x + pad * 2, height: b.y - a.y + pad * 2,
    };
  }, tag.cells);

  const SHOTS = 14;
  const SPAN = 7000;
  for (let i = 0; i < SHOTS; i++) {
    await step(SPAN / SHOTS);
    const ms = Math.round(((i + 1) * SPAN) / SHOTS);
    await page.screenshot({ path: path.join(frames, `${String(ms).padStart(5, '0')}ms.png`), clip });
  }
  // One past the end: the window must have closed itself and left nothing
  // behind on the photo.
  await step(1200);
  await page.screenshot({ path: path.join(frames, 'after.png'), clip });
  const stillLiving = await page.evaluate(() => !!window.__paintblobTest.board.living);
  console.log(`frames: ${path.relative(ROOT, frames)}/  (${tag.effect})`);
  console.log(stillLiving ? '  WARNING: the window did not close itself' : '  window closed cleanly');
} else {
  console.log('no animation tagged for this picture yet');
}

await browser.close();
server.close();
