#!/usr/bin/env node
// Renders the real UI in headless Chromium and screenshots a burst frame by
// frame. Iterating on the feel of the effect by relaunching Electron and
// squinting is miserable; this gives you a contact sheet in a few seconds and
// fails loudly on any console error.
//
//   node tools/preview.mjs [puzzle-id] [--out dir] [--head]

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

// Straight from the effect itself, so frame labels can never drift out of sync
// with the timeline they describe.
import { BURST_DURATION, PHASES } from '../src/paint-fx.js';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

// Prefer whatever the environment already has rather than downloading a
// browser. PLAYWRIGHT_CHROMIUM overrides if neither guess is right.
function findChromium() {
  if (process.env.PLAYWRIGHT_CHROMIUM) return process.env.PLAYWRIGHT_CHROMIUM;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  const candidates = fs.existsSync(base)
    ? fs.readdirSync(base)
      .filter((d) => d.startsWith('chromium'))
      .flatMap((d) => [
        path.join(base, d, 'chrome-linux', 'chrome'),
        path.join(base, d, 'chrome-linux', 'headless_shell'),
      ])
    : [];
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) throw new Error(`no chromium found under ${base}; set PLAYWRIGHT_CHROMIUM`);
  return found;
}

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png',
};

// Fractions of a burst worth looking at.
//
// These are stepped on a virtual clock rather than captured in real time.
// Headless Chromium throttles requestAnimationFrame hard, and the renderer
// caps dt at 64ms to stay sane across stalls — so wall-clock captures land in
// the wrong phase entirely. Driving the clock from here makes each frame
// exact and the whole run takes a couple of seconds.
const FRACTIONS = [0.03, 0.10, 0.18, 0.26, 0.33, 0.42, 0.50, 0.58, 0.65, 0.72, 0.82, 0.92, 1.02];

// FILL deliberately overlaps the tail of SUCK; report whichever phase started
// most recently, which is what you actually want to see on a frame label.
const phaseAt = (f) => {
  const ms = f * BURST_DURATION;
  const started = Object.entries(PHASES)
    .filter(([, [a]]) => ms >= a)
    .sort((x, y) => y[1][0] - x[1][0])[0];
  return ms > BURST_DURATION ? 'after' : started?.[0] ?? 'pre';
};

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

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i < 0 ? fallback : args[i + 1];
};

const outDir = path.resolve(flag('out', path.join(ROOT, 'puzzles', '_raw', 'preview')));
const speed = Number(flag('speed', 1)); // burst playback rate, as the game uses it
const BURST_MS = BURST_DURATION;
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'puzzles', 'manifest.json'), 'utf8'));
const wanted = args.find((a) => !a.startsWith('--') && manifest.some((p) => p.id === a))
  ?? manifest[0].id;

const puzzles = Object.fromEntries(manifest.map((p) => [
  p.id,
  JSON.parse(fs.readFileSync(path.join(ROOT, 'puzzles', `${p.id}.json`), 'utf8')),
]));

const { server, port } = await serve();
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: findChromium(),
  headless: !args.includes('--head'),
  args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio', '--no-sandbox'],
});

const page = await browser.newPage({ viewport: { width: 720, height: 820 } });

const problems = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') problems.push(`console: ${msg.text()}`);
});
page.on('pageerror', (err) => problems.push(`pageerror: ${err.message}`));

// Replace rAF with a clock we step by hand from Node. Must be installed before
// any app code runs, hence addInitScript rather than evaluate.
await page.addInitScript(() => {
  let vnow = 0;
  let pending = [];
  window.requestAnimationFrame = (cb) => pending.push(cb);
  window.cancelAnimationFrame = () => {};
  performance.now = () => vnow;
  window.__clock = {
    step(ms) {
      vnow += ms;
      const due = pending;
      pending = [];
      for (const cb of due) cb(vnow);
    },
  };
});

