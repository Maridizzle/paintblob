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
import { outlineSVG, outlineWeight } from './thumbnail.js';
import { computePlayStats } from './playstats.js';
import { Tour } from './tour.js';
import {
  ROOMS, HOUSE_ITEMS, LIGHTING, PETS, PROP_SLOTS, SLOT_LABEL,
  defaultHouse, itemsFor, starterFor, buildRoomSVG, colourablesIn, colourKey,
  PET_NEEDS, defaultPetStats, applyPetDecay, carePet, petMood,
} from './house.js';

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
  // What undo gives back, newest last. Per-sitting rather than saved: an
  // unbounded array of every cell ever painted does not belong in a save file,
  // and reopening a picture is a fresh start on it anyway.
  history: [],
  avatarTab: 'customize', // UI-only, not persisted — resets to Customize each time the panel opens
  abilityFan: false,      // is the ability pop-up up? Also UI-only: always starts down
  // How the Pictures list is filtered. UI-only, like the two above: it resets
  // to "show everything, A–Z" every time the panel opens, so the list you land
  // on is always the whole list.
  picFilter: { q: '', status: 'all', source: 'all', size: 'all', difficulty: 'all', theme: 'all', sort: 'az' },
  avatarSlot: null,       // which avatar part is currently being recoloured
  previewId: null,        // picture whose large preview is open or pending
  previewTimer: 0,
  roomProp: null,         // which thing in the room is selected — an id from colourablesIn()
  roomPart: null,         // which of that thing's parts is being recoloured, as a colour key
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
  // Only the tubs. The avatar widget shares this row so that it wraps with
  // them rather than taking width off every line, and clearing the container
  // wholesale would delete it on every puzzle load.
  wrap.querySelectorAll('.tub').forEach((el) => el.remove());

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
    wrap.insertBefore(tub, $('avatarWidget'));
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
  // `.tub`, not every child: the avatar widget rides in this row too and has
  // no .count to write into.
  [...$('tubs').querySelectorAll('.tub')].forEach((tub, i) => {
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

/** Turns a #rrggbb string into { h, s, l } (hue 0..360, sat/lightness 0..1). */
function hexToHsl(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const l = (max + min) / 510;
  const denom = 255 - Math.abs(max + min - 255);
  const s = d === 0 || denom === 0 ? 0 : d / denom;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return { h, s, l };
}

/**
 * Re-orders a puzzle's palette into shade order: grouped by colour family
 * (hue), then dark-to-light within each family, with neutral greys pulled
 * together at the end. The tub number, the number printed in each cell, and
 * the stored palette index are one and the same, so every cell's colour index
 * is remapped in lockstep — the picture is unchanged, only the numbering.
 * Runs once per load on the freshly-fetched puzzle and mutates it in place;
 * idempotent, so a puzzle already in this order (or re-loaded) is untouched.
 */
function sortPaletteByShade(puzzle) {
  const CHROMA = 0.15; // below this saturation a colour counts as a neutral grey
  const order = puzzle.palette
    .map((paint, i) => ({ i, ...hexToHsl(paint.hex) }))
    .sort((a, b) => {
      const aC = a.s >= CHROMA, bC = b.s >= CHROMA;
      if (aC !== bC) return aC ? -1 : 1;              // colours before greys
      if (aC && Math.abs(a.h - b.h) > 0.5) return a.h - b.h; // by hue family
      return a.l - b.l;                                // then dark -> light
    })
    .map((e) => e.i);

  if (order.every((from, to) => from === to)) return; // already sorted

  const remap = new Map(order.map((from, to) => [from, to]));
  puzzle.palette = order.map((i) => puzzle.palette[i]);
  for (const cell of puzzle.cells) cell.c = remap.get(cell.c);
}

async function loadPuzzle(id) {
  const puzzle = await api.loadPuzzle(id);
  sortPaletteByShade(puzzle);
  const saved = S.save.progress[id] || { filled: [], done: false, seconds: 0 };

  S.puzzle = puzzle;
  S.cells = prepareCells(puzzle);
  S.filled = new Set(saved.filled);
  S.elapsedMs = (saved.seconds || 0) * 1000;
  S.finished = S.filled.size === S.cells.length;
  S.bursts = [];
  S.history = [];
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
  syncUndo(); // history was just cleared, so this always hides it
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

// Nothing is looking at the picture any more, so the raised element settles
// back square rather than staying frozen at whatever angle you left it.
$('board').addEventListener('pointerleave', () => board.releaseLift());

$('board').addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId)) {
    // No gesture claims this pointer: the plain hover-outline path. A finger
    // has no hover state, and touch drags would otherwise leave an outline
    // stranded under wherever the thumb last was.
    // The raised element's parallax reads the pointer as an eye position, so
    // it wants every move — including a finger's, and including one over a
    // finished picture, neither of which the hover outline below cares about.
    board.setLiftFrom(e.clientX, e.clientY);
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
    // Lifetime wrong-colour taps, for the accuracy stat (cells / (cells + wrongTaps)).
    S.save.stats.wrongTaps = (S.save.stats.wrongTaps ?? 0) + 1;
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
    // slack is divided by board.scale, so zooming in actually *shrinks* the
    // picture-space forgiveness. In the browser, where a mouse has to land on
    // small cells, give a little of that back once zoomed so a near-miss on a
    // magnified cell still counts. The desktop app and 100% zoom are unchanged.
    const zoomHelp = (!api.isDesktop && board.zoom > 1) ? 1.4 : 1;
    const slack = ((pointerType === 'touch' ? 18 : 7) * steady * zoomHelp) / board.scale;
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
    opacity: S.save.settings.opacity ?? 0.7,
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
  const goldenWas = wasGolden ? board.goldenCell : null;
  S.filled.add(cell.id);
  S.pending.delete(cell.id);
  S.remaining[cell.colour]--;
  board.markFilled(cell.id);
  if (wasGolden) board.goldenCell = null;

  S.save.stats.cells++;
  const muted = !sfx.enabled;
  if (muted) S.save.stats.mutedCells = (S.save.stats.mutedCells || 0) + 1;
  const hinted = accruePassiveHint(S.save.stats);
  if (hinted) {
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
  // Best fill-streak is a lifetime high-water mark of the current combo, so undo
  // (which never lowers a record) leaves it untouched.
  if (streaks.combo > S.save.stats.bestStreak) S.save.stats.bestStreak = streaks.combo;
  achievements.sync(S.save.stats);

  if (S.remaining[cell.colour] === 0) {
    achievements.award('tub-empty');
    nextTub();
  }

  // Everything undo has to hand back, recorded as it is granted rather than
  // recomputed later: `award` folds in a Golden Cell and a Colour Surge that
  // may both have expired by the time this is taken back.
  S.history.push({
    cells: [cell.id],
    colour: cell.colour,
    points: award,
    muted,
    hint: hinted,
    golden: wasGolden && goldenWas ? goldenWas : null,
  });

  syncTubs();
  syncUndo();
  persist();

  if (S.filled.size === S.cells.length) finish();
}

/**
 * Takes back the last thing painted. Free, and as far back as this sitting
 * goes: a misclick is a misclick, and either charging for it or capping it at
 * one step would be worse than the mistake itself.
 *
 * Everything commitFill granted comes back off — the cell, the tub's count,
 * the cell tally, the points. What does not come back off is anything already
 * announced: achievements earned, and ability charges handed out at a level
 * up. Taking those away is a nastier surprise than the inconsistency of
 * keeping them, and their toast has already been read.
 *
 * Once a picture is finished, undo is over. Unwinding that would mean undoing
 * stats.puzzles, the reveal and the stats card — and there is nothing to
 * correct anyway, since only a cell of the colour you are holding can ever be
 * filled, so the last one was never a mistake.
 */
function undoLast() {
  if (!S.puzzle || S.finished || !S.history.length) return;
  const step = S.history.pop();
  const stats = S.save.stats;

  for (const id of step.cells) {
    S.filled.delete(id);
    board.markUnfilled(id);
  }
  S.remaining[step.colour] += step.cells.length;

  stats.cells -= step.cells.length;
  stats.undos = (stats.undos ?? 0) + 1;
  if (step.muted) stats.mutedCells = Math.max(0, (stats.mutedCells ?? 0) - step.cells.length);
  if (step.points) {
    stats.points = Math.max(0, (stats.points ?? 0) - step.points);
    stats.pointsEarned = Math.max(0, (stats.pointsEarned ?? 0) - step.points);
  }
  if (step.hint) {
    // hintsEarned is what the cell count has paid out, so it always comes back
    // down — otherwise the same crossing could be sold again on a repaint. The
    // spendable balance can only go to zero, which is where it stops if the
    // hint was already used.
    stats.hintsEarned = Math.max(0, (stats.hintsEarned ?? 0) - 1);
    stats.hints = Math.max(0, (stats.hints ?? 0) - 1);
    syncHints();
  }
  // Golden Cell was cleared when the cell it marked got filled. If its window
  // has not run out, that cell is still worth five points.
  if (step.golden && step.golden.end > Date.now()) board.goldenCell = step.golden;

  // You are left holding the colour you just took back, which is nearly always
  // the one you were about to use again — and the fill may have emptied that
  // tub and moved the selection on by itself.
  if (S.selected === step.colour) sfx.play('pick', step.colour);
  else selectTub(step.colour);

  syncTubs();
  syncAvatarWidget();
  syncAbilityRow();
  syncUndo();
  persist();
  ensureFrame();
}

/** Offered only while there is something to take back, and never once the
 *  picture is done — which is also why it can share the compare pill's corner,
 *  since that one appears exactly when this one stops. */
function syncUndo() {
  const pill = $('undoPill');
  if (!pill) return;
  pill.classList.toggle('hidden', S.finished || !S.history.length);
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
  const colour = S.selected;
  for (let i = 0; i < n; i++) {
    const cell = candidates[i];
    S.filled.add(cell.id);
    S.remaining[cell.colour]--;
    board.markFilled(cell.id);
  }
  // One entry for the whole batch: it was one action, so it is one undo. It
  // granted no points and no cell credit, so there is none to hand back.
  if (n) {
    S.history.push({
      cells: candidates.slice(0, n).map((c) => c.id),
      colour, points: 0, muted: false, hint: false, golden: null,
    });
  }
  if (n && S.remaining[S.selected] === 0) {
    achievements.award('tub-empty');
    nextTub();
  }
  syncTubs();
  syncUndo();
  persist();
  ensureFrame();
  if (S.filled.size === S.cells.length) finish();
  return n;
}

function finish() {
  S.finished = true;
  S.revealFrom = performance.now();
  $('board').classList.add('done');
  syncUndo();

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
    if (S.puzzle?.id === finishing && S.finished) {
      // The pop-up outranks the finish card, so it would hang over the reveal.
      closeAbilityFan();
      $('finish').classList.remove('hidden');
    }
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
  // board.living is safe to include where numberOverride was not: it counts
  // down and drawLiving() clears it the moment its window closes, so the
  // loop drops back to the idle cadence by itself.
  // board.liftMoving() is safe to include for the same reason board.living is:
  // it eases to a stop by itself, so the loop drops back to the idle cadence
  // rather than being pinned at full rate forever.
  const busy = S.bursts.length > 0 || S.revealFrom > 0 || board.hintTarget
    || board.colourFlash || board.goldenCell || board.living || board.liftMoving();
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
  // Only the avatar panel's room/pet tabs run in scene mode; every other panel
  // is a plain scrolling list. The scene classes carry `overflow: hidden`, so
  // leaving them on after switching to Pictures/Trophies/Settings silently
  // locks that list from scrolling. renderAvatarPanel re-adds them when needed.
  body.classList.remove('scene', 'panel-open');
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
    S.picFilter = { q: '', status: 'all', source: 'all', size: 'all', difficulty: 'all', theme: 'all', sort: 'az' };
    renderPictures(body);
  } else if (kind === 'trophies') {
    renderTrophies(body);
  } else if (kind === 'avatar') {
    renderAvatarPanel(body);
    maybeAvatarTour();
  } else {
    renderSettings(body);
  }
}

function closePanel() {
  S.panel = null;
  hidePicturePreview();
  $('panel').classList.add('hidden');
  $('pointsHud').classList.remove('hidden');
}

function row(cls = '') {
  const el = document.createElement('div');
  el.className = `row ${cls}`.trim();
  return el;
}

/**
 * Zebra-stripes a panel list. Counts only the direct `.row` children of
 * `container`, so the add-picture control, the trophy summary line and the
 * avatar tab strip don't throw the alternation off — and a skipped hidden
 * achievement can't either, since this reads the DOM rather than a loop
 * index. CSS `:nth-child` can do neither: every one of those is a <div>.
 */
function band(container) {
  container.querySelectorAll(':scope > .row')
    .forEach((el, i) => el.classList.toggle('alt', i % 2 === 1));
}

/* ------------------------------------------------------- picture previews */

// Row thumbnails, keyed by picture id. Only the finished markup is kept, not
// the puzzle it came from: a puzzle carries its source photo as a data URI and
// runs to a couple of hundred kilobytes, and there can be a lot of them.
const thumbCache = new Map();

const THUMB_PX = 46;

/**
 * Fills in a row's thumbnail once the row is actually on screen. Building
 * every one up front means loading every puzzle the moment the panel opens,
 * which is most of a megabyte the player may never scroll to.
 */
const thumbLoader = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    const el = entry.target;
    thumbLoader.unobserve(el);
    fillThumb(el, el.dataset.picture);
  }
}, { rootMargin: '120px' });

