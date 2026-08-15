'use strict';

// CommonJS on purpose. The renderer is ESM (via <script type="module">), but
// keeping the main and preload scripts CJS avoids Electron's ESM/sandbox
// caveats entirely — one less thing to break on a version bump.

const { app, BrowserWindow, ipcMain, screen, shell } = require('electron');
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
  stats: { blobs: 0, cells: 0, puzzles: 0, colourSwitches: 0, seconds: 0, undos: 0 },
  unlocked: [],      // achievement ids
  settings: { sound: true, volume: 0.7, alwaysOnTop: true, scale: 1 },
  bounds: null,
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

  win = new BrowserWindow({
    width: restored?.width ?? 720,
    height: restored?.height ?? 820,
    x: restored?.x,
    y: restored?.y,
    minWidth: MIN_SIZE,
    minHeight: MIN_SIZE,
    frame: false,
    transparent: true,
    hasShadow: false,          // we draw our own; OS shadow clips the round corners
    backgroundColor: '#00000000',
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

  // Float above full-screen apps too, without stealing focus.
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setAlwaysOnTop(save.settings.alwaysOnTop !== false, 'floating');

  win.loadFile(path.join(__dirname, '..', 'src', 'index.html'));
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

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
    await wait(1200);

    // Spray clicks across the picture. Whichever land on a cell matching the
    // auto-selected first tub will fire a burst; the rest are harmless misses.
    const filled = await target.webContents.executeJavaScript(`(async () => {
      const canvas = document.getElementById('board');
      const rect = canvas.getBoundingClientRect();
      for (let i = 0; i < 5; i++) {
        for (let j = 0; j < 5; j++) {
          canvas.dispatchEvent(new PointerEvent('pointerdown', {
            button: 0, bubbles: true,
            clientX: rect.left + rect.width * (j + 0.5) / 5,
            clientY: rect.top + rect.height * (i + 0.5) / 5,
          }));
          await new Promise((r) => setTimeout(r, 40));
        }
      }
      await new Promise((r) => setTimeout(r, 1800));
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

    // The reported crash: the app died the instant the file chooser opened.
    // Click the real button, then confirm the process is still here.
    const survived = await target.webContents.executeJavaScript(`(async () => {
      document.querySelector('[data-act="pictures"]').click();
      await new Promise((r) => setTimeout(r, 300));
      const add = document.querySelector('.primary.add');
      if (!add) return 'no Add picture button';
      add.click();
      await new Promise((r) => setTimeout(r, 1200));
      document.querySelectorAll('input[type=file]').forEach((el) => el.remove());
      return 'alive';
    })()`);
    console.log(`smoke: after opening the picker -> ${survived}`);
    if (survived !== 'alive' || target.isDestroyed()) {
      errors.push(`opening the file picker did not survive: ${survived}`);
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

// Choosing a file is done entirely in the renderer with an input element.
// dialog.showOpenDialog used to live here, parented to this window — which is
// frameless, transparent, always-on-top and visible on all workspaces. That
// combination could take the whole process down the moment the dialog opened.
// The renderer's picker is Chromium's own and is not attached to the window.
ipcMain.handle('win:suspend-top', (_e, suspend) => {
  if (!win || win.isDestroyed()) return false;
  const wanted = suspend ? false : readSave().settings.alwaysOnTop !== false;
  win.setAlwaysOnTop(wanted, 'floating');
  return wanted;
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
