#!/usr/bin/env node
// Pick the one thing in a picture that comes alive, and tag it.
//
// The tagging itself is a judgement call — which element should move, and
// which of the five effects suits it — so this tool's job is to put the
// picture in front of you, let you name a region, and then show you the
// result moving before you commit it. Every run renders the map; a run on an
// already-tagged picture also renders frames across the whole window.
//
//   node tools/tag-animation.mjs koi-pond            # map it, and see any existing tag move
//   node tools/tag-animation.mjs koi-pond --palette  # list the tubs, for --colour
//   node tools/tag-animation.mjs koi-pond --box 200,600,700,880 --colour 3,7
//   node tools/tag-animation.mjs koi-pond --set ripple --cells 6,12,15 --speed 0.8
//   node tools/tag-animation.mjs koi-pond --clear
//
//   --box x0,y0,x1,y1   cells whose anchor is inside this picture-unit box
//   --colour n[,n...]   cells of these palette indices (tub number minus one)
//   --cells a,b,c       exact ids; overrides --box/--colour entirely
//   --set <effect>      commit the selection (ripple|glow|shimmer|breathe|twinkle)
//   --speed, --amplitude   default 1 each; >1 is faster / stronger
//   --ids               label every cell id even on a dense picture
//   --out <dir>, --head    where the renders go; run the browser visibly
//
// --box and --colour intersect, which is what isolates one thing in a busy
// picture. Writing a tag also writes it straight into puzzles/<id>.json — see
// tools/apply-animations.mjs for why that second step is not optional.
//
// Full instructions, including how to choose an effect: docs/animating-pictures.md

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

import { findChromium } from './lib/chromium.mjs';
import { applyAnimations } from './apply-animations.mjs';
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
  // Straight into the puzzle files too. A weekly mystery picture is baked
  // once and its source photo is then deleted, so there is no later bake to
  // inject the tag — writing the sidecar alone would leave it inert.
  const { changed } = applyAnimations();
  if (changed.length) console.log(`updated puzzles/: ${changed.join(', ')}`);
}

/* ------------------------------------------- picking cells without a browser */

/**
 * The chosen cells, by any combination of the three selectors.
 *
 * --cells wins outright when given. Otherwise --box and --colour *intersect*:
 * on a 500-cell picture a box alone sweeps up the whole sky along with the
 * aurora, and a colour alone grabs every green in the picture including the
 * ones on the far side of it. "Green, in this rectangle" is the selector that
 * actually isolates a thing.
 */
function select() {
  if (has('cells')) return flag('cells').split(',').map((s) => Number(s.trim()));
  if (!has('box') && !has('colour') && !has('color')) return null;

  const box = has('box') ? flag('box').split(',').map(Number) : null;
  const colours = has('colour') || has('color')
    ? new Set(String(flag('colour', flag('color'))).split(',').map((s) => Number(s.trim())))
    : null;

  return puzzle.cells
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => !box || (c.x >= box[0] && c.x <= box[2] && c.y >= box[1] && c.y <= box[3]))
    .filter(({ c }) => !colours || colours.has(c.c))
    .map(({ i }) => i);
}

function describe(ids) {
  for (const i of ids) {
    const c = puzzle.cells[i];
    const p = puzzle.palette[c.c];
    console.log(`  ${String(i).padStart(3)}  tub ${String(c.c + 1).padStart(2)} ${p.hex} ${p.name.padEnd(22)}`
      + ` at ${Math.round(c.x)},${Math.round(c.y)}  area ${c.a}`);
  }
}

// The palette, so a colour can be chosen without guessing its index. Tub
// numbers are what the game shows; --colour takes the zero-based index.
if (has('palette')) {
  puzzle.palette.forEach((p, i) => {
    const n = puzzle.cells.filter((c) => c.c === i).length;
    console.log(`  --colour ${String(i).padStart(2)}  (tub ${String(i + 1).padStart(2)})  `
      + `${p.hex}  ${p.name.padEnd(24)} ${n} cell(s)`);
  });
}

