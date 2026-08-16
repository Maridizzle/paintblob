#!/usr/bin/env node
// Verifies the web build behaves on a phone.
//
// Runs dist-web/ in Chromium with a Pixel-sized viewport and touch input, taps
// a cell with a finger rather than a mouse, then kills the network and reloads
// to prove the service worker really does make it work offline — which is the
// whole point of installing it to a home screen.
//
//   node tools/build-web.mjs && node tools/check-web.mjs [--head]

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from 'playwright-core';

import { findChromium } from './lib/chromium.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const WEB = path.join(ROOT, 'dist-web');
const OUT = path.join(ROOT, 'puzzles', '_raw', 'mobile');


const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
};

function serve(root) {
  const server = http.createServer((req, res) => {
    let rel = decodeURIComponent(req.url.split('?')[0]);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.join(root, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store', // force the service worker to be the thing under test
    });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

if (!fs.existsSync(WEB)) {
  console.error('dist-web/ is missing — run: node tools/build-web.mjs');
  process.exit(1);
}

const { server, port } = await serve(WEB);
// 127.0.0.1 counts as a secure context, so service workers are allowed
// without having to terminate TLS here.
const origin = `http://127.0.0.1:${port}/`;
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: findChromium(chromium),
  headless: !process.argv.includes('--head'),
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--mute-audio'],
});

const context = await browser.newContext({ ...devices['Pixel 5'] });
const page = await context.newPage();

const problems = [];
page.on('console', (m) => {
  if (m.type() === 'error') problems.push(`console: ${m.text()}`);
});
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));

const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) problems.push(`check failed: ${label} ${detail}`);
};

console.log(`Pixel 5, ${origin}`);

await page.goto(origin);
await page.waitForFunction(
  () => document.querySelectorAll('#tubs .tub').length > 0,
  null,
  { timeout: 15000, polling: 100 },
);

// Switch to the picture with the most paint tubs. A tray of eighteen is what
// actually threatens a phone layout; whichever puzzle happens to sort first
// tells you nothing.
const manifest = JSON.parse(fs.readFileSync(path.join(WEB, 'puzzles', 'manifest.json'), 'utf8'));
const busiest = [...manifest].sort((a, b) => b.colours - a.colours)[0];
await page.click('[data-act="pictures"]');
await page.click(`.row.clickable:has-text("${busiest.title}")`);
await page.waitForFunction(
  (title) => document.getElementById('barSubtitle').textContent.startsWith(title),
  busiest.title,
  { timeout: 10000, polling: 100 },
);

/* --------------------------------------------------------------- the basics */

check('boots and renders paint tubs', true, `${busiest.title}, ${busiest.colours} tubs`);
check('platform detected as web',
  await page.evaluate(() => document.documentElement.classList.contains('is-web')));

const chromeHidden = await page.evaluate(() =>
  [...document.querySelectorAll('.desktop-only')].every((el) => el.offsetParent === null));
check('window chrome hidden on touch', chromeHidden);

const tubBox = await page.locator('#tubs .tub').first().boundingBox();
check('tub is a comfortable tap target', tubBox.width >= 40 && tubBox.height >= 40,
  `${Math.round(tubBox.width)}x${Math.round(tubBox.height)}px`);

// The tray must not crowd out the picture, however many colours there are.
const split = await page.evaluate(() => ({
  board: document.getElementById('board').getBoundingClientRect().height,
  tray: document.getElementById('tray').getBoundingClientRect().height,
}));
check('picture keeps most of the screen', split.board > split.tray * 1.8,
  `board ${Math.round(split.board)}px vs tray ${Math.round(split.tray)}px`);

/* -------------------------------------------------------------- painting */

const puzzleId = await page.evaluate(() => document.getElementById('barSubtitle').textContent);
const puzzle = JSON.parse(fs.readFileSync(
  path.join(WEB, 'puzzles', `${fs.readdirSync(path.join(WEB, 'puzzles'))
    .filter((f) => f !== 'manifest.json')
    .find((f) => JSON.parse(fs.readFileSync(path.join(WEB, 'puzzles', f), 'utf8')).title
      === puzzleId.split(' · ')[0])}`),
  'utf8',
));

