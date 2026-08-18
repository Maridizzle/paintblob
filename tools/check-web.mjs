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
// tells you nothing. Blind picture titles are hidden in the list (that's the
// whole point of them), so clicking one by its real title further down would
// never find a row — restrict the search to picked ones a title click works.
const manifest = JSON.parse(fs.readFileSync(path.join(WEB, 'puzzles', 'manifest.json'), 'utf8'));
const busiest = [...manifest].filter((p) => !p.blind).sort((a, b) => b.colours - a.colours)[0];
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

// Whichever tub the game is holding right now — not necessarily target.c's
// tub by count of cells, since tub order is vibrancy-first, not usage-first,
// so a tub can easily be down to one cell (or already fully painted, in
// which case the game will have moved on to the next one). Read the live
// state and its own screen transform via window.__paintblobTest (see
// src/game.js) rather than assume a second cell of the first tub exists.
const target2 = await page.evaluate(() => {
  const { board, state } = window.__paintblobTest;
  const cell = state.cells.find((c) => c.colour === state.selected && !state.filled.has(c.id));
  return cell ? board.toScreen(cell.anchor.x, cell.anchor.y) : null;
});
check('a second unfilled cell of the held tub exists to tap', !!target2, JSON.stringify(target2));
await page.touchscreen.tap(target2.x, target2.y);
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

// That paste was this session's first import, which unlocks an achievement.
// Its toast is worth reading, so it waits for a click instead of fading on
// the same short timer an ordinary status toast uses.
const toastResult = await page.evaluate(async () => {
  const toast = document.querySelector('#toasts .toast.sticky');
  if (!toast) return { found: false };
  await new Promise((r) => setTimeout(r, 4200)); // past the 3800ms ordinary-toast timeout
  const survivedTimeout = document.body.contains(toast) && !toast.classList.contains('out');
  toast.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 500));
  const dismissedByClick = !document.body.contains(toast) || toast.classList.contains('out');
  return { found: true, survivedTimeout, dismissedByClick };
});
check('achievement toast waits for a click instead of fading on its own',
  toastResult.found && toastResult.survivedTimeout && toastResult.dismissedByClick,
  JSON.stringify(toastResult));

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

// A .zip is the deliberate way to get a picture without knowing what it is
// ahead of time — its filenames would spoil that as surely as a title would,
// so both stay hidden in the list until the picture is solved.
const zipResult = await page.evaluate(async () => {
  function u16(v) { return [v & 0xff, (v >> 8) & 0xff]; }
  function u32(v) { return [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff]; }

  // STORED (uncompressed) entries only — a plain JS builder needs no deflate
  // step, and readZip's deflate path already has its own unit tests.
  function buildZip(files) {
    const chunks = [];
    let at = 0;
    const track = (arr) => { chunks.push(arr); at += arr.length; };
    const enc = new TextEncoder();
    const offsets = [];

    for (const f of files) {
      offsets.push(at);
      const name = enc.encode(f.name);
      track(Uint8Array.from([
        ...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
        ...u32(0), ...u32(f.data.length), ...u32(f.data.length),
        ...u16(name.length), ...u16(0),
      ]));
      track(name);
      track(f.data);
    }
    const centralStart = at;
    files.forEach((f, i) => {
      const name = enc.encode(f.name);
      track(Uint8Array.from([
        ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
        ...u32(0), ...u32(f.data.length), ...u32(f.data.length),
        ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0),
        ...u32(offsets[i]),
      ]));
      track(name);
    });
    const centralSize = at - centralStart;
    track(Uint8Array.from([
      ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length),
      ...u32(centralSize), ...u32(centralStart), ...u16(0),
    ]));
    const out = new Uint8Array(at);
    let o = 0;
    for (const c of chunks) { out.set(c, o); o += c.length; }
    return out;
  }

  async function png(fill) {
    const cv = new OffscreenCanvas(120, 120);
    const ctx = cv.getContext('2d');
    ctx.fillStyle = fill; ctx.fillRect(0, 0, 120, 120);
    return new Uint8Array(await (await cv.convertToBlob({ type: 'image/png' })).arrayBuffer());
  }

  const zipBytes = buildZip([
    { name: 'this-is-definitely-a-sunset.png', data: await png('#ff8844') },
    { name: 'this-is-definitely-a-forest.png', data: await png('#2f7a3c') },
  ]);

  const dt = new DataTransfer();
  dt.items.add(new File([zipBytes], 'mystery-pack.zip', { type: 'application/zip' }));
  window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));

  for (let i = 0; i < 80; i++) {
    await new Promise((r) => setTimeout(r, 100));
    if (/Mystery picture/.test(document.getElementById('barSubtitle').textContent)) return 'added';
  }
  return document.getElementById('barSubtitle').textContent;
});
check('dropping a .zip imports its pictures blind', zipResult === 'added', zipResult);

