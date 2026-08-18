import { Board } from './render.js';
import { Burst, audioCue } from './paint-fx.js';
import { Sfx } from './audio.js';
import { ACHIEVEMENTS, Achievements, StreakTracker } from './achievements.js';
import { accruePassiveHint, grantHints, spendHint, pickHintTarget } from './hints.js';
import { prepareCells, cellAt, cellNear } from './geometry.js';
import { importImages, imagesFromDrop } from './import.js';
import { createPlatform } from './platform.js';
import {
  buildAvatarSVG, defaultAvatarCustomize, DEFAULT_PALETTE, VARIANTS, setVariant,
  RACE_PROFILE, raceSkinPalette,
} from './avatar.js';
import { grantPoints, spendPoints, levelForPoints, pointsIntoLevel } from './points.js';
import {
  ABILITIES, defaultAbilityState, getDef, isUnlocked, grantLevelUpCharges,
  activate as activateAbility, isActive as isAbilityActive, consumeActive,
  NUMBER_RECOLOR_CYCLE, nextNumberRecolorIndex,
} from './abilities.js';
import { WARDROBE_ITEMS } from './wardrobe.js';

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
  hintsThisPuzzle: 0,
  pending: new Set(), // cells with a burst already in flight, claimed but not yet filled
  avatarTab: 'customize', // UI-only, not persisted — resets to Customize each time the panel opens
  avatarSlot: null,       // which avatar part is currently being recoloured
};

// Read-only handle for the smoke test (electron/main.cjs) so it can click a
// real cell instead of spraying screen coordinates and hoping one lands —
// normal play never touches this.
window.__paintblobTest = { board, state: S };

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
      avatar: S.save.avatar,
    });
  };
  if (immediate) flush();
  else saveTimer = setTimeout(flush, 900);
}

/* -------------------------------------------------------------------- toasts */

/**
 * @param {object} def  { icon, name, desc }
 * @param {string} [reward]  e.g. "+2✦", appended to desc
 * @param {object} o
 * @param {boolean} [o.sticky]  an achievement is worth reading properly, so
 *   it waits for a click rather than fading on its own timer like an
 *   ordinary status toast does.
 */
function toast(def, reward = '', { sticky = false } = {}) {
  const el = document.createElement('div');
  el.className = sticky ? 'toast sticky' : 'toast';
  el.innerHTML = `<span class="glyph"></span><span><span class="name"></span><br><span class="desc"></span></span>`;
  el.querySelector('.glyph').textContent = def.icon;
  el.querySelector('.name').textContent = def.name;
  el.querySelector('.desc').textContent = reward ? `${def.desc}  ${reward}` : def.desc;
  $('toasts').append(el);

  const dismiss = () => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 320);
  };
  if (sticky) el.addEventListener('click', dismiss, { once: true });
  else setTimeout(dismiss, 3800);

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
  // Detailed pictures can carry eighteen colours. At full size that eats three
  // rows of a phone screen, so the tubs shrink rather than the picture.
  wrap.classList.toggle('many', S.puzzle.palette.length > 12);
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
  // A blind pack's title stays hidden in the bar too, or painting the
  // picture would not be what gave it away.
  const title = S.puzzle.blind && !S.finished ? 'Mystery picture' : S.puzzle.title;
  $('barSubtitle').textContent = S.finished
    ? title
    : `${title} · ${S.filled.size}/${total}`;
}

function syncHints() {
  const btn = document.querySelector('[data-act="hint"]');
  if (!btn) return;
  const n = S.save.stats.hints ?? 0;
  btn.querySelector('.badge').textContent = String(n);
  btn.classList.toggle('empty', n <= 0);
}

function syncZoom() {
  const pill = $('zoomPill');
  if (!pill) return;
  const pct = Math.round(board.zoom * 100);
  pill.classList.toggle('hidden', pct <= 100);
  pill.textContent = `${pct}%`;
  $('board').classList.toggle('zoomed', pct > 100);
}

/** The compare-to-photo pill only ever appears once a picture is finished —
 *  and only if this one actually has a photo to compare against, which an
 *  older save from before this feature existed will not. */
function syncCompare() {
  const pill = $('comparePill');
  if (!pill) return;
  pill.classList.toggle('hidden', !(S.finished && S.puzzle?.sourceImage));
  pill.textContent = board.showSource ? '🎨 Painting' : '🖼 Photo';
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
  S.hintsThisPuzzle = 0;
  S.pending.clear();

  S.remaining = puzzle.palette.map(() => 0);
  for (const cell of S.cells) if (!S.filled.has(cell.id)) S.remaining[cell.colour]++;

  streaks.reset();
  board.setPuzzle(puzzle, S.cells, S.filled);
  // setPuzzle() just cleared numberOverride (correct — Colour Flash/Golden
  // Cell reference the outgoing picture's own cells) but Number Recolor's
  // colour choice is deliberately persistent across a puzzle switch, so it
  // needs one explicit re-apply here.
  const recolour = S.save.avatar.abilities['number-recolor'];
  if (recolour?.colourIndex >= 0) {
    board.setNumberOverride(NUMBER_RECOLOR_CYCLE[recolour.colourIndex].hex, 0, performance.now());
  }
  board.reveal = S.finished ? 1 : 0;
  $('board').classList.toggle('done', S.finished);
  $('finish').classList.add('hidden');

  buildTubs();
  board.layout();
  syncZoom(); // board.setPuzzle() already reset zoom for the new picture
  syncCompare(); // ditto showSource
  if (!S.finished) nextTub();

  S.save.settings.lastPuzzle = id;
  persist();
}

