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
import { isStoryPuzzle } from '../src/story.js';

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

// ?notour keeps the first-run squirrel tour from covering the screen while we
// drive it — it survives the offline reload below, and a real phone never
// carries the flag.
await page.goto(`${origin}?notour`);
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
// Story stones are hidden from the gallery for the same reason (they live on
// the board until finished), so they are excluded on the same grounds.
const manifest = JSON.parse(fs.readFileSync(path.join(WEB, 'puzzles', 'manifest.json'), 'utf8'));
const busiest = [...manifest]
  .filter((p) => !p.blind && !isStoryPuzzle(p.id))
  .sort((a, b) => b.colours - a.colours)[0];
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

/* --------------------------------------------------------------------- undo */

// Everything a fill granted has to come back off together. Reading it from
// the DOM rather than from internals is the point — these four are what the
// player actually sees change.
const snapshot = () => page.evaluate(() => ({
  progress: document.getElementById('barSubtitle').textContent,
  points: document.getElementById('pointsValue').textContent,
  tubs: [...document.querySelectorAll('#tubs .count')].map((n) => n.textContent).join(','),
  undoOffered: !document.getElementById('undoPill').classList.contains('hidden'),
}));

const painted = await snapshot();
check('undo is offered once something has been painted', painted.undoOffered);

await page.click('#undoPill');
await page.waitForTimeout(200);
const undone = await snapshot();
check('undo puts the cell back', /· 0\//.test(undone.progress), undone.progress);
check('undo hands back the point it granted',
  Number(undone.points) === Number(painted.points) - 1,
  `${painted.points} -> ${undone.points}`);
check('undo refills the tub it emptied', undone.tubs !== painted.tubs,
  `${painted.tubs} -> ${undone.tubs}`);
check('undo stops being offered with nothing left to take back', !undone.undoOffered);

// Ctrl+Z is the same path, and has to survive there being no history left.
await page.keyboard.press('Control+z');
await page.waitForTimeout(150);
check('undo with an empty history is a no-op, not a crash',
  (await snapshot()).progress === undone.progress);

// Put the cell back so everything downstream sees the state it expects.
{
  const t = await boardTransform();
  await page.touchscreen.tap(t.ox + target.x * t.scale, t.oy + target.y * t.scale);
  await page.waitForFunction(
    () => /· [1-9]\d*\//.test(document.getElementById('barSubtitle').textContent),
    null, { timeout: 10000, polling: 100 },
  );
  await page.waitForTimeout(700);
  const again = await snapshot();
  check('repainting after an undo restores exactly what was there',
    again.progress === painted.progress && again.tubs === painted.tubs
      && again.points === painted.points,
    `${again.progress} · ${again.points}🪙`);
}

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

// Achievement toasts wait for a click, and they are the one part of #toasts
// that takes pointer events. Which ones exist right now depends on the wall
// clock — "Night Shift" fires on any fill between 2am and 5am and "Early
// Bird" between 5am and 7am, and CI runs on UTC — and the third toast makes
// the stack tall enough to cover this check's tap point. The tap then lands
// on the toast and dismisses it (exactly as designed) instead of reaching
// the board, which is how this check failed only during those hours.
// Dismiss them the way a player would, so the tap being judged is the one
// this check is actually about.
await page.evaluate(async () => {
  for (const t of document.querySelectorAll('.toast.sticky')) t.click();
  await new Promise((r) => setTimeout(r, 400)); // out-animation is 300ms
});

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

/* ------------------------------------------------ the avatar circle and fan */
// The circle replaced a column of up to eight ability buttons that used to
// stand on the picture. What matters: it is off the canvas at rest, it
// outsizes a tub so it does not read as a stray colour, and the abilities go
// back over the artwork only while they are open — without being clipped.

const dock = await page.evaluate(() => {
  const pill = document.getElementById('avatarPill').getBoundingClientRect();
  const tub = document.querySelector('#tubs .tub').getBoundingClientRect();
  const board = document.getElementById('board').getBoundingClientRect();
  return {
    pill: pill.width,
    tub: tub.width,
    clearsBoard: pill.top >= board.bottom,
    fanHidden: document.getElementById('abilityRow').classList.contains('hidden'),
    expanded: document.getElementById('avatarPill').getAttribute('aria-expanded'),
  };
});
check('the avatar circle sits below the picture, not on it', dock.clearsBoard);
check('the avatar circle outsizes a paint tub', dock.pill > dock.tub,
  `${Math.round(dock.pill)}px vs ${Math.round(dock.tub)}px`);
check('the abilities stay collapsed until asked for',
  dock.fanHidden && dock.expanded === 'false');

const fanFlow = await page.evaluate(async () => {
  const pill = document.getElementById('avatarPill');
  const fan = document.getElementById('abilityRow');
  const wait = () => new Promise((r) => setTimeout(r, 80));

  pill.click();
  await wait();
  const app = () => document.getElementById('app').getBoundingClientRect();
  const fits = () => {
    const f = fan.getBoundingClientRect();
    const a = app();
    return f.top >= a.top && f.left >= a.left && f.right <= a.right;
  };
  const f = fan.getBoundingClientRect();
  const opened = !fan.classList.contains('hidden') && f.height > 0;
  // Upward, off the circle — the structural property, true whatever the
  // player's level. How far it reaches over the picture depends on how many
  // abilities are unlocked, so that is not something to assert here.
  const fansUp = f.bottom <= pill.getBoundingClientRect().top;
  const unlocked = fan.querySelectorAll('[data-ability]').length;

  // The worst case a real player reaches is all eight abilities, which this
  // save is nowhere near. #app is overflow:hidden, so a pop-up taller than
  // the stage is guillotined rather than pushed back into view — stand in the
  // missing buttons and check the tall version fits before shipping it.
  const spare = [];
  for (let i = unlocked; i < 8; i += 1) {
    const b = document.createElement('button');
    b.className = 'ability-btn';
    b.textContent = '✦';
    fan.append(b);
    spare.push(b);
  }
  const fullFits = fits();
  const fullHeight = fan.getBoundingClientRect().height;
  spare.forEach((b) => b.remove());
  const unclipped = fits() && fullFits;

  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await wait();
  const escClosed = fan.classList.contains('hidden');

  pill.click();
  await wait();
  document.getElementById('board').dispatchEvent(
    new PointerEvent('pointerdown', { bubbles: true }));
  await wait();
  const outsideClosed = fan.classList.contains('hidden');

  pill.click();
  await wait();
  pill.click();
  await new Promise((r) => setTimeout(r, 300));
  const panel = document.getElementById('panelTitle').textContent;
  const panelOpen = !document.getElementById('panel').classList.contains('hidden');
  document.querySelector('[data-act="panel-close"]')?.click();
  await wait();

  return {
    opened, unclipped, fansUp, unlocked, fullHeight,
    escClosed, outsideClosed, panelOpen, panel,
  };
});
check('the circle opens the abilities upward, off itself',
  fanFlow.opened && fanFlow.fansUp, `${fanFlow.unlocked} unlocked`);
check('the abilities fit the window even with all eight unlocked',
  fanFlow.unclipped, `${Math.round(fanFlow.fullHeight)}px tall`);
check('Escape collapses the abilities', fanFlow.escClosed);
check('a tap elsewhere collapses the abilities', fanFlow.outsideClosed);
check('a second click on the face opens the avatar panel',
  fanFlow.panelOpen, fanFlow.panel);
await page.screenshot({ path: path.join(OUT, 'avatar-dock.png') });

/* -------------------------------------------------------------- landscape */

await page.setViewportSize({ width: 851, height: 393 });
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(OUT, 'landscape.png') });
check('landscape lays out without overflow',
  await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));