// Stand in for the Electron preload bridge, backed by the real puzzle files.
await page.addInitScript((data) => {
  const save = {
    version: 1,
    progress: {},
    stats: { blobs: 0, cells: 0, puzzles: 0, colourSwitches: 0, seconds: 0, undos: 0, mutedCells: 0 },
    unlocked: [],
    settings: { sound: false, volume: 0, alwaysOnTop: true, speed: data.speed, density: 1 },
    bounds: null,
  };
  window.blob = {
    readSave: async () => save,
    writeSave: async () => true,
    listPuzzles: async () => data.manifest,
    loadPuzzle: async (id) => data.puzzles[id],
    minimise() {}, close() {},
    toggleAlwaysOnTop: async () => true,
    resizeBy() {},
  };
}, { manifest, puzzles, speed });

await page.goto(`http://127.0.0.1:${port}/src/index.html`);
await page.waitForFunction(() => document.querySelectorAll('#tubs .tub').length > 0, { timeout: 10000 });
await page.waitForTimeout(250);

const puzzle = puzzles[wanted];
if (wanted !== manifest[0].id) {
  await page.click('[data-act="pictures"]');
  await page.click(`.row.clickable:has-text("${puzzle.title}")`);
  await page.waitForTimeout(300);
}

// Mirror Board.layout() so we can aim at a specific cell from out here.
const rect = await page.evaluate(() => {
  const r = document.getElementById('board').getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
});
const scale = Math.min(rect.width / puzzle.width, rect.height / puzzle.height);
const ox = rect.left + (rect.width - puzzle.width * scale) / 2;
const oy = rect.top + (rect.height - puzzle.height * scale) / 2;

// Tub 1 is auto-selected on load, so target its biggest cell.
const target = puzzle.cells
  .filter((c) => c.c === 0)
  .sort((a, b) => b.a - a.a)[0];

if (!target) throw new Error('no cell for the first tub');

const stage = page.locator('#stage');

// Nothing has painted yet — the first frame only runs when we step the clock.
await page.evaluate(() => window.__clock.step(16));

await page.mouse.move(ox + target.x * scale, oy + target.y * scale);
await page.mouse.down();
await page.mouse.up();

const STEP = 16;
const advance = async (ms) => {
  for (let done = 0; done < ms; done += STEP) {
    await page.evaluate((s) => window.__clock.step(s), Math.min(STEP, ms - done));
  }
};

const shots = [];
let virtual = 0;
for (const f of FRACTIONS) {
  const want = (f * BURST_MS) / speed;
  await advance(want - virtual);
  virtual = want;
  const label = `${String(Math.round(f * 100)).padStart(3, '0')}-${phaseAt(f)}`;
  const file = path.join(outDir, `${wanted}-${label}.png`);
  await stage.screenshot({ path: file });
  shots.push(file);
}

// A second click while the first burst is still resolving — overlapping bursts
// are the normal case for anyone clicking quickly.
const second = puzzle.cells.filter((c) => c.c === 1).sort((a, b) => b.a - a.a)[0];
if (second) {
  await page.keyboard.press('2');
  await page.mouse.click(ox + second.x * scale, oy + second.y * scale);
  await advance((0.3 * BURST_MS) / speed);
  await stage.screenshot({ path: path.join(outDir, `${wanted}-overlap.png`) });
}

await advance(BURST_MS / speed);
await stage.screenshot({ path: path.join(outDir, `${wanted}-settled.png`) });

const filledCount = await page.evaluate(() => {
  const text = document.getElementById('barSubtitle').textContent;
  return text;
});

await browser.close();
server.close();

console.log(`wrote ${shots.length + 2} frames to ${path.relative(ROOT, outDir)}`);
console.log(`speed ${speed}× on a virtual clock · ${STEP}ms steps`);
console.log(`state after run: ${filledCount}`);
if (problems.length) {
  console.error(`\n${problems.length} renderer problem(s):`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log('no console errors');