/* -------------------------------------------------------------------- input */

function pointerToCell(clientX, clientY) {
  const p = board.toPuzzle(clientX, clientY);
  return { point: p, cell: cellAt(S.cells, p.x, p.y) };
}

// Every pointer currently down on the board, latest {x, y}. A lone pointer
// is undecided — tap or pan? — until it moves; a second pointer landing
// makes it a pinch. Mouse and touch share this one path, which is what lets
// zoom and pan work identically everywhere rather than only on a phone.
const pointers = new Map();
const DRAG_PX = 6;   // movement past this abandons a tap for a pan
let tap = null;      // { id, x0, y0 } — sole pointer, decision pending
let panning = null;  // { id, x, y } — single-pointer pan in progress
let pinch = null;    // { ids, dist, zoom, midX, midY } — two-finger gesture

$('board').addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId)) {
    // No gesture claims this pointer: the plain hover-outline path. A finger
    // has no hover state, and touch drags would otherwise leave an outline
    // stranded under wherever the thumb last was.
    if (S.finished || e.pointerType === 'touch') return;
    const { cell } = pointerToCell(e.clientX, e.clientY);
    // Idle frames are throttled to 30fps; force the next one so the hover
    // outline tracks the cursor rather than lagging behind it.
    if (board.setHover(cell && !S.filled.has(cell.id) ? cell.id : -1)) lastDraw = 0;
    return;
  }
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (pinch) {
    const [a, b] = pinch.ids.map((id) => pointers.get(id));
    if (!a || !b) return;
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;
    if (dist > 0 && pinch.dist > 0) board.setZoom(pinch.zoom * (dist / pinch.dist), midX, midY);
    board.panBy(midX - pinch.midX, midY - pinch.midY);
    pinch.midX = midX;
    pinch.midY = midY;
    syncZoom();
    ensureFrame();
    return;
  }

  if (panning) {
    const p = pointers.get(panning.id);
    board.panBy(p.x - panning.x, p.y - panning.y);
    panning.x = p.x;
    panning.y = p.y;
    ensureFrame();
    return;
  }

  if (tap && Math.hypot(e.clientX - tap.x0, e.clientY - tap.y0) > DRAG_PX) {
    // Moved far enough that this was never going to be a tap — pan instead,
    // the way any zoomable map or image viewer treats a drag.
    panning = { id: tap.id, x: e.clientX, y: e.clientY };
    board.setHover(-1);
    tap = null;
  }
});

$('board').addEventListener('pointerleave', () => board.setHover(-1));

$('board').addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return; // zoom/pan still work once finished — tryPaint blocks the paint itself
  sfx.ensure();
  S.idleSinceBurst = false;
  // Not every pointer session honours capture (synthetic test events among
  // them); painting and panning both work fine without it, so a failure here
  // is not worth losing the gesture over.
  try { board.canvas.setPointerCapture(e.pointerId); } catch { /* best-effort */ }
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (pointers.size === 2) {
    // A second finger landed mid-gesture: whatever the first one was doing,
    // a pinch takes over.
    tap = null;
    panning = null;
    const [a, b] = [...pointers.values()];
    pinch = {
      ids: [...pointers.keys()],
      dist: Math.hypot(a.x - b.x, a.y - b.y),
      zoom: board.zoom,
      midX: (a.x + b.x) / 2,
      midY: (a.y + b.y) / 2,
    };
    return;
  }
  if (pointers.size > 2) return; // a third finger is not a gesture this handles

  tap = { id: e.pointerId, x0: e.clientX, y0: e.clientY };
});

function endPointer(e) {
  pointers.delete(e.pointerId);
  if (board.canvas.hasPointerCapture(e.pointerId)) board.canvas.releasePointerCapture(e.pointerId);

  if (pinch) {
    if (pinch.ids.includes(e.pointerId)) pinch = null;
    return;
  }
  if (panning) {
    if (panning.id === e.pointerId) panning = null;
    return;
  }
  if (tap && tap.id === e.pointerId) {
    tryPaint(e.clientX, e.clientY, e.pointerType);
    tap = null;
  }
}
$('board').addEventListener('pointerup', endPointer);
$('board').addEventListener('pointercancel', endPointer);

$('board').addEventListener('wheel', (e) => {
  if (!S.puzzle) return; // zoom still works once finished — painting is what tryPaint blocks
  e.preventDefault();
  // A little steep on purpose: this is a paint-by-number, not a map — a
  // couple of notches should get from fit-to-window to "that cell is huge".
  board.setZoom(board.zoom * Math.exp(-e.deltaY * 0.0018), e.clientX, e.clientY);
  syncZoom();
  ensureFrame();
}, { passive: false });