// Landscape is the tight one: the stage is a couple of hundred pixels tall, so
// the four-row portrait pop-up would be taller than the picture it floats over
// and #app would guillotine it.
const fanLandscape = await page.evaluate(async () => {
  const pill = document.getElementById('avatarPill');
  const fan = document.getElementById('abilityRow');
  const spare = [];
  for (let i = fan.querySelectorAll('[data-ability]').length; i < 8; i += 1) {
    const b = document.createElement('button');
    b.className = 'ability-btn';
    b.textContent = '✦';
    fan.append(b);
    spare.push(b);
  }
  pill.click();
  await new Promise((r) => setTimeout(r, 100));
  const f = fan.getBoundingClientRect();
  const a = document.getElementById('app').getBoundingClientRect();
  const out = {
    fits: f.top >= a.top && f.left >= a.left && f.right <= a.right,
    size: [Math.round(f.width), Math.round(f.height)],
  };
  spare.forEach((b) => b.remove());
  pill.click();
  document.querySelector('[data-act="panel-close"]')?.click();
  await new Promise((r) => setTimeout(r, 100));
  return out;
});
check('the abilities fit a landscape window with all eight unlocked',
  fanLandscape.fits, `${fanLandscape.size[0]}x${fanLandscape.size[1]}px`);

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

/* --------------------------------------------------------- filtering the list */