// The board's on-screen position, freshly read — the bar above it grows and
// shrinks (toasts, badges) as the game reacts to what just happened, so a
// rect cached from an earlier moment drifts. A real finger always aims at
// where the picture is *now*, so every tap below re-reads this first.
async function boardTransform() {
  const r = await page.evaluate(() => {
    const b = document.getElementById('board').getBoundingClientRect();
    return { left: b.left, top: b.top, width: b.width, height: b.height };
  });
  const s = Math.min(r.width / puzzle.width, r.height / puzzle.height);
  return {
    scale: s,
    ox: r.left + (r.width - puzzle.width * s) / 2,
    oy: r.top + (r.height - puzzle.height * s) / 2,
  };
}

const { scale, ox, oy } = await boardTransform();
const target = puzzle.cells.filter((c) => c.c === 0).sort((a, b) => b.a - a.a)[0];

await page.screenshot({ path: path.join(OUT, 'portrait-before.png') });

// A real finger tap, not a synthetic mouse click.
await page.touchscreen.tap(ox + target.x * scale, oy + target.y * scale);
await page.waitForTimeout(500);
await page.screenshot({ path: path.join(OUT, 'portrait-burst.png') });

await page.waitForFunction(
  () => /· [1-9]\d*\//.test(document.getElementById('barSubtitle').textContent),
  null,
  { timeout: 10000, polling: 100 },
);
check('tapping a cell paints it', true,
  await page.evaluate(() => document.getElementById('barSubtitle').textContent));

await page.waitForTimeout(900);
await page.screenshot({ path: path.join(OUT, 'portrait-after.png') });

/* -------------------------------------------------------------- zoom & pan */

// Two-finger pinch: Playwright's touchscreen API is single-touch only, so
// this dispatches raw PointerEvents the way a real two-finger touch would —
// the same technique already used below for paste/drop, which cannot go
// through a high-level API either.
const pinchResult = await page.evaluate(() => {
  const board = document.getElementById('board');
  const r = board.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  const fire = (type, id, x, y) => board.dispatchEvent(new PointerEvent(type, {
    pointerId: id, pointerType: 'touch', clientX: x, clientY: y,
    bubbles: true, cancelable: true, isPrimary: id === 1,
  }));

  fire('pointerdown', 1, cx - 20, cy);
  fire('pointerdown', 2, cx + 20, cy);
  for (let i = 1; i <= 5; i++) {
    const half = 20 + i * 24;
    fire('pointermove', 1, cx - half, cy);
    fire('pointermove', 2, cx + half, cy);
  }
  fire('pointerup', 1, cx - 140, cy);
  fire('pointerup', 2, cx + 140, cy);

  const pill = document.getElementById('zoomPill');
  return { text: pill.textContent, hidden: pill.classList.contains('hidden') };
});
check('pinch zooms in', !pinchResult.hidden && Number.parseInt(pinchResult.text, 10) > 100,
  `pill reads "${pinchResult.text}"`);
await page.screenshot({ path: path.join(OUT, 'pinch-zoomed.png') });

// A one-finger drag past the threshold must pan, not paint — this is the
// bar a fingertip is held to everywhere else in the app (a fuzzy tap is
// still a tap), so it is worth checking a real drag does not sneak past it.
const beforeDrag = await page.evaluate(() => document.getElementById('barSubtitle').textContent);
await page.evaluate(() => {
  const board = document.getElementById('board');
  const r = board.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  const fire = (type, x, y) => board.dispatchEvent(new PointerEvent(type, {
    pointerId: 9, pointerType: 'touch', clientX: x, clientY: y,
    bubbles: true, cancelable: true, isPrimary: true,
  }));
  fire('pointerdown', cx, cy);
  fire('pointermove', cx - 15, cy - 10);
  fire('pointermove', cx - 40, cy - 30);
  fire('pointermove', cx - 70, cy - 55);
  fire('pointerup', cx - 70, cy - 55);
});
const afterDrag = await page.evaluate(() => document.getElementById('barSubtitle').textContent);
check('one-finger drag pans instead of painting', afterDrag === beforeDrag,
  `"${beforeDrag}" -> "${afterDrag}"`);