const mysteryRows = await page.evaluate(async () => {
  document.querySelector('[data-act="pictures"]').click();
  await new Promise((r) => setTimeout(r, 250));
  const rows = [...document.querySelectorAll('#panelBody .row')]
    .filter((r) => r.querySelector('.label')?.textContent === 'Mystery picture');
  const swatchCounts = rows.map((r) => r.querySelectorAll('.swatches i').length);
  document.querySelector('[data-act="panel-close"]')?.click();
  return { count: rows.length, swatchCounts };
});
check('both mystery pictures are listed with hidden titles and no colour swatches',
  mysteryRows.count >= 2 && mysteryRows.swatchCounts.every((n) => n === 0),
  JSON.stringify(mysteryRows));

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

/* --------------------------------------------------- finishing a picture */
// Last of all, since it permanently marks Harbour Row done: fast-forward its
// save to one cell short, reload to pick that up, then paint the last cell
// for real, so finish() runs its actual code path rather than a shortcut.

{
  const cells = puzzle.cells;
  let biggest = 0;
  for (let i = 1; i < cells.length; i++) if (cells[i].a > cells[biggest].a) biggest = i;
  const leftover = cells[biggest];
  const almostDone = cells.map((_, i) => i).filter((i) => i !== biggest);

  await page.evaluate(async ({ base, id, filled }) => {
    const { createPlatform } = await import(new URL('platform.js', base).href);
    const api = await createPlatform();
    await api.writeSave({
      progress: { [id]: { filled, done: false, seconds: 300 } },
      // Paste/drop/zip above each switch to whatever they just added, so
      // without this the reload below would reopen one of those instead —
      // lastPuzzle is what boot() actually uses to decide.
      settings: { lastPuzzle: id },
    });
  }, { base: origin, id: puzzle.id, filled: almostDone });

  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(
    (title) => document.getElementById('barSubtitle').textContent.startsWith(title),
    busiest.title,
    { timeout: 10000, polling: 100 },
  );
  const pickedUp = await page.evaluate(() => document.getElementById('barSubtitle').textContent);
  check('the fast-forwarded save picks up right where it was left',
    pickedUp === `${busiest.title} · ${cells.length - 1}/${cells.length}`, pickedUp);

  const { ox: fOx, oy: fOy, scale: fScale } = await boardTransform();
  await page.touchscreen.tap(fOx + leftover.x * fScale, fOy + leftover.y * fScale);

  // The leftover cell is the single biggest in the picture, chosen for a
  // reliably tappable target — but that also gives its burst the longest
  // flood-fill of any cell, so wait for the actual state change rather than
  // guessing a fixed delay. The moment it lands is what matters here: the
  // finish card must not have covered the picture yet, only the much longer
  // pause after it should do that.
  const finished = await page.waitForFunction(
    (title) => document.getElementById('barSubtitle').textContent === title,
    busiest.title,
    { timeout: 8000, polling: 100 },
  ).then(() => true).catch(() => false);
  const rightAfter = await page.evaluate(() => ({
    subtitle: document.getElementById('barSubtitle').textContent,
    finishHidden: document.getElementById('finish').classList.contains('hidden'),
    comparePillHidden: document.getElementById('comparePill')?.classList.contains('hidden'),
  }));
  check('finishing the last cell is recognised', finished, rightAfter.subtitle);
  check('the finish card waits before covering the finished picture',
    rightAfter.finishHidden, JSON.stringify(rightAfter));
  check('the compare-to-photo pill appears as soon as the picture is finished',
    rightAfter.comparePillHidden === false, JSON.stringify(rightAfter));

  // Two animations are still running right at this point, and sampling
  // through either would compare their motion, not the toggle: the burst's
  // own screen-shake nudges the *whole* base layer by a random offset every
  // frame until it stops at DURATION (1180ms), and the outline/number fade
  // (S.revealFrom, 850ms) keeps tinting boundary pixels as it eases out.
  // Both start at essentially the same moment finish() does. A fixed wait
  // here assumes the animation loop runs at roughly real-time, which a
  // cold/no-GPU-cache renderer (every CI run, by construction) does not
  // guarantee — poll for the actual state game.js's own frame() loop clears
  // when each animation finishes, instead.
  await page.waitForFunction(() => {
    const { state } = window.__paintblobTest;
    return state.bursts.length === 0 && state.revealFrom === 0;
  }, { timeout: 10000, polling: 100 });

  // The pill must actually swap what is on the canvas, not just its own
  // label. A single sampled pixel is not reliable — quantisation deliberately
  // picks a flat cell colour close to the photo underneath it, so a lone
  // point can coincidentally land somewhere the two nearly agree. A grid
  // spread across the picture is robust to that: some of sixteen points
  // landing near a cell edge or a gradient is as good as guaranteed. The
  // square puzzle is letterboxed in this taller viewport, so the grid is
  // built in picture space and mapped to canvas pixels the same way the
  // renderer's own fit-to-window transform does — a naive fraction of the
  // canvas's own width/height would land outside the picture entirely for
  // some of these points, sampling empty margin instead.
  const sample = () => page.evaluate(({ pw, ph }) => {
    const canvas = document.getElementById('board');
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const scale = Math.min(rect.width / pw, rect.height / ph);
    const offX = (rect.width - pw * scale) / 2;
    const offY = (rect.height - ph * scale) / 2;
    const out = [];
    for (let gy = 1; gy <= 4; gy++) {
      for (let gx = 1; gx <= 4; gx++) {
        const d = ctx.getImageData(
          Math.floor((offX + ((pw * gx) / 5) * scale) * dpr),
          Math.floor((offY + ((ph * gy) / 5) * scale) * dpr),
          1, 1,
        ).data;
        out.push(d[0], d[1], d[2]);
      }
    }
    return out;
  }, { pw: puzzle.width, ph: puzzle.height });
  const totalDiff = (a, b) => a.reduce((sum, v, i) => sum + Math.abs(v - b[i]), 0);

  const painting1 = await sample();
  await page.click('#comparePill');
  await page.waitForTimeout(150);
  const photo = await sample();
  await page.click('#comparePill');
  await page.waitForTimeout(150);
  const painting2 = await sample();

  // Threshold well below what Harbour Row actually measures (113, and exactly
  // repeatable — rendering is fully deterministic once the animations above
  // have settled) but well above what identical, unswapped pixels would give
  // (0): most sample points sit in the sky and water, which is exactly the
  // kind of large flat area quantisation approximates most closely, so the
  // real margin between "swapped" and "not" is much smaller here than it
  // would be over a busier picture.
  check('the compare pill swaps the canvas to the real photo',
    totalDiff(painting1, photo) > 40, `total diff across 16 sample points: ${totalDiff(painting1, photo)}`);
  check('toggling back returns to the painted picture',
    totalDiff(painting1, painting2) < 10, `first ${painting1}, after round-trip ${painting2}`);

  const modalAppeared = await page.waitForFunction(
    () => !document.getElementById('finish').classList.contains('hidden'),
    null, { timeout: 4000, polling: 100 },
  ).then(() => true).catch(() => false);
  check('the finish card appears once the pause is over', modalAppeared);

  await page.click('.finish-close');
  const closedByX = await page.evaluate(() => document.getElementById('finish').classList.contains('hidden'));
  check("the finish card's close button dismisses it without leaving the picture", closedByX);

  await page.screenshot({ path: path.join(OUT, 'finished-compare.png') });
}

await browser.close();
server.close();

console.log(`\nscreenshots in ${path.relative(ROOT, OUT)}`);
if (problems.length) {
  console.error(`\n${problems.length} problem(s):`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log('all checks passed');
