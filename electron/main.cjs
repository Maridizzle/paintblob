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
  target.webContents.on('console-message', (_e, level, message) => {
    if (level >= 2) errors.push(message); // 2 = warning, 3 = error
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
    const imported = await target.webContents.executeJavaScript(`(async () => {
      const canvas = new OffscreenCanvas(360, 360);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#f2e9d8'; ctx.fillRect(0, 0, 360, 360);
      ctx.fillStyle = '#d1495b'; ctx.beginPath(); ctx.arc(130, 140, 84, 0, 7); ctx.fill();
      ctx.fillStyle = '#2a9d8f'; ctx.fillRect(30, 250, 300, 80);
      ctx.fillStyle = '#e9c46a'; ctx.beginPath(); ctx.arc(258, 110, 58, 0, 7); ctx.fill();

      const blob = await canvas.convertToBlob({ type: 'image/png' });
      const transfer = new DataTransfer();
      transfer.items.add(new File([blob], 'smoke-import.png', { type: 'image/png' }));
      window.dispatchEvent(new DragEvent('drop', {
        dataTransfer: transfer, bubbles: true, cancelable: true,
      }));

      for (let i = 0; i < 60 && !/Smoke Import/.test(document.getElementById('barSubtitle').textContent); i++) {
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

const MAX_IMAGE_BYTES = 48 * 1024 * 1024;

ipcMain.handle('puzzles:pick-image', async () => {
  const result = await dialog.showOpenDialog(win, {
    title: 'Add a picture',
    buttonLabel: 'Add',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif', 'bmp'] },
      { name: 'All files', extensions: ['*'] },
    ],
  });
  if (result.canceled) return [];

  // Decoding happens in the renderer, where Chromium handles every format it
  // can display — considerably more than the CLI's PNG/JPEG. All the main
  // process does is hand over bytes.
  return result.filePaths.flatMap((file) => {
    const { size } = fs.statSync(file);
    if (size > MAX_IMAGE_BYTES) return [];
    return [{ name: path.basename(file, path.extname(file)), bytes: fs.readFileSync(file) }];
  });
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