async function fillThumb(el, id) {
  if (!thumbCache.has(id)) {
    try {
      const puzzle = await api.loadPuzzle(id);
      thumbCache.set(id, outlineSVG(puzzle, {
        ...outlineWeight(puzzle.cells.length, THUMB_PX),
      }));
    } catch {
      // A picture that will not load is the row's problem, not the panel's —
      // clicking it already surfaces the failure. Leave the box empty.
      thumbCache.set(id, '');
    }
  }
  // The panel may have been closed and rebuilt while that was in flight.
  if (el.isConnected) el.innerHTML = thumbCache.get(id);
}

/**
 * The big look at an unpainted picture: hover it with a mouse, or hold it down
 * with a finger. Loaded fresh rather than cached — it is one picture at a time
 * and the wait is already covered by the delay before it opens.
 */
async function showPicturePreview(id, title) {
  const host = $('picPreview');
  if (!host) return;
  let puzzle;
  try {
    puzzle = await api.loadPuzzle(id);
  } catch {
    return;
  }
  // Moved on, or closed the panel out from under it, while that was loading.
  if (S.previewId !== id || S.panel !== 'pictures') return;

  // Built as nodes with their sizing set as properties, not as a style="..."
  // attribute in a markup string: the app ships a CSP of style-src 'self',
  // which refuses inline style attributes outright — the sheet would have come
  // out unsized. Presentation attributes inside the SVG are fine, which is why
  // outlineSVG uses stroke/fill rather than CSS.
  const sheet = document.createElement('div');
  sheet.className = 'sheet';
  sheet.style.aspectRatio = `${puzzle.width} / ${puzzle.height}`;
  if (puzzle.width >= puzzle.height) sheet.style.width = 'min(78vmin, 78vw)';
  else sheet.style.height = 'min(78vmin, 72vh)';
  sheet.innerHTML = outlineSVG(puzzle, { ...outlineWeight(puzzle.cells.length, 420) });

  const cap = document.createElement('div');
  cap.className = 'cap';
  cap.textContent = title;

  host.textContent = '';
  host.append(sheet, cap);
  host.classList.remove('hidden');
}