const filter = await page.evaluate(async () => {
  const wait = () => new Promise((r) => setTimeout(r, 150));
  document.querySelector('[data-act="pictures"]').click();
  await wait();
  const list = document.querySelector('#panelBody .pic-list');
  const vis = () => [...list.querySelectorAll(':scope > .row')].filter((r) => !r.classList.contains('hidden'));
  const labels = () => vis().map((r) => r.querySelector('.label').textContent);
  // Several groups repeat "All", so target by axis, not by button text.
  const chip = (axis, text) => [...document.querySelectorAll(`.pic-chips [data-axis="${axis}"] button`)]
    .find((b) => b.textContent === text);
  const out = { total: vis().length };

  // Search narrows to the matching visible titles and hides everything else,
  // mystery rows included (their label is "Mystery picture", never a real name).
  const input = document.querySelector('.pic-search input');
  input.value = 'harbour';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await wait();
  out.searchLabels = labels();

  // Clearing puts everything back.
  document.querySelector('.pic-search-clear').click();
  await wait();
  out.afterClear = vis().length;

  // A status nobody has reached yet empties the list and shows the empty note.
  chip('status', 'Done')?.click();
  await wait();
  out.doneCount = vis().length;
  out.emptyShown = !document.querySelector('.pic-empty').classList.contains('hidden');
  chip('status', 'All')?.click();
  await wait();

  // The zip drop earlier added imported pictures, so Source chips exist.
  out.hasSourceChips = !!chip('source', 'Yours');
  chip('source', 'Yours')?.click();
  await wait();
  out.yoursAllImported = vis().every((r) => r._pic.imported) && vis().length > 0;
  chip('source', 'Built-in')?.click();
  await wait();
  out.builtinNoneImported = vis().every((r) => !r._pic.imported);
  chip('source', 'All')?.click();
  await wait();

  // Recent floats your imports to the top.
  chip('sort', 'Recent')?.click();
  await wait();
  out.recentTopImported = vis()[0]?._pic.imported === true;

  document.querySelector('[data-act="panel-close"]')?.click();
  return out;
});
check('search narrows the list to matching titles and hides the rest',
  filter.searchLabels.length > 0
  && filter.searchLabels.every((l) => /harbour/i.test(l))
  && filter.searchLabels.length < filter.total,
  JSON.stringify(filter.searchLabels));
check('clearing the search restores every row', filter.afterClear === filter.total,
  `${filter.afterClear} of ${filter.total}`);
check('a status with no pictures shows the empty note',
  filter.doneCount === 0 && filter.emptyShown);
check('Yours shows only imported pictures, Built-in only bundled',
  filter.hasSourceChips && filter.yoursAllImported && filter.builtinNoneImported);
check('Recent floats your imports to the top', filter.recentTopImported);

/* ------------------------------------------------- unpainted thumbnails */

const thumbs = await page.evaluate(async () => {
  document.querySelector('[data-act="pictures"]').click();
  // Thumbnails load lazily as rows come into view, so give the observer and
  // the puzzle fetches a moment.
  await new Promise((r) => setTimeout(r, 1500));
  const rows = [...document.querySelectorAll('#panelBody .row')];
  return rows.map((r) => {
    const t = r.querySelector('.pic-thumb');
    return {
      mystery: r.querySelector('.label')?.textContent === 'Mystery picture',
      blind: !!t?.classList.contains('blind'),
      drawn: !!t?.querySelector('svg path[d]'),
    };
  }).filter((r) => r.blind || r.drawn || r.mystery);
});
check('every ordinary picture shows its unpainted outline',
  thumbs.some((t) => t.drawn) && thumbs.every((t) => (t.mystery ? !t.drawn : t.drawn)),
  JSON.stringify(thumbs.map((t) => (t.mystery ? 'mystery' : 'drawn'))));
check('a mystery picture gives nothing away in its thumbnail',
  thumbs.filter((t) => t.mystery).every((t) => t.blind && !t.drawn));

// Press and hold opens the big look — and letting go must not then load the
// picture you were only looking at.
const held = await page.evaluate(async () => {
  const thumb = [...document.querySelectorAll('.pic-thumb')].find((t) => t.querySelector('svg'));
  const box = thumb.getBoundingClientRect();
  const at = { clientX: box.x + box.width / 2, clientY: box.y + box.height / 2 };
  thumb.dispatchEvent(new PointerEvent('pointerdown', { ...at, pointerType: 'touch', bubbles: true }));
  await new Promise((r) => setTimeout(r, 900));
  const opened = !document.getElementById('picPreview').classList.contains('hidden');
  const drawn = !!document.querySelector('#picPreview .sheet svg path[d]');
  const titled = document.querySelector('#picPreview .cap')?.textContent ?? '';
  thumb.dispatchEvent(new PointerEvent('pointerup', { ...at, pointerType: 'touch', bubbles: true }));
  thumb.closest('.row').click();
  await new Promise((r) => setTimeout(r, 250));
  return {
    opened, drawn, titled,
    stillOnPanel: !document.getElementById('panel').classList.contains('hidden'),
    closedAfter: document.getElementById('picPreview').classList.contains('hidden'),
  };
});
check('holding a thumbnail opens the large unpainted preview',
  held.opened && held.drawn && held.titled.length > 0, JSON.stringify(held));