// Reset, then a plain tap must still paint — confirming the gesture rework
// left the common case, a finger just tapping a cell, exactly as it was.
await page.click('#zoomPill');
const zoomReset = await page.evaluate(() =>
  document.getElementById('zoomPill').classList.contains('hidden'));
check('zoom pill resets to 100%', zoomReset);

// Same tub as the first tap — held tub is still whatever the first tap
// selected, and a second colour's cell would be a genuine wrong-tub miss.
const target2 = puzzle.cells.filter((c) => c.c === target.c).sort((a, b) => b.a - a.a)[1];
const post = await boardTransform();
await page.touchscreen.tap(post.ox + target2.x * post.scale, post.oy + target2.y * post.scale);
const secondTap = await page.waitForFunction(
  () => /· [2-9]\d*\//.test(document.getElementById('barSubtitle').textContent),
  null,
  { timeout: 10000, polling: 100 },
).then(() => true).catch(() => false);
check('a tap still paints after zoom and pan', secondTap,
  await page.evaluate(() => document.getElementById('barSubtitle').textContent));

/* ------------------------------------------------------------------ speed */

// Drive the effect directly rather than timing frames on the page: headless
// Chromium throttles requestAnimationFrame hard, so observed frame rate says
// nothing. This measures the actual cost of a burst frame — three passes over
// every blob plus two gradients each — against the 16.6ms a 60fps budget.
const msPerFrame = await page.evaluate(async (base) => {
  const { Burst } = await import(new URL('paint-fx.js', base).href);
  const canvas = document.createElement('canvas');
  canvas.width = 900;
  canvas.height = 900;
  const ctx = canvas.getContext('2d');
  const make = () => new Burst({
    origin: { x: 450, y: 450 },
    sink: { x: 300, y: 320 },
    colour: '#d1495b',
    width: 900,
    height: 900,
    reach: 220,
    cellPath: null,
    seed: 7,
    speed: 1,
    density: 1,
  });

  make(); // warm the JIT and allocate the scratch layer
  const burst = make();
  const frames = 72;
  const started = performance.now();
  for (let i = 0; i < frames; i++) {
    burst.update(16);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    burst.drawBlobs(ctx);
  }
  return (performance.now() - started) / frames;
}, origin);

check('burst frame fits a 60fps budget', msPerFrame < 16.6,
  `${msPerFrame.toFixed(1)}ms per frame at full density`);

/* ------------------------------------------------------------------- pwa */

const webManifest = await page.evaluate(async () => {
  const link = document.querySelector('link[rel="manifest"]');
  if (!link) return null;
  return (await fetch(link.href)).json();
});
check('manifest is linked and valid', !!webManifest?.icons?.length,
  webManifest ? `${webManifest.name}, ${webManifest.icons.length} icons` : 'missing');

const swReady = await page.evaluate(() =>
  navigator.serviceWorker.ready.then(() => true).catch(() => false));
check('service worker registered', swReady);

/* --------------------------------------------------------------- offline */

// The real test of an installed app: no network at all.
await context.setOffline(true);
await page.reload({ waitUntil: 'load' });
const offlineOk = await page.waitForFunction(
  () => document.querySelectorAll('#tubs .tub').length > 0,
  null,
  { timeout: 15000, polling: 100 },
).then(() => true).catch(() => false);
check('works with the network switched off', offlineOk);

if (offlineOk) {
  const kept = await page.evaluate(() => document.getElementById('barSubtitle').textContent);
  check('progress survived the reload', /· [1-9]\d*\//.test(kept), kept);
  await page.screenshot({ path: path.join(OUT, 'offline.png') });
}
await context.setOffline(false);

/* -------------------------------------------------------------- landscape */

await page.setViewportSize({ width: 851, height: 393 });
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(OUT, 'landscape.png') });
check('landscape lays out without overflow',
  await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));

