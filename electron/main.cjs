'use strict';

// CommonJS on purpose. The renderer is ESM (via <script type="module">), but
// keeping the main and preload scripts CJS avoids Electron's ESM/sandbox
// caveats entirely — one less thing to break on a version bump.

const { app, BrowserWindow, dialog, ipcMain, screen, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const DEV = process.argv.includes('--dev');
const MIN_SIZE = 380;

// `electron . --smoke [out.png]` boots the window, fires a handful of clicks at
// the picture, screenshots itself and exits non-zero on any renderer error.
// The headless preview harness covers the effect in far more detail, but only
// this proves the real Electron window loads, composites and paints — which is
// exactly what breaks on an Electron upgrade.
const SMOKE = process.argv.includes('--smoke');

// Windows never opens an OS file dialog, in any form. Opening one loads every
// installed shell extension — cloud-drive overlays, antivirus hooks, archive
// tools — into this process and enumerates the start folder, before the user
// clicks anything; any of those can kill an unsigned process on the spot. It
// crashed identically parented, parentless, and via Chromium's own chooser,
// while the same imports through drag-and-drop and paste never crashed once.
// That code is not ours and not patchable from JS, so on Windows it simply
// never runs: the Add button guides to the dialog-free routes instead (see
// showAddGuide in game.js). PAINTBLOB_NO_DIALOG forces this path on other
// platforms so it can actually be tested end to end.
const DIALOG_FREE = process.platform === 'win32' || !!process.env.PAINTBLOB_NO_DIALOG;

function smokeOutputPath() {
  const next = process.argv[process.argv.indexOf('--smoke') + 1];
  if (next && !next.startsWith('--')) return path.resolve(next);
  // In a packaged build everything under resources/ is a read-only asar, so
  // the repo-relative default is not writable. Only userData and temp are.
  return app.isPackaged
    ? path.join(app.getPath('temp'), 'paintblob-smoke.png')
    : path.join(__dirname, '..', 'puzzles', '_raw', 'smoke.png');
}

let win = null;
let savePath = null;

/* ------------------------------------------------------------------ storage */

const DEFAULT_SAVE = {
  version: 1,
  progress: {},      // puzzleId -> { filled: number[], done: bool, seconds }
  stats: { blobs: 0, cells: 0, puzzles: 0, colourSwitches: 0, seconds: 0, undos: 0, bestStreak: 0, wrongTaps: 0, dayStreak: 0, bestDayStreak: 0 },
  unlocked: [],      // achievement ids
  settings: { sound: true, volume: 0.7, alwaysOnTop: true, scale: 1, opacity: 0.7, theme: 'void' },
  bounds: null,
  avatar: {
    customize: {
      race: 'human', gender: 'nb', height: 1, weight: 1, style: 'inked',
      hair: { style: 'short', colour: '#3b2a1a' },
      eyes: { style: 'round', colour: '#4a7a8c' },
      face: { shape: 'oval' },
      skin: { colour: '#e0b088' },
      shirt: { itemId: 'shirt-basic', colour: '#c9c9c9' },
      bottoms: { itemId: 'bottoms-basic', colour: '#3a3a3a' },
      dress: { itemId: null, colour: '#c9c9c9' },
      socks: { itemId: 'socks-basic', colour: '#ffffff' },
      shoes: { itemId: 'shoes-basic', colour: '#2a2a2a' },
    },
    unlocked: ['shirt-basic', 'bottoms-basic', 'socks-basic', 'shoes-basic'],
    abilities: {},
    // Shape only — boot() fills this from house.js's defaultHouse(), which is
    // the single source of truth for which room, props, lighting and pet a new
    // player starts with.
    house: null,
  },
};

function readSave() {
  try {
    const raw = JSON.parse(fs.readFileSync(savePath, 'utf8'));
    return {
      ...DEFAULT_SAVE,
      ...raw,
      stats: { ...DEFAULT_SAVE.stats, ...(raw.stats || {}) },
      settings: { ...DEFAULT_SAVE.settings, ...(raw.settings || {}) },
    };
  } catch {
    return structuredClone(DEFAULT_SAVE);
  }
}

// Write to a sibling temp file and rename. A half-written save file would
// throw away every achievement the player has earned.
function writeSave(data) {
  const tmp = `${savePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, savePath);
}

/* ------------------------------------------------------------------ crashes */

// An Electron app that dies takes its console with it, so a user can only
// report "it shut down". This leaves a line behind in the same directory as
// the save file, which is the difference between a diagnosis and a guess.
function logCrash(kind, detail) {
  try {
    fs.appendFileSync(
      path.join(app.getPath('userData'), 'crash.log'),
      `${new Date().toISOString()}  ${kind}: ${detail}\n`,
    );
  } catch {
    // If even appending a line fails there is nothing useful left to try.
  }
}

// Logged and survived rather than logged and exited: almost everything that
// reaches here is a broken IPC call, and losing an in-progress picture over
// it would be worse than carrying on.
process.on('uncaughtException', (err) => logCrash('uncaughtException', err?.stack ?? err));
process.on('unhandledRejection', (err) => logCrash('unhandledRejection', err?.stack ?? err));
app.on('render-process-gone', (_e, _wc, details) => logCrash('renderer-gone', JSON.stringify(details)));
app.on('child-process-gone', (_e, details) => logCrash('child-process-gone', JSON.stringify(details)));

/* ------------------------------------------------------------------- window */

function clampToDisplay(bounds) {
  if (!bounds) return null;
  const area = screen.getDisplayMatching(bounds).workArea;
  const width = Math.min(bounds.width, area.width);
  const height = Math.min(bounds.height, area.height);
  return {
    width,
    height,
    x: Math.min(Math.max(bounds.x, area.x), area.x + area.width - width),
    y: Math.min(Math.max(bounds.y, area.y), area.y + area.height - height),
  };
}

function createWindow() {
  const save = readSave();
  const restored = clampToDisplay(save.bounds);

  // Glass everywhere again. 0.5.4 went opaque on Windows blaming transparency
  // for the file-dialog crash, but the crash tracked the dialog through every
  // variant while identical imports through this same window via drag/paste
  // never died — the dialog machinery itself was the poisoned piece. Windows
  // no longer opens one at all (see DIALOG_FREE), so there is nothing left
  // for the transparency to collide with. PAINTBLOB_OPAQUE stays as an
  // escape hatch if a specific machine misbehaves.
  const transparent = !process.env.PAINTBLOB_OPAQUE;

  win = new BrowserWindow({
    width: restored?.width ?? 720,
    height: restored?.height ?? 820,
    x: restored?.x,
    y: restored?.y,
    minWidth: MIN_SIZE,
    minHeight: MIN_SIZE,
    frame: false,
    transparent,
    // Opaque builds get a real OS shadow; transparent ones draw their own so
    // the shadow does not clip the rounded corners.
    hasShadow: !transparent,
    backgroundColor: transparent ? '#00000000' : '#17151f',
    alwaysOnTop: save.settings.alwaysOnTop !== false,
    resizable: true,
    maximizable: false,
    fullscreenable: false,
    title: 'paintblob',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false, // keep animating while it sits behind things
    },
  });

  // Tell the renderer whether it is on glass or a solid panel, so the corners
  // can be squared off when there is nothing to see through them.
  win.webContents.on('did-finish-load', () => {
    win.webContents.executeJavaScript(
      `document.documentElement.classList.toggle('opaque-window', ${!transparent})`,
    ).catch(() => {});
  });

  // Float above full-screen apps too, without stealing focus.
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setAlwaysOnTop(save.settings.alwaysOnTop !== false, 'floating');

  // Under --smoke the script below drives the UI, so keep the first-run squirrel
  // tour from covering it; a normal launch gets the tour as intended.
  win.loadFile(path.join(__dirname, '..', 'src', 'index.html'),
    SMOKE ? { search: 'notour' } : undefined);
  if (DEV) win.webContents.openDevTools({ mode: 'detach' });

  // Anything trying to navigate away or spawn a window goes to the real
  // browser instead. Nothing in this app should ever need either.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event) => event.preventDefault());

  const persistBounds = () => {
    if (!win || win.isDestroyed() || win.isMinimized()) return;
    const data = readSave();
    data.bounds = win.getBounds();
    writeSave(data);
  };

  if (SMOKE) runSmokeTest(win);

  let boundsTimer = null;
  const scheduleBounds = () => {
    clearTimeout(boundsTimer);
    boundsTimer = setTimeout(persistBounds, 400);
  };
  win.on('resize', scheduleBounds);
  win.on('move', scheduleBounds);
  win.on('closed', () => {
    win = null;
  });
}

/* -------------------------------------------------------------------- smoke */

async function runSmokeTest(target) {
  const errors = [];
  // A file chooser may only open from a real user gesture, and this test
  // clicks programmatically, so Chromium refuses and says so. Expected here;
  // what is being checked is that the attempt does not kill the process.
  const EXPECTED = [/File chooser dialog can only be shown with a user activation/];
  target.webContents.on('console-message', (_e, level, message) => {
    if (level >= 2 && !EXPECTED.some((re) => re.test(message))) errors.push(message);
  });
  target.webContents.on('render-process-gone', (_e, details) => {
    errors.push(`renderer gone: ${details.reason}`);
  });

  try {
    await new Promise((resolve) => target.webContents.once('did-finish-load', resolve));
    // A fixed sleep here used to race a slow boot on a loaded CI runner —
    // worst on a 500-cell picture, whose prepareCells() has the most Path2D
    // parsing to do. Poll for the game to actually be ready to paint instead
    // of hoping a fixed delay was long enough; the deadline is only there so
    // a genuinely broken boot fails fast rather than hanging.
    const bootPoll = await target.webContents.executeJavaScript(`(async () => {
      const start = Date.now();
      const deadline = start + 8000;
      for (;;) {
        const t = window.__paintblobTest;
        const ready = !!(t?.state?.puzzle && t.state.selected >= 0 && t.state.cells.length > 0);
        if (ready || Date.now() >= deadline) {
          return {
            ready, elapsedMs: Date.now() - start, hasHook: !!t,
            hasPuzzle: !!t?.state?.puzzle, selected: t?.state?.selected,
            cellsLen: t?.state?.cells?.length ?? null,
          };
        }
        await new Promise((r) => setTimeout(r, 50));
      }
    })()`);
    console.log(`smoke: boot poll ${JSON.stringify(bootPoll)}`);

    // Click an actual cell of the auto-selected first tub, found through the
    // same anchor point the renderer uses for its number — not a blind spray
    // of screen coordinates hoping one lands. A puzzle can legitimately be
    // fine enough that no fixed grid of guesses is guaranteed to hit a real
    // cell (that's the whole point of the detail presets), so this asks the
    // game itself where a paintable cell is via window.__paintblobTest (see
    // src/game.js), then fires a real tap — pointerdown then pointerup,
    // since painting resolves on pointerup — at its exact screen position.
    const filled = await target.webContents.executeJavaScript(`(async () => {
      const canvas = document.getElementById('board');
      const { board, state } = window.__paintblobTest;
      const target = state.cells.find(
        (c) => c.colour === state.selected && !state.filled.has(c.id),
      );
      if (target) {
        const { x, y } = board.toScreen(target.anchor.x, target.anchor.y);
        for (const type of ['pointerdown', 'pointerup']) {
          canvas.dispatchEvent(new PointerEvent(type, {
            pointerId: 1, button: 0, bubbles: true, clientX: x, clientY: y,
          }));
        }
      }
      // The paint lands once the burst's fill animation completes, not the
      // instant the tap does — and how long that animation takes wall-clock
      // is not fixed: a burst runs on requestAnimationFrame, which on a
      // genuinely cold renderer (no GPU/shader cache — every CI run, by
      // construction) has measured as slow as ~40% of real-time for the
      // first second or so. A fixed sleep here has to either way overshoot
      // that worst case or risk exactly the flake this replaced. Poll for
      // the actual paint instead, capped so a truly broken paint still
      // fails in reasonable time rather than hanging.
      const deadline = Date.now() + 10000;
      while (!state.filled.has(target?.id) && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 100));
      }
      return document.getElementById('barSubtitle').textContent;
    })()`);

    // Exercise the add-a-picture path for real: generate an image in the
    // renderer, drop it on the window, and confirm it round-trips through IPC,
    // the pipeline, and the user puzzle directory into something playable.
    // Deliberately a *photograph*, not flat art: grain, a gradient and a dark
    // border, at a size a phone actually produces. Flat art skips the whole
    // grain and crop path, which is how a crash on real photos got through.
    const imported = await target.webContents.executeJavaScript(`(async () => {
      const W = 2000, H = 2600;
      const canvas = new OffscreenCanvas(W, H);
      const ctx = canvas.getContext('2d');
      const img = ctx.createImageData(W, H);
      const d = img.data;
      let s = 11;
      const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const o = (y * W + x) * 4;
          const r = Math.hypot(x - W / 2, y - H / 2) / (W * 0.7);
          const border = (x < 70 || y < 70 || x > W - 71 || y > H - 71) ? 0.08 : 1;
          const n = (rnd() - 0.5) * 28;
          d[o] = (185 - r * 70 + n) * border;
          d[o + 1] = (150 + r * 40 + n) * border;
          d[o + 2] = (175 - r * 20 + n) * border;
          d[o + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);

      const blob = await canvas.convertToBlob({ type: 'image/png' });
      const transfer = new DataTransfer();
      transfer.items.add(new File([blob], 'smoke-import.png', { type: 'image/png' }));
      window.dispatchEvent(new DragEvent('drop', {
        dataTransfer: transfer, bubbles: true, cancelable: true,
      }));

      for (let i = 0; i < 200 && !/Smoke Import/.test(document.getElementById('barSubtitle').textContent); i++) {
        await new Promise((r) => setTimeout(r, 100));
      }
      const subtitle = document.getElementById('barSubtitle').textContent;
      const listed = (await window.blob.listPuzzles()).some((p) => p.id === 'smoke-import');
      await window.blob.deletePuzzle('smoke-import');
      return { subtitle, listed };
    })()`);

    console.log(`smoke: imported "${imported.subtitle}" (listed: ${imported.listed})`);
    if (!imported.listed || !/Smoke Import/.test(imported.subtitle)) {
      errors.push(`add-a-picture failed (subtitle: "${imported.subtitle}", listed: ${imported.listed})`);
    }

    // The Add-picture button now opens a native dialog in the main process,
    // which blocks until a real person answers it — so the button cannot be
    // clicked in an automated test without hanging forever, and the actual
    // Windows dialog crash cannot be reproduced on this platform at all. What
    // is checked here is that the wiring is present and the button exists; the
    // dialog itself is only ever exercised by hand.
    const wiring = await target.webContents.executeJavaScript(`(async () => {
      const hasBridge = typeof window.blob.pickImage === 'function';
      document.querySelector('[data-act="pictures"]').click();
      await new Promise((r) => setTimeout(r, 300));
      const hasButton = !!document.querySelector('.primary.add');
      document.querySelector('[data-act="panel-close"]')?.click();
      return { hasBridge, hasButton };
    })()`);
    console.log(`smoke: picker wired ${wiring.hasBridge}, button present ${wiring.hasButton}`);
    if (!wiring.hasBridge || !wiring.hasButton) {
      errors.push(`add-a-picture wiring missing: ${JSON.stringify(wiring)}`);
    }

    if (DIALOG_FREE) {
      // The Windows path, end to end: clicking Add must open the guide (and
      // never a dialog), and the guide must dismiss on click. This is the code
      // path Windows users actually run, exercised for real — unlike the OS
      // dialog, nothing in it needs a human at a real desktop.
      const shown = await target.webContents.executeJavaScript(`(async () => {
        document.querySelector('[data-act="pictures"]').click();
        await new Promise((r) => setTimeout(r, 300));
        document.querySelector('.primary.add').click();
        await new Promise((r) => setTimeout(r, 500));
        return !!document.querySelector('.drop-hint.guide');
      })()`);

      // Capture while the guide is up, so what a Windows user sees when they
      // press the button is a reviewable image rather than a description.
      const guideShot = await target.webContents.capturePage();
      fs.mkdirSync(path.dirname(smokeOutputPath()), { recursive: true });
      fs.writeFileSync(
        path.join(path.dirname(smokeOutputPath()), 'guide.png'),
        guideShot.toPNG(),
      );

      const dismissed = await target.webContents.executeJavaScript(`(async () => {
        document.getElementById('drop').click();
        await new Promise((r) => setTimeout(r, 200));
        const gone = !document.querySelector('.drop-hint.guide');
        document.querySelector('[data-act="panel-close"]')?.click();
        return gone;
      })()`);
      const guide = { shown, dismissed };
      console.log(`smoke: dialog-free guide shown=${guide.shown} dismissed=${guide.dismissed}`);
      if (!guide.shown || !guide.dismissed) {
        errors.push(`dialog-free guide misbehaved: ${JSON.stringify(guide)}`);
      }
    }

    const image = await target.webContents.capturePage();
    const out = smokeOutputPath();
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, image.toPNG());

    const painted = Number(/(\d+)\s*\/\s*\d+/.exec(filled)?.[1] ?? 0);
    console.log(`smoke: ${filled}`);
    console.log(`smoke: wrote ${out}`);

    if (!painted) errors.push(`no cells were painted (subtitle: "${filled}")`);
    if (errors.length) {
      console.error(`smoke: FAILED\n  ${errors.join('\n  ')}`);
      app.exit(1);
    } else {
      console.log('smoke: OK');
      app.exit(0);
    }
  } catch (err) {
    console.error(`smoke: FAILED\n  ${err.stack ?? err}`);
    app.exit(1);
  }
}

/* ---------------------------------------------------------------------- ipc */

ipcMain.handle('save:read', () => readSave());

ipcMain.handle('save:write', (_e, patch) => {
  const data = readSave();
  const merged = {
    ...data,
    ...patch,
    stats: { ...data.stats, ...(patch.stats || {}) },
    settings: { ...data.settings, ...(patch.settings || {}) },
    progress: { ...data.progress, ...(patch.progress || {}) },
    bounds: data.bounds,
  };
  writeSave(merged);
  return true;
});

/* ------------------------------------------------------------------ puzzles */

// Two libraries. The bundled one ships with the app and, once packaged, lives
// inside a read-only asar; anything the player imports has to go somewhere
// writable instead. Both are merged on read, with imports winning on an id
// clash so a player can replace a demo picture with their own.
const bundledDir = () => path.join(__dirname, '..', 'puzzles');
const importedDir = () => path.join(app.getPath('userData'), 'puzzles');

const VALID_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

function readManifest(dir, imported) {
  try {
    const list = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
    return list.map((p) => ({ ...p, imported }));
  } catch {
    return [];
  }
}

function writeImportedManifest(list) {
  const dir = importedDir();
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, 'manifest.json.tmp');
  fs.writeFileSync(tmp, `${JSON.stringify(list, null, 2)}\n`);
  fs.renameSync(tmp, path.join(dir, 'manifest.json'));
}

ipcMain.handle('puzzles:list', async () => {
  const bundled = readManifest(bundledDir(), false);
  const imported = readManifest(importedDir(), true);
  const byId = new Map(bundled.map((p) => [p.id, p]));
  for (const p of imported) byId.set(p.id, p);
  return [...byId.values()].sort((a, b) => a.title.localeCompare(b.title));
});

ipcMain.handle('puzzles:load', async (_e, id) => {
  // Never let a renderer-supplied id escape either puzzle directory.
  if (!VALID_ID.test(id)) throw new Error('bad puzzle id');
  for (const dir of [importedDir(), bundledDir()]) {
    const file = path.join(dir, `${id}.json`);
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  }
  throw new Error(`no such puzzle: ${id}`);
});

const MAX_IMAGE_BYTES = 64 * 1024 * 1024;

// The file picker. Deliberately a native dialog in the main process with NO
// parent window, and deliberately not an <input type=file> in the renderer.
//
// On Windows a `transparent` BrowserWindow crashes the whole process — a
// native crash, below any JS handler — the instant it owns an OS file dialog.
// An <input> triggers exactly that dialog, owned by this window, so it crashes
// too; that is why swapping the native dialog for an input did not help. A
// parentless dialog is a standalone top-level OS window owned by nothing, so
// the transparent window is never in the picture.
ipcMain.handle('win:pick-image', async () => {
  // The dialog-free platforms get a sentinel instead of a dialog; the renderer
  // responds by showing the drag/paste guide. See DIALOG_FREE above for why.
  if (DIALOG_FREE) return { dialogFree: true };

  // Drop always-on-top while the dialog is up, or the floating window sits in
  // front of it. Restored in the finally. This is a plain main-process call,
  // so there is no user-gesture timing to get wrong.
  const pinned = win && !win.isDestroyed() && win.isAlwaysOnTop();
  if (pinned) win.setAlwaysOnTop(false);

  try {
    // No window argument: the dialog is parented to nothing.
    const result = await dialog.showOpenDialog({
      title: 'Add a picture',
      buttonLabel: 'Add',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif'] },
        { name: 'All files', extensions: ['*'] },
      ],
    });
    if (result.canceled) return [];

    return result.filePaths.flatMap((file) => {
      try {
        if (fs.statSync(file).size > MAX_IMAGE_BYTES) return [];
        return [{ name: path.basename(file, path.extname(file)), bytes: fs.readFileSync(file) }];
      } catch (err) {
        logCrash('pick-image-read', `${file}: ${err.message}`);
        return [];
      }
    });
  } catch (err) {
    logCrash('pick-image', err?.stack ?? String(err));
    return [];
  } finally {
    if (pinned && win && !win.isDestroyed()) {
      win.setAlwaysOnTop(readSave().settings.alwaysOnTop !== false, 'floating');
    }
  }
});

ipcMain.handle('puzzles:save', async (_e, { id, title, puzzle, entry }) => {
  if (!VALID_ID.test(id)) throw new Error('bad puzzle id');
  const dir = importedDir();
  fs.mkdirSync(dir, { recursive: true });

  const tmp = path.join(dir, `${id}.json.tmp`);
  fs.writeFileSync(tmp, JSON.stringify({ id, title, ...puzzle }));
  fs.renameSync(tmp, path.join(dir, `${id}.json`));

  const list = readManifest(dir, true).map(({ imported, ...rest }) => rest);
  writeImportedManifest([...list.filter((p) => p.id !== id), { ...entry, id, title }]);
  return { id, dir };
});

ipcMain.handle('puzzles:delete', async (_e, id) => {
  if (!VALID_ID.test(id)) throw new Error('bad puzzle id');
  const dir = importedDir();
  const file = path.join(dir, `${id}.json`);
  if (!fs.existsSync(file)) return false; // bundled puzzles are not removable
  fs.rmSync(file);
  writeImportedManifest(
    readManifest(dir, true).filter((p) => p.id !== id).map(({ imported, ...rest }) => rest),
  );

  const data = readSave();
  delete data.progress[id];
  writeSave(data);
  return true;
});

ipcMain.on('win:minimise', () => win?.minimize());
ipcMain.on('win:close', () => win?.close());

ipcMain.handle('win:toggle-top', () => {
  if (!win) return false;
  const next = !win.isAlwaysOnTop();
  win.setAlwaysOnTop(next, 'floating');
  const data = readSave();
  data.settings.alwaysOnTop = next;
  writeSave(data);
  return next;
});

// Frameless + transparent windows have unreliable native resize edges on
// Windows, so the corner grip drives the size explicitly.
ipcMain.on('win:resize-by', (_e, dx, dy) => {
  if (!win) return;
  const b = win.getBounds();
  win.setBounds({
    x: b.x,
    y: b.y,
    width: Math.max(MIN_SIZE, Math.round(b.width + dx)),
    height: Math.max(MIN_SIZE, Math.round(b.height + dy)),
  });
});

/* -------------------------------------------------------------------- boot */

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    savePath = path.join(app.getPath('userData'), 'paintblob-save.json');
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => app.quit());
}