check('letting go of a hold does not load the picture you were looking at',
  held.stillOnPanel && held.closedAfter, JSON.stringify(held));

await page.evaluate(() => document.querySelector('[data-act="panel-close"]')?.click());

// Banding is applied in JS, so the thing worth checking is the property CSS
// alone could not guarantee: that the stripes actually alternate once the
// headings and controls each panel interleaves with its rows are in the DOM.
const banding = await page.evaluate(async () => {
  const out = {};
  for (const panel of ['pictures', 'trophies', 'avatar', 'settings']) {
    // The avatar has no button of its own in the title bar: it is the circle
    // down in the tray, and reaching its panel now takes two clicks — one to
    // open the abilities, one on the face itself.
    if (panel === 'avatar') {
      document.getElementById('avatarPill').click();
      await new Promise((r) => setTimeout(r, 60));
      document.getElementById('avatarPill').click();
    } else {
      document.querySelector(`[data-act="${panel}"]`).click();
    }
    await new Promise((r) => setTimeout(r, 250));
    // Group by parent: the avatar panel nests its rows in .avatar-section
    // rather than directly under #panelBody, and each container bands alone.
    const groups = new Map();
    for (const el of document.querySelectorAll('#panelBody .row')) {
      if (!groups.has(el.parentElement)) groups.set(el.parentElement, []);
      groups.get(el.parentElement).push(el);
    }
    out[panel] = [...groups.values()].map((rows) => {
      // Two rows sit outside the stripe by design: .earned carries its own
      // amber tint, and whichever row the mouse happens to be parked over
      // from an earlier check is showing its hover tint.
      const tints = rows.map((r) => (r.classList.contains('earned') || r.matches(':hover')
        ? null : getComputedStyle(r).backgroundColor));
      const alternates = tints.every((t, i) => {
        if (t === null || i === 0 || tints[i - 1] === null) return true;
        return t !== tints[i - 1];
      });
      const distinct = new Set(tints.filter(Boolean)).size;
      return { rows: rows.length, distinct, alternates };
    });
    document.querySelector('[data-act="panel-close"]')?.click();
    await new Promise((r) => setTimeout(r, 60));
  }
  return out;
});
const bandGroups = Object.values(banding).flat().filter((g) => g.rows > 1);
check('every panel list is banded in alternating stripes',
  bandGroups.length >= 4
    && bandGroups.every((g) => g.alternates && g.distinct === 2),
  JSON.stringify(banding));

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

  // --- the living element ------------------------------------------------
  // Harbour Row is untagged, so drive the effect by hand rather than tagging
  // a picture just for the harness. What matters is the property everything
  // above depends on: the effect draws on the live layer only, so once its
  // window closes the photo must be pixel-identical to before it started —
  // and the window must actually close itself, or frame() stays pinned at
  // 60fps forever the way numberOverride once did.
  await page.click('#comparePill');
  await page.waitForTimeout(150);
  // Every pixel, not the 16-point grid the toggle uses: those points sit in
  // flat sky and water on purpose, and a few pixels of sideways ripple
  // through a flat region is invisible to them by construction.
  const living = await page.evaluate(() => {
    const { board } = window.__paintblobTest;
    const ctx = board.canvas.getContext('2d');
    const grab = () => ctx.getImageData(0, 0, board.canvas.width, board.canvas.height).data;
    const diff = (a, b) => {
      let n = 0;
      for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++;
      return n;
    };
    // The four biggest cells, so the effect covers a decent share of the
    // canvas and the numbers below mean something.
    const ids = [...board.cells].sort((a, b) => b.area - a.area).slice(0, 4).map((c) => c.id);
    const now = performance.now();

    board.living = null;
    board.draw([], now);
    const before = grab();

    board.startLiving({ effect: 'ripple', cells: ids, amplitude: 3 }, now);
    board.draw([], now + 1500);
    const mid = grab();

    // Ripple is the expensive one — a blit per band, over the four biggest
    // cells in the picture, which is about as bad as a real tag ever gets.
    const t0 = performance.now();
    for (let i = 0; i < 30; i++) board.draw([], now + 500 + i * 16);
    const perFrame = (performance.now() - t0) / 30;

    board.draw([], board.living.end + 1);
    const after = grab();

    return {
      moved: diff(before, mid), residue: diff(before, after), closed: !board.living, perFrame,
    };
  });

  check('the living element moves the photo while its window is open',
    living.moved > 0, `${living.moved} channels changed`);
  check('the animation window closes itself', living.closed);
  check('the living element fits a 60fps budget',
    living.perFrame < 16, `${living.perFrame.toFixed(1)}ms per frame`);
  check('the photo is untouched once the animation has finished',
    living.residue === 0, `${living.residue} channels left changed`);

  await page.click('#comparePill');
  await page.waitForTimeout(150);

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