function hidePicturePreview() {
  S.previewId = null;
  clearTimeout(S.previewTimer);
  const host = $('picPreview');
  if (!host) return;
  host.classList.add('hidden');
  host.textContent = '';
}

/**
 * Hover on a mouse, press-and-hold on a finger. A hold that opens the preview
 * also has to swallow the click that follows it, or letting go loads the very
 * picture you were only looking at.
 */
function wirePreview(el, id, title) {
  const open = (delay) => {
    clearTimeout(S.previewTimer);
    S.previewId = id;
    S.previewTimer = setTimeout(() => showPicturePreview(id, title), delay);
  };

  if (matchMedia('(pointer: fine)').matches) {
    el.addEventListener('mouseenter', () => open(280));
    el.addEventListener('mouseleave', hidePicturePreview);
  }

  let held = null;
  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return; // hover already covers it
    held = { x: e.clientX, y: e.clientY, fired: false };
    clearTimeout(S.previewTimer);
    S.previewId = id;
    S.previewTimer = setTimeout(() => {
      if (held) held.fired = true;
      showPicturePreview(id, title);
    }, 420);
  });
  el.addEventListener('pointermove', (e) => {
    if (!held) return;
    // A drag is a scroll, not a hold.
    if (Math.hypot(e.clientX - held.x, e.clientY - held.y) > 8) {
      held = null;
      hidePicturePreview();
    }
  });
  const release = () => {
    if (held?.fired) el.dataset.swallowClick = '1';
    held = null;
    hidePicturePreview();
  };
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);
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

  const bar = buildPicFilterBar();
  const list = document.createElement('div');
  list.className = 'pic-list';
  const empty = document.createElement('div');
  empty.className = 'empty pic-empty hidden';
  empty.textContent = 'No pictures match.';
  body.append(bar, list, empty);

  for (const p of S.manifest) {
    const progress = S.save.progress[p.id];
    const done = progress?.done;
    const painted = progress?.filled?.length ?? 0;
    // A blind pack drop is unsolved until you finish it — the title and the
    // colours actually in it would both give the picture away early.
    const hidden = p.blind && !done;

    const el = row(`clickable ${p.id === S.puzzle?.id ? 'current' : ''}`);

    // What you are picking, drawn the way it looks before you start on it. A
    // blind pack shows nothing: the shape of the picture gives it away every
    // bit as fast as its title would.
    const thumb = document.createElement('div');
    thumb.className = `pic-thumb${hidden ? ' blind' : ''}`;
    if (hidden) {
      thumb.textContent = '?';
      thumb.title = 'Hidden until you finish it';
    } else {
      thumb.dataset.picture = p.id;
      thumb.title = `${p.title} — hold or hover for a closer look`;
      if (thumbCache.has(p.id)) thumb.innerHTML = thumbCache.get(p.id);
      else thumbLoader.observe(thumb);
      wirePreview(thumb, p.id, p.title);
    }

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

    el.append(thumb, sw, text);
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
      // A press-and-hold that opened the preview ends in a click too; that one
      // was a look, not a choice.
      if (thumb.dataset.swallowClick) {
        delete thumb.dataset.swallowClick;
        return;
      }
      hidePicturePreview();
      closePanel();
      await loadPuzzle(p.id);
    });
    // Everything the filter needs, read once here rather than re-derived on
    // every keystroke. `label` is what is on screen — for an unsolved mystery
    // that is "Mystery picture", never its real title, so a search can never
    // surface one by name.
    el._pic = {
      label: (hidden ? 'Mystery picture' : p.title).toLowerCase(),
      title: p.title,
      imported: !!p.imported,
      cells: p.cells,
      difficulty: p.difficulty ?? 'normal',
      themes: p.themes ?? [],
      status: done ? 'done' : painted > 0 ? 'started' : 'todo',
      added: p.added ?? 0,
      idx: list.childElementCount, // manifest order, for restoring the default sort
    };
    list.append(el);
  }
  applyPicFilter();
}

/** Stripes only the rows currently on screen, so hiding some for a filter
 *  keeps the alternating background unbroken. */
function bandVisible(list) {
  let i = 0;
  for (const el of list.querySelectorAll(':scope > .row')) {
    if (el.classList.contains('hidden')) continue;
    el.classList.toggle('alt', i % 2 === 1);
    i += 1;
  }
}

// The theme tags a picture can carry (see puzzles/tags.json). The Pictures
// list offers these as a single-select dropdown; the values match the manifest.
const PICTURE_THEMES = [
  'Animals', 'Flowers', 'Food', 'Fantasy', 'Space', 'Landscape', 'Spooky', 'Abstract', 'Water',
];

function segGroup(axis, current, options, onPick) {
  const seg = document.createElement('div');
  // The connected (bordered) variant, not `.wrap`: each axis has to read as one
  // control, or two adjacent groups with a selection each look like a single
  // group with two things lit. `.pic-chips` wraps between whole groups instead.
  seg.className = 'segmented';
  seg.dataset.axis = axis; // several groups repeat "All"; this keeps them apart
  for (const [value, text] of options) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    b.className = value === current ? 'on' : '';
    b.addEventListener('click', () => {
      [...seg.children].forEach((c) => c.classList.toggle('on', c === b));
      onPick(value);
    });
    seg.append(b);
  }
  return seg;
}

function buildPicFilterBar() {
  const f = S.picFilter;
  const bar = document.createElement('div');
  bar.className = 'pic-filter';

  // Search. Matches the visible label, so mysteries stay hidden by name.
  const search = document.createElement('div');
  search.className = 'pic-search';
  const input = document.createElement('input');
  input.type = 'search';
  input.placeholder = 'Search pictures';
  input.value = f.q;
  input.addEventListener('input', () => {
    f.q = input.value.trim().toLowerCase();
    clear.classList.toggle('hidden', !input.value);
    applyPicFilter();
  });
  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = `pic-search-clear${f.q ? '' : ' hidden'}`;
  clear.textContent = '✕';
  clear.title = 'Clear search';
  clear.addEventListener('click', () => {
    input.value = '';
    f.q = '';
    clear.classList.add('hidden');
    applyPicFilter();
    input.focus();
  });
  search.append(input, clear);

  const chips = document.createElement('div');
  chips.className = 'pic-chips';
  chips.append(segGroup('status', f.status, [
    ['all', 'All'], ['todo', 'To do'], ['started', 'Started'], ['done', 'Done'],
  ], (v) => { f.status = v; applyPicFilter(); }));
  // Source only earns its space once there is something of your own to sort
  // from the built-in set.
  if (S.manifest.some((p) => p.imported)) {
    chips.append(segGroup('source', f.source, [
      ['all', 'All'], ['bundled', 'Built-in'], ['yours', 'Yours'],
    ], (v) => { f.source = v; applyPicFilter(); }));
  }
  chips.append(segGroup('size', f.size, [
    ['all', 'Any size'], ['quick', 'Quick'], ['full', 'Full'],
  ], (v) => { f.size = v; applyPicFilter(); }));
  // How hard a picture is — the preset it was built at (chunky/normal/detailed/
  // insane). Wraps as its own group so its "All" never reads as another axis'.
  chips.append(segGroup('difficulty', f.difficulty, [
    ['all', 'All'], ['chunky', 'Chunky'], ['normal', 'Normal'],
    ['detailed', 'Detailed'], ['insane', 'Insane'],
  ], (v) => { f.difficulty = v; applyPicFilter(); }));
  // Theme is a single-select dropdown rather than a segmented strip: nine
  // values would wrap into an unreadable wall of chips.
  const theme = document.createElement('select');
  theme.className = 'pic-theme';
  theme.setAttribute('aria-label', 'Filter by theme');
  for (const [value, text] of [['all', 'Any theme'], ...PICTURE_THEMES.map((t) => [t, t])]) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = text;
    if (value === f.theme) opt.selected = true;
    theme.append(opt);
  }
  theme.addEventListener('change', () => { f.theme = theme.value; applyPicFilter(); });
  chips.append(theme);
  chips.append(segGroup('sort', f.sort, [
    ['az', 'A–Z'], ['recent', 'Recent'],
  ], (v) => { f.sort = v; applyPicFilter(); }));

  bar.append(search, chips);
  return bar;
}

