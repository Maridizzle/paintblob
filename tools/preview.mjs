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

import { findChromium } from './lib/chromium.mjs';

// Straight from the effect itself, so frame labels can never drift out of sync
// with the timeline they describe.
import { BURST_DURATION, PHASES } from '../src/paint-fx.js';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));


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
  executablePath: findChromium(chromium),
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
    stats: {
      blobs: 0, cells: 0, puzzles: 0, colourSwitches: 0, seconds: 0, undos: 0, mutedCells: 0,
      hints: 3, hintsEarned: 3, hintsUsed: 0, imported: 0, daysVisited: 1,
    },
    unlocked: [],
    settings: { sound: false, volume: 0, alwaysOnTop: true, speed: data.speed, density: 1 },
    bounds: null,
  };
  const extra = new Map(); // pictures added during the run, kept in memory
  window.blob = {
    readSave: async () => save,
    writeSave: async () => true,
    listPuzzles: async () => [...data.manifest, ...[...extra.values()].map((p) => p.entry)],
    loadPuzzle: async (id) => data.puzzles[id] ?? extra.get(id)?.puzzle,
    pickImage: async () => [],
    savePuzzle: async ({ id, title, puzzle, entry }) => {
      extra.set(id, { puzzle: { id, title, ...puzzle }, entry: { ...entry, id, title, imported: true } });
      return { id };
    },
    deletePuzzle: async (id) => extra.delete(id),
    minimise() {}, close() {},
    toggleAlwaysOnTop: async () => true,
    resizeBy() {},
  };
}, { manifest, puzzles, speed });

await page.goto(`http://127.0.0.1:${port}/src/index.html`);
// polling must be a timer, not the default 'raf' — the virtual clock above
// hijacks requestAnimationFrame, so raf-based polling never fires.
await page.waitForFunction(
  () => document.querySelectorAll('#tubs .tub').length > 0,
  null,
  { timeout: 10000, polling: 100 },
);
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
const STEP = 16;
const advance = async (ms) => {
  for (let done = 0; done < ms; done += STEP) {
    await page.evaluate((s) => window.__clock.step(s), Math.min(STEP, ms - done));
  }
};

// --- rapid double-click on one cell must not double-count it -------------
// Regression check: clicking the same unfilled cell twice before the first
// burst lands used to launch two bursts at it. Committing both decremented
// the tub's remaining count twice for one visually-filled cell — eventually
// driving it negative and stranding real cells of that colour with no way
// to select their tub again.
{
  const tub0 = puzzle.cells.filter((c) => c.c === 0).sort((a, b) => b.a - a.a);
  // Second-biggest of tub 1, not the biggest — the burst-effect walkthrough
  // below needs that one still unpainted.
  const rapidTarget = tub0[1] ?? puzzle.cells.find((c) => c.c !== 0);
  if (!rapidTarget) throw new Error('no safe second cell found for the rapid-click test');

  // Hold the tub this cell actually takes. Tub 1 is selected at load, so when
  // it has two cells to spare nothing changes here — but the fallback above
  // reaches into a different tub, and a click carrying the wrong colour is a
  // nudge rather than a fill. That painted nothing at all, which read as the
  // duplicate-burst bug this check exists to catch.
  await page.evaluate((idx) => document.querySelectorAll('#tubs .tub')[idx].click(),
    rapidTarget.c);
  await advance(16);

  const tubCount = (i) => page.evaluate(
    (idx) => Number(document.querySelectorAll('#tubs .tub')[idx].querySelector('.count').textContent),
    i,
  );
  const countBefore = await tubCount(rapidTarget.c);

  const rx = ox + rapidTarget.x * scale;
  const ry = oy + rapidTarget.y * scale;
  await page.evaluate(() => window.__clock.step(16)); // first frame only runs once stepped
  await page.mouse.move(rx, ry);
  await page.mouse.down();
  await page.mouse.up();
  await advance(200); // well inside the ~760ms before the first burst commits
  await page.mouse.down(); // same spot: a second, still-in-flight click on the same cell
  await page.mouse.up();
  await advance(1400); // both bursts, if the bug is present, fully resolve

  const countAfter = await tubCount(rapidTarget.c);
  console.log(`rapid click: tub ${rapidTarget.c + 1} count ${countBefore} -> ${countAfter}`);
  if (countAfter !== countBefore - 1) {
    problems.push(
      `rapid click on one cell changed its tub's count by ${countBefore - countAfter}, not 1 ` +
      `(${countBefore} -> ${countAfter}) — the second click launched a duplicate burst`,
    );
  }
}