/** Resolves a settled tap: paint the cell underneath it, if there is one. */
function tryPaint(clientX, clientY, pointerType) {
  if (S.finished) return;
  const { point, cell } = pointerToCell(clientX, clientY);

  // Aimed squarely at an unpainted cell of another colour: that is a genuine
  // mistake and deserves the buzz, not a silent correction — unless Streak
  // Shield is up, which exists precisely to absorb one of these.
  if (cell && !S.filled.has(cell.id) && !S.pending.has(cell.id) && cell.colour !== S.selected) {
    if (isAbilityActive(S.save.avatar.abilities, 'streak-shield', Date.now())) {
      consumeActive(S.save.avatar.abilities, 'streak-shield');
      syncAbilityRow();
      return;
    }
    sfx.play('nope');
    streaks.wrong();
    const tub = $('tubs').children[cell.colour];
    tub?.classList.remove('nudge');
    void tub?.offsetWidth; // restart the animation
    tub?.classList.add('nudge');
    return;
  }

  let target = cell && !S.filled.has(cell.id) && !S.pending.has(cell.id) ? cell : null;
  if (!target) {
    // Missed everything, or landed on a cell already done or already claimed
    // by a burst still in flight. Look just around the point — small cells
    // are fiddly with a mouse and much worse under a fingertip, which covers
    // several at once. Steady Hand widens this further on request.
    const steady = isAbilityActive(S.save.avatar.abilities, 'steady-hand', Date.now()) ? 1.6 : 1;
    const slack = ((pointerType === 'touch' ? 18 : 7) * steady) / board.scale;
    const spokenFor = S.pending.size ? new Set([...S.filled, ...S.pending]) : S.filled;
    target = cellNear(S.cells, point.x, point.y, {
      colour: S.selected,
      filled: spokenFor,
      radius: slack,
    });
  }
  if (!target) return;

  launch(target, point);
}

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
  // Claimed the instant it launches, not when it lands — otherwise a second
  // rapid click on the same cell launches a duplicate burst, and the cell
  // gets double-counted (and the tub's remaining count with it) once both commit.
  S.pending.add(cell.id);

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
  const wasGolden = board.goldenCell?.id === cell.id;
  S.filled.add(cell.id);
  S.pending.delete(cell.id);
  S.remaining[cell.colour]--;
  board.markFilled(cell.id);
  if (wasGolden) board.goldenCell = null;

  S.save.stats.cells++;
  if (!sfx.enabled) S.save.stats.mutedCells = (S.save.stats.mutedCells || 0) + 1;
  if (accruePassiveHint(S.save.stats)) {
    sfx.play('bank');
    syncHints();
  }

  // Points/levels: only a real successful click ever reaches commitFill —
  // tryPaint() returns early on every kind of miss — so this is structurally
  // the one and only place points get granted.
  const surging = isAbilityActive(S.save.avatar.abilities, 'colour-surge', Date.now());
  const award = (wasGolden ? 5 : 1) * (surging ? 2 : 1);
  const beforeLevel = levelForPoints(S.save.stats.pointsEarned);
  grantPoints(S.save.stats, award);
  const afterLevel = levelForPoints(S.save.stats.pointsEarned);
  for (let lv = beforeLevel + 1; lv <= afterLevel; lv++) grantLevelUpCharges(S.save.avatar.abilities, lv);
  if (afterLevel > beforeLevel) {
    toast({ icon: '⭐', name: `Level ${afterLevel}`, desc: 'Your avatar levelled up.' }, '', { sticky: true });
    sfx.play('achievement');
  }
  syncAvatarWidget();
  syncAbilityRow();
  bumpPointsHud(award);

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

/**
 * Half Fill's effect: paints half of the held colour's remaining cells
 * outright. Deliberately bypasses commitFill entirely — no stats.cells++, no
 * points, no streak credit — because no click happened. "Points for each
 * SUCCESSFUL click" means exactly that; this is the one ability that hands
 * over direct progress instead of an edge, so it must never look like one.
 */
function autoFillHalfOfHeldColour() {
  if (S.finished || S.selected < 0) return 0;
  const candidates = S.cells.filter(
    (c) => c.colour === S.selected && !S.filled.has(c.id) && !S.pending.has(c.id),
  );
  const n = Math.ceil(candidates.length / 2);
  for (let i = 0; i < n; i++) {
    const cell = candidates[i];
    S.filled.add(cell.id);
    S.remaining[cell.colour]--;
    board.markFilled(cell.id);
  }
  if (n && S.remaining[S.selected] === 0) {
    achievements.award('tub-empty');
    nextTub();
  }
  syncTubs();
  persist();
  ensureFrame();
  if (S.filled.size === S.cells.length) finish();
  return n;
}