function applyPicFilter() {
  const list = $('panelBody')?.querySelector('.pic-list');
  if (!list) return;
  const f = S.picFilter;
  const rows = [...list.querySelectorAll(':scope > .row')];

  let shown = 0;
  for (const el of rows) {
    const p = el._pic;
    const ok = (!f.q || p.label.includes(f.q))
      && (f.status === 'all' || p.status === f.status)
      && (f.source === 'all' || (f.source === 'yours') === p.imported)
      && (f.size === 'all' || (f.size === 'quick') === (p.cells < 100))
      && (f.difficulty === 'all' || p.difficulty === f.difficulty)
      && (f.theme === 'all' || p.themes.includes(f.theme));
    el.classList.toggle('hidden', !ok);
    if (ok) shown += 1;
  }

  // `recent` floats your imports to the top, newest by their save stamp; both
  // sorts fall back to the manifest's own order (bundled A–Z, imports last),
  // which is what the default `az` restores exactly.
  const order = rows.slice().sort((a, b) => {
    if (f.sort === 'recent' && a._pic.imported !== b._pic.imported) {
      return a._pic.imported ? -1 : 1;
    }
    if (f.sort === 'recent' && a._pic.imported && b._pic.imported) {
      return b._pic.added - a._pic.added;
    }
    return a._pic.idx - b._pic.idx;
  });
  for (const el of order) list.append(el);

  bandVisible(list);
  const empty = $('panelBody').querySelector('.pic-empty');
  if (empty) empty.classList.toggle('hidden', shown > 0);
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
  band(body);
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

/**
 * Paints the stage for whichever tab is open. Customize and Outfits show the
 * figure on her own; Room and Abilities show the whole scene.
 *
 * The split is about what you are doing rather than what looks nicer. In the
 * room she is drawn at AVATAR_SCALE inside a 260-wide frame shown at 208px,
 * which puts the whole figure at about 77px and her eyes at two — fine to look
 * at, impossible to aim at. Building her or dressing her wants her big; once
 * you are just admiring the result, the room is the point.
 *
 * Delegation is wired once per stage element, not once per paint: the listener
 * sits on the stage itself and survives innerHTML being replaced, so re-wiring
 * on each redraw stacked one more handler per recolour.
 */
/**
 * The colours on offer for any recolour: the paint from the picture currently
 * open, falling back to a default set when there is none. Using the live
 * palette is what ties a room to the pictures painted in it — you decorate in
 * the colours you have just been working with.
 */
function paintPalette() {
  return S.puzzle?.palette?.map((p) => p.hex) ?? DEFAULT_PALETTE;
}

function swatchRow(hexes, onPick) {
  const swatches = document.createElement('div');
  swatches.className = 'swatch-row';
  for (const hex of hexes) {
    const sw = document.createElement('button');
    sw.className = 'swatch';
    sw.style.background = hex;
    sw.title = hex;
    sw.addEventListener('click', () => onPick(hex));
    swatches.append(sw);
  }
  return swatches;
}

/**
 * Selecting a thing in the room. Deliberately coarser than the avatar's
 * [data-slot]: this picks an OBJECT and its parts are then chosen from a list,
 * because a drawer handle is three pixels wide and the shading washes sit on
 * top of the parts they shade.
 */
function wireRoomPropClicks(stageEl) {
  stageEl.addEventListener('click', (e) => {
    const prop = e.target.closest('[data-prop]');
    if (!prop) return;
    S.roomProp = prop.dataset.prop;
    S.roomPart = null;
    S.avatarTab = 'room';
    renderAvatarPanel($('panelBody'));
  });
}

function paintStage(stage) {
  const bare = S.avatarTab === 'customize' || S.avatarTab === 'outfits';
  stage.classList.toggle('figure', bare);
  stage.innerHTML = bare
    ? buildAvatarSVG(S.save.avatar.customize)
    : buildRoomSVG(S.save.avatar.house, S.save.avatar.customize);
  if (!stage.dataset.wired) {
    stage.dataset.wired = '1';
    wireAvatarPartClicks(stage);
    wireRoomPropClicks(stage);
  }
}

// The play-stats dashboard that fills the space under the room on the scene
// tabs. Pure derivation lives in playstats.js; this only lays it out.
function buildSceneStats() {
  const wrap = document.createElement('div');
  wrap.className = 'scene-stats';
  for (const group of computePlayStats(S.save)) {
    const section = document.createElement('div');
    section.className = 'stat-group';
    const heading = document.createElement('h4');
    heading.textContent = group.title;
    const grid = document.createElement('div');
    grid.className = 'stat-grid';
    for (const tile of group.tiles) {
      const cell = document.createElement('div');
      cell.className = 'stat-tile';
      const val = document.createElement('div');
      val.className = 'stat-value';
      if (tile.value === '—') val.classList.add('dim');
      val.textContent = tile.value;
      const label = document.createElement('div');
      label.className = 'stat-label';
      label.textContent = tile.label;
      cell.append(val, label);
      grid.append(cell);
    }
    section.append(heading, grid);
    wrap.append(section);
  }
  return wrap;
}

function renderAvatarPanel(body) {
  // A room change (buy, recolour, place) rebuilds the whole panel, which would
  // otherwise snap the scrollable side panel back to the top and yank you away
  // from the row you just acted on. Remember where it was and restore it below.
  const prevPanelScroll = body.querySelector('.room-panel')?.scrollTop ?? 0;
  body.textContent = '';
  const level = levelForPoints(S.save.stats.pointsEarned);
  const { into, span } = pointsIntoLevel(S.save.stats.pointsEarned);
  // The room and pet tabs are about the scene, so the room fills the panel and
  // the controls ride in from a collapsible side panel on the left. The list
  // tabs (customize/outfits/abilities) keep the plain stacked layout.
  const scene = S.avatarTab === 'room' || S.avatarTab === 'pet';
  // Was the panel already showing a scene? If so this is an in-tab redraw (a
  // care tap, a recolour) and the side panel must not replay its slide-in.
  const wasScene = body.classList.contains('scene');
  body.classList.toggle('scene', scene);

  const head = document.createElement('div');
  head.className = 'avatar-head';
  const stage = document.createElement('div');
  stage.className = 'avatar-stage';
  paintStage(stage);
  head.append(stage);
  // The scene tabs (room/pet) leave a tall band under the room; fill it with a
  // play-stats dashboard for the min/max crowd. Same block on both tabs.
  if (scene) head.append(buildSceneStats());

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
  // In scene mode the level/coins read moves into the side panel to free the
  // stage; the head itself is appended per-layout below.
  if (!scene) head.append(levelbar);

  const tabs = document.createElement('div');
  // Five tabs no longer fit on one line, and .segmented is overflow:hidden
  // with no wrap — without `wrap` the last one is silently clipped off.
  tabs.className = 'segmented avatar-tabs wrap';
  for (const key of ['customize', 'outfits', 'abilities', 'room', 'pet']) {
    const btn = document.createElement('button');
    btn.textContent = key[0].toUpperCase() + key.slice(1);
    btn.className = S.avatarTab === key ? 'on' : '';
    btn.addEventListener('click', () => {
      S.avatarTab = key;
      renderAvatarPanel(body);
    });
    tabs.append(btn);
  }

  const section = document.createElement('div');
  section.className = 'avatar-section';

  if (S.avatarTab === 'outfits') renderAvatarOutfits(section, stage);
  else if (S.avatarTab === 'abilities') renderAvatarAbilities(section);
  else if (S.avatarTab === 'room') renderAvatarRoom(section);
  else if (S.avatarTab === 'pet') renderAvatarPet(section);
  else renderAvatarCustomize(section, stage);
  // One call covers all tabs: they append synchronously into `section`.
  band(section);

  if (scene) {
    // Tabs across the top, the room filling the rest, and the controls in a
    // side panel that slides in from the left. It is either fully open or
    // fully closed — no half state — so a change can be made and then the
    // panel tucked away to see the whole room. Open state is remembered.
    const panelOpen = S.roomPanelOpen !== false;
    body.classList.toggle('panel-open', panelOpen);

    const panel = document.createElement('div');
    // Slide-in flourish only when arriving on the tab with the panel open, not
    // on every in-tab redraw and not when it is meant to start closed.
    panel.className = (!wasScene && panelOpen) ? 'room-panel enter' : 'room-panel';

    const coins = document.createElement('div');
    coins.className = 'panel-coins';
    coins.textContent = `Level ${level} · ${S.save.stats.points ?? 0}🪙 to spend`;
    panel.append(coins, section);

    // The edge tab lives outside the panel so it stays reachable when the panel
    // has slid off-screen; CSS parks it at the screen edge when closed and at
    // the panel's edge when open.
    const toggle = document.createElement('button');
    toggle.className = 'room-panel-toggle';
    const syncToggle = (isOpen) => {
      toggle.textContent = isOpen ? '‹' : '›';
      toggle.setAttribute('aria-label', isOpen ? 'Hide room controls' : 'Show room controls');
    };
    syncToggle(panelOpen);
    toggle.addEventListener('click', () => {
      const next = !(S.roomPanelOpen !== false);
      S.roomPanelOpen = next;
      body.classList.toggle('panel-open', next);
      syncToggle(next);
    });

    // The room, the panel and its edge tab share one positioned box below the
    // tabs, so the panel starts under the tab strip however many rows it wraps
    // to rather than under a hard-coded offset.
    const sceneStage = document.createElement('div');
    sceneStage.className = 'scene-stage';
    sceneStage.append(head, panel, toggle);
    body.append(tabs, sceneStage);
    // Put the side panel back where it was so a purchase or recolour updates
    // the row in place rather than jumping the list to the top.
    panel.scrollTop = prevPanelScroll;
  } else {
    body.append(head, tabs, section);
  }
}

function renderAvatarCustomize(section, stage) {
  const customize = S.save.avatar.customize;
  const redraw = () => {
    paintStage(stage);
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
    const set = (hex) => { target.colour = hex; redraw(); };
    // Skin gets its race's own tones offered first — green is a long way
    // from anything a landscape's palette will hand you — but the paint
    // from the current picture stays right below it, unchanged.
    if (S.avatarSlot === 'skin') {
      const label = document.createElement('div');
      label.className = 'empty';
      label.style.padding = '2px 4px 0';
      label.textContent = `${RACE_PROFILE[customize.race]?.label ?? 'Human'} skin tones`;
      section.append(label, swatchRow(raceSkinPalette(customize.race), set));
    }
    section.append(swatchRow(paintPalette(), set));
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
    paintStage(stage);
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

/**
 * Room, props, lighting and pet. Prop options are filtered by the selected
 * room, so switching rooms swaps the whole set of choices; each room keeps its
 * own arrangement, which is why the save nests props under the room id.
 */
function renderAvatarRoom(section) {
  const house = S.save.avatar.house;
  const level = levelForPoints(S.save.stats.pointsEarned);
  const owned = new Set(house.unlocked);

  const redraw = () => {
    persist();
    // Buying a prop/lighting/pet spends points same as the wardrobe does, so
    // the main-screen coin count needs the same refresh or it goes stale
    // until some unrelated grant happens to touch it.
    syncAvatarWidget();
    renderAvatarPanel($('panelBody'));
  };

  // One purchase path for every kind of thing in here, so a pet and a rug and
  // a lamp all behave identically.
  const buyable = (item, icon, onBuy) => {
    const buy = document.createElement('button');
    buy.className = 'primary buy';
    // Dim only when you genuinely can't afford it — that is what "unavailable"
    // should mean here, not the row simply being unowned.
    const affordable = (S.save.stats.points ?? 0) >= item.price;
    buy.disabled = !affordable;
    buy.textContent = affordable ? 'Buy' : `${item.price}🪙`;
    buy.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!spendPoints(S.save.stats, item.price)) {
        sfx.play('nope');
        return;
      }
      house.unlocked.push(item.id);
      onBuy?.();
      toast({ icon, name: `Unlocked ${item.name}`, desc: 'Set it from the Room tab.' });
      redraw();
    });
    return buy;
  };

  const pickerRow = (label, options, isOn, onPick, icon, describe) => {
    for (const [i, opt] of options.entries()) {
      const gated = opt.unlockLevel != null && level < opt.unlockLevel;
      // Rooms are earned by levelling and never appear in `unlocked`; props,
      // lighting and pets are bought and always do. Keyed off unlockLevel so
      // the two kinds share one row builder.
      const has = opt.unlockLevel != null ? !gated : owned.has(opt.id);
      const on = isOn(opt);
      // Owned → tappable; level-gated → dimmed lock; a store item you don't own
      // yet is purchasable, so it stays at full strength with a Buy button
      // rather than reading as unavailable like a gated row.
      const el = row(has && !gated ? 'clickable' : gated ? 'locked' : 'buyable');

      const text = document.createElement('div');
      text.className = 'grow';
      text.innerHTML = '<div class="label"></div><div class="sub"></div>';
      // Only the first option of a group is labelled, so the rows read as one
      // block per slot rather than as a flat list of unrelated things.
      text.querySelector('.label').textContent = i === 0 ? `${label} — ${opt.name}` : opt.name;
      text.querySelector('.sub').textContent = describe(opt, { has, gated, on });
      el.append(text);

      if (on) {
        const tick = document.createElement('span');
        tick.className = 'glyph';
        tick.textContent = '✓';
        el.append(tick);
      } else if (gated) {
        const lock = document.createElement('span');
        lock.className = 'glyph';
        lock.textContent = '🔒';
        el.append(lock);
      } else if (has) {
        el.addEventListener('click', () => { onPick(opt); redraw(); });
      } else if (opt.source === 'store') {
        el.append(buyable(opt, icon));
      }
      section.append(el);
    }
  };

  renderRoomColours(section, house, redraw);

  pickerRow('Room', ROOMS, (r) => r.id === house.room, (r) => { house.room = r.id; },
    '🏠', (r, { gated }) => (gated ? `unlocks at level ${r.unlockLevel}` : 'tap to move in'));

  // Scene toggle: keep the character in the room, or hand the whole scene to
  // the pet and the furniture. Same one-tap row shape as everything else here.
  const showChar = row('clickable');
  showChar.innerHTML = '<div class="grow"><div class="label">Character</div><div class="sub"></div></div>';
  showChar.querySelector('.sub').textContent = house.hideAvatar
    ? 'hidden — tap to show her' : 'in the room — tap to hide';
  const showGlyph = document.createElement('span');
  showGlyph.className = 'glyph';
  showGlyph.textContent = house.hideAvatar ? '🚫' : '✓';
  showChar.append(showGlyph);
  showChar.addEventListener('click', () => { house.hideAvatar = !house.hideAvatar; redraw(); });
  section.append(showChar);

  for (const slot of PROP_SLOTS) {
    pickerRow(SLOT_LABEL[slot], itemsFor(house.room, slot),
      (it) => house.props[house.room]?.[slot] === it.id,
      (it) => { house.props[house.room][slot] = it.id; },
      '🪑', (it, { has }) => (has ? 'tap to place' : `${it.price}🪙`));
  }

  pickerRow('Lighting', LIGHTING, (l) => l.id === house.lighting,
    (l) => { house.lighting = l.id; },
    '💡', (l, { has }) => (has ? 'tap to light the room' : `${l.price}🪙`));

  pickerRow('Pet', PETS, (pet) => pet.id === house.pet, (pet) => { house.pet = pet.id; },
    '🐾', (pet, { has }) => (has ? 'tap to invite in' : `${pet.price}🪙`));
}