// --- zoom and pan ----------------------------------------------------------
{
  const zoomPill = () => page.evaluate(() => {
    const el = document.getElementById('zoomPill');
    return { text: el.textContent, hidden: el.classList.contains('hidden') };
  });

  const cx = ox + puzzle.width * scale * 0.5;
  const cy = oy + puzzle.height * scale * 0.5;
  await page.mouse.move(cx, cy);
  await page.mouse.wheel(0, -600); // negative deltaY: zoom in, centred on the picture
  await advance(50);
  await stage.screenshot({ path: path.join(outDir, `${wanted}-zoomed-in.png`) });

  const zoomed = await zoomPill();
  console.log(`zoom: pill after wheel "${zoomed.text}" hidden=${zoomed.hidden}`);
  if (zoomed.hidden || Number.parseInt(zoomed.text, 10) <= 100) {
    problems.push(`wheel did not zoom in (pill: "${zoomed.text}", hidden=${zoomed.hidden})`);
  }

  // A drag past the threshold must pan, not paint — barSubtitle's fill count
  // must be untouched by it.
  const subtitleBefore = await page.evaluate(() => document.getElementById('barSubtitle').textContent);
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx - 60, cy - 40, { steps: 8 });
  await page.mouse.up();
  await advance(50);
  await stage.screenshot({ path: path.join(outDir, `${wanted}-panned.png`) });
  const subtitleAfter = await page.evaluate(() => document.getElementById('barSubtitle').textContent);
  console.log(`pan: subtitle "${subtitleBefore}" -> "${subtitleAfter}"`);
  if (subtitleAfter !== subtitleBefore) {
    problems.push(
      `a drag past the threshold painted a cell instead of panning ` +
      `(subtitle "${subtitleBefore}" -> "${subtitleAfter}")`,
    );
  }

  // The pill doubles as the reset button.
  await page.click('#zoomPill');
  await advance(50);
  const reset = await zoomPill();
  console.log(`zoom: pill after reset "${reset.text}" hidden=${reset.hidden}`);
  if (!reset.hidden || reset.text !== '100%') {
    problems.push(`zoom reset did not return to 100% (pill: "${reset.text}", hidden=${reset.hidden})`);
  }
}

await page.mouse.move(ox + target.x * scale, oy + target.y * scale);
await page.mouse.down();
await page.mouse.up();

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

// Spend a hint and screenshot the ping-then-pulse timeline, so a change to
// the flash's shape or timing shows up here instead of only in play. The
// balance is read before and after rather than asserted from the seed value,
// because painting cells above may itself have banked one or more — blob-1
// alone hands back a hint the instant the first cell lands.
const hintBefore = await page.evaluate(() =>
  document.querySelector('[data-act="hint"] .badge').textContent);
await page.click('[data-act="hint"]');
await page.evaluate(() => window.__clock.step(16));
await stage.screenshot({ path: path.join(outDir, `${wanted}-hint-ping.png`) });
await advance(650);
await stage.screenshot({ path: path.join(outDir, `${wanted}-hint-pulse.png`) });
await advance(650);
await stage.screenshot({ path: path.join(outDir, `${wanted}-hint-fade.png`) });
await advance(300); // past the 1600ms flash duration; it should be cleared by now
await stage.screenshot({ path: path.join(outDir, `${wanted}-hint-cleared.png`) });

const hintAfter = await page.evaluate(() =>
  document.querySelector('[data-act="hint"] .badge').textContent);
console.log(`hint: badge ${hintBefore} -> ${hintAfter} after spending one`);
if (Number(hintAfter) !== Number(hintBefore) - 1) {
  problems.push(`hint spend did not decrement the balance by exactly one (${hintBefore} -> ${hintAfter})`);
}