function finish() {
  S.finished = true;
  S.revealFrom = performance.now();
  $('board').classList.add('done');

  S.save.stats.puzzles++;
  if (streaks.wrongClicks === 0) achievements.award('flawless');
  if (S.elapsedMs < 90_000) achievements.award('speedrun');
  if (S.hintsThisPuzzle === 0) achievements.award('unassisted');
  if (S.cells.length >= 100) achievements.award('fine-print');
  if (S.cells.length < 12) achievements.award('minimalist');
  achievements.sync(S.save.stats);

  const secs = Math.round(S.elapsedMs / 1000);
  $('finishName').textContent = S.puzzle.title;
  $('finishStats').textContent =
    `${S.cells.length} cells · ${Math.floor(secs / 60)}m ${String(secs % 60).padStart(2, '0')}s` +
    `${streaks.wrongClicks === 0 ? ' · flawless' : ''}`;

  // A real pause on the finished picture before anything covers it — the
  // 850ms outline fade (S.revealFrom above) is barely long enough to notice
  // it happened, let alone look the picture over. The stats card can wait;
  // it isn't going anywhere, and the ✕ on it backs right out to this same
  // clear view whenever the player is done with it. Guard against the player
  // jumping to another picture in the meantime — the overlay would land on
  // that one.
  const finishing = S.puzzle.id;
  setTimeout(() => {
    if (S.puzzle?.id === finishing && S.finished) $('finish').classList.remove('hidden');
  }, 2800);
  sfx.play('complete');
  syncTubs();
  syncCompare();
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

function useHint() {
  if (S.finished || !S.puzzle) return;
  if (!spendHint(S.save.stats)) {
    sfx.play('nope');
    return;
  }
  const target = pickHintTarget(S.cells, S.filled, S.selected);
  S.hintsThisPuzzle++;
  board.showHint(target.id, performance.now());
  sfx.play('hint');
  achievements.sync(S.save.stats);
  syncHints();
  persist();
  ensureFrame();
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
  // numberOverride is deliberately excluded: it's now an indefinite,
  // static colour choice rather than a timed effect counting down, so
  // pinning the loop to full framerate for it would never stop once the
  // ability is used even once. drawBase() already redraws it correctly the
  // instant it changes (setNumberOverride() sets dirty = true itself); the
  // ordinary lazy 30fps idle cadence below covers the rest.
  const busy = S.bursts.length > 0 || S.revealFrom > 0 || board.hintTarget
    || board.colourFlash || board.goldenCell;
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
  $('panelTitle').textContent = kind === 'pictures' ? 'Pictures'
    : kind === 'trophies' ? 'Achievements'
    : kind === 'avatar' ? 'Avatar'
    : 'Settings';
  $('panel').classList.remove('hidden');
  // The panel sits at a lower z-index than #stage's floating pills so a
  // conditionally-shown one (zoom/compare) can still surface above it if
  // ever needed — but the points HUD is unconditional, and top-center is
  // exactly where the avatar panel's own preview sits, so it needs an
  // explicit hide here rather than relying on z-index alone.
  $('pointsHud').classList.add('hidden');

  if (kind === 'pictures') {
    // Re-read the manifest rather than trusting the copy from startup, so a
    // picture mapified while the app was open shows up without a restart.
    S.manifest = await api.listPuzzles();
    if (S.panel !== kind) return; // closed again while we were waiting
    renderPictures(body);
  } else if (kind === 'trophies') {
    renderTrophies(body);
  } else if (kind === 'avatar') {
    renderAvatarPanel(body);
  } else {
    renderSettings(body);
  }
}

function closePanel() {
  S.panel = null;
  $('panel').classList.add('hidden');
  $('pointsHud').classList.remove('hidden');
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
    // A blind pack drop is unsolved until you finish it — the title and the
    // colours actually in it would both give the picture away early.
    const hidden = p.blind && !done;

    const el = row(`clickable ${p.id === S.puzzle?.id ? 'current' : ''}`);
    const sw = document.createElement('div');
    sw.className = 'swatches';
    if (!hidden) {
      for (const hex of p.thumb ?? []) {
        const i = document.createElement('i');
        i.style.background = hex;
        sw.append(i);
      }
    }

    const text = document.createElement('div');
    text.className = 'grow';
    text.innerHTML = '<div class="label"></div><div class="sub"></div>';
    text.querySelector('.label').textContent = hidden ? 'Mystery picture' : p.title;
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
      remove.title = `Remove ${hidden ? 'this mystery picture' : p.title}`;
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
    try {
      const picked = await api.pickImage();
      // Windows: no OS dialog is ever opened (its shell-extension machinery
      // crashed the process on open). The main process says so, and the button
      // becomes a guide to the two dialog-free routes instead.
      if (picked?.dialogFree) {
        showAddGuide();
        return;
      }
      if (!picked?.length) return;
      await runImport(picked.map((f) => ({ name: f.name, blob: new Blob([f.bytes]) })), body);
    } catch (err) {
      // A rejected file dialog or a failed read would otherwise vanish into an
      // unhandled rejection and leave the button looking dead.
      S.importing = false;
      toast({ icon: '⚠️', name: 'Could not add that picture', desc: err.message });
    }
  });

  const detail = document.createElement('div');
  detail.className = 'segmented';
  for (const key of ['chunky', 'normal', 'detailed', 'insane']) {
    const option = document.createElement('button');
    option.textContent = key[0].toUpperCase() + key.slice(1);
    option.className = S.save.settings.detail === key ? 'on' : '';
    option.title = {
      chunky: 'Fewer, bigger cells',
      normal: 'A balanced picture',
      detailed: 'More cells, finer shapes',
      insane: 'So many cells the tiny ones trade their number for a stripe',
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
  hint.textContent =
    'or drop an image on the window (a .zip of them for a surprise), or press Ctrl/Cmd+V to paste one';

  wrap.append(button, detail, hint);
  return wrap;
}

/* On platforms where the Add button cannot open an OS dialog, it repurposes
   the drop overlay as an instruction card: drag a file in, or paste. Both use
   the exact import path below and neither touches a native dialog. */
let dismissAddGuide = null;

function showAddGuide() {
  if (dismissAddGuide) return;
  const drop = $('drop');
  const label = drop.querySelector('span');
  const original = label.textContent;

  label.textContent = 'Drag a picture here from your folder, or press Ctrl+V to paste one — click to dismiss';
  drop.classList.add('guide');
  $('app').classList.add('dropping');

  const onClick = () => dismissAddGuide?.();
  dismissAddGuide = () => {
    drop.classList.remove('guide');
    $('app').classList.remove('dropping');
    label.textContent = original;
    drop.removeEventListener('click', onClick);
    dismissAddGuide = null;
  };
  drop.addEventListener('click', onClick);
}

/** Shared by the button and drag-and-drop. */
async function runImport(files, body) {
  if (S.importing || !files.length) return;
  dismissAddGuide?.(); // the guide's advice was followed; get out of the way
  S.importing = true;

  const status = document.createElement('div');
  status.className = 'empty';
  const panelOpen = !$('panel').classList.contains('hidden');
  if (panelOpen && body) {
    body.textContent = '';
    body.append(status);
  }

  let result = { added: [], failed: [] };
  try {
    result = await importImages(files, {
      api,
      detail: S.save.settings.detail ?? 'normal',
      taken: new Set(S.manifest.map((p) => p.id)),
      onProgress: (name, i, total, blind) => {
        // A blind pack's filenames are as much a spoiler as its title —
        // "Mapping sunset-over-mountains…" gives it away before it opens.
        const label = blind ? 'a mystery picture' : name;
        status.textContent = total > 1
          ? `Mapping ${label}…  (${i + 1} of ${total})`
          : `Mapping ${label}…`;
      },
    });
    S.manifest = await api.listPuzzles();
  } catch (err) {
    // Anything that escapes the per-file handling. Without this the busy flag
    // stays set and every later attempt silently does nothing, which looks
    // exactly like the app having broken.
    result.failed.push({ name: files[0]?.name ?? 'that picture', reason: err.message });
  } finally {
    S.importing = false;
  }

  for (const p of result.added) {
    S.save.stats.imported = (S.save.stats.imported ?? 0) + 1;
    if (p.photoLike) achievements.award('import-photo');
    toast(p.blind ? {
      icon: '🎁',
      name: 'Added a mystery picture',
      desc: `${p.cells} cells — finish it to find out what it is`,
    } : {
      icon: '🖼️',
      name: `Added ${p.title}`,
      desc: `${p.cells} cells · ${p.colours} colours`,
    });
  }
  if (result.added.length) achievements.sync(S.save.stats);
  for (const f of result.failed) {
    toast({
      icon: '⚠️',
      name: f.blind ? 'Could not add a mystery picture' : `Could not add ${f.name}`,
      desc: f.reason,
    });
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
    `${S.save.stats.cells.toLocaleString()} cells painted · ` +
    `${(S.save.stats.hints ?? 0).toLocaleString()}✦ in hand`;
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

    const reward = document.createElement('span');
    reward.className = 'reward';
    reward.textContent = `+${a.hint ?? 1}✦`;
    el.append(reward);

    body.append(el);
  }
}

/* --------------------------------------------------------------------- avatar */

function wireAvatarPartClicks(stageEl) {
  stageEl.addEventListener('click', (e) => {
    const part = e.target.closest('[data-slot]');
    if (!part) return;
    S.avatarSlot = part.dataset.slot;
    S.avatarTab = 'customize';
    renderAvatarPanel($('panelBody'));
  });
}

function renderAvatarPanel(body) {
  body.textContent = '';
  const customize = S.save.avatar.customize;
  const level = levelForPoints(S.save.stats.pointsEarned);
  const { into, span } = pointsIntoLevel(S.save.stats.pointsEarned);

  const head = document.createElement('div');
  head.className = 'avatar-head';
  const stage = document.createElement('div');
  stage.className = 'avatar-stage';
  stage.innerHTML = buildAvatarSVG(customize);
  wireAvatarPartClicks(stage);

  const levelbar = document.createElement('div');
  levelbar.className = 'avatar-levelbar';
  const label = document.createElement('div');
  label.className = 'label';
  label.textContent = `Level ${level} · ${S.save.stats.points ?? 0}🪙 to spend`;
  const bar = document.createElement('div');
  bar.className = 'bar';
  const fill = document.createElement('i');
  fill.style.width = `${span ? (into / span) * 100 : 100}%`;
  bar.append(fill);
  levelbar.append(label, bar);
  head.append(stage, levelbar);
  body.append(head);

  const tabs = document.createElement('div');
  tabs.className = 'segmented avatar-tabs';
  for (const key of ['customize', 'outfits', 'abilities']) {
    const btn = document.createElement('button');
    btn.textContent = key[0].toUpperCase() + key.slice(1);
    btn.className = S.avatarTab === key ? 'on' : '';
    btn.addEventListener('click', () => {
      S.avatarTab = key;
      renderAvatarPanel(body);
    });
    tabs.append(btn);
  }
  body.append(tabs);

  const section = document.createElement('div');
  section.className = 'avatar-section';
  body.append(section);

  if (S.avatarTab === 'outfits') renderAvatarOutfits(section, stage);
  else if (S.avatarTab === 'abilities') renderAvatarAbilities(section);
  else renderAvatarCustomize(section, stage);
}

function renderAvatarCustomize(section, stage) {
  const customize = S.save.avatar.customize;
  const redraw = () => {
    stage.innerHTML = buildAvatarSVG(customize);
    wireAvatarPartClicks(stage);
    persist();
    syncAvatarWidget();
  };

  const pick = (label, options, get, set, wrap = false) => {
    const r = row();
    const text = document.createElement('div');
    text.className = 'label';
    text.style.width = '68px';
    text.textContent = label;
    const seg = document.createElement('div');
    // `.segmented` is overflow:hidden with no wrap, so a six-option row
    // would silently clip its last buttons off the end.
    seg.className = wrap ? 'segmented grow wrap' : 'segmented grow';
    for (const opt of options) {
      const b = document.createElement('button');
      b.textContent = opt[0].toUpperCase() + opt.slice(1);
      b.className = get() === opt ? 'on' : '';
      b.addEventListener('click', () => {
        set(opt);
        redraw();
        [...seg.children].forEach((c) => c.classList.toggle('on', c === b));
      });
      seg.append(b);
    }
    r.append(text, seg);
    section.append(r);
  };

  pick('Race', VARIANTS.race, () => customize.race, (v) => setVariant(customize, 'race', v), true);
  pick('Gender', VARIANTS.gender, () => customize.gender, (v) => setVariant(customize, 'gender', v));
  pick('Hair', VARIANTS.hairStyle, () => customize.hair.style, (v) => setVariant(customize, 'hair', v));
  pick('Eyes', VARIANTS.eyesStyle, () => customize.eyes.style, (v) => setVariant(customize, 'eyes', v));
  pick('Face', VARIANTS.faceShape, () => customize.face.shape, (v) => setVariant(customize, 'face', v));

  const sizeSlider = (label, key, min, max, step) => {
    const r = row();
    const text = document.createElement('div');
    text.className = 'label';
    text.style.width = '68px';
    text.textContent = label;
    const field = document.createElement('div');
    field.className = 'field grow';
    const input = document.createElement('input');
    input.type = 'range';
    input.min = min;
    input.max = max;
    input.step = step;
    input.value = customize[key];
    const value = document.createElement('span');
    value.className = 'value';
    value.textContent = `${Math.round(customize[key] * 100)}%`;
    input.addEventListener('input', () => {
      customize[key] = Number(input.value);
      value.textContent = `${Math.round(customize[key] * 100)}%`;
      redraw();
    });
    field.append(input, value);
    r.append(text, field);
    section.append(r);
  };
  sizeSlider('Height', 'height', 0.85, 1.2, 0.01);
  sizeSlider('Weight', 'weight', 0.8, 1.3, 0.01);

  const hint = document.createElement('div');
  hint.className = 'empty';
  hint.textContent = S.avatarSlot
    ? `Recolouring: ${S.avatarSlot}`
    : 'Tap a part of your avatar above to recolour it.';
  section.append(hint);

  const target = S.avatarSlot && customize[S.avatarSlot];
  if (target && 'colour' in target) {
    const swatchRow = (hexes) => {
      const swatches = document.createElement('div');
      swatches.className = 'swatch-row';
      for (const hex of hexes) {
        const sw = document.createElement('button');
        sw.className = 'swatch';
        sw.style.background = hex;
        sw.title = hex;
        sw.addEventListener('click', () => {
          target.colour = hex;
          redraw();
        });
        swatches.append(sw);
      }
      return swatches;
    };
    // Skin gets its race's own tones offered first — green is a long way
    // from anything a landscape's palette will hand you — but the paint
    // from the current picture stays right below it, unchanged.
    if (S.avatarSlot === 'skin') {
      const label = document.createElement('div');
      label.className = 'empty';
      label.style.padding = '2px 4px 0';
      label.textContent = `${RACE_PROFILE[customize.race]?.label ?? 'Human'} skin tones`;
      section.append(label, swatchRow(raceSkinPalette(customize.race)));
    }
    section.append(swatchRow(S.puzzle?.palette?.map((p) => p.hex) ?? DEFAULT_PALETTE));
  }
}

function renderAvatarOutfits(section, stage) {
  const customize = S.save.avatar.customize;
  const owned = new Set(S.save.avatar.unlocked);

  const head = document.createElement('div');
  head.className = 'empty';
  head.style.padding = '2px 4px 8px';
  head.textContent = `${owned.size} of ${WARDROBE_ITEMS.length} owned · ${S.save.stats.points ?? 0}🪙 to spend`;
  section.append(head);

  const redraw = () => {
    stage.innerHTML = buildAvatarSVG(customize);
    wireAvatarPartClicks(stage);
    persist();
    syncAvatarWidget();
    renderAvatarPanel($('panelBody'));
  };

  for (const item of WARDROBE_ITEMS) {
    const has = owned.has(item.id);
    const equipped = customize[item.slot]?.itemId === item.id;
    const el = row(has ? 'clickable' : 'locked');
    const text = document.createElement('div');
    text.className = 'grow';
    text.innerHTML = '<div class="label"></div><div class="sub"></div>';
    text.querySelector('.label').textContent = item.name;
    text.querySelector('.sub').textContent = equipped
      ? 'equipped'
      : has
        ? 'owned · tap to equip'
        : item.source === 'achievement' ? 'earned from an achievement' : `${item.price}🪙`;
    el.append(text);

    if (equipped) {
      const tick = document.createElement('span');
      tick.className = 'glyph';
      tick.textContent = '✓';
      el.append(tick);
      if (item.slot === 'dress') {
        el.classList.add('clickable');
        el.title = 'Tap to remove the dress';
        el.addEventListener('click', () => {
          customize.dress.itemId = null;
          redraw();
        });
      }
    } else if (has) {
      el.addEventListener('click', () => {
        customize[item.slot].itemId = item.id;
        redraw();
      });
    } else if (item.source === 'store') {
      const buy = document.createElement('button');
      buy.className = 'primary';
      buy.textContent = 'Buy';
      buy.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!spendPoints(S.save.stats, item.price)) {
          sfx.play('nope');
          return;
        }
        S.save.avatar.unlocked.push(item.id);
        toast({ icon: '👕', name: `Unlocked ${item.name}`, desc: 'Equip it from Outfits.' });
        redraw();
      });
      el.append(buy);
    }
    section.append(el);
  }
}

