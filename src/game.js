import { Board } from './render.js';
import { Burst, audioCue } from './paint-fx.js';
import { Sfx } from './audio.js';
import { Achievements, StreakTracker } from './achievements.js';
import { prepareCells, cellAt } from './geometry.js';
import { importImages, imagesFromDrop } from './import.js';
import { createPlatform } from './platform.js';

let api;
const $ = (id) => document.getElementById(id);

const board = new Board($('board'));
let sfx;
let achievements;
const streaks = new StreakTracker();

const S = {
  save: null,
  manifest: [],
  puzzle: null,
  cells: [],
  filled: new Set(),
  remaining: [],
  selected: -1,
  bursts: [],
  seed: 1,
  elapsedMs: 0,
  finished: false,
  revealFrom: 0,
  idleSinceBurst: true,
  panel: null,
  importing: false,
};

/* ---------------------------------------------------------------- persistence */

let saveTimer = null;
function persist(immediate = false) {
  clearTimeout(saveTimer);
  const flush = () => {
    if (S.puzzle) {
      S.save.progress[S.puzzle.id] = {
        filled: [...S.filled],
        done: S.finished,
        seconds: Math.round(S.elapsedMs / 1000),
      };
    }
    S.save.unlocked = [...achievements.unlocked];
    api?.writeSave({
      progress: S.save.progress,
      stats: S.save.stats,
      settings: S.save.settings,
      unlocked: S.save.unlocked,
    });
  };
  if (immediate) flush();
  else saveTimer = setTimeout(flush, 900);
}

/* -------------------------------------------------------------------- toasts */