/* ----------------------------------------------------- the raised element */

// Last, because it switches pictures. Koi Pond's subject is its three koi —
// bodies and fins, which is what its lift tag holds; the pond around them is
// not part of the fish and is not raised with them.
{
  const sample = () => page.evaluate(() => {
    const c = document.getElementById('board');
    const g = c.getContext('2d');
    const b = window.__paintblobTest.board;
    // A strip through the middle of the FIRST lifted cell, not of the whole
    // union: a subject of several parts — three koi — has a union box that is
    // mostly the water between them, and a strip through its centre misses
    // every fish. One cell is guaranteed to be solid subject. Both axes go
    // through the same picture-units-to-device conversion.
    const cell = b.cells[(b.liftCells ?? [])[0]];
    const { box } = b.unionOf([(b.liftCells ?? [])[0]]);
    const k = b.scale * b.dpr;
    const y = Math.round((b.offsetY * b.dpr) + cell.anchor.y * k);
    const x0 = Math.round((b.offsetX * b.dpr) + box.x0 * k) - 12;
    const w = Math.round((box.x1 - box.x0) * k) + 24;
    return [...g.getImageData(Math.max(0, x0), y, Math.max(1, w), 1).data];
  });
  const differing = (a, b) => a.reduce((n, v, i) => n + (v === b[i] ? 0 : 1), 0);

  await page.evaluate(async () => {
    document.querySelector('[data-act="pictures"]').click();
    await new Promise((r) => setTimeout(r, 400));
    const row = [...document.querySelectorAll('#panelBody .row')]
      .find((r) => r.querySelector('.label')?.textContent === 'Koi Pond');
    row.click();
  });
  await page.waitForFunction(() => /Koi Pond/.test(document.getElementById('barSubtitle').textContent),
    null, { timeout: 10000, polling: 100 });
  await page.waitForTimeout(500);

  // Against the tag rather than a literal, so re-tagging the picture updates
  // the expectation instead of failing the check. What matters here is that
  // the board raised exactly what the sidecar asked for.
  const want = JSON.parse(fs.readFileSync(path.join(WEB, 'puzzles', 'koi-pond.json'), 'utf8')).lift;
  const tagged = await page.evaluate(() => window.__paintblobTest.board.liftCells ?? []);
  check('the tagged subject is raised off the picture',
    want?.length > 0 && JSON.stringify(tagged) === JSON.stringify(want),
    `${tagged.length} of ${want?.length ?? 0} cells`);

  const box = await page.evaluate(() => {
    const b = document.getElementById('board').getBoundingClientRect();
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  });
  const look = async (fx) => {
    await page.mouse.move(box.x + box.w * fx, box.y + box.h * 0.5);
    await page.waitForTimeout(600); // the parallax eases rather than snapping
    return sample();
  };
  const fromLeft = await look(0.05);
  const fromRight = await look(0.95);
  check('the raised element shifts as the pointer moves across the picture',
    differing(fromLeft, fromRight) > 40, `${differing(fromLeft, fromRight)} channels moved`);

  // And must not follow the picture into photo view: that is the living
  // element's own stage, and a parallax on a photograph is just a wobble.
  await page.evaluate(() => document.getElementById('comparePill').click());
  await page.waitForFunction(() => window.__paintblobTest.board.living === null,
    null, { timeout: 15000, polling: 120 });
  await page.waitForTimeout(300);
  const photoLeft = await look(0.05);
  const photoRight = await look(0.95);
  check('the raise does not follow the picture into photo view',
    differing(photoLeft, photoRight) === 0,
    `${differing(photoLeft, photoRight)} channels moved in photo view`);
  await page.screenshot({ path: path.join(OUT, 'raised-element.png') });
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