function renderAvatarAbilities(section) {
  const level = levelForPoints(S.save.stats.pointsEarned);

  for (const def of ABILITIES) {
    const unlocked = isUnlocked(def, level);
    const s = S.save.avatar.abilities[def.id] ?? { charges: 0 };
    const el = row(unlocked ? 'clickable' : 'locked');
    const glyph = document.createElement('span');
    glyph.className = 'glyph';
    glyph.textContent = unlocked ? def.icon : '🔒';

    const text = document.createElement('div');
    text.className = 'grow';
    text.innerHTML = '<div class="label"></div><div class="sub"></div>';
    text.querySelector('.label').textContent = def.name;
    text.querySelector('.sub').textContent = unlocked ? def.desc : `Unlocks at level ${def.unlockLevel}`;
    el.append(text);

    if (unlocked) {
      const reward = document.createElement('span');
      reward.className = 'reward';
      reward.textContent = `${s.charges}/${def.maxCharges}`;
      el.append(reward);
      el.addEventListener('click', () => {
        triggerAbility(def.id);
        renderAvatarPanel($('panelBody'));
      });
    }
    section.append(el);
  }
}

function triggerAbility(id) {
  if (!S.puzzle || S.finished) return;
  const def = getDef(id);
  const level = levelForPoints(S.save.stats.pointsEarned);
  if (!def || !isUnlocked(def, level)) return;
  const now = Date.now();
  if (!activateAbility(S.save.avatar.abilities, id, now)) {
    sfx.play('nope');
    return;
  }

  switch (id) {
    case 'precision-ping': {
      const target = pickHintTarget(S.cells, S.filled, S.selected);
      if (target) board.showHint(target.id, performance.now());
      break;
    }
    case 'number-recolor': {
      const s = S.save.avatar.abilities['number-recolor'];
      s.colourIndex = nextNumberRecolorIndex(s.colourIndex);
      board.setNumberOverride(NUMBER_RECOLOR_CYCLE[s.colourIndex].hex, 0, performance.now());
      break;
    }
    case 'colour-flash':
      if (S.selected >= 0) board.flashColour(S.selected, performance.now(), def.durationMs);
      break;
    case 'golden-cell': {
      const pool = S.cells.filter((c) => c.colour === S.selected && !S.filled.has(c.id));
      if (pool.length) {
        const cell = pool[Math.floor(Math.random() * pool.length)];
        board.markGolden(cell.id, def.durationMs, performance.now());
      }
      break;
    }
    case 'half-fill': {
      const n = autoFillHalfOfHeldColour();
      toast({ icon: def.icon, name: def.name, desc: `Auto-painted ${n} cells` });
      break;
    }
    // steady-hand, colour-surge, streak-shield: the activation window set by
    // activateAbility() above IS the whole effect — tryPaint()/commitFill()
    // read it back directly via isAbilityActive()/consumeActive().
    default:
      break;
  }
  sfx.play('pick', 3);
  persist();
  syncAbilityRow();
  ensureFrame();
}