// The achievements panel, so the new reward badges and hint tally get eyes on
// them in the same pass as everything else.
await page.click('[data-act="trophies"]');
await page.waitForTimeout(150);
await page.locator('#app').screenshot({ path: path.join(outDir, 'trophies-panel.png') });
await page.click('[data-act="panel-close"]');

// Drop an image on the window and shoot the Pictures panel, so the import UI
// gets eyes on it in the same pass as the effect.
await page.evaluate(async () => {
  const canvas = new OffscreenCanvas(400, 400);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#efe6d5'; ctx.fillRect(0, 0, 400, 400);
  ctx.fillStyle = '#d1495b'; ctx.beginPath(); ctx.arc(150, 150, 96, 0, 7); ctx.fill();
  ctx.fillStyle = '#2a9d8f'; ctx.fillRect(40, 280, 320, 90);
  ctx.fillStyle = '#e9c46a'; ctx.beginPath(); ctx.arc(290, 120, 64, 0, 7); ctx.fill();

  const transfer = new DataTransfer();
  transfer.items.add(new File([await canvas.convertToBlob({ type: 'image/png' })],
    'dropped-shapes.png', { type: 'image/png' }));
  window.dispatchEvent(new DragEvent('drop', {
    dataTransfer: transfer, bubbles: true, cancelable: true,
  }));
});
try {
  await page.waitForFunction(
    () => /Dropped Shapes/.test(document.getElementById('barSubtitle').textContent),
    null,
    { timeout: 15000, polling: 100 },
  );
} catch (err) {
  // A bare Playwright timeout says nothing about why. The renderer's own
  // complaints are what actually diagnose it.
  console.error('import step failed');
  console.error(`  subtitle: ${await page.evaluate(() => document.getElementById('barSubtitle').textContent)}`);
  for (const p of problems) console.error(`  ${p}`);
  throw err;
}
await page.evaluate(() => window.__clock.step(16));

await page.click('[data-act="pictures"]');
await page.waitForTimeout(200);
await page.locator('#app').screenshot({ path: path.join(outDir, 'pictures-panel.png') });
await page.click('[data-act="panel-close"]');

// One more import, through the real Insane detail option and a busy
// synthetic mosaic, so the stripe fallback for undersized cells gets
// exercised through the actual import path rather than a stub. Shrunk
// viewport so scale is low enough that plenty of cells actually land under
// the 5px stripe threshold, rather than leaving it to chance at full size.
await page.setViewportSize({ width: 340, height: 380 });
await page.click('[data-act="pictures"]');
await page.waitForTimeout(200);
await page.click('.segmented button:has-text("Insane")');
await page.evaluate(async () => {
  const W = 400;
  const H = 400;
  const block = 8;
  const cols = Math.ceil(W / block);
  const rows = Math.ceil(H / block);
  const palette = ['#dc2828', '#283cd2', '#f5f0e1', '#1e8c5a', '#c87814', '#7828a0'];
  let s = 7;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const canvas = new OffscreenCanvas(W, H);
  const ctx = canvas.getContext('2d');
  for (let by = 0; by < rows; by++) {
    for (let bx = 0; bx < cols; bx++) {
      ctx.fillStyle = palette[Math.floor(rnd() * palette.length)];
      ctx.fillRect(bx * block, by * block, block, block);
    }
  }
  const transfer = new DataTransfer();
  transfer.items.add(new File([await canvas.convertToBlob({ type: 'image/png' })],
    'busy-mosaic.png', { type: 'image/png' }));
  window.dispatchEvent(new DragEvent('drop', {
    dataTransfer: transfer, bubbles: true, cancelable: true,
  }));
});
await page.waitForFunction(
  () => /Busy Mosaic/.test(document.getElementById('barSubtitle').textContent),
  null,
  { timeout: 15000, polling: 100 },
);
await page.evaluate(() => window.__clock.step(16));
// Toasts dismiss on a real setTimeout, not the virtual clock, and the script
// gets here in well under 3800ms of wall-clock time — wait them out so they
// do not blot out the very cells this screenshot needs to show.
await page.waitForTimeout(4200);
await stage.screenshot({ path: path.join(outDir, 'insane-detail.png') });
console.log(`insane detail: ${await page.evaluate(() => document.getElementById('barSubtitle').textContent)}`);

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