function toast(def) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span class="glyph"></span><span><span class="name"></span><br><span class="desc"></span></span>`;
  el.querySelector('.glyph').textContent = def.icon;
  el.querySelector('.name').textContent = def.name;
  el.querySelector('.desc').textContent = def.desc;
  $('toasts').append(el);

  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 320);
  }, 3800);

  // Stop the corner filling up during a burst of unlocks.
  const all = $('toasts').children;
  while (all.length > 4) all[0].remove();
}

/* ---------------------------------------------------------------------- tubs */

function buildTubs() {
  const wrap = $('tubs');
  wrap.textContent = '';

  S.puzzle.palette.forEach((paint, i) => {
    const tub = document.createElement('button');
    tub.className = 'tub';
    tub.style.background = paint.hex;
    tub.dataset.index = String(i);
    tub.title = `${paint.name} — press ${i + 1}`;
    tub.style.color = readableOn(paint.hex);
    tub.textContent = String(i + 1);

    const count = document.createElement('span');
    count.className = 'count';
    tub.append(count);

    tub.addEventListener('click', () => selectTub(i, true));
    wrap.append(tub);
  });
  syncTubs();
}

function readableOn(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  // Rec. 601 luma; the number sits directly on the paint.
  return 0.299 * r + 0.587 * g + 0.114 * b > 140 ? 'rgba(0,0,0,0.72)' : 'rgba(255,255,255,0.92)';
}

function syncTubs() {
  [...$('tubs').children].forEach((tub, i) => {
    const left = S.remaining[i];
    tub.classList.toggle('spent', left === 0);
    tub.classList.toggle('selected', i === S.selected);
    tub.querySelector('.count').textContent = String(left);
  });

  const total = S.cells.length;
  $('progressFill').style.width = `${(S.filled.size / total) * 100}%`;
  $('barSubtitle').textContent = S.finished
    ? S.puzzle.title
    : `${S.puzzle.title} · ${S.filled.size}/${total}`;
}

function selectTub(i, fromUser = false) {
  if (i < 0 || i >= S.puzzle.palette.length) return;
  if (S.remaining[i] === 0 || i === S.selected) return;

  if (fromUser && S.selected >= 0) {
    S.save.stats.colourSwitches++;
    achievements.sync(S.save.stats);
  }
  S.selected = i;
  board.setSelected(i);
  syncTubs();
  sfx.play('pick', i);
}

function nextTub() {
  const n = S.puzzle.palette.length;
  for (let step = 1; step <= n; step++) {
    const i = (S.selected + step) % n;
    if (S.remaining[i] > 0) return selectTub(i);
  }
  return undefined;
}

/* -------------------------------------------------------------------- puzzle */

async function loadPuzzle(id) {
  const puzzle = await api.loadPuzzle(id);
  const saved = S.save.progress[id] || { filled: [], done: false, seconds: 0 };

  S.puzzle = puzzle;
  S.cells = prepareCells(puzzle);
  S.filled = new Set(saved.filled);
  S.elapsedMs = (saved.seconds || 0) * 1000;
  S.finished = S.filled.size === S.cells.length;
  S.bursts = [];
  S.selected = -1;
  S.revealFrom = S.finished ? 0 : -1;

  S.remaining = puzzle.palette.map(() => 0);
  for (const cell of S.cells) if (!S.filled.has(cell.id)) S.remaining[cell.colour]++;

  streaks.reset();
  board.setPuzzle(puzzle, S.cells, S.filled);
  board.reveal = S.finished ? 1 : 0;
  $('board').classList.toggle('done', S.finished);
  $('finish').classList.add('hidden');

  buildTubs();
  board.layout();
  if (!S.finished) nextTub();

  S.save.settings.lastPuzzle = id;
  persist();
}

/* -------------------------------------------------------------------- input */

function pointerToCell(e) {
  const p = board.toPuzzle(e.clientX, e.clientY);
  return { point: p, cell: cellAt(S.cells, p.x, p.y) };
}

$('board').addEventListener('pointermove', (e) => {
  // A finger has no hover state. Touch drags would otherwise leave an outline
  // stranded under wherever the thumb last was.
  if (S.finished || e.pointerType === 'touch') return;
  const { cell } = pointerToCell(e);
  // Idle frames are throttled to 30fps; force the next one so the hover
  // outline tracks the cursor rather than lagging behind it.
  if (board.setHover(cell && !S.filled.has(cell.id) ? cell.id : -1)) lastDraw = 0;
});

$('board').addEventListener('pointerleave', () => board.setHover(-1));

$('board').addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || S.finished) return;
  sfx.ensure();
  S.idleSinceBurst = false;

  const { point, cell } = pointerToCell(e);
  if (!cell || S.filled.has(cell.id)) return;

  if (cell.colour !== S.selected) {
    sfx.play('nope');
    streaks.wrong();
    const tub = $('tubs').children[cell.colour];
    tub?.classList.remove('hint');
    void tub?.offsetWidth; // restart the animation
    tub?.classList.add('hint');
    return;
  }

  launch(cell, point);
});

function launch(cell, point) {
  const burst = new Burst({
    origin: point,
    sink: cell.anchor,
    colour: board.hexOf(cell.colour),
    width: S.puzzle.width,
    height: S.puzzle.height,
    reach: cell.reach,
    cellPath: cell.path,
    seed: S.seed++,
    speed: S.save.settings.speed ?? 1,
    density: S.save.settings.density ?? 1,
  });
  burst.cell = cell;
  burst.applied = false;
  S.bursts.push(burst);

  // Arm the "watched it land without touching anything" achievement. The
  // pointerdown that got us here already cleared the flag; any *further* click
  // clears it again.
  S.idleSinceBurst = true;

  board.setHover(-1);
  sfx.play('splat');
  ensureFrame();
}

function commitFill(burst) {
  const cell = burst.cell;
  S.filled.add(cell.id);
  S.remaining[cell.colour]--;
  board.markFilled(cell.id);

  S.save.stats.cells++;
  if (!sfx.enabled) S.save.stats.mutedCells = (S.save.stats.mutedCells || 0) + 1;

  for (const id of streaks.fill(Date.now())) achievements.award(id);
  achievements.sync(S.save.stats);

  if (S.remaining[cell.colour] === 0) {
    achievements.award('tub-empty');
    nextTub();
  }

  syncTubs();
  persist();

  if (S.filled.size === S.cells.length) finish();
}

function finish() {
  S.finished = true;
  S.revealFrom = performance.now();
  $('board').classList.add('done');

  S.save.stats.puzzles++;
  if (streaks.wrongClicks === 0) achievements.award('flawless');
  if (S.elapsedMs < 90_000) achievements.award('speedrun');
  achievements.sync(S.save.stats);

  const secs = Math.round(S.elapsedMs / 1000);
  $('finishName').textContent = S.puzzle.title;
  $('finishStats').textContent =
    `${S.cells.length} cells · ${Math.floor(secs / 60)}m ${String(secs % 60).padStart(2, '0')}s` +
    `${streaks.wrongClicks === 0 ? ' · flawless' : ''}`;

  // Let the reveal animation play out first. Guard against the player jumping
  // to another picture in the meantime — the overlay would land on that one.
  const finishing = S.puzzle.id;
  setTimeout(() => {
    if (S.puzzle?.id === finishing && S.finished) $('finish').classList.remove('hidden');
  }, 900);
  sfx.play('complete');
  syncTubs();
  persist(true);
}

async function nextPuzzle() {
  if (!S.manifest.length) return;
  const order = S.manifest.map((p) => p.id);
  const start = order.indexOf(S.puzzle?.id);
  const unfinished = order.find((id, i) =>
    i !== start && !(S.save.progress[id]?.done));
  await loadPuzzle(unfinished ?? order[(start + 1) % order.length]);
}

/* --------------------------------------------------------------------- loop */

let frameHandle = null;
let last = 0;
let lastDraw = 0;
let secondsCarry = 0;

function ensureFrame() {
  if (frameHandle === null) {
    last = performance.now();
    frameHandle = requestAnimationFrame(frame);
  }
}

function frame(now) {
  frameHandle = null;
  const dt = Math.min(64, now - last);
  last = now;

  if (!S.finished && !document.hidden) {
    S.elapsedMs += dt;
    // Carry the fraction. Rounding dt/1000 straight into an integer counter
    // rounds every frame down to zero and the clock never moves.
    secondsCarry += dt / 1000;
    if (secondsCarry >= 1) {
      const whole = Math.floor(secondsCarry);
      secondsCarry -= whole;
      S.save.stats.seconds += whole;
      achievements.sync(S.save.stats);
    }
  }

  for (const burst of S.bursts) {
    const before = burst.elapsed;
    burst.update(dt);
    const cue = audioCue(before, burst.elapsed);
    if (cue) sfx.play(cue);
    if (burst.filled && !burst.applied) {
      burst.applied = true;
      commitFill(burst);
    }
    if (burst.done && S.idleSinceBurst) {
      S.save.stats.patientLandings = (S.save.stats.patientLandings ?? 0) + 1;
      achievements.sync(S.save.stats);
    }
  }

  if (S.bursts.some((b) => b.done)) {
    S.bursts = S.bursts.filter((b) => !b.done);
    S.idleSinceBurst = true;
  }

  if (S.revealFrom > 0) {
    const t = Math.min(1, (now - S.revealFrom) / 850);
    board.reveal = t * t;
    board.dirty = true;
    if (t >= 1) S.revealFrom = 0;
  }

  // Full rate while anything is moving, a lazy 30fps for the idle pulse.
  const busy = S.bursts.length > 0 || S.revealFrom > 0;
  if (busy || now - lastDraw > 33) {
    lastDraw = now;
    board.draw(S.bursts, now);
  }

  if (!document.hidden) ensureFrame();
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) ensureFrame();
  else persist(true);
});

/* -------------------------------------------------------------------- panels */

async function openPanel(kind) {
  S.panel = kind;
  const body = $('panelBody');
  body.textContent = '';
  $('panelTitle').textContent =
    kind === 'pictures' ? 'Pictures' : kind === 'trophies' ? 'Achievements' : 'Settings';
  $('panel').classList.remove('hidden');

  if (kind === 'pictures') {
    // Re-read the manifest rather than trusting the copy from startup, so a
    // picture mapified while the app was open shows up without a restart.
    S.manifest = await api.listPuzzles();
    if (S.panel !== kind) return; // closed again while we were waiting
    renderPictures(body);
  } else if (kind === 'trophies') {
    renderTrophies(body);
  } else {
    renderSettings(body);
  }
}

function closePanel() {
  S.panel = null;
  $('panel').classList.add('hidden');
}

function row(cls = '') {
  const el = document.createElement('div');
  el.className = `row ${cls}`.trim();
  return el;
}

function renderPictures(body) {
  body.append(buildAddRow(body));

  if (!S.manifest.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'No pictures yet. Add one above, or drop an image onto the window.';
    body.append(empty);
    return;
  }

  for (const p of S.manifest) {
    const progress = S.save.progress[p.id];
    const done = progress?.done;
    const painted = progress?.filled?.length ?? 0;

    const el = row(`clickable ${p.id === S.puzzle?.id ? 'current' : ''}`);
    const sw = document.createElement('div');
    sw.className = 'swatches';
    for (const hex of p.thumb ?? []) {
      const i = document.createElement('i');
      i.style.background = hex;
      sw.append(i);
    }

    const text = document.createElement('div');
    text.className = 'grow';
    text.innerHTML = '<div class="label"></div><div class="sub"></div>';
    text.querySelector('.label').textContent = p.title;
    text.querySelector('.sub').textContent = done
      ? `finished · ${p.cells} cells`
      : `${painted}/${p.cells} cells · ${p.colours} colours`;

    el.append(sw, text);
    if (done) {
      const tick = document.createElement('span');
      tick.className = 'glyph';
      tick.textContent = '✓';
      el.append(tick);
    }
    if (p.imported) {
      const remove = document.createElement('button');
      remove.className = 'icon danger';
      remove.title = `Remove ${p.title}`;
      remove.textContent = '✕';
      remove.addEventListener('click', async (e) => {
        e.stopPropagation(); // the row itself loads the picture
        await api.deletePuzzle(p.id);
        delete S.save.progress[p.id];
        S.manifest = await api.listPuzzles();
        if (S.puzzle?.id === p.id && S.manifest.length) await loadPuzzle(S.manifest[0].id);
        await openPanel('pictures');
      });
      el.append(remove);
    }
    el.addEventListener('click', async () => {
      closePanel();
      await loadPuzzle(p.id);
    });
    body.append(el);
  }
}

/* ------------------------------------------------------------------ import */

function buildAddRow(body) {
  const wrap = document.createElement('div');
  wrap.className = 'add-row';

  const button = document.createElement('button');
  button.className = 'primary add';
  button.textContent = '＋  Add picture';
  button.addEventListener('click', async () => {
    const picked = await api.pickImage();
    if (!picked.length) return;
    await runImport(picked.map((f) => ({ name: f.name, blob: new Blob([f.bytes]) })), body);
  });

  const detail = document.createElement('div');
  detail.className = 'segmented';
  for (const key of ['chunky', 'normal', 'detailed']) {
    const option = document.createElement('button');
    option.textContent = key[0].toUpperCase() + key.slice(1);
    option.className = S.save.settings.detail === key ? 'on' : '';
    option.title = {
      chunky: 'Fewer, bigger cells',
      normal: 'A balanced picture',
      detailed: 'More cells, finer shapes',
    }[key];
    option.addEventListener('click', () => {
      S.save.settings.detail = key;
      persist();
      [...detail.children].forEach((c) => c.classList.toggle('on', c === option));
    });
    detail.append(option);
  }

  const hint = document.createElement('div');
  hint.className = 'add-hint';
  hint.textContent = 'or drop an image anywhere on the window';

  wrap.append(button, detail, hint);
  return wrap;
}

/** Shared by the button and drag-and-drop. */
async function runImport(files, body) {
  if (S.importing || !files.length) return;
  S.importing = true;

  const status = document.createElement('div');
  status.className = 'empty';
  const panelOpen = !$('panel').classList.contains('hidden');
  if (panelOpen && body) {
    body.textContent = '';
    body.append(status);
  }

  const result = await importImages(files, {
    api,
    detail: S.save.settings.detail ?? 'normal',
    taken: new Set(S.manifest.map((p) => p.id)),
    onProgress: (name, i, total) => {
      status.textContent = total > 1
        ? `Mapping ${name}…  (${i + 1} of ${total})`
        : `Mapping ${name}…`;
    },
  });

  S.manifest = await api.listPuzzles();
  S.importing = false;

  for (const p of result.added) {
    toast({
      icon: '🖼️',
      name: `Added ${p.title}`,
      desc: `${p.cells} cells · ${p.colours} colours`,
    });
  }
  for (const f of result.failed) {
    toast({ icon: '⚠️', name: `Could not add ${f.name}`, desc: f.reason });
  }

  if (result.added.length) {
    // Drop straight into the newest picture; that is what you wanted.
    closePanel();
    await loadPuzzle(result.added.at(-1).id);
  } else if (panelOpen) {
    await openPanel('pictures');
  }
}

function renderTrophies(body) {
  const list = achievements.list(S.save.stats);
  const earned = list.filter((a) => a.earned).length;

  const head = document.createElement('div');
  head.className = 'empty';
  head.style.padding = '2px 4px 8px';
  head.textContent = `${earned} of ${list.length} unlocked · ` +
    `${S.save.stats.cells.toLocaleString()} cells painted`;
  body.append(head);

  for (const a of list) {
    if (a.hidden && !a.earned) continue;
    const el = row(a.earned ? 'earned' : 'locked');
    const glyph = document.createElement('span');
    glyph.className = 'glyph';
    glyph.textContent = a.earned ? a.icon : '🔒';

    const text = document.createElement('div');
    text.className = 'grow';
    text.innerHTML = '<div class="label"></div><div class="sub"></div>';
    text.querySelector('.label').textContent = a.name;
    text.querySelector('.sub').textContent = a.desc;

    if (a.track && !a.earned) {
      const bar = document.createElement('div');
      bar.className = 'bar';
      const fill = document.createElement('i');
      fill.style.width = `${a.progress * 100}%`;
      bar.append(fill);
      text.append(bar);
      text.querySelector('.sub').textContent =
        `${a.desc}  (${Math.min(a.value, a.goal).toLocaleString()}/${a.goal.toLocaleString()})`;
    }

    el.append(glyph, text);
    body.append(el);
  }
}

function renderSettings(body) {
  const settings = S.save.settings;

  const toggle = (label, key, onChange) => {
    const el = row('clickable');
    const text = document.createElement('div');
    text.className = 'grow label';
    text.textContent = label;
    const sw = document.createElement('div');
    sw.className = `switch ${settings[key] ? 'on' : ''}`;
    el.append(text, sw);
    el.addEventListener('click', () => {
      settings[key] = !settings[key];
      sw.classList.toggle('on', settings[key]);
      onChange?.(settings[key]);
      persist();
    });
    body.append(el);
  };

  const slider = (label, key, min, max, step, format, onChange) => {
    const el = row();
    const text = document.createElement('div');
    text.className = 'label';
    text.style.width = '84px';
    text.textContent = label;

    const field = document.createElement('div');
    field.className = 'field grow';
    const input = document.createElement('input');
    input.type = 'range';
    input.min = min;
    input.max = max;
    input.step = step;
    input.value = settings[key] ?? 1;
    const value = document.createElement('span');
    value.className = 'value';
    value.textContent = format(Number(input.value));

    input.addEventListener('input', () => {
      settings[key] = Number(input.value);
      value.textContent = format(settings[key]);
      onChange?.(settings[key]);
      persist();
    });
    field.append(input, value);
    el.append(text, field);
    body.append(el);
  };

  toggle('Sound', 'sound', (on) => {
    sfx.setEnabled(on);
    syncSoundIcon();
    if (on) sfx.play('pick', 2);
  });
  slider('Volume', 'volume', 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`, (v) => sfx.setVolume(v));
  slider('Blob speed', 'speed', 0.6, 1.8, 0.1, (v) => `${v.toFixed(1)}×`);
  slider('Blob density', 'density', 0.4, 1.6, 0.1, (v) => `${v.toFixed(1)}×`);

  const reset = row('clickable');
  reset.innerHTML = '<div class="grow"><div class="label">Repaint this picture</div>' +
    '<div class="sub">Clears progress on the current picture only</div></div>';
  reset.addEventListener('click', async () => {
    delete S.save.progress[S.puzzle.id];
    persist(true);
    closePanel();
    await loadPuzzle(S.puzzle.id);
  });
  body.append(reset);
}