function syncAvatarWidget() {
  if (!S.save) return;
  const pill = $('avatarPill');
  if (pill) {
    const level = levelForPoints(S.save.stats.pointsEarned);
    pill.innerHTML = `${buildAvatarSVG(S.save.avatar.customize)}<span class="level-badge">${level}</span>`;
  }
  const value = $('pointsValue');
  if (value) value.textContent = String(S.save.stats.points ?? 0);
}

/** Per-click feedback for the points HUD: a quick pulse on the pill itself,
 *  plus a "+N" that floats up and fades — commitFill() is the only granting
 *  site (Half Fill bypasses it on purpose), so this is the only call site. */
function bumpPointsHud(award) {
  const hud = $('pointsHud');
  if (hud) {
    hud.classList.remove('bump');
    void hud.offsetWidth; // restart the animation even if one is still mid-flight
    hud.classList.add('bump');
  }
  const layer = $('pointsFx');
  if (!layer) return;
  const el = document.createElement('span');
  el.className = 'points-fx-bump';
  el.textContent = `+${award}`;
  layer.append(el);
  el.addEventListener('animationend', () => el.remove(), { once: true });
  while (layer.children.length > 6) layer.children[0].remove();
}

function syncAbilityRow() {
  const wrap = $('abilityRow');
  if (!wrap || !S.save) return;
  const level = levelForPoints(S.save.stats.pointsEarned);
  wrap.textContent = '';
  for (const def of ABILITIES) {
    if (!isUnlocked(def, level)) continue;
    const s = S.save.avatar.abilities[def.id] ?? { charges: 0 };
    const btn = document.createElement('button');
    btn.className = 'ability-btn';
    btn.classList.toggle('empty', s.charges <= 0);
    btn.dataset.ability = def.id;
    btn.title = `${def.name} — ${s.charges}/${def.maxCharges}`;
    btn.textContent = def.icon;
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = String(s.charges);
    btn.append(badge);
    wrap.append(btn);
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
      achievements.award('free-spirit');
      break;
    }
    case 'hint': useHint(); break;
    case 'zoom-reset': board.resetZoom(); syncZoom(); ensureFrame(); break;
    case 'toggle-source': board.setShowSource(!board.showSource); syncCompare(); ensureFrame(); break;
    case 'pictures': case 'trophies': case 'settings': case 'avatar':
      if (S.panel === act) closePanel();
      else await openPanel(act);
      break;
    case 'panel-close': closePanel(); break;
    case 'next': $('finish').classList.add('hidden'); await nextPuzzle(); break;
    case 'finish-dismiss': $('finish').classList.add('hidden'); break;
    default: break;
  }
});

