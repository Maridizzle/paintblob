// Everything the game needs from the world outside the renderer, behind one
// interface with two implementations.
//
// On the desktop it forwards to the Electron preload bridge. In a browser —
// which is how it runs on Android — it backs the same calls with IndexedDB and
// a file input. The game itself never learns which one it got.
//
// Keeping the surface this narrow is what makes the port cheap: nine methods,
// no Node, no Electron APIs anywhere in src/.

const DB_NAME = 'paintblob';
const DB_VERSION = 1;

const DEFAULT_SAVE = {
  version: 1,
  progress: {},
  stats: { blobs: 0, cells: 0, puzzles: 0, colourSwitches: 0, seconds: 0, undos: 0, bestStreak: 0, wrongTaps: 0, dayStreak: 0, bestDayStreak: 0 },
  unlocked: [],
  settings: { sound: true, volume: 0.7, alwaysOnTop: true, scale: 1, opacity: 0.7, theme: 'void', overtime: true },
  // Story mode. Shallow-spread through readSave like `avatar`, so a save that
  // already has it but predates a later sub-key gets that key from a ??= in
  // boot(). `seen` records which chapters' opening scenes have played.
  story: { chapter: 1, seen: {} },
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

/* ------------------------------------------------------------------- indexeddb */

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      if (!db.objectStoreNames.contains('puzzles')) db.createObjectStore('puzzles');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function tx(db, store, mode, run) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(store, mode);
    const request = run(transaction.objectStore(store));
    transaction.oncomplete = () => resolve(request?.result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

const idbGet = (db, store, key) => tx(db, store, 'readonly', (s) => s.get(key));
const idbSet = (db, store, key, value) => tx(db, store, 'readwrite', (s) => s.put(value, key));
const idbDel = (db, store, key) => tx(db, store, 'readwrite', (s) => s.delete(key));

/* ---------------------------------------------------------------------- web */

const VALID_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

/**
 * Chooses image files through an ordinary file input, on every platform.
 *
 * Deliberately not Electron's `dialog.showOpenDialog`. Parenting a native
 * modal to this window — frameless, transparent, always-on-top and visible on
 * all workspaces — is a reliable way to take the whole process down with it.
 * An input element goes through Chromium's own picker, which is the same code
 * path every web page uses and is not attached to the window at all.
 *
 * `capture` is deliberately absent so Android offers the gallery and Files
 * alongside the camera.
 *
 * Exported for the harness, which cannot open a real chooser (that needs a
 * user gesture) but can check this never resolves before one is answered.
 */
export function pickImage() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.style.display = 'none';
    document.body.append(input);

    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(value);
    };

    input.addEventListener('change', () => {
      finish([...input.files].map((file) => ({
        name: file.name.replace(/\.[^.]+$/, ''),
        bytes: file,
      })));
    });

    // `cancel` is the only signal used, and it is the correct one — every
    // engine this runs on fires it when a chooser is dismissed.
    //
    // There used to be a window-focus fallback here for older engines. It was
    // actively harmful: focus can arrive while the chooser is still open, and
    // finishing detaches the input, which dismisses the chooser. The dialog
    // appeared for a moment and then closed by itself.
    input.addEventListener('cancel', () => finish([]));

    input.click();
  });
}

async function webPlatform() {
  const db = await openDB();
  const base = new URL('.', document.baseURI);

  // Offline support and the home-screen install prompt both hang off this.
  // It is absent when running src/ directly without a web build, and over
  // plain http on a LAN address — neither is worth complaining about.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register(new URL('sw.js', base)).catch(() => {});
  }

  // Bundled pictures are static files next to the page. They never change at
  // runtime, so one fetch is enough.
  let bundled = null;
  const loadBundled = async () => {
    if (bundled) return bundled;
    try {
      const res = await fetch(new URL('puzzles/manifest.json', base));
      bundled = res.ok ? (await res.json()).map((p) => ({ ...p, imported: false })) : [];
    } catch {
      bundled = [];
    }
    return bundled;
  };

  const importedList = async () => (await idbGet(db, 'kv', 'imported')) ?? [];

  return {
    isDesktop: false,

    async readSave() {
      const raw = (await idbGet(db, 'kv', 'save')) ?? {};
      return {
        ...DEFAULT_SAVE,
        ...raw,
        stats: { ...DEFAULT_SAVE.stats, ...(raw.stats || {}) },
        settings: { ...DEFAULT_SAVE.settings, ...(raw.settings || {}) },
        progress: { ...(raw.progress || {}) },
      };
    },

    async writeSave(patch) {
      const current = (await idbGet(db, 'kv', 'save')) ?? {};
      await idbSet(db, 'kv', 'save', {
        ...current,
        ...patch,
        stats: { ...(current.stats || {}), ...(patch.stats || {}) },
        settings: { ...(current.settings || {}), ...(patch.settings || {}) },
        progress: { ...(current.progress || {}), ...(patch.progress || {}) },
      });
      return true;
    },

    async listPuzzles() {
      const byId = new Map((await loadBundled()).map((p) => [p.id, p]));
      for (const p of await importedList()) byId.set(p.id, { ...p, imported: true });
      return [...byId.values()].sort((a, b) => a.title.localeCompare(b.title));
    },

    async loadPuzzle(id) {
      if (!VALID_ID.test(id)) throw new Error('bad puzzle id');
      const own = await idbGet(db, 'puzzles', id);
      if (own) return own;
      const res = await fetch(new URL(`puzzles/${id}.json`, base));
      if (!res.ok) throw new Error(`no such puzzle: ${id}`);
      return res.json();
    },

    pickImage,

    async savePuzzle({ id, title, puzzle, entry }) {
      if (!VALID_ID.test(id)) throw new Error('bad puzzle id');
      await idbSet(db, 'puzzles', id, { id, title, ...puzzle });
      const list = (await importedList()).filter((p) => p.id !== id);
      await idbSet(db, 'kv', 'imported', [...list, { ...entry, id, title }]);
      return { id };
    },

    async deletePuzzle(id) {
      if (!VALID_ID.test(id)) throw new Error('bad puzzle id');
      if (!(await idbGet(db, 'puzzles', id))) return false;
      await idbDel(db, 'puzzles', id);
      await idbSet(db, 'kv', 'imported', (await importedList()).filter((p) => p.id !== id));
      return true;
    },

    // Window management has no meaning in a browser tab. The chrome that would
    // drive these is hidden, but the methods stay so nothing has to null-check.
    minimise() {},
    close() {},
    async toggleAlwaysOnTop() { return false; },
    resizeBy() {},
  };
}

/* ------------------------------------------------------------------ electron */

function electronPlatform(bridge) {
  // Note: no HTML file input here. On Windows a `transparent` BrowserWindow
  // crashes — natively, below JS — the moment the OS file dialog opens, and an
  // <input type=file> triggers that same dialog owned by this window. The
  // dialog is opened in the main process instead, parented to nothing, so it
  // is never associated with the transparent window. See win:pick-image.
  return { isDesktop: true, ...bridge };
}

/**
 * @returns {Promise<object>} the platform bridge, or null if neither backend
 *   is usable (a browser with IndexedDB blocked, typically private browsing).
 */
export async function createPlatform() {
  if (window.blob) return electronPlatform(window.blob);
  if (!('indexedDB' in window)) return null;
  try {
    return await webPlatform();
  } catch {
    return null;
  }
}