const selected = select();

if (selected && !has('set')) {
  console.log(`${selected.length} cell(s) selected:`);
  describe(selected);
  console.log('\nlook at map-photo.png — the selection is highlighted cyan.'
    + ' Narrow it with --box/--colour until it is only the thing you want,'
    + ' then re-run with --set <effect> to commit it.');
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

// Above this many cells, printing every id turns the map into an unreadable
// wall of digits — and every weekly mystery picture is 500 cells. Dense
// pictures get the coordinate grid instead, and are selected with --box or
// --colour; only the chosen cells are ever labelled. `--ids` forces the full
// set back on.
const ID_LIMIT = 60;
const labelAll = has('ids') || puzzle.cells.length <= ID_LIMIT;

/** Redraw at the current virtual time, then overlay the grid and the labels. */
async function shoot(file, { photo, ids = [] }) {
  await page.evaluate(({ photo: p, ids: on, all }) => {
    const { board } = window.__paintblobTest;
    const picked = new Set(on);
    board.setShowSource(p);
    board.draw([], performance.now());

    const ctx = board.canvas.getContext('2d');
    ctx.save();
    board.applyTransform(ctx);
    ctx.lineJoin = 'round';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const px = (n) => n / board.scale; // constant on-screen size at any zoom
    const label = (text, x, y, colour) => {
      ctx.font = `700 ${px(17)}px system-ui, sans-serif`;
      ctx.lineWidth = px(4);
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
      ctx.strokeText(text, x, y);
      ctx.fillStyle = colour;
      ctx.fillText(text, x, y);
    };

    // Outlines first: every cell faint, the chosen ones bright and filled.
    for (const cell of board.cells) {
      const on2 = picked.has(cell.id);
      ctx.lineWidth = px(on2 ? 3 : 1);
      ctx.strokeStyle = on2 ? 'rgba(0, 224, 255, 0.95)' : 'rgba(255, 255, 255, 0.4)';
      ctx.stroke(cell.path);
      if (on2) {
        ctx.fillStyle = 'rgba(0, 224, 255, 0.22)';
        ctx.fill(cell.path);
      }
    }

    // The coordinate grid, in picture units — what --box is written in.
    const { width, height } = board.puzzle;
    const raw = Math.max(width, height) / 8;
    const step = Math.max(50, Math.round(raw / 50) * 50);
    ctx.lineWidth = px(1);
    ctx.strokeStyle = 'rgba(255, 80, 200, 0.55)';
    ctx.beginPath();
    for (let x = step; x < width; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, height); }
    for (let y = step; y < height; y += step) { ctx.moveTo(0, y); ctx.lineTo(width, y); }
    ctx.stroke();
    for (let x = step; x < width; x += step) label(String(x), x, px(14), '#ff7ad0');
    for (let y = step; y < height; y += step) label(String(y), px(24), y, '#ff7ad0');

    // Ids last, so they sit over everything.
    for (const cell of board.cells) {
      const on2 = picked.has(cell.id);
      if (!all && !on2) continue;
      label(String(cell.id), cell.anchor.x, cell.anchor.y, on2 ? '#00e0ff' : '#ffffff');
    }
    ctx.restore();
  }, { photo, ids, all: labelAll });
  await page.locator('#board').screenshot({ path: path.join(outDir, file) });
}

await shoot('map-painting.png', { photo: false, ids: highlight });
await shoot('map-photo.png', { photo: true, ids: highlight });
console.log(`\nmap: ${path.relative(ROOT, outDir)}/map-painting.png, map-photo.png`);
console.log(labelAll
  ? `  every cell id is labelled (${puzzle.cells.length} cells)`
  : `  ${puzzle.cells.length} cells — too many to label, so only the grid is`
    + ' shown. Read a region off the pink coordinate grid and select it with'
    + ' --box x0,y0,x1,y1 (or --colour n); the cells you pick come back'
    + ' highlighted and numbered on the next run.');

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