/**
 * The pet's own tab: name it, read its mood, and tend its four needs.
 *
 * Deliberately gentle — see PET_NEEDS. Opening the tab first ages the meters by
 * however long you have been away (applyPetDecay), so they reflect real time
 * without any background timer running; then a care tap fills one back up. There
 * is no failure state to reach, so nothing here scolds.
 */
function renderAvatarPet(section) {
  const house = S.save.avatar.house;
  house.petStats ??= defaultPetStats();
  // Catch the meters up to now before we draw them, and save that so the next
  // open decays from here rather than double-counting the same idle time.
  applyPetDecay(house.petStats);
  persist();

  const pet = PETS.find((p) => p.id === house.pet);
  const displayName = (house.petName || '').trim() || (pet ? pet.name : 'your pet');
  const mood = petMood(house.petStats);

  const redraw = () => {
    persist();
    renderAvatarPanel($('panelBody'));
  };

  // Header: a name field and a one-line mood read.
  const head = row('pet-header');
  const grow = document.createElement('div');
  grow.className = 'grow';
  const nameInput = document.createElement('input');
  nameInput.className = 'pet-name';
  nameInput.value = house.petName || '';
  nameInput.placeholder = pet ? pet.name : 'Name your pet';
  nameInput.maxLength = 20;
  nameInput.setAttribute('aria-label', 'Pet name');
  // Save on the way out or on Enter, not per keystroke, so a re-render never
  // yanks the field out from under the cursor mid-word.
  const moodText = (name) => (pet
    ? `${name} the ${pet.name.toLowerCase()} is feeling ${mood.label}`
    : 'invite a pet in from the Room tab');
  const commitName = () => {
    const next = nameInput.value.trim();
    if (next === (house.petName || '')) return;
    house.petName = next;
    persist();
    // Refresh the read-out in place rather than re-rendering — the field has
    // just blurred, so there is no cursor to disturb.
    moodLine.textContent = moodText(next || (pet ? pet.name : 'your pet'));
  };
  nameInput.addEventListener('change', commitName);
  nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') nameInput.blur(); });
  const moodLine = document.createElement('div');
  moodLine.className = 'sub';
  moodLine.textContent = moodText(displayName);
  grow.append(nameInput, moodLine);
  head.append(grow);
  section.append(head);

  if (!pet) { band(section); return; }

  // One meter + care button per need.
  for (const need of PET_NEEDS) {
    const value = Math.round(house.petStats[need.key] ?? 0);
    const el = row('pet-meter');

    const info = document.createElement('div');
    info.className = 'grow';
    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = `${need.icon} ${need.label}`;
    const track = document.createElement('div');
    track.className = 'meter';
    const fillBar = document.createElement('i');
    fillBar.style.width = `${value}%`;
    // Warm when topped up, cooling toward attention-needed. Purely a hint —
    // even an empty meter is only a nudge, never a penalty.
    fillBar.classList.toggle('low', value < 35);
    track.append(fillBar);
    info.append(label, track);

    const btn = document.createElement('button');
    btn.className = 'primary pet-care';
    btn.textContent = need.action;
    btn.addEventListener('click', () => {
      carePet(house.petStats, need.key);
      sfx.play('pick');
      redraw();
    });

    el.append(info, btn);
    section.append(el);
  }

  const note = row('pet-note');
  note.innerHTML = '<div class="sub grow">Needs drift down while you’re away and perk '
    + 'right back up when you visit. Nothing bad ever happens — it’s just nice to be missed.</div>';
  section.append(note);

  band(section);
}