// The finish card is a small island in a dark overlay — clicking the dark
// part, same as the close button, dismisses it without leaving the picture.
$('finish').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) $('finish').classList.add('hidden');
});

// A repeated list of icon buttons keyed by ability id, not a single fixed
// [data-act] — its own small delegated listener rather than overloading the
// chrome switch above with a dynamic case.
$('abilityRow').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-ability]');
  if (btn) triggerAbility(btn.dataset.ability);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (dismissAddGuide) return dismissAddGuide();
    return closePanel();
  }
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

// Paste an image straight in. No file chooser is involved, which matters:
// the chooser is the one part of adding a picture that cannot be exercised
// without a real user gesture, and so the one part that keeps shipping broken.
window.addEventListener('paste', async (e) => {
  const files = [...(e.clipboardData?.items ?? [])]
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item) => item.getAsFile())
    .filter(Boolean)
    .map((file, i) => ({
      name: file.name ? file.name.replace(/\.[^.]+$/, '') : `pasted ${i + 1}`,
      blob: file,
    }));
  if (!files.length) return;
  e.preventDefault();
  await runImport(files, $('panelBody'));
});

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
    const files = await imagesFromDrop(e);
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
  S.save.stats.hints ??= 0;
  S.save.stats.hintsEarned ??= 0;
  S.save.stats.hintsUsed ??= 0;
  S.save.stats.imported ??= 0;
  S.save.stats.daysVisited ??= 0;
  S.save.stats.points ??= 0;
  S.save.stats.pointsEarned ??= 0;
  S.save.settings.detail ??= 'normal';

  // A save from before this feature existed has no `avatar` key at all — the
  // DEFAULT_SAVE merge in platform.js/main.cjs already covers that case with
  // a complete literal. What it can't cover is a save that already HAS an
  // avatar (this feature already shipped) but predates a newly added
  // ability — abilities.js's own defaults backfill any charge state missing
  // from what was saved, same idea as the ??= lines above.
  const starterItems = WARDROBE_ITEMS.filter((i) => i.source === 'starter').map((i) => i.id);
  S.save.avatar ??= { customize: defaultAvatarCustomize(), unlocked: starterItems, abilities: {} };
  S.save.avatar.customize ??= defaultAvatarCustomize();
  // Neither backend deep-merges `avatar` — an existing save's avatar object
  // replaces DEFAULT_SAVE.avatar wholesale — so adding `race` to those two
  // literals only ever reaches a brand-new save. This backfill is the only
  // thing that gets it to a returning player.
  S.save.avatar.customize.race ??= 'human';
  S.save.avatar.unlocked ??= starterItems;
  S.save.avatar.abilities = { ...defaultAbilityState(), ...S.save.avatar.abilities };
  // Phones have far less GPU headroom than a laptop, and the burst is the most
  // expensive thing here. Start them lighter; the slider still goes to 1.6.
  S.save.settings.density ??= matchMedia('(pointer: coarse)').matches ? 0.7 : 1;

  // Counts distinct calendar days the app has been opened on, not a strict
  // login streak — missing a day should not cost you a ladder you were on.
  const today = new Date().toDateString();
  if (S.save.stats.lastVisitDay !== today) {
    S.save.stats.lastVisitDay = today;
    S.save.stats.daysVisited++;
  }

  sfx = new Sfx({ enabled: S.save.settings.sound !== false, volume: S.save.settings.volume ?? 0.7 });
  achievements = new Achievements(S.save.unlocked);
  achievements.onUnlock((def) => {
    const reward = def.hint ?? 1;
    grantHints(S.save.stats, reward);
    syncHints();
    if (def.outfit && !S.save.avatar.unlocked.includes(def.outfit)) {
      S.save.avatar.unlocked.push(def.outfit);
      syncAvatarWidget();
    }
    toast(def, `+${reward}✦`, { sticky: true });
    sfx.play('achievement');
    persist();
  });
  achievements.sync(S.save.stats);

  // sync() only fires onUnlock for a threshold NEWLY crossed this boot — a
  // player who already earned blob-1000/pic-10 in a past session, before
  // this feature existed, has that id sitting in achievements.unlocked
  // already, so onUnlock never re-fires for it and the tied outfit would
  // otherwise never arrive. Backfill from the full unlocked set instead.
  for (const def of ACHIEVEMENTS) {
    if (def.outfit && achievements.has(def.id) && !S.save.avatar.unlocked.includes(def.outfit)) {
      S.save.avatar.unlocked.push(def.outfit);
    }
  }

  document.querySelector('[data-act="pin"]')
    ?.classList.toggle('on', S.save.settings.alwaysOnTop !== false);
  syncSoundIcon();
  syncHints();
  syncAvatarWidget();
  syncAbilityRow();

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