/* --------------------------------------------------------- ways to add art */
// Last, because these change the active puzzle. Paste and drag-drop are the
// routes that never open a native file picker — which is the one part of "add
// a picture" that cannot be tested without a real OS gesture, and the part
// that keeps shipping broken. They are what the user falls back to, so they
// must be solid.

await page.setViewportSize({ width: 393, height: 851 });
await page.waitForTimeout(200);

const pasteResult = await page.evaluate(async () => {
  const cv = new OffscreenCanvas(300, 300);
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#e8d5a0'; ctx.fillRect(0, 0, 300, 300);
  ctx.fillStyle = '#7a3b8c'; ctx.beginPath(); ctx.arc(150, 150, 90, 0, 7); ctx.fill();
  const blob = await cv.convertToBlob({ type: 'image/png' });
  const dt = new DataTransfer();
  dt.items.add(new File([blob], 'pasted.png', { type: 'image/png' }));
  window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  for (let i = 0; i < 80; i++) {
    await new Promise((r) => setTimeout(r, 100));
    if (/Pasted/.test(document.getElementById('barSubtitle').textContent)) return 'added';
  }
  return document.getElementById('barSubtitle').textContent;
});
check('pasting an image adds it', pasteResult === 'added', pasteResult);

const dropResult = await page.evaluate(async () => {
  const cv = new OffscreenCanvas(300, 300);
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#a0d5e8'; ctx.fillRect(0, 0, 300, 300);
  ctx.fillStyle = '#3b8c5a'; ctx.fillRect(60, 60, 180, 180);
  const blob = await cv.convertToBlob({ type: 'image/png' });
  const dt = new DataTransfer();
  dt.items.add(new File([blob], 'dropped.png', { type: 'image/png' }));
  window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  for (let i = 0; i < 80; i++) {
    await new Promise((r) => setTimeout(r, 100));
    if (/Dropped/.test(document.getElementById('barSubtitle').textContent)) return 'added';
  }
  return document.getElementById('barSubtitle').textContent;
});
check('dropping an image adds it', dropResult === 'added', dropResult);

// The picker itself: a real chooser needs a user gesture, so click() is
// stubbed and the events a chooser emits are dispatched instead. What matters
// is that nothing resolves the picker early — finishing detaches the input,
// which dismisses an open chooser, and a focus fallback used to do exactly that.
const chooser = await page.evaluate(async (base) => {
  const { pickImage } = await import(new URL('platform.js', base).href);
  const real = HTMLInputElement.prototype.click;
  HTMLInputElement.prototype.click = function noop() {};
  try {
    let settled = false;
    const pending = pickImage().then((v) => { settled = true; return v; });
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('blur'));
    window.dispatchEvent(new Event('focus'));
    await new Promise((r) => setTimeout(r, 1400));
    const stayedOpen = !settled;
    const input = document.querySelector('input[type=file]');
    const detached = !input;
    input?.dispatchEvent(new Event('cancel'));
    const cancelled = await Promise.race([
      pending.then(() => 'resolved'),
      new Promise((r) => setTimeout(() => r('hung'), 2000)),
    ]);
    return { stayedOpen, detached, cancelled };
  } finally {
    HTMLInputElement.prototype.click = real;
  }
}, origin);
check('chooser survives focus changes', chooser.stayedOpen && !chooser.detached,
  chooser.detached ? 'input detached, which dismisses the dialog'
    : chooser.stayedOpen ? '' : 'picker resolved before the user answered');
check('cancelling the chooser resolves', chooser.cancelled === 'resolved', chooser.cancelled);

await browser.close();
server.close();

console.log(`\nscreenshots in ${path.relative(ROOT, OUT)}`);
if (problems.length) {
  console.error(`\n${problems.length} problem(s):`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log('all checks passed');