/**
 * The colours of whatever is selected in the scene above.
 *
 * Two steps, not one: tapping the room picks an object, and its parts are then
 * chosen from this list. Parts are not clickable targets themselves — a drawer
 * handle is three pixels wide, and half of what is on screen is a translucent
 * wash lying over the thing it shades, so a tap would land on the wash.
 *
 * Nothing here costs anything. The props were the purchase; what colour you
 * paint them is not a second one.
 */
function renderRoomColours(section, house, redraw) {
  const colourables = colourablesIn(house);
  // A selection made before the room or a prop changed may no longer be on
  // screen. Fall back to the room itself rather than to nothing.
  const target = colourables.find((o) => o.id === S.roomProp) ?? colourables[0];
  S.roomProp = target.id;

  const head = document.createElement('div');
  head.className = 'empty';
  head.style.padding = '2px 4px 7px';
  head.textContent = `${target.name} — tap the room above to pick something else`;
  section.append(head);

  for (const part of target.parts) {
    const key = colourKey(target.id, part.key);
    const changed = key in house.colours;
    const on = S.roomPart === key;
    const el = row('clickable');
    if (on) el.classList.add('on');

    const chip = document.createElement('span');
    chip.className = 'part-chip';
    chip.style.background = house.colours[key] ?? part.default;
    el.append(chip);

    const text = document.createElement('div');
    text.className = 'grow';
    text.innerHTML = '<div class="label"></div><div class="sub"></div>';
    text.querySelector('.label').textContent = part.name;
    text.querySelector('.sub').textContent = on
      ? 'pick a colour below'
      : changed ? 'changed · tap to edit' : 'tap to recolour';
    el.append(text);
    el.addEventListener('click', () => {
      S.roomPart = on ? null : key;
      renderAvatarPanel($('panelBody'));
    });

    if (changed) {
      const reset = document.createElement('button');
      reset.textContent = '↺';
      reset.title = `Back to ${part.default}`;
      reset.addEventListener('click', (e) => {
        e.stopPropagation();
        delete house.colours[key];
        redraw();
      });
      el.append(reset);
    }
    section.append(el);
  }

  if (S.roomPart) {
    section.append(swatchRow(paintPalette(), (hex) => {
      house.colours[S.roomPart] = hex;
      redraw();
    }));
  }

  // Every key belonging to anything currently in this room. Without a way back
  // out, one bad palette is only undoable by wiping the save.
  const roomKeys = colourables.flatMap((o) => o.parts.map((part) => colourKey(o.id, part.key)))
    .filter((key) => key in house.colours);
  if (roomKeys.length) {
    const el = row('clickable');
    const text = document.createElement('div');
    text.className = 'grow';
    text.innerHTML = '<div class="label"></div><div class="sub"></div>';
    text.querySelector('.label').textContent = 'Reset this room';
    text.querySelector('.sub').textContent =
      `${roomKeys.length} colour${roomKeys.length === 1 ? '' : 's'} changed`;
    el.append(text);
    el.addEventListener('click', () => {
      for (const key of roomKeys) delete house.colours[key];
      S.roomPart = null;
      redraw();
    });
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
    pill.innerHTML = buildAvatarSVG(S.save.avatar.customize);
    // Outside the pill, which crops its portrait with overflow:hidden and was
    // slicing the badge into a wedge. It rides on the ring instead, sitting
    // proud of the circle the way a tub's count does.
    const ring = $('avatarRing');
    let badge = ring?.querySelector('.level-badge');
    if (ring && !badge) {
      badge = document.createElement('span');
      badge.className = 'level-badge';
      ring.append(badge);
    }
    if (badge) badge.textContent = String(level);
  }
  const value = $('pointsValue');
  if (value) value.textContent = String(S.save.stats.points ?? 0);

  // Progress through the current level, drawn as a lap of the ring around the
  // portrait. This function already re-runs on every grant, so it cannot go
  // stale. A custom property rather than a style attribute: `style-src 'self'`
  // refuses inline styles in markup, but the CSSOM is fine.
  const ring = $('avatarRing');
  if (ring) {
    const { into, span } = pointsIntoLevel(S.save.stats.pointsEarned);
    ring.style.setProperty('--xp', String(span ? (into / span) * 100 : 100));
  }
}