function syncSoundIcon() {
  document.querySelector('[data-act="settings"]')
    ?.classList.toggle('on', !!S.save.settings.sound);
}

/* ------------------------------------------------------------------ chrome */

document.addEventListener('click', async (e) => {
  const button = e.target.closest('[data-act]');
  const act = button?.dataset.act;
  if (!act) return;
  switch (act) {
    case 'minimise': api.minimise(); break;
    case 'close': persist(true); api.close(); break;
    case 'pin': {
      const on = await api.toggleAlwaysOnTop();
      button.classList.toggle('on', on);
      break;
    }
    case 'pictures': case 'trophies': case 'settings':
      if (S.panel === act) closePanel();
      else await openPanel(act);
      break;
    case 'panel-close': closePanel(); break;
    case 'next': $('finish').classList.add('hidden'); await nextPuzzle(); break;
    default: break;
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') return closePanel();
  if (e.key >= '1' && e.key <= '9') return selectTub(Number(e.key) - 1, true);
  if (e.key === '0') return selectTub(9, true);
  return undefined;
});

// Frameless transparent windows have flaky native resize edges, so the grip
// drives the window size through IPC instead.
{
  const grip = $('grip');
  let anchor = null;
  grip.addEventListener('pointerdown', (e) => {
    anchor = { x: e.screenX, y: e.screenY };
    grip.setPointerCapture(e.pointerId);
  });
  grip.addEventListener('pointermove', (e) => {
    if (!anchor) return;
    api.resizeBy(e.screenX - anchor.x, e.screenY - anchor.y);
    anchor = { x: e.screenX, y: e.screenY };
  });
  const stop = () => { anchor = null; };
  grip.addEventListener('pointerup', stop);
  grip.addEventListener('pointercancel', stop);
}

// Drop an image anywhere on the window to add it. dragenter/dragleave fire for
// every child element the cursor crosses, so track depth rather than toggling
// on each event or the hint strobes.
{
  let depth = 0;
  const clear = () => {
    depth = 0;
    $('app').classList.remove('dropping');
  };
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('dragenter', (e) => {
    e.preventDefault();
    depth++;
    if (!S.importing) $('app').classList.add('dropping');
  });
  window.addEventListener('dragleave', () => {
    if (--depth <= 0) clear();
  });
  window.addEventListener('drop', async (e) => {
    e.preventDefault();
    clear();
    const files = imagesFromDrop(e);
    if (files.length) await runImport(files, $('panelBody'));
  });
}

const ro = new ResizeObserver(() => {
  board.layout();
  board.dirty = true;
});

/* -------------------------------------------------------------------- boot */

async function boot() {
  api = await createPlatform();
  if (!api) {
    document.body.innerHTML =
      '<div class="empty">paintblob needs somewhere to save your progress, and this ' +
      'browser will not allow it. Private browsing usually blocks storage — try a ' +
      'normal window.</div>';
    return;
  }

  // Window chrome only means something on the desktop; on a phone the title
  // bar buttons and resize grip are noise.
  document.documentElement.classList.add(api.isDesktop ? 'is-desktop' : 'is-web');

  S.save = await api.readSave();
  S.save.settings.speed ??= 1;
  S.save.stats.mutedCells ??= 0;
  S.save.stats.patientLandings ??= 0;
  S.save.settings.detail ??= 'normal';
  // Phones have far less GPU headroom than a laptop, and the burst is the most
  // expensive thing here. Start them lighter; the slider still goes to 1.6.
  S.save.settings.density ??= matchMedia('(pointer: coarse)').matches ? 0.7 : 1;

  sfx = new Sfx({ enabled: S.save.settings.sound !== false, volume: S.save.settings.volume ?? 0.7 });
  achievements = new Achievements(S.save.unlocked);
  achievements.onUnlock((def) => {
    toast(def);
    sfx.play('achievement');
    persist();
  });

  document.querySelector('[data-act="pin"]')
    ?.classList.toggle('on', S.save.settings.alwaysOnTop !== false);
  syncSoundIcon();

  S.manifest = await api.listPuzzles();
  ro.observe($('stage'));

  if (!S.manifest.length) {
    await openPanel('pictures');
    return;
  }

  const preferred = S.save.settings.lastPuzzle;
  const first = S.manifest.find((p) => p.id === preferred)
    ?? S.manifest.find((p) => !S.save.progress[p.id]?.done)
    ?? S.manifest[0];

  await loadPuzzle(first.id);
  ensureFrame();
}

boot();