/** The abilities are a pop-up now, so something has to say whether it is up.
 *  Session state, not saved: it always opens collapsed, on every screen. */
function syncAbilityFan() {
  $('abilityRow')?.classList.toggle('hidden', !S.abilityFan);
  $('avatarPill')?.setAttribute('aria-expanded', String(!!S.abilityFan));
}

function closeAbilityFan() {
  if (!S.abilityFan) return;
  S.abilityFan = false;
  syncAbilityFan();
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
    // The icon is the only text content, so without this a screen reader
    // announces the button as "🎯". `title` is not a substitute: it is only
    // consulted when there is no accessible name at all.
    btn.setAttribute('aria-label', `${def.name} — ${s.charges} of ${def.maxCharges}`);
    btn.textContent = def.icon;
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = String(s.charges);
    btn.append(badge);
    wrap.append(btn);
  }
}

/* -------------------------------------------------------------------- tour */

// The squirrel's route around the screen. Each stop names a control by
// selector and what to say about it; tour.js drops any stop whose control is
// hidden on this platform (the desktop-only window buttons on the phone, say),
// so one list serves both. `null` targets are the centred hello and goodbye.
const TOUR_STEPS = [
  { target: null, title: 'Hello — I\'m your guide',
    body: 'One quick lap around the screen so you know where everything is. It takes about twenty seconds, and you can Skip any time.' },
  { target: '#board', title: 'The canvas',
    body: 'Your picture lives here. Pick a paint, then click any cell showing that paint\'s number — a blob explosion tears across the whole picture and sucks itself into the cell you clicked.' },
  { target: '#tubs', title: 'Your paints',
    body: 'Each tub is a colour with a number. Click a cell carrying that number to fill it. Number keys 1–9 switch tubs, and when a tub runs dry the next one takes over on its own.' },
  { target: '.progress', title: 'Progress',
    body: 'This bar creeps across as you fill cells — it\'s how close you are to finishing the picture.' },
  { target: '#pointsHud', title: 'Coins',
    body: 'Every cell you paint earns a few. Spend them on outfits for your avatar and furniture for its room.' },
  { target: '[data-act="hint"]', title: 'Hints',
    body: 'Stuck on where a colour goes? A hint flashes an unfinished cell. You earn hints just by painting, and more from achievements.' },
  { target: '#avatarWidget', title: 'That\'s you',
    body: 'The ring around your avatar is its experience bar. Click once for your abilities, and again to open the wardrobe and decorate your room.' },
  { target: '[data-act="pictures"]', title: 'Pictures',
    body: 'Your gallery. Browse what\'s here, or add your own — drag an image onto the window, paste one, or use Add. Each becomes a paint-by-number.' },
  { target: '[data-act="trophies"]', title: 'Achievements',
    body: 'Small goals to chase. Reaching one hands you hints and the odd outfit.' },
  { target: '[data-act="settings"]', title: 'Settings',
    body: 'Sound, and how fast and thick the blob splats. This is also where you can send me round again — look for "Squirrel tour".' },
  { target: null, title: 'Off you go',
    body: 'That\'s the whole screen. Pick a tub, click a cell, and enjoy the mess. 🐿️' },
];

let tour = null;

function startTour({ fromSettings = false } = {}) {
  if (fromSettings) closePanel();
  // A panel or the ability fan open over the board would fight the spotlight;
  // clear them so every stop is actually visible before the squirrel sets off.
  closeAbilityFan();
  tour?.end();
  tour = new Tour($('app'));
  // Let a closing panel finish sliding away before the first stop is measured.
  setTimeout(() => tour.start(TOUR_STEPS, {
    suppressible: !fromSettings,
    onEnd: (suppress) => {
      // Seen is already set up front (so a mid-tour reload can't restart it);
      // un-ticking "Don't show again" during the auto run is the one thing that
      // clears it, letting a still-fresh save be greeted once more. A Settings
      // replay carries no checkbox (suppress is undefined) and leaves it be.
      if (suppress === false) {
        // An explicit "show me again" must outlast an immediate close, so flush now.
        S.save.settings.tourSeen = false;
        persist(true);
      }
    },
  }), fromSettings ? 260 : 0);
}

function maybeFirstRunTour() {
  // The headless harnesses (check-web, preview) and the Electron smoke test all
  // boot a fresh save and then drive the UI, which the tour would sit on top of.
  // They load with ?notour so only they skip the automatic run — the Settings
  // replay is always available, and a real first launch never carries the flag.
  if (/[?&]notour\b/.test(location.search)) return;
  if (S.save.settings.tourSeen) return;
  // Only a genuinely untouched save gets the tour unbidden — a returning player
  // who has painted before shouldn't be ambushed by it, so mark it seen for
  // them silently (Settings still offers a replay). A fresh player gets a beat
  // for the picture to settle, then the squirrel sets off. Either way it is
  // marked up front, so a reload mid-tour doesn't start it over.
  const fresh = !S.save.stats.cells && !S.save.stats.puzzles && !S.save.stats.imported;
  S.save.settings.tourSeen = true;
  persist();
  if (fresh) setTimeout(() => startTour(), 700);
}

/* ------------------------------------------------------- tour: the avatar */

// The avatar panel is its own screen with five tabs, so it gets its own short
// tour — given in context the first time it is opened rather than tacked onto
// the opening lap. Each stop switches to a tab and then points: the list tabs
// (Customize/Outfits/Abilities) at their tab button, the scene tabs (Room/Pet)
// at the figure itself, which by then is showing the room. `before` does the
// switching; tour.js waits for it before measuring.
const AVATAR_TAB_BTN = (name) => () =>
  [...document.querySelectorAll('.avatar-tabs button')]
    .find((b) => b.textContent.trim().toLowerCase() === name);

function setAvatarTab(key) {
  S.avatarTab = key;
  if (S.panel === 'avatar') renderAvatarPanel($('panelBody'));
  // A beat for the tab (and, for Room/Pet, the scene layout) to settle before
  // the spotlight is measured against it.
  return new Promise((r) => setTimeout(r, 260));
}

const AVATAR_STEPS = [
  { target: '.avatar-stage', before: () => setAvatarTab('customize'),
    title: 'This is you, full size',
    body: 'The figure up top is your avatar; the five tabs below are everything you can do with it. Let me run through them.' },
  { target: AVATAR_TAB_BTN('customize'), before: () => setAvatarTab('customize'),
    title: 'Customize',
    body: 'Build the look — race, hair, face and body sliders — and recolour any single part from the palette. The figure updates as you go.' },
  { target: AVATAR_TAB_BTN('outfits'), before: () => setAvatarTab('outfits'),
    title: 'Outfits',
    body: 'Clothes you\'ve unlocked. You earn more by hitting achievements and levelling up; click one to put it on.' },
  { target: AVATAR_TAB_BTN('abilities'), before: () => setAvatarTab('abilities'),
    title: 'Abilities',
    body: 'Small powers — a streak shield, a colour surge, a steadier hand. They gain charges as you level up, and you arm one from the ring on the picture.' },
  { target: '.avatar-stage', before: () => setAvatarTab('room'),
    title: 'Room',
    body: 'Your own little room. Spend coins on furniture, change the lighting, and recolour anything in it — the controls slide in from the left.' },
  { target: '.avatar-stage', before: () => setAvatarTab('pet'),
    title: 'Pet',
    body: 'And a pet to keep. Feed it and give it some attention now and then; a contented pet is its own small reward.' },
  { target: null, before: () => setAvatarTab('customize'),
    title: 'That\'s the lot',
    body: 'Poke around whenever you like — nothing here costs anything but the coins you\'ve already earned. 🐿️' },
];

function startAvatarTour({ fromSettings = false } = {}) {
  const begin = () => {
    closeAbilityFan();
    tour?.end();
    tour = new Tour($('app'));
    tour.start(AVATAR_STEPS, {
      suppressible: !fromSettings,
      onEnd: (suppress) => {
        // avatarTourSeen was set up front; un-ticking "Don't show again" clears
        // it, so the next visit to the avatar panel plays it once more.
        if (suppress === false) {
          S.save.settings.avatarTourSeen = false;
          persist(true);
        }
        // Leave the panel on the first tab rather than wherever the tour stopped.
        if (S.panel === 'avatar') setAvatarTab('customize');
      },
    });
  };
  if (S.panel === 'avatar') {
    setTimeout(begin, fromSettings ? 200 : 0);
  } else {
    // Replaying from Settings (panel closed): open the avatar panel first, then
    // let it settle before the squirrel sets off.
    if (fromSettings) closePanel();
    openPanel('avatar').then(() => setTimeout(begin, 320));
  }
}

function maybeAvatarTour() {
  if (/[?&]notour\b/.test(location.search)) return;
  if (S.save.settings.avatarTourSeen) return;
  // Don't stack on the opening tour if it happens to still be up.
  if (tour?.running) return;
  S.save.settings.avatarTourSeen = true;
  persist();
  setTimeout(() => startAvatarTour(), 450);
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
  slider('Blob opacity', 'opacity', 0.25, 1, 0.05, (v) => `${Math.round(v * 100)}%`);

  const guide = row('clickable');
  guide.innerHTML = '<div class="grow"><div class="label">Squirrel tour</div>' +
    '<div class="sub">Send the squirrel round the screen again</div></div>' +
    '<div class="tour-seal" aria-hidden="true">🐿️</div>';
  guide.addEventListener('click', () => startTour({ fromSettings: true }));
  body.append(guide);

  const avatarGuide = row('clickable');
  avatarGuide.innerHTML = '<div class="grow"><div class="label">Avatar tour</div>' +
    '<div class="sub">A walk through the avatar\'s five tabs</div></div>' +
    '<div class="tour-seal" aria-hidden="true">🐿️</div>';
  avatarGuide.addEventListener('click', () => startAvatarTour({ fromSettings: true }));
  body.append(avatarGuide);

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
  band(body);
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
    case 'undo': undoLast(); break;
    case 'zoom-reset': board.resetZoom(); syncZoom(); ensureFrame(); break;
    case 'toggle-source': {
      // Every trip into photo view plays the picture's living element again,
      // if it has one — it is the reward for looking, not a one-off at the
      // moment of solving.
      if (board.setShowSource(!board.showSource)) {
        board.startLiving(S.puzzle.animation, performance.now());
      }
      syncCompare();
      ensureFrame();
      break;
    }
    // One control, two depths: the collapsed circle opens the abilities, and
    // clicking the face again — now that you can see it is the avatar — goes
    // on into the avatar panel.
    case 'avatar-toggle':
      if (S.abilityFan) {
        closeAbilityFan();
        await openPanel('avatar');
      } else {
        S.abilityFan = true;
        syncAbilityFan();
      }
      break;
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
  if (!btn) return;
  // You opened it for this. Get it off the picture again.
  closeAbilityFan();
  triggerAbility(btn.dataset.ability);
});

// Anywhere else dismisses it. The tap is swallowed rather than passed through:
// the pop-up sits over the bottom-right of the picture, which is exactly where
// a thumb rests, and dismissing a menu should not also paint a cell.
document.addEventListener('pointerdown', (e) => {
  if (!S.abilityFan || e.target?.closest?.('#avatarWidget')) return;
  e.preventDefault();
  e.stopPropagation();
  closeAbilityFan();
}, true);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (dismissAddGuide) return dismissAddGuide();
    if (S.abilityFan) return closeAbilityFan();
    return closePanel();
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    return undoLast();
  }
  if (e.ctrlKey || e.metaKey) return undefined;
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
  // Ships translucent: the splat covers most of the picture at its peak, and
  // seeing the artwork through it is the point. The slider goes back to 100%.
  S.save.settings.opacity ??= 0.7;
  S.save.stats.mutedCells ??= 0;
  S.save.stats.patientLandings ??= 0;
  S.save.stats.hints ??= 0;
  S.save.stats.hintsEarned ??= 0;
  S.save.stats.hintsUsed ??= 0;
  S.save.stats.imported ??= 0;
  S.save.stats.daysVisited ??= 0;
  S.save.stats.points ??= 0;
  S.save.stats.pointsEarned ??= 0;
  // Tracking added with the play-stats dashboard — a save from before it counts
  // from zero, so these grow only from this release forward.
  S.save.stats.bestStreak ??= 0;
  S.save.stats.wrongTaps ??= 0;
  S.save.stats.dayStreak ??= 0;
  S.save.stats.bestDayStreak ??= 0;
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
  // Same reason as `race` above: a save written before the house existed keeps
  // its own avatar object, so DEFAULT_SAVE's house never reaches it.
  S.save.avatar.house ??= defaultHouse();
  const freshHouse = defaultHouse();
  S.save.avatar.house.room ??= freshHouse.room;
  S.save.avatar.house.lighting ??= freshHouse.lighting;
  S.save.avatar.house.unlocked ??= freshHouse.unlocked;
  if (!('pet' in S.save.avatar.house)) S.save.avatar.house.pet = freshHouse.pet;
  // Scene toggle and pet care, both added after the house shipped, so a save
  // from before them has neither. hideAvatar defaults off (she stays in the
  // room); petStats starts fresh and contented; petName is blank until named.
  S.save.avatar.house.hideAvatar ??= false;
  S.save.avatar.house.petName ??= '';
  S.save.avatar.house.petStats ??= defaultPetStats();
  S.save.avatar.house.props ??= {};
  // Same reason as `pet` above: a save written before parts were recolourable
  // has no map at all, and an absent one has to mean "everything at default"
  // rather than throwing on the first lookup.
  S.save.avatar.house.colours ??= {};
  // Rooms added in a later version have no entry yet, and a slot whose prop id
  // no longer exists falls back to that room's starter rather than rendering
  // an empty corner.
  for (const room of ROOMS) {
    const chosen = (S.save.avatar.house.props[room.id] ??= {});
    for (const slot of PROP_SLOTS) {
      const item = HOUSE_ITEMS.find((i) => i.id === chosen[slot]);
      if (!item || item.roomId !== room.id || item.slot !== slot) {
        chosen[slot] = starterFor(room.id, slot)?.id ?? null;
      }
    }
  }
  for (const id of freshHouse.unlocked) {
    if (!S.save.avatar.house.unlocked.includes(id)) S.save.avatar.house.unlocked.push(id);
  }
  // Phones have far less GPU headroom than a laptop, and the burst is the most
  // expensive thing here. Start them lighter; the slider still goes to 1.6.
  S.save.settings.density ??= matchMedia('(pointer: coarse)').matches ? 0.7 : 1;

  // Counts distinct calendar days the app has been opened on, not a strict
  // login streak — missing a day should not cost you a ladder you were on.
  const today = new Date().toDateString();
  if (S.save.stats.lastVisitDay !== today) {
    // Consecutive-day streak: if the last visit was yesterday the ladder grows,
    // otherwise it starts over at today. A save from before this shipped has no
    // usable lastVisitDay for the gap check, so it simply begins a new streak.
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (S.save.stats.lastVisitDay === yesterday.toDateString()) {
      S.save.stats.dayStreak++;
    } else {
      S.save.stats.dayStreak = 1;
    }
    S.save.stats.bestDayStreak = Math.max(S.save.stats.bestDayStreak, S.save.stats.dayStreak);
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
  // The markup ships collapsed, but say so from the one place that owns it
  // rather than relying on two files agreeing.
  syncAbilityFan();

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
  maybeFirstRunTour();
}

boot();
