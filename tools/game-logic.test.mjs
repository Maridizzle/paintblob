// Unit tests for the DOM-free gameplay logic: the hint economy and the
// achievement/streak bookkeeping. Both are plain functions/classes taking
// `now` and `stats` as explicit arguments precisely so they can be exercised
// here without a browser.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ACHIEVEMENTS, Achievements, StreakTracker } from '../src/achievements.js';
import {
  PASSIVE_HINT_INTERVAL, accruePassiveHint, grantHints, spendHint, pickHintTarget,
} from '../src/hints.js';
import { grantPoints, spendPoints, levelForPoints, cumulativeForLevel } from '../src/points.js';
import {
  ABILITIES, getDef, isUnlocked, defaultAbilityState, grantLevelUpCharges,
  activate, isActive, consumeActive,
} from '../src/abilities.js';
import { WARDROBE_ITEMS } from '../src/wardrobe.js';
import {
  CHUNKS, MIN_STEP, labL, rampFrom, randomStops, lerpHue, scramble, swap, isSolved, placedCount, partnerFor,
} from '../src/overtime.js';
// Aliased: THEMES is already taken further down by the picture-tag list.
import { THEMES as APP_THEMES, DEFAULT_THEME, isTheme, themeOr } from '../src/themes.js';
import {
  CHAPTERS, DEFAULT_CHAPTER, getChapter, chapterOr, defaultStory, nodeState,
  isStoryPuzzle, openingSeen,
} from '../src/story.js';
import { letterSVG, isSpeaker } from '../src/letters.js';
import {
  COLOURS as SWAP_COLOURS, PAIRS as SWAP_PAIRS, scramble as swapScramble,
  swap as swapNames, isSolved as swapSolved, placedCount as swapPlaced,
} from '../src/swap.js';
import { LIVING_EFFECTS } from '../src/render.js';
import { Burst } from '../src/paint-fx.js';
import {
  buildAvatarSVG, defaultAvatarCustomize, setVariant, VARIANTS, RACE_PROFILE, raceSkinPalette,
} from '../src/avatar.js';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

/**
 * A source file as text, with line endings normalised.
 *
 * Several tests below assert on the *structure* of the source rather than on
 * behaviour — slicing a function out by looking for "\n}\n", matching a
 * pattern that spans lines. A Windows checkout hands those back with CRLF, at
 * which point the search finds nothing: indexOf returns -1, the slice collapses
 * to a single character, and the assertion fails on a file that is perfectly
 * correct. A release build died on exactly that. Line endings are not what any
 * of these tests are about, so they are normalised on the way in.
 */
const readSource = (rel) =>
  fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
const IDS = new Set(ACHIEVEMENTS.map((a) => a.id));

/* -------------------------------------------------------------------- hints */

test('accruePassiveHint grants exactly one hint every Nth cell', () => {
  const stats = { cells: 0 };
  let granted = 0;
  for (let i = 1; i <= PASSIVE_HINT_INTERVAL * 3; i++) {
    stats.cells = i;
    if (accruePassiveHint(stats)) granted++;
  }
  assert.equal(granted, 3);
  assert.equal(stats.hints, 3);
  assert.equal(stats.hintsEarned, 3);
});

test('accruePassiveHint does nothing off the interval', () => {
  const stats = { cells: PASSIVE_HINT_INTERVAL - 1 };
  assert.equal(accruePassiveHint(stats), false);
  assert.equal(stats.hints, undefined);
});

test('grantHints raises both the spendable balance and the lifetime total', () => {
  const stats = {};
  grantHints(stats, 5);
  grantHints(stats, 2);
  assert.equal(stats.hints, 7);
  assert.equal(stats.hintsEarned, 7);
});

test('grantHints defaults to a single hint', () => {
  const stats = {};
  grantHints(stats);
  assert.equal(stats.hints, 1);
});

test('spendHint refuses an empty balance, and tracks lifetime uses separately from the balance', () => {
  const stats = { hints: 1 };
  assert.equal(spendHint(stats), true);
  assert.equal(stats.hints, 0);
  assert.equal(stats.hintsUsed, 1);
  assert.equal(spendHint(stats), false, 'balance is now 0, a second spend must fail');
  assert.equal(stats.hints, 0);
  assert.equal(stats.hintsUsed, 1, 'a failed spend must not count as a use');
});

test('spendHint on a fresh stats object with no hints field fails cleanly', () => {
  assert.equal(spendHint({}), false);
});

test('pickHintTarget prefers the biggest unfilled cell of the held colour', () => {
  const cells = [
    { id: 0, colour: 0, area: 50 },
    { id: 1, colour: 0, area: 200 },
    { id: 2, colour: 1, area: 900 },
  ];
  assert.equal(pickHintTarget(cells, new Set(), 0).id, 1);
});

test('pickHintTarget falls back to the biggest unfilled cell of any colour', () => {
  const cells = [
    { id: 0, colour: 0, area: 50 },
    { id: 1, colour: 1, area: 900 },
  ];
  assert.equal(pickHintTarget(cells, new Set(), 2).id, 1); // nothing takes colour 2
});

test('pickHintTarget skips filled cells', () => {
  const cells = [
    { id: 0, colour: 0, area: 900 },
    { id: 1, colour: 0, area: 50 },
  ];
  assert.equal(pickHintTarget(cells, new Set([0]), 0).id, 1);
});

/* ------------------------------------------------------------- achievements */

test('every achievement id is unique', () => {
  const ids = ACHIEVEMENTS.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('award() unlocks an event achievement exactly once', () => {
  const fired = [];
  const a = new Achievements();
  a.onUnlock((def) => fired.push(def.id));
  assert.equal(a.award('combo-15'), true);
  assert.equal(a.award('combo-15'), false);
  assert.deepEqual(fired, ['combo-15']);
});

test('award() on an unknown id is a harmless no-op, not a throw', () => {
  const a = new Achievements();
  assert.equal(a.award('not-a-real-id'), false);
});

test('sync() fires every tracked achievement whose goal is already met', () => {
  const fired = [];
  const a = new Achievements();
  a.onUnlock((def) => fired.push(def.id));
  a.sync({ cells: 50 });
  assert.ok(fired.includes('blob-1'));
  assert.ok(fired.includes('blob-10'));
  assert.ok(fired.includes('blob-50'));
  assert.ok(!fired.includes('blob-250'));
});

test('sync() never fires the same tracked achievement twice', () => {
  const fired = [];
  const a = new Achievements();
  a.onUnlock((def) => fired.push(def.id));
  a.sync({ cells: 1 });
  a.sync({ cells: 1 });
  assert.equal(fired.filter((id) => id === 'blob-1').length, 1);
});

test('stockpile tracks the live hint balance, not a lifetime total', () => {
  const a = new Achievements();
  a.sync({ hints: 20 });
  assert.ok(a.has('stockpile'));
});

test('completionist fires once every other achievement is unlocked, and not before', () => {
  const others = ACHIEVEMENTS.filter((d) => d.id !== 'completionist').map((d) => d.id);
  const a = new Achievements(others);
  assert.ok(!a.has('completionist'), 'fixture should not pre-unlock the finale itself');

  const fired = [];
  a.onUnlock((def) => fired.push(def.id));
  a.sync({});
  assert.deepEqual(fired, ['completionist']);
});

test('completionist does not fire while any other achievement is still missing', () => {
  const others = ACHIEVEMENTS.filter((d) => d.id !== 'completionist').map((d) => d.id);
  others.pop(); // leave exactly one un-unlocked
  const a = new Achievements(others);
  a.sync({});
  assert.ok(!a.has('completionist'));
});

test('list() sorts unearned before earned, closest-to-goal first among the unearned', () => {
  const a = new Achievements(['blob-1']);
  const list = a.list({ cells: 5 });

  const firstEarnedIndex = list.findIndex((x) => x.earned);
  assert.ok(firstEarnedIndex > 0, 'at least one unearned entry should lead the list');
  assert.ok(
    list.slice(firstEarnedIndex).every((x) => x.earned),
    'no unearned entry should appear after the first earned one',
  );
  assert.equal(list[0].id, 'blob-10', 'closest unearned progress (5/10) should lead');
});

/* ----------------------------------------------------------- StreakTracker */

test('StreakTracker.fill reports every combo tier crossed by the current streak', () => {
  const s = new StreakTracker();
  let now = 0;
  let earned = [];
  for (let i = 0; i < 80; i++) {
    now += 1000; // well outside the 10s rapid window, so only combo tiers trip
    earned = s.fill(now);
  }
  assert.equal(s.combo, 80);
  assert.deepEqual(
    earned.filter((id) => id.startsWith('combo')).sort(),
    ['combo-15', 'combo-40', 'combo-80'],
  );
});

test('StreakTracker.wrong() resets the combo and counts toward wrongClicks', () => {
  const s = new StreakTracker();
  for (let i = 0; i < 5; i++) s.fill(i * 10);
  s.wrong();
  assert.equal(s.combo, 0);
  assert.equal(s.wrongClicks, 1);
});

test('StreakTracker.fill reports rapid tiers within a rolling 10s window', () => {
  const s = new StreakTracker();
  let earned = [];
  for (let i = 0; i < 20; i++) earned = s.fill(i * 100); // 20 fills across 1.9s
  assert.ok(earned.includes('rapid-10'));
  assert.ok(earned.includes('rapid-20'));
});

test('StreakTracker.fill does not report rapid tiers once fills spread out', () => {
  const s = new StreakTracker();
  let earned = [];
  for (let i = 0; i < 15; i++) earned = s.fill(i * 2000); // 2s apart, outside the window
  assert.ok(!earned.includes('rapid-10'));
});

test('StreakTracker.fill flags night-owl and early-bird from distinct, non-overlapping hours', () => {
  const s = new StreakTracker();
  const at = (hour) => new Date(2026, 0, 1, hour, 0, 0).getTime();
  assert.ok(s.fill(at(3)).includes('night-owl'));
  assert.ok(!s.fill(at(3)).includes('early-bird'));
  assert.ok(s.fill(at(6)).includes('early-bird'));
  assert.ok(!s.fill(at(6)).includes('night-owl'));
  assert.ok(!s.fill(at(12)).includes('night-owl'));
  assert.ok(!s.fill(at(12)).includes('early-bird'));
});

/* ---------------------------------------------------------------- points */

test('grantPoints raises both the spendable balance and the lifetime total', () => {
  const stats = {};
  grantPoints(stats, 3);
  grantPoints(stats, 2);
  assert.equal(stats.points, 5);
  assert.equal(stats.pointsEarned, 5);
});

test('grantPoints defaults to a single point', () => {
  const stats = {};
  grantPoints(stats);
  assert.equal(stats.points, 1);
});

test('spendPoints refuses an insufficient balance without touching it', () => {
  const stats = { points: 3 };
  assert.equal(spendPoints(stats, 5), false);
  assert.equal(stats.points, 3);
});

test('spendPoints on a fresh stats object with no points field fails cleanly', () => {
  assert.equal(spendPoints({}, 1), false);
});

test('spendPoints succeeds exactly at the balance and leaves zero behind', () => {
  const stats = { points: 5 };
  assert.equal(spendPoints(stats, 5), true);
  assert.equal(stats.points, 0);
});

test('levelForPoints starts at 1 and only rises once the next level\'s cost is met', () => {
  assert.equal(levelForPoints(0), 1);
  assert.equal(levelForPoints(cumulativeForLevel(2) - 1), 1);
  assert.equal(levelForPoints(cumulativeForLevel(2)), 2);
  assert.equal(levelForPoints(cumulativeForLevel(5)), 5);
});

/* -------------------------------------------------------------- abilities */

test('every ability id is unique', () => {
  const ids = ABILITIES.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('ability cost tiers strictly rise in unlock level as max charges falls', () => {
  const byUnlock = [...ABILITIES].sort((a, b) => a.unlockLevel - b.unlockLevel);
  for (let i = 1; i < byUnlock.length; i++) {
    assert.ok(
      byUnlock[i].maxCharges <= byUnlock[i - 1].maxCharges,
      `${byUnlock[i].id} (unlocks later) should not have more max charges than ${byUnlock[i - 1].id}`,
    );
  }
});

test('defaultAbilityState gives every ability a full charge pool up front', () => {
  const state = defaultAbilityState();
  for (const a of ABILITIES) assert.equal(state[a.id].charges, a.maxCharges);
});

test('activate spends exactly one charge and refuses at zero', () => {
  const state = defaultAbilityState();
  const def = getDef('colour-flash'); // Beacon
  for (let i = 0; i < def.maxCharges; i++) assert.equal(activate(state, def.id, 0), true);
  assert.equal(state[def.id].charges, 0);
  assert.equal(activate(state, def.id, 0), false);
});

test('activate on an ability with a duration opens an active window isActive sees', () => {
  const state = defaultAbilityState();
  activate(state, 'focus', 1000);
  assert.equal(isActive(state, 'focus', 1500), true);
  assert.equal(isActive(state, 'focus', 1000 + getDef('focus').durationMs + 1), false);
});

test('activate on a zero-duration ability (an instant effect) opens no active window', () => {
  const state = defaultAbilityState();
  activate(state, 'prism', 1000); // instant fill
  assert.equal(isActive(state, 'prism', 1000), false);
});

test('consumeActive ends a window early', () => {
  const state = defaultAbilityState();
  activate(state, 'focus', 0);
  assert.equal(isActive(state, 'focus', 10), true);
  consumeActive(state, 'focus');
  assert.equal(isActive(state, 'focus', 10), false);
});

test('isUnlocked gates purely on level vs unlockLevel', () => {
  const def = getDef('half-fill'); // Floodgate
  assert.equal(isUnlocked(def, def.unlockLevel - 1), false);
  assert.equal(isUnlocked(def, def.unlockLevel), true);
});

test('abilities unlock one per level across 1..5, not clumped in the first few', () => {
  // The five that survived the cull arrive one at a time as you climb, not all
  // at once. (Guards the old "level 3 with almost every ability" complaint.)
  const levels = ABILITIES.map((a) => a.unlockLevel).sort((x, y) => x - y);
  assert.deepEqual(levels, [1, 2, 3, 4, 5]);
  const atLevel3 = ABILITIES.filter((a) => isUnlocked(a, 3)).length;
  assert.equal(atLevel3, 3, 'level 3 should grant 3 abilities, not most of them');
});

test('the cut abilities are gone, and every survivor is a reveal, filter or fill', () => {
  const ids = new Set(ABILITIES.map((a) => a.id));
  for (const gone of ['precision-ping', 'number-recolor', 'steady-hand', 'golden-cell', 'colour-surge', 'streak-shield']) {
    assert.ok(!ids.has(gone), `${gone} should have been cut`);
  }
  assert.deepEqual([...ids].sort(), ['colour-flash', 'explode', 'focus', 'half-fill', 'prism'].sort());
  // And game.js wires each visible effect, and no longer reaches for the cut ones.
  const game = readSource('src/game.js');
  assert.match(game, /case 'focus':\s*\n\s*if \(S\.selected >= 0\) board\.setFocus\(/, 'Focus must grey the board');
  assert.match(game, /case 'prism':[\s\S]*?fillOnePerColour\(\)/, 'Prism must fill one of every colour');
  assert.match(game, /case 'explode':[\s\S]*?explodeHeldColour\(\)/, 'Explode must burst a third of the colour');
  assert.ok(!/NUMBER_RECOLOR_CYCLE|markGolden|colour-surge/.test(game), 'no reference to a cut ability should remain');
});

test('grantLevelUpCharges refills one charge per level-up, capped at max, only once unlocked', () => {
  const state = defaultAbilityState();
  const def = getDef('colour-flash'); // levelsPerCharge 1
  const L = def.unlockLevel; // read live so this survives re-tiering
  activate(state, def.id, 0);
  activate(state, def.id, 0);
  assert.equal(state[def.id].charges, def.maxCharges - 2);
  grantLevelUpCharges(state, L - 1); // below unlockLevel: no-op
  assert.equal(state[def.id].charges, def.maxCharges - 2);
  grantLevelUpCharges(state, L);
  assert.equal(state[def.id].charges, def.maxCharges - 1);
  // Enough further level-ups to overshoot max, proving the cap holds.
  for (let lv = L + 1; lv <= L + def.maxCharges; lv++) grantLevelUpCharges(state, lv);
  assert.equal(state[def.id].charges, def.maxCharges);
});

test('half-fill only regains a charge every second level-up, per its slower levelsPerCharge', () => {
  const state = defaultAbilityState();
  const def = getDef('half-fill'); // maxCharges 1, levelsPerCharge 2
  const L = def.unlockLevel; // read live so this survives re-tiering
  activate(state, def.id, 0);
  assert.equal(state[def.id].charges, 0);
  grantLevelUpCharges(state, L);
  assert.equal(state[def.id].charges, 0, 'one level-up since unlock is not enough yet');
  grantLevelUpCharges(state, L + 1);
  assert.equal(state[def.id].charges, 1, 'the second level-up since unlock grants the charge');
});

/* --------------------------------------------------------------- wardrobe */

test('every wardrobe item id is unique', () => {
  const ids = WARDROBE_ITEMS.map((i) => i.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('every starter wardrobe item is free', () => {
  for (const item of WARDROBE_ITEMS) {
    if (item.source === 'starter') assert.equal(item.price, 0, `${item.id} is a starter item but has a price`);
  }
});

/* ----------------------------------------------------- referential integrity */

// Achievements.award() silently no-ops on an id with no matching definition —
// exactly what a typo produces, with no error to point at it. These scan the
// real source for every id literal handed to award()/push()/has() and check
// it against the real list, catching that typo at test time instead of at
// "why didn't that unlock".

test('every achievement id awarded by game.js exists in ACHIEVEMENTS', () => {
  const text = readSource('src/game.js');
  const ids = [...text.matchAll(/achievements\.award\('([^']+)'\)/g)].map((m) => m[1]);
  assert.ok(ids.length > 0, 'sanity check: the scan should find some award() calls');
  for (const id of ids) assert.ok(IDS.has(id), `game.js awards unknown achievement id "${id}"`);
});

test('every achievement id pushed by StreakTracker exists in ACHIEVEMENTS', () => {
  const text = readSource('src/achievements.js');
  const ids = [...text.matchAll(/earned\.push\('([^']+)'\)/g)].map((m) => m[1]);
  assert.ok(ids.length > 0, 'sanity check: the scan should find some earned.push() calls');
  for (const id of ids) assert.ok(IDS.has(id), `StreakTracker pushes unknown achievement id "${id}"`);
});

test('every achievement id checked with unlocked.has() in achievements.js exists in ACHIEVEMENTS', () => {
  const text = readSource('src/achievements.js');
  const ids = [...text.matchAll(/unlocked\.has\('([^']+)'\)/g)].map((m) => m[1]);
  assert.ok(ids.length > 0, 'sanity check: the scan should find at least the completionist check');
  for (const id of ids) assert.ok(IDS.has(id), `references unknown achievement id "${id}"`);
});

test('every achievement outfit field references a real WARDROBE_ITEMS id', () => {
  const wardrobeIds = new Set(WARDROBE_ITEMS.map((i) => i.id));
  const outfits = ACHIEVEMENTS.filter((a) => a.outfit).map((a) => a.outfit);
  assert.ok(outfits.length > 0, 'sanity check: the scan should find at least one outfit field');
  for (const id of outfits) assert.ok(wardrobeIds.has(id), `unknown wardrobe item id "${id}"`);
});

/* ---------------------------------------------------------------- avatar */

// avatar.js is pure ESM over wardrobe.js with no DOM, so the SVG builder
// runs here directly. The failure mode of a coordinate-driven generator is
// not a thrown error — it is a path string quietly containing "NaN", which
// renders as nothing at all. These sweep for exactly that.

const SLOTS = new Set(['skin', 'hair', 'eyes', 'shirt', 'bottoms', 'dress', 'socks', 'shoes']);

/** Every meaningful combination of the customization axes. */
function* everyAvatar() {
  for (const style of VARIANTS.style) {
    for (const race of VARIANTS.race) {
      for (const gender of VARIANTS.gender) {
        for (const shape of VARIANTS.faceShape) {
          for (const hair of VARIANTS.hairStyle) {
            for (const eyes of VARIANTS.eyesStyle) {
              const c = defaultAvatarCustomize();
              c.style = style;
              c.race = race;
              c.gender = gender;
              c.face.shape = shape;
              c.hair.style = hair;
              c.eyes.style = eyes;
              yield [`${style}/${race}/${gender}/${shape}/${hair}/${eyes}`, c];
            }
          }
        }
      }
    }
  }
}

test('no avatar combination emits NaN, undefined or Infinity into a path', () => {
  let count = 0;
  for (const [label, c] of everyAvatar()) {
    const svg = buildAvatarSVG(c);
    assert.ok(!/NaN|undefined|Infinity/.test(svg), `${label} produced a poisoned path`);
    count++;
  }
  assert.ok(count > 300, `sanity check: expected a real sweep, got ${count}`);
});

test('every wardrobe item renders cleanly on every race', () => {
  for (const race of VARIANTS.race) {
    for (const item of WARDROBE_ITEMS) {
      const c = defaultAvatarCustomize();
      c.race = race;
      if (item.slot === 'dress') c.dress = { itemId: item.id, colour: '#c9799a' };
      else c[item.slot] = { itemId: item.id, colour: '#808080' };
      const svg = buildAvatarSVG(c);
      assert.ok(!/NaN|undefined|Infinity/.test(svg), `${race} + ${item.id} produced a poisoned path`);
    }
  }
});

test('every wardrobe item stays in frame at the body-slider extremes', () => {
  // The new cuts (skirt, sundress, joggers) introduce their own flare/taper
  // math, so combine each garment with the tiniest and largest bodies — a
  // gap or blow-out shows up as a coordinate off the 120x210 frame.
  for (const item of WARDROBE_ITEMS) {
    for (const height of [0.85, 1.2]) {
      for (const weight of [0.8, 1.3]) {
        const c = defaultAvatarCustomize();
        c.height = height;
        c.weight = weight;
        if (item.slot === 'dress') c.dress = { itemId: item.id, colour: '#c9799a' };
        else c[item.slot] = { itemId: item.id, colour: '#808080' };
        const svg = buildAvatarSVG(c);
        assert.ok(!/NaN|undefined|Infinity/.test(svg), `${item.id} h${height} w${weight} poisoned`);
        for (const m of svg.matchAll(/(-?\d+\.\d+),(-?\d+\.\d+)/g)) {
          const x = Number(m[1]);
          const y = Number(m[2]);
          assert.ok(x > -22 && x < 142, `${item.id} h${height} w${weight}: x ${x} out of frame`);
          assert.ok(y > -22 && y < 232, `${item.id} h${height} w${weight}: y ${y} out of frame`);
        }
      }
    }
  }
});

test('the slider extremes stay clean and in frame', () => {
  for (const race of VARIANTS.race) {
    for (const height of [0.85, 1, 1.2]) {
      for (const weight of [0.8, 1, 1.3]) {
        const c = defaultAvatarCustomize();
        c.race = race;
        c.height = height;
        c.weight = weight;
        const svg = buildAvatarSVG(c);
        assert.ok(!/NaN|undefined|Infinity/.test(svg), `${race} h${height} w${weight} poisoned`);
        // A runaway landmark shows up as a coordinate far outside the frame.
        const nums = [...svg.matchAll(/(-?\d+\.\d+),(-?\d+\.\d+)/g)];
        for (const m of nums) {
          const x = Number(m[1]);
          const y = Number(m[2]);
          assert.ok(x > -20 && x < 140, `${race} h${height} w${weight}: x ${x} out of frame`);
          assert.ok(y > -20 && y < 230, `${race} h${height} w${weight}: y ${y} out of frame`);
        }
      }
    }
  }
});

test('every emitted data-slot is one of the known eight, and groups balance', () => {
  for (const [label, c] of everyAvatar()) {
    const svg = buildAvatarSVG(c);
    const slots = [...svg.matchAll(/<g data-slot="([a-z]+)"/g)].map((m) => m[1]);
    for (const s of slots) assert.ok(SLOTS.has(s), `${label} emitted unknown slot "${s}"`);
    assert.equal((svg.match(/<g /g) ?? []).length, (svg.match(/<\/g>/g) ?? []).length,
      `${label} has unbalanced groups`);
  }
});

test('the bare figure exposes every part the customize tab can recolour', () => {
  // The customize tab shows buildAvatarSVG rather than the room scene, and it
  // is the only place a part can be picked. Anything carrying a `colour` in
  // the save but no group in this render is a colour you own and can never
  // reach.
  const groups = (c) =>
    new Set([...buildAvatarSVG(c).matchAll(/<g data-slot="([a-z]+)"/g)].map((m) => m[1]));

  // A dress stands in for the shirt and bottoms, so no single render carries
  // all eight — undressed covers seven, and the dress covers the eighth.
  const plain = groups(defaultAvatarCustomize());
  for (const slot of SLOTS) {
    if (slot === 'dress') continue;
    assert.ok(plain.has(slot), `no <g data-slot="${slot}"> to click on the customize screen`);
  }

  const c = defaultAvatarCustomize();
  c.dress.itemId = 'dress-basic';
  assert.ok(groups(c).has('dress'), 'an equipped dress is not clickable');
});

test('customize and outfits stage the figure, room and abilities the scene', () => {
  // Which builder each tab uses is the whole point of the customize screen —
  // rendering the room there puts her at about 77px and her eyes at two.
  const game = readSource('src/game.js');
  assert.match(game, /function paintStage\(stage\)/,
    'the stage builder choice must live in one place, not be repeated per call site');
  assert.match(game, /const bare = S\.avatarTab === 'customize' \|\| S\.avatarTab === 'outfits'/);
  assert.ok(!/stage\.innerHTML = buildRoomSVG/.test(game),
    'a call site is painting the room directly instead of going through paintStage');
  const css = readSource('src/styles.css');
  assert.match(css, /\.avatar-stage\.figure\b/,
    'the figure stage needs its own height-driven sizing or it overflows the panel');
});

test('a save predating the race field still renders, defaulting to human', () => {
  const c = defaultAvatarCustomize();
  delete c.race;
  const svg = buildAvatarSVG(c);
  assert.ok(!/NaN|undefined|Infinity/.test(svg));
  const human = defaultAvatarCustomize();
  assert.equal(svg, buildAvatarSVG(human), 'a missing race should render exactly as human');
});

test('buildAvatarSVG survives a completely empty customize object', () => {
  const svg = buildAvatarSVG({});
  assert.ok(!/NaN|undefined|Infinity/.test(svg));
  assert.ok(svg.startsWith('<svg'));
});

test('setVariant accepts known races and ignores anything else', () => {
  const c = defaultAvatarCustomize();
  setVariant(c, 'race', 'orc');
  assert.equal(c.race, 'orc');
  setVariant(c, 'race', 'kobold');
  assert.equal(c.race, 'orc', 'an unknown race must be ignored, not stored');
});

test('changing race leaves the chosen skin colour alone', () => {
  const c = defaultAvatarCustomize();
  c.skin.colour = '#123456';
  setVariant(c, 'race', 'orc');
  assert.equal(c.skin.colour, '#123456');
});

test('every race profile has a usable skin palette', () => {
  for (const race of VARIANTS.race) {
    assert.ok(RACE_PROFILE[race], `${race} is listed in VARIANTS but has no profile`);
    const palette = raceSkinPalette(race);
    assert.ok(palette.length >= 4, `${race} palette is too short`);
    for (const hex of palette) assert.match(hex, /^#[0-9a-f]{6}$/i, `${race} has a malformed hex`);
  }
  assert.deepEqual(raceSkinPalette('kobold'), raceSkinPalette('human'),
    'an unknown race should fall back rather than throw');
});

test('both DEFAULT_SAVE literals declare a race, and boot backfills it', () => {
  for (const f of ['src/platform.js', 'electron/main.cjs']) {
    const text = readSource(f);
    assert.match(text, /race: 'human'/, `${f} is missing race in DEFAULT_SAVE`);
  }
  // The backfill is the only path that reaches an existing save, since
  // neither backend deep-merges `avatar`.
  const game = readSource('src/game.js');
  assert.match(game, /customize\.race \?\?= 'human'/,
    'boot() must backfill customize.race or every returning player loses their avatar');
});

/* ------------------------------------------------------- avatar: the ink */

// The Inked style adds contour linework by putting a stroke on the same <g>
// that carries each slot's fill. These pin the two properties that keeps it
// honest: it must never tint with the fill (or a recoloured part would drag
// its outline with it), and a translucent wash must never come back outlined.

test('a save predating the style field renders as inked, the new default', () => {
  const c = defaultAvatarCustomize();
  delete c.style;
  const inked = defaultAvatarCustomize();
  assert.equal(buildAvatarSVG(c), buildAvatarSVG(inked),
    'a missing style must default to inked, matching the boot() backfill');
});

test('both DEFAULT_SAVE literals declare a style, and boot backfills it', () => {
  for (const f of ['src/platform.js', 'electron/main.cjs']) {
    assert.match(readSource(f), /style: 'inked'/, `${f} is missing style in DEFAULT_SAVE`);
  }
  assert.match(readSource('src/game.js'), /customize\.style \?\?= 'inked'/,
    'boot() must backfill customize.style — an existing save replaces avatar wholesale');
});

test('every customize row with more than four options is allowed to wrap', () => {
  // `.segmented` is overflow:hidden with no wrap, so a long row silently
  // drops its last buttons off the end rather than showing you it did. This
  // is the check that catches a VARIANTS list growing past what one line
  // holds — which is exactly how the Style row broke when it went from two
  // entries to six.
  const game = readSource('src/game.js');
  const LONG = 4;
  const rows = {
    Style: VARIANTS.style, Race: VARIANTS.race, Gender: VARIANTS.gender,
    Hair: VARIANTS.hairStyle, Eyes: VARIANTS.eyesStyle, Face: VARIANTS.faceShape,
  };
  for (const [label, list] of Object.entries(rows)) {
    if (list.length <= LONG) continue;
    const call = game.slice(game.indexOf(`pick('${label}'`));
    assert.ok(call.slice(0, call.indexOf(');')).includes(', true'),
      `the ${label} row has ${list.length} options and must pass wrap`);
  }
});

test('setVariant accepts known styles and ignores anything else', () => {
  const c = defaultAvatarCustomize();
  setVariant(c, 'style', 'classic');
  assert.equal(c.style, 'classic');
  setVariant(c, 'style', 'watercolour');
  assert.equal(c.style, 'classic', 'an unknown style must be ignored, not stored');
});

test('classic draws no linework at all, so it is the figure it always was', () => {
  for (const [label, c] of everyAvatar()) {
    if (c.style !== 'classic') continue;
    assert.ok(!/ stroke="#/.test(buildAvatarSVG(c)),
      `${label} leaked ink into the classic style`);
  }
});

test('every slot carries linework under inked, and none of it is tinted', () => {
  const c = defaultAvatarCustomize();
  c.dress.itemId = 'dress-basic';
  for (const customize of [defaultAvatarCustomize(), c]) {
    const svg = buildAvatarSVG(customize);
    for (const m of svg.matchAll(/<g data-slot="([a-z]+)"[^>]*>/g)) {
      assert.ok(/ stroke="#/.test(m[0]) || svg.slice(m.index).startsWith(`${m[0]}<g fill="#`),
        `the ${m[1]} slot draws no outline under inked`);
    }
    // The line is one fixed near-black everywhere. A stroke derived from the
    // slot's own colour would look better on paper and be wrong here: every
    // part recolours to any hue, and there is no colour maths in this file.
    const inks = new Set([...svg.matchAll(/stroke="(#[0-9a-f]{6})"/gi)].map((m) => m[1]));
    assert.equal(inks.size, 1, `expected one ink colour, got ${[...inks].join(', ')}`);
  }
});

test('no translucent wash is ever outlined, in any combination', () => {
  // A wash overrides the group's fill by carrying its own; under Inked it has
  // to override the group's stroke the same way, or it comes back ringed in
  // black. Adding a new shade()/light()/waistband and forgetting the opt-out
  // is the exact mistake this catches.
  for (const [label, c] of everyAvatar()) {
    for (const m of buildAvatarSVG(c).matchAll(/fill="rgba\([^"]*\)"(?: stroke="([^"]*)")?/g)) {
      assert.equal(m[1], 'none', `${label}: a wash is taking the outline — ${m[0]}`);
    }
  }
});

test('every wardrobe item is outlined as one garment, not as loose pieces', () => {
  // Union inking draws each slot twice: a fattened ink copy, then the real
  // one over it, so only the outer fringe survives and a sleeve's join with
  // its shirt stays invisible. If a garment stops being double-emitted it has
  // fallen back to outlining every piece, which is the "stacked slabs" look.
  for (const item of WARDROBE_ITEMS) {
    const c = defaultAvatarCustomize();
    if (item.slot === 'dress') c.dress = { itemId: item.id, colour: '#c9799a' };
    else c[item.slot] = { itemId: item.id, colour: '#808080' };
    const svg = buildAvatarSVG(c);
    assert.match(svg, new RegExp(`<g data-slot="${item.slot}" fill="[^"]*"><g fill="#`),
      `${item.id} is not union-inked`);
    assert.ok(!/NaN|undefined|Infinity/.test(svg), `${item.id} produced a poisoned path`);
  }
});

/* ---------------------------------------------------------------- themes */

test('every theme in the catalogue is actually implemented', () => {
  // A theme the picker offers but the stylesheet has no block for renders as
  // the default with a wrong button lit — no error, no clue, just wrong.
  const css = readSource('src/styles.css');
  for (const t of APP_THEMES) {
    if (t.id === DEFAULT_THEME) continue; // the default IS :root
    assert.ok(css.includes(`[data-theme="${t.id}"]`), `no styles for theme "${t.id}"`);
  }
  assert.ok(isTheme(DEFAULT_THEME), 'the default must be in the catalogue');
  const ids = APP_THEMES.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate theme id');
  for (const t of APP_THEMES) {
    assert.ok(t.label && t.blurb, `theme "${t.id}" needs a label and a blurb`);
  }
});

test('an unknown theme falls back instead of leaving the app unstyled', () => {
  assert.equal(themeOr('fae'), 'fae');
  assert.equal(themeOr('chartreuse'), DEFAULT_THEME);
  assert.equal(themeOr(undefined), DEFAULT_THEME);
  assert.equal(themeOr(null), DEFAULT_THEME);
});

test('a theme overrides tokens and never reaches past them', () => {
  const css = readSource('src/styles.css');
  for (const t of APP_THEMES) {
    if (t.id === DEFAULT_THEME) continue;
    const start = css.indexOf(`[data-theme="${t.id}"]`);
    const block = css.slice(start, css.indexOf('\n}', start));
    // Comments come out wholesale first — a prose line can carry a colon
    // ("No diagonals: the void's"), which a line-at-a-time guess reads as a
    // declaration and fails on.
    const bare = block.replace(/\/\*[\s\S]*?\*\//g, '');
    // Only custom properties. A theme that starts writing real rules stops
    // being swappable and starts being a second stylesheet.
    for (const decl of bare.split(';')) {
      const d = decl.trim();
      if (!d || !d.includes(':') || d.includes('{')) continue;
      assert.ok(d.startsWith('--'), `theme "${t.id}" sets something that is not a token: ${d.slice(0, 60)}`);
    }
  }
});

test('no rule below the token blocks names an accent colour', () => {
  // What makes a theme a theme: every colour in the app comes from a token, so
  // swapping the tokens swaps the app. Sixteen rules were tinting with literal
  // cyan when Tee Vibes was first switched on, which left a cyan ring round the
  // selected tub in a world with no cyan in it. Anything needing an accent at a
  // custom alpha writes rgba(var(--accent-rgb), …) instead.
  const css = readSource('src/styles.css');
  const rules = css.slice(css.indexOf('* { box-sizing'));
  for (const [name, rgb] of [['cyan', '53, 233, 255'], ['green', '77, 255, 145'],
    ['orange', '255, 106, 31']]) {
    assert.ok(!rules.includes(`rgba(${rgb}`), `a rule still tints with literal ${name}`);
  }
  for (const hex of ['#35e9ff', '#4dff91', '#ff6a1f']) {
    assert.ok(!rules.includes(hex), `a rule still names ${hex} directly`);
  }
  // And every theme has to supply the channels, or those rules go transparent.
  for (const t of APP_THEMES) {
    const block = t.id === DEFAULT_THEME
      ? css.slice(css.indexOf(':root {'), css.indexOf('\n}', css.indexOf(':root {')))
      : css.slice(css.indexOf(`[data-theme="${t.id}"]`),
        css.indexOf('\n}', css.indexOf(`[data-theme="${t.id}"]`)));
    for (const tok of ['--accent-rgb', '--accent2-rgb', '--hot-rgb']) {
      assert.ok(block.includes(tok), `theme "${t.id}" is missing ${tok}`);
    }
  }
});

test('Tee Vibes keeps its magenta-and-gold rule', () => {
  // The hard rule of chapter one's look. One cyan token and it stops reading
  // as somewhere you arrived and starts reading as a hue rotation.
  const css = readSource('src/styles.css');
  const start = css.indexOf('[data-theme="fae"]');
  const block = css.slice(start, css.indexOf('\n}', start));
  for (const hex of block.match(/#[0-9a-f]{6}/gi) ?? []) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    // Cyan and green are the void's voices: both are green-dominant. Nothing
    // in this theme may be.
    assert.ok(!(g > r && g > b), `${hex} is green-dominant, which Tee Vibes forbids`);
  }
  for (const rgba of block.match(/rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+/g) ?? []) {
    const [r, g, b] = rgba.match(/\d+/g).map(Number);
    if (r === g && g === b) continue; // neutrals are fine — grain, shadow, ink
    assert.ok(!(g > r && g > b), `${rgba}) is green-dominant, which Tee Vibes forbids`);
  }
});

test('both DEFAULT_SAVE literals declare a theme, and boot backfills it', () => {
  for (const f of ['src/platform.js', 'electron/main.cjs']) {
    assert.match(readSource(f), /theme: 'void'/, `${f} is missing theme in DEFAULT_SAVE`);
  }
  const game = readSource('src/game.js');
  assert.match(game, /settings\.theme \?\?= DEFAULT_THEME/, 'boot() must backfill settings.theme');
  // settings IS deep-merged by both backends, unlike avatar — but the backfill
  // is still what reaches a save written before the field existed.
  assert.match(game, /document\.documentElement\.dataset\.theme = themeOr\(/,
    'the theme must reach the DOM through themeOr, so a stale id cannot strand the app');
});

/* ---------------------------------------------------------------- story */

// Story mode's data and gating are pure, like the rest of the DOM-free logic,
// so all of it is exercised here. The board and the cutscene are drawn in
// game.js and only checked structurally.

test('chapter one is a coherent seven-stone path', () => {
  const ch = getChapter(1);
  assert.equal(ch.id, 1);
  assert.ok(ch.title && ch.theme, 'a chapter needs a title and a theme to hand out');
  assert.ok(isTheme(ch.theme), `chapter theme "${ch.theme}" is not a real theme`);
  assert.equal(ch.nodes.length, 7, 'chapter one has seven stones');

  const ids = ch.nodes.map((n) => n.id);
  assert.equal(new Set(ids).size, ids.length, 'stone ids must be unique');
  assert.equal(ch.nodes[ch.nodes.length - 1].kind, 'boss', 'the last stone is the boss');
  assert.equal(ch.nodes.filter((n) => n.kind === 'boss').length, 1, 'exactly one boss');

  // Every stone that names a puzzle must name one that actually ships, or the
  // board would offer a stone that loads nothing. This is the check that pins
  // the story to the puzzles built for it.
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'puzzles/manifest.json'), 'utf8'));
  const built = new Set(manifest.map((p) => p.id));
  for (const node of ch.nodes) {
    if (node.puzzle) assert.ok(built.has(node.puzzle), `stone "${node.id}" names a missing puzzle "${node.puzzle}"`);
  }
});

test('a fresh save opens exactly the two built stones', () => {
  const ch = getChapter(1);
  const fresh = { progress: {} };
  const states = ch.nodes.map((n) => nodeState(n, fresh));
  assert.equal(states.filter((s) => s === 'open').length, 2, 'two stones open on a fresh save');
  assert.equal(states.filter((s) => s === 'locked').length, 5, 'the other five are locked');
  assert.equal(states.filter((s) => s === 'done').length, 0);
  // The two open ones are the two carrying a puzzle, and they come first.
  assert.deepEqual(states.slice(0, 2), ['open', 'open']);
});

test('nodeState reads completion off the save and never strands', () => {
  const ch = getChapter(1);
  const first = ch.nodes[0];
  const second = ch.nodes[1];
  const locked = ch.nodes[2];

  assert.equal(nodeState(first, { progress: {} }), 'open');
  assert.equal(nodeState(first, { progress: { [first.puzzle]: { done: true } } }), 'done');
  // Finishing one stone opens nothing new in this slice — the other built stone
  // was already open, the rest stay locked.
  const afterOne = { progress: { [first.puzzle]: { done: true } } };
  assert.equal(nodeState(second, afterOne), 'open');
  assert.equal(nodeState(locked, afterOne), 'locked');
  // A stone with no puzzle is locked however the save looks; nothing throws on a
  // missing progress map or a missing node.
  assert.equal(nodeState(locked, {}), 'locked');
  assert.equal(nodeState(undefined, {}), 'locked');
  assert.equal(nodeState(first, undefined), 'open');
});

test('a stale story save falls back instead of stranding the mode', () => {
  // Same contract as themeOr: a save carrying a chapter this build dropped must
  // land on a real one rather than leave story mode pointing at nothing.
  assert.equal(chapterOr(1), 1);
  assert.equal(chapterOr(999), DEFAULT_CHAPTER);
  assert.equal(chapterOr(undefined), DEFAULT_CHAPTER);
  assert.equal(chapterOr(null), DEFAULT_CHAPTER);
  const story = defaultStory();
  assert.equal(story.chapter, DEFAULT_CHAPTER);
  assert.deepEqual(story.seen, {});
  assert.equal(openingSeen(story, 1), false);
  assert.equal(openingSeen({ seen: { 1: true } }, 1), true);
  assert.equal(openingSeen(undefined, 1), false);
});

test('every story puzzle id is a real manifest entry, and only story ids read as story', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'puzzles/manifest.json'), 'utf8'));
  const built = new Set(manifest.map((p) => p.id));
  const storyIds = CHAPTERS.flatMap((c) => c.nodes.map((n) => n.puzzle).filter(Boolean));
  for (const id of storyIds) {
    assert.ok(isStoryPuzzle(id), `${id} should read as a story puzzle`);
    assert.ok(built.has(id), `${id} is not in the manifest`);
  }
  assert.equal(isStoryPuzzle('koi-pond'), false, 'a free-play picture is not a story puzzle');
});

test('the story save key reaches disk from all the places it has to', () => {
  // The exact shape that let `race` and `style` go missing before: a key must be
  // in both DEFAULT_SAVE literals AND in persist()'s written set, or one backend
  // drops it. story is spread wholesale (not deep-merged), so a boot() ??=
  // backfill is what reaches a save written before it existed.
  for (const f of ['src/platform.js', 'electron/main.cjs']) {
    assert.match(readSource(f), /story: \{ chapter: 1, seen: \{\} \}/, `${f} DEFAULT_SAVE is missing story`);
  }
  const game = readSource('src/game.js');
  assert.match(game, /story: S\.save\.story,/, "persist() must write the story key, or the desktop backend drops it");
  assert.match(game, /S\.save\.story \?\?= defaultStory\(\);/, 'boot() must backfill story for an older save');
});

test('the story stones keep out of the free gallery until finished', () => {
  // The one that breaks silently: renderPictures would list the story art in
  // free mode, spoiling the chapter's order, and nothing would error. And
  // free-mode "next" would jump into a stone.
  const game = readSource('src/game.js');
  assert.match(game, /if \(isStoryPuzzle\(p\.id\) && !S\.save\.progress\[p\.id\]\?\.done\) continue;/,
    'renderPictures must skip an unfinished story stone');
  const nextBody = game.slice(game.indexOf('async function nextPuzzle'), game.indexOf('function useHint'));
  assert.match(nextBody, /\.filter\(\(id\) => !isStoryPuzzle\(id\)\)/,
    'nextPuzzle must skip story stones so free mode never walks into one');
});

test('the letters are drawable, wash-shaded, and never do colour maths', () => {
  for (const id of ['Y', 'Ee']) {
    assert.ok(isSpeaker(id), `${id} should be a known speaker`);
    const svg = letterSVG(id);
    assert.match(svg, /^<svg/, `${id} must render an svg`);
    assert.match(svg, /class="lt-body"/, `${id} must colour its body off a token`);
    // Every shade is a literal rgba wash carrying its own fill — the squirrel's
    // rule, so a letter recolours with the theme and this file never touches a
    // colour value. No hex, no hsl(), no arithmetic on channels.
    assert.ok(!/#[0-9a-f]{3,6}/i.test(svg), `${id} names a literal colour`);
    assert.ok(!/hsl\(|rgb\(/.test(svg), `${id} computes a colour`);
  }
  // An unknown speaker falls back to a face rather than throwing, so a beat that
  // names one this build does not draw still shows someone.
  assert.match(letterSVG('Q'), /^<svg/);
});

test('the opening scene is playable: every beat has a drawable speaker and words', () => {
  for (const ch of CHAPTERS) {
    assert.ok(Array.isArray(ch.opening) && ch.opening.length, `chapter ${ch.id} has no opening`);
    for (const beat of ch.opening) {
      assert.ok(isSpeaker(beat.speaker), `a beat names an undrawable speaker "${beat.speaker}"`);
      assert.ok(beat.title && beat.title.length, 'a beat has no title');
      assert.ok(beat.body && beat.body.length > 20, 'a beat has no real text');
    }
  }
});

test('game.js plays the opening through the tour, and marks it seen up front', () => {
  const game = readSource('src/game.js');
  // Seen is written before the scene plays, like tourSeen, so a reload mid-scene
  // cannot replay it — and persisted immediately, to outlast a fast reload.
  const body = game.slice(game.indexOf('function maybeStoryOpening'), game.indexOf('function startStoryScene'));
  const seenAt = body.indexOf('seen[chapter] = true');
  const playAt = body.indexOf('startStoryScene');
  assert.ok(seenAt > 0 && playAt > seenAt, 'the opening must be marked seen before it is played');
  assert.match(body, /persist\(true\)/, 'seen must be flushed immediately, not on the debounce');
  assert.ok(body.includes('notour'), 'the scene must be skipped under ?notour for the harnesses');
});

/* ------------------------------------------------------------- the swap */

// The Swap — story mode's minigame. Six colours each wearing another's name;
// you trade them back. All the arithmetic is pure, like Overtime's, so it runs
// here; the board and clock are drawn in game.js and checked structurally.

const seededRngSwap = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

test('the six colours are distinct, named, and unmistakable', () => {
  assert.equal(SWAP_COLOURS.length, SWAP_PAIRS);
  assert.equal(new Set(SWAP_COLOURS.map((c) => c.name)).size, SWAP_PAIRS, 'names must be unique');
  assert.equal(new Set(SWAP_COLOURS.map((c) => c.hex)).size, SWAP_PAIRS, 'hues must be unique');
  for (const c of SWAP_COLOURS) {
    assert.match(c.hex, /^#[0-9a-f]{6}$/i, `${c.name} has a malformed hex`);
    assert.ok(c.name && c.name.length, 'a colour has no name');
  }
});

test('a scramble leaves not one colour wearing its own name', () => {
  // The premise the how-to panel states: every colour is wrong. A single colour
  // opening already correct would quietly contradict it — so, unlike Overtime,
  // the shuffle must be a FULL derangement, not merely near-unsolved.
  for (let seed = 1; seed <= 400; seed++) {
    const order = swapScramble(SWAP_PAIRS, seededRngSwap(seed));
    assert.deepEqual([...order].sort((a, b) => a - b), [...Array(SWAP_PAIRS).keys()],
      `seed ${seed} is not a permutation: ${order}`);
    assert.equal(swapPlaced(order), 0, `seed ${seed} opened with a colour already named: ${order}`);
    assert.equal(swapSolved(order), false);
  }
  // A degenerate rng must still hand back a valid derangement, not spin out.
  assert.equal(swapPlaced(swapScramble(SWAP_PAIRS, () => 0)), 0);
});

test('a swap is pure and undoes itself; solved and placed agree', () => {
  const start = [...Array(SWAP_PAIRS).keys()];
  const once = swapNames(start, 1, 4);
  assert.deepEqual(start, [...Array(SWAP_PAIRS).keys()], 'swap mutated its input');
  assert.equal(once[1], 4);
  assert.equal(once[4], 1);
  assert.deepEqual(swapNames(once, 1, 4), start, 'swapping the same pair back restores it');
  assert.ok(swapSolved(start));
  assert.equal(swapPlaced(start), SWAP_PAIRS);
  assert.equal(swapSolved(once), false);
  assert.equal(swapPlaced(once), SWAP_PAIRS - 2);
});

test('the Swap is story mode’s bonus, and Overtime is free mode’s', () => {
  const game = readSource('src/game.js');
  // One or the other is offered, never both, and the split is on the story.
  assert.match(game, /else if \(S\.inStory && isStoryPuzzle\(S\.puzzle\.id\)\) maybeOfferSwap\(\);\s*\n\s*else maybeOfferOvertime\(\);/,
    'commitFill must offer the Swap on a story stone and Overtime otherwise');
  const offer = game.slice(game.indexOf('function maybeOfferSwap'), game.indexOf('function closeSwap'));
  assert.match(offer, /S\.filled\.size < 10/, 'the Swap waits until the player is into the picture');
  assert.match(offer, /S\.save\.settings\.overtime === false/, 'the Swap honours the bonus-round opt-out');
});

test('the Swap shows its rules before the clock, and reveals on a loss', () => {
  const game = readSource('src/game.js');
  // The how-to panel the user asked for: opening the round does NOT start the
  // clock — beginSwap does, and only from the panel.
  assert.match(game, /started: false/, 'startSwap must open on the how-to panel, clock not yet running');
  const begin = game.slice(game.indexOf('function beginSwap'), game.indexOf('function tickSwap'));
  assert.match(begin, /endsAt = Date\.now\(\) \+ SWAP_SECONDS \* 1000/, 'beginSwap starts the two minutes');
  assert.match(begin, /setInterval\(tickSwap/, 'the clock only ticks once begun');
  // A loss lays each colour beside its own name.
  assert.match(game, /function revealSwapAnswer/, 'a lost round must show the right pairing');
});

test('Overtime shows its rules before the clock too', () => {
  const game = readSource('src/game.js');
  // Same how-to contract as the Swap: startOvertime opens the panel and starts
  // NOTHING — no clock until Begin. The timer lived inside startOvertime before;
  // it must have moved out to beginOvertime, or the sixty seconds run behind the
  // instructions and the panel is a lie.
  const start = game.slice(game.indexOf('function startOvertime'), game.indexOf('function beginOvertime'));
  assert.ok(start.length > 50, 'startOvertime has moved or gone');
  assert.match(start, /started: false/, 'startOvertime must open on the how-to panel');
  assert.ok(!/setInterval/.test(start), 'the clock must not start until Begin');
  const begin = game.slice(game.indexOf('function beginOvertime'), game.indexOf('function tickOvertime'));
  assert.match(begin, /endsAt = Date\.now\(\) \+ OT_SECONDS \* 1000/, 'beginOvertime starts the sixty seconds');
  assert.match(begin, /setInterval\(tickOvertime/, 'the clock only ticks once begun');
  // renderOvertime draws the panel off the started flag.
  assert.match(game, /function renderOvertime[\s\S]*?if \(!S\.ot\.started\)/, 'renderOvertime must branch on the how-to panel');
});

test('Named answers a tap with the cell’s own colour, and is spent per cell', () => {
  const game = readSource('src/game.js');
  const body = game.slice(game.indexOf('function tryPaint'), game.indexOf('function launch'));
  // The boon retunes the selection to the cell under the pointer (so no buzz)
  // and spends one charge — before the wrong-colour check, or it would buzz.
  assert.match(body, /if \(S\.named > 0 && cell && !S\.filled\.has\(cell\.id\) && !S\.pending\.has\(cell\.id\)\) \{\s*\n\s*S\.selected = cell\.colour;\s*\n\s*S\.named--;/,
    'a Named tap must fill the cell’s own colour and cost one charge');
  const namedAt = body.indexOf('S.named--');
  const buzzAt = body.indexOf('deserves the buzz');
  assert.ok(namedAt > 0 && namedAt < buzzAt, 'Named must resolve before the wrong-colour buzz');
});

test('a re-baked picture starts fresh instead of painting phantom cells', () => {
  // The bug behind a story stone re-cut chunkier: progress is a list of cell
  // ids, and a re-bake renumbers every cell, so the old ids point at different
  // ones. loadPuzzle must notice and reset, and persist must record the count
  // it can notice by.
  const game = readSource('src/game.js');
  assert.match(game, /saved\.cells != null && saved\.cells !== count\) \|\| saved\.filled\.some\(\(n\) => n >= count\)/,
    'loadPuzzle must drop progress taken at a different cell count');
  assert.match(game, /cells: S\.cells\.length,/, 'persist must record the cell count progress was taken at');
});

test('finishing a story stone leads back to the path, not out to the gallery', () => {
  // The wart caught before shipping: the finish card's primary button ran
  // nextPuzzle(), which skips story stones — so completing a stone ejected you
  // into a random free-mode picture mid-chapter. Both the label and the action
  // now branch on the same story condition.
  const game = readSource('src/game.js');
  assert.match(game, /S\.inStory && isStoryPuzzle\(S\.puzzle\.id\) \? 'Back to the path' : 'Next picture'/,
    'the finish card must offer the path back inside the story');
  const handler = game.slice(game.indexOf("case 'next':"), game.indexOf("case 'finish-dismiss'"));
  assert.match(handler, /if \(S\.inStory && isStoryPuzzle\(S\.puzzle\?\.id\)\) openStoryBoard\(\)/,
    'the next button must return to the board for a finished story stone');
  assert.match(handler, /else await nextPuzzle\(\)/, 'free mode still walks the gallery');
});

/* -------------------------------------------------------------- overtime */

// Overtime hands you a fifteen-step gradient in pieces and sixty seconds to
// put it back in order. All of the arithmetic is pure and lives away from the
// DOM, so all of it runs here.

const hueOf = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (!d) return 0; // grey has no hue; the caller has to know that
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return ((h * 60) % 360 + 360) % 360;
};

/** mulberry32 — a seeded rng, so a shuffle can be swept the same way twice. */
const seededRng = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

test('the ramp is orderable: fifteen distinct steps, always climbing', () => {
  // THE invariant the round rests on. The puzzle asks for one specific order,
  // so the ramp has to have one — a flat or a doubling-back stretch anywhere
  // in it leaves two chunks with no way to tell which comes first, and a round
  // that cannot honestly be won. Hue alone would not do it: it wraps, so there
  // would be no defensible first chunk.
  //
  // Measured in L*, and the difference is not academic. An earlier version
  // climbed evenly in HSL lightness and passed a test that measured HSL
  // lightness, while Void's fully-saturated tokens came out at L* of
  // ...88 89 90 91 92 93 94 94: eight chunks the eye could not separate and two
  // it could not tell apart at all. A test on the wrong axis agreed with the
  // code and both were wrong about the screen.
  const cases = [
    [{ h: 330, s: 0.62 }, { h: 35, s: 0.7 }],                    // Tee Vibes
    [{ h: 187, s: 1 }, { h: 143, s: 1 }, { h: 20, s: 1 }],        // Void
    [{ h: 330, s: 0.62 }, { h: 0, s: 0.8 }, { h: 35, s: 0.7 }],  // three stops
    [{ h: 210, s: 0.05 }],                                       // one stop
    [],                                                          // a theme missing its tokens
    [{ h: 0, s: 0 }, { h: 0, s: 0 }],                            // no hue to help at all
  ];
  for (const stops of cases) {
    const ramp = rampFrom(stops);
    const label = JSON.stringify(stops);
    assert.equal(ramp.length, CHUNKS, `${label} gave ${ramp.length} chunks`);
    assert.equal(new Set(ramp).size, CHUNKS, `${label} repeats a colour`);
    for (const hex of ramp) assert.match(hex, /^#[0-9a-f]{6}$/, `malformed ${hex} in ${label}`);
    for (let i = 1; i < ramp.length; i++) {
      const step = labL(ramp[i]) - labL(ramp[i - 1]);
      assert.ok(step >= MIN_STEP,
        `${label} climbs only ${step.toFixed(2)} of L* between ${i - 1} and ${i}`);
    }
  }
});

test('a random gradient is a different puzzle but never an unsolvable one', () => {
  // The point of randomStops is variety — a fresh colour family every round
  // instead of the theme's one gradient forever. The thing that must NOT vary
  // is the answer key: however the hue and saturation come out, the fifteen
  // steps still have to climb in L* by at least MIN_STEP, or the round has no
  // findable order. Sweep a few hundred seeds and hold every one to the same
  // invariant the themed ramps are held to above.
  const seen = new Set();
  for (let seed = 0; seed < 400; seed++) {
    const stops = randomStops(seededRng(seed));
    assert.ok(stops.length === 2 || stops.length === 3, `seed ${seed} gave ${stops.length} stops`);
    for (const s of stops) {
      assert.ok(Number.isFinite(s.h) && s.h >= 0 && s.h < 360, `seed ${seed} hue ${s.h}`);
      assert.ok(s.s >= 0.46 && s.s <= 0.8, `seed ${seed} sat ${s.s}`);
    }
    const ramp = rampFrom(stops);
    assert.equal(ramp.length, CHUNKS);
    assert.equal(new Set(ramp).size, CHUNKS, `seed ${seed} repeats a colour`);
    for (let i = 1; i < ramp.length; i++) {
      const step = labL(ramp[i]) - labL(ramp[i - 1]);
      assert.ok(step >= MIN_STEP, `seed ${seed} climbs only ${step.toFixed(2)} between ${i - 1} and ${i}`);
    }
    seen.add(Math.round(hueOf(ramp[7]))); // the middle chunk's hue stands in for the family
  }
  // Variety actually happened: the swept rounds did not all land on one hue.
  assert.ok(seen.size > 40, `only ${seen.size} distinct mid-hues across 400 rounds — not varied enough`);
});

test('L* is perceived lightness, not a byte average', () => {
  // The anchors CIE defines: black is 0, white is 100, and mid-grey — sRGB
  // #777777, half way up in bytes — sits at 50, not at the 47 a naive average
  // would give. Fully saturated green and blue are the pair that matters here:
  // they are the same distance from black in bytes and nowhere near it to look
  // at, which is exactly what an HSL ramp got wrong.
  assert.ok(Math.abs(labL('#000000')) < 0.01);
  assert.ok(Math.abs(labL('#ffffff') - 100) < 0.01);
  assert.ok(Math.abs(labL('#777777') - 50) < 1.5, `mid grey came out at ${labL('#777777')}`);
  assert.ok(labL('#00ff00') > 85, 'pure green is nearly as light as white');
  assert.ok(labL('#0000ff') < 35, 'pure blue is nearly as dark as black');
  assert.ok(labL('#00ff00') - labL('#0000ff') > 50,
    'green and blue are one byte apart and must not be one L* apart');
});

test('the ramp takes the short way round the wheel', () => {
  // Magenta to gold is sixty-five degrees up through red. The long way is two
  // hundred and ninety-five degrees through green — every colour in the wheel
  // except the two the theme actually asked for, in a chapter whose whole rule
  // is that nothing may be green-dominant.
  for (const hex of rampFrom([{ h: 330, s: 0.62 }, { h: 35, s: 0.7 }])) {
    const h = hueOf(hex);
    assert.ok(h >= 329 || h <= 36, `${hex} sits at ${Math.round(h)}deg, off the magenta-gold arc`);
  }
  // And the interpolator itself, where the wrap is easiest to get wrong.
  assert.ok(Math.abs(lerpHue(330, 35, 0.5) - 2.5) < 0.01, 'halfway from magenta to gold is red');
  assert.equal(lerpHue(10, 350, 0.5), 0, 'the short way back has to cross zero too');
  assert.equal(lerpHue(20, 20, 0.5), 20, 'a stop to itself must not drift');
});

test('the ramp never doubles back in hue', () => {
  // Three stops can be declared in an order that sends hue out and back. Void
  // declares cyan, green, gold, and walked in that order the ramp ran cyan ->
  // gold -> green: chunk eight came out warmer than the chunks on either side
  // of it, so hue was telling you the opposite of what lightness was. That is
  // worse than hue saying nothing, and it survived the monotonic-lightness
  // check above, because lightness was never the part that broke.
  //
  // Measured as total travel against end-to-end distance: a ramp that turns
  // round covers more ground than it gets, and by a lot.
  const arc = (a, b) => ((((b - a) % 360) + 540) % 360) - 180;
  const cases = [
    ['Void', [{ h: 187, s: 1 }, { h: 143, s: 1 }, { h: 20, s: 1 }]],
    ['Tee Vibes', [{ h: 328, s: 0.63 }, { h: 32, s: 0.56 }, { h: 33, s: 0.5 }]],
    ['out and back', [{ h: 0, s: 0.9 }, { h: 120, s: 0.9 }, { h: 30, s: 0.9 }]],
    ['straddling zero', [{ h: 350, s: 0.9 }, { h: 40, s: 0.9 }, { h: 10, s: 0.9 }]],
  ];
  for (const [name, stops] of cases) {
    const hues = rampFrom(stops).map(hueOf);
    let travel = 0;
    for (let i = 1; i < hues.length; i++) travel += Math.abs(arc(hues[i - 1], hues[i]));
    const span = Math.abs(arc(hues[0], hues[hues.length - 1]));
    // Six degrees of slack: neighbouring stops only a degree or two apart
    // round to the same byte and jitter, which is not a turn.
    assert.ok(travel <= span + 6,
      `${name} travels ${travel.toFixed(1)}deg to get ${span.toFixed(1)}deg: it turns round`);
  }
});

test('a scramble is never most of the way solved already', () => {
  // A plain shuffle leaves a chunk in its right slot about once per run, and a
  // board that opens with a third of it done is a gift rather than a puzzle.
  for (let seed = 1; seed <= 400; seed++) {
    const order = scramble(CHUNKS, seededRng(seed));
    assert.deepEqual([...order].sort((a, b) => a - b), [...Array(CHUNKS).keys()],
      `seed ${seed} is not a permutation: ${order}`);
    assert.equal(isSolved(order), false, `seed ${seed} handed over a solved board`);
    assert.ok(placedCount(order) <= 1,
      `seed ${seed} opened with ${placedCount(order)} chunks already placed`);
  }
  // An rng that never varies has to give back something valid rather than
  // spin out the retry loop.
  const stuck = scramble(CHUNKS, () => 0);
  assert.equal(placedCount(stuck), 0, 'a degenerate rng must still leave nothing in place');
});

test('a swap is pure, and undoes itself', () => {
  const start = [...Array(CHUNKS).keys()];
  const once = swap(start, 2, 9);
  assert.deepEqual(start, [...Array(CHUNKS).keys()], 'swap mutated the array it was given');
  assert.equal(once[2], 9);
  assert.equal(once[9], 2);
  assert.deepEqual(swap(once, 2, 9), start, 'swapping the same pair back must restore the order');
  assert.deepEqual(swap(start, 4, 4), start, 'a chunk traded with itself must not move');
  // The two readings of "how done is this" have to agree, or the round could
  // end on a board that is not actually solved.
  assert.ok(isSolved(start));
  assert.equal(placedCount(start), CHUNKS);
  assert.equal(isSolved(once), false);
  assert.equal(placedCount(once), CHUNKS - 2);
});

test('the ramp is drawn fresh each round, never from the theme or the picture', () => {
  // Two earlier sources are both gone. The first took its hue from the
  // picture's commonest paint, which put a navy tray in a magenta room; the
  // second took it from the theme tokens, which was steady but meant the same
  // gradient every single round under a given room. Now startOvertime builds
  // the ramp from randomStops, so it varies play to play and belongs to
  // neither the room nor the picture.
  const game = readSource('src/game.js');
  const start = game.slice(game.indexOf('function startOvertime'),
    game.indexOf('function tickOvertime'));
  assert.match(start, /ramp:\s*rampFrom\(randomStops\(\)\)/,
    'the ramp must be built from randomStops, fresh each round');
  assert.ok(!/getComputedStyle|--accent|--hot|--accent2/.test(start),
    'the round no longer reads the theme tokens — that was the every-round-the-same bug');
  assert.ok(!/getImageData|drawImage|canvas/i.test(start),
    'the round must not go near the picture: it plays over blind ones too');
  // randomStops is arithmetic, not chrome — it has to run in node beside the
  // rest of overtime.js, so it may not reach for the DOM the way the old
  // theme-reading stops did.
  const ot = readSource('src/overtime.js');
  const fn = ot.slice(ot.indexOf('export function randomStops'),
    ot.indexOf('/* --------------------------------------------------------------- ordering */'));
  assert.ok(fn.length > 100, 'randomStops has moved or gone');
  assert.ok(!/document|getComputedStyle|window/.test(fn),
    'randomStops must stay pure — no DOM');
});

test('undo only takes back the cells that were counted', () => {
  // commitFill counts one cell per click, but an entry can carry more than
  // one: Half Fill's batch and Overtime's doubled partner both ride along
  // free. Undo subtracting the whole length drove the lifetime tally below
  // what had actually been painted — silently, and every average computed
  // from it with it.
  const game = readSource('src/game.js');
  assert.match(game, /const paid = step\.cells\.length - \(step\.free \?\? 0\);/,
    'undoLast must discount the free cells in an entry');
  assert.match(game, /stats\.cells -= paid;/, 'the cell tally must come off by paid, not by length');
  assert.match(game, /stats\.mutedCells = Math\.max\(0, \(stats\.mutedCells \?\? 0\) - paid\)/,
    'the muted tally has the same shape and the same bug');
  // And both producers of a multi-cell entry have to declare it.
  const entries = [...game.matchAll(/S\.history\.push\(\{([\s\S]*?)\}\);/g)].map((m) => m[1]);
  assert.ok(entries.length >= 2, 'expected both commitFill and half-fill to push history');
  for (const body of entries) {
    assert.ok(/\bfree:/.test(body), `a history entry does not declare free: ${body.slice(0, 70)}`);
  }
});

test('the doubled fill is free, and rides in one undo', () => {
  const game = readSource('src/game.js');
  // Structurally: the partner is filled before the tub-empty check, or an
  // emptied tub would not be noticed and finish() could be missed.
  const body = game.slice(game.indexOf('function commitFill'), game.indexOf('function undoLast'));
  const partnerAt = body.indexOf('const partner = S.bogo');
  const emptyAt = body.indexOf('if (S.remaining[cell.colour] === 0)');
  const pushAt = body.indexOf('S.history.push');
  assert.ok(partnerAt > 0 && emptyAt > partnerAt,
    'the partner must be filled before the tub-empty check reads the count');
  assert.ok(pushAt > partnerAt, 'the partner must be known before the history entry is written');
  assert.match(body, /cells: partner \? \[cell\.id, partner\.id\] : \[cell\.id\]/,
    'one click has to be one undo entry, not two');
  // The partner must not reach grantPoints. Everything between the two is the
  // primary's award, so the partner block simply must not mention points.
  const block = body.slice(partnerAt, body.indexOf('S.save.stats.cells++'));
  assert.ok(!/grantPoints|award/.test(block), 'the doubled cell must not be paid for');
});

test('a doubled fill takes the nearest unfilled cell of the same colour', () => {
  const cell = (id, colour, x, y) => ({ id, colour, anchor: { x, y } });
  const cells = [
    cell(0, 1, 0, 0), cell(1, 1, 5, 0), cell(2, 1, 50, 0),
    cell(3, 2, 1, 1), cell(4, 1, 2, 0),
  ];
  const none = new Set();
  const near = partnerFor(cells, cells[0], { colour: 1, filled: none, pending: none });
  assert.equal(near.id, 4, 'the closest same-colour cell must win');
  assert.equal(
    partnerFor(cells, cells[0], { colour: 1, filled: new Set([4]), pending: new Set([1]) }).id, 2,
    'filled and in-flight cells must both be skipped',
  );
  assert.equal(
    partnerFor(cells, cells[0], { colour: 1, filled: new Set([1, 2, 4]), pending: none }), null,
    'no candidate must give null, not a throw',
  );
  assert.equal(partnerFor(cells, null, { colour: 1 }), null);
  assert.equal(
    partnerFor(cells, cells[3], { colour: 2, filled: none, pending: none }), null,
    'a colour with only the origin cell has no partner',
  );
});

/* ------------------------------------------------------------- paint blob */

// Burst's constructor never touches the DOM (the scratch canvas is only
// created inside drawBlobs), so the opacity knob is checkable here.

test('a Burst stores its opacity and defaults to fully opaque', () => {
  const base = {
    origin: { x: 10, y: 10 },
    sink: { x: 20, y: 20 },
    colour: '#ff0000',
    width: 100,
    height: 100,
    reach: 12,
    seed: 1,
  };
  assert.equal(new Burst(base).opacity, 1, 'an omitted opacity must not fade the blob');
  assert.equal(new Burst({ ...base, opacity: 0.7 }).opacity, 0.7);
  assert.equal(new Burst({ ...base, opacity: 0 }).opacity, 0, '0 must survive the ?? guard');
});

test('game.js passes an opacity through to every Burst it launches', () => {
  const text = readSource('src/game.js');
  const constructions = [...text.matchAll(/new Burst\(\{[\s\S]*?\}\)/g)];
  assert.equal(constructions.length, 1, 'expected exactly one Burst construction site');
  assert.match(constructions[0][0], /opacity:/, 'the blob opacity setting is not reaching the Burst');
});

test('both DEFAULT_SAVE literals ship the blob opacity, and boot backfills it', () => {
  for (const f of ['src/platform.js', 'electron/main.cjs']) {
    const text = readSource(f);
    assert.match(text, /settings: \{[^}]*opacity:/, `${f} is missing opacity in DEFAULT_SAVE.settings`);
  }
  const game = readSource('src/game.js');
  assert.match(game, /settings\.opacity \?\?=/, 'boot() should backfill settings.opacity');
});

test('every panel renderer bands its list', () => {
  const text = readSource('src/game.js');
  // Each renderer's body, from its signature to the next top-level function.
  // Pictures bands through its filter (applyPicFilter → bandVisible) because the
  // stripe has to follow which rows a filter leaves showing; the rest call band
  // directly.
  const bander = { renderPictures: /applyPicFilter\(\)/ };
  for (const name of ['renderPictures', 'renderTrophies', 'renderAvatarPanel', 'renderSettings']) {
    const start = text.indexOf(`function ${name}(`);
    assert.ok(start > 0, `${name} is missing from game.js`);
    const end = text.indexOf('\nfunction ', start + 1);
    const body = text.slice(start, end === -1 ? text.length : end);
    assert.match(body, bander[name] ?? /\bband\(/, `${name} does not band its rows`);
  }
});

test('the band tint is distinct from both the base row and the hover tint', () => {
  const css = readSource('src/styles.css');
  const tint = (selector) => {
    // Up to the semicolon, not to the first ')': a tint is now written
    // rgba(var(--sheen-rgb), .06), so stopping at the first bracket truncates
    // every one of them to the same string and the comparison always passes.
    const m = css.match(new RegExp(`${selector}\\s*\\{[^}]*background: ([^;]+);`));
    assert.ok(m, `no background found for ${selector}`);
    return m[1];
  };
  // `\\s*{` keeps the bare `.row` pattern off `.row.alt`.
  const base = tint('\\.row');
  const alt = tint('\\.row\\.alt');
  const hover = tint('\\.row\\.clickable:hover');
  assert.notEqual(alt, base, 'a banded row must not match the base row');
  // Without this, hovering an alt row would give no feedback at all.
  assert.notEqual(hover, alt, 'hover must not match the band tint');
  assert.notEqual(hover, base, 'hover must not match the base tint');
});

/* ------------------------------------------------------- the raised element */

test('the in-hand colour marks its blank cells with a hatch, not a wash', () => {
  const render = readSource('src/render.js');
  const base = render.slice(render.indexOf('  drawBase() {'));
  const body = base.slice(0, base.indexOf('\n  }\n'));
  // The selected-colour branch fills a diagonal hatch of the paint, the same
  // mark the tiny numberless cells use — not a translucent flat fill, which
  // just reads as a faded copy of the finished cell.
  const branch = body.slice(body.indexOf('else if (cell.colour === this.selected)'));
  assert.match(branch.slice(0, 800), /stripeFor\(cell\.colour, true\)/,
    'selected blank cells must be hatched via stripeFor, not washed');
  // The old animated flat *wash* (and its zoom boost) that rode over them is
  // gone — what breathes over them on the live layer now is a hatch, not a wash
  // (see the next test), or the watermark comes straight back.
  assert.ok(!/Pulsing wash|highlightBoost/.test(render),
    'the flat pulsing highlight wash (and its zoom boost) must be gone');
});

test('the in-hand colour breathes as a hatch on the live layer, never a glaze', () => {
  const render = readSource('src/render.js');

  // The live breath deepens the resting hatch: it fills the selected colour's
  // unpainted cells with the cached stripe pattern, modulated by a slow sine.
  // It must not paint a flat colour glaze (hexOf) back over them — that would
  // be the watermark again, just moving.
  const draw = render.slice(render.indexOf('  draw(bursts, timeMs) {'));
  const drawBody = draw.slice(0, draw.indexOf('\n  }\n'));
  const block = drawBody.slice(
    drawBody.indexOf('The colour in hand breathes'),
    drawBody.indexOf('if (this.colourFlash)'),
  );
  assert.match(block, /this\.pulseStripe\(\)/,
    'the breath must fill selected cells with the pulseStripe pattern');
  assert.match(block, /cell\.colour !== this\.selected/,
    'the breath must be scoped to the selected colour’s cells');
  assert.ok(!/hexOf/.test(block),
    'the breath must stay a hatch — no flat colour glaze (hexOf) over the cells');

  // And that pattern is built transparent-gap (opaque = false), so it deepens
  // only the diagonal lines rather than glazing the paper between them.
  const pulse = render.slice(render.indexOf('  pulseStripe() {'));
  const pulseBody = pulse.slice(0, pulse.indexOf('\n  }\n'));
  assert.match(pulseBody, /stripePattern\([^\n]*true, false\)/,
    'pulseStripe must build a transparent-gap tile (opaque = false)');
});

test('the raise belongs to painting, and cannot reach the photo', () => {
  const render = readSource('src/render.js');
  const draw = render.slice(render.indexOf('  draw(bursts, timeMs) {'));
  const body = draw.slice(0, draw.indexOf('\n  }\n'));

  const photoReturn = body.indexOf('if (this.showSource) {');
  const liftCall = body.indexOf('this.drawLift(');
  assert.ok(photoReturn >= 0 && liftCall >= 0, 'draw() no longer has both branches');
  assert.ok(liftCall > photoReturn,
    'drawLift must sit after the showSource early return, or the parallax rides the photograph');
});

test('the shadow stays on the surface while the element moves off it', () => {
  // The gap between the two is the entire illusion. A shadow carried along
  // with the element is just a picture that has slipped sideways.
  const render = readSource('src/render.js');
  const fn = render.slice(render.indexOf('  drawLift(shakeX, shakeY) {'));
  const body = fn.slice(0, fn.indexOf('\n  }\n'));
  assert.match(body, /this\.applyTransform\(ctx, shakeX, shakeY\);[\s\S]*?ctx\.shadowColor/,
    'the shadow is drawn at the element\'s own position, without the parallax offset');
  assert.match(body, /this\.applyTransform\(ctx, shakeX \+ dx, shakeY \+ dy\)/,
    'the element itself is drawn with the parallax offset');
  assert.match(body, /ctx\.rect\(0, 0, width, height\)/,
    'both must be clipped to the artwork, or a raised element hangs off the paper');
});

test('a subject with no room to move against is not raised at all', () => {
  const render = readSource('src/render.js');
  assert.match(render, /const LIFT_MAX_AREA = 0\.\d+;/);
  assert.match(render, /covered <= puzzle\.width \* puzzle\.height \* LIFT_MAX_AREA/);

  // Every shipped lift must actually clear the cap. This used to assert that
  // the tags straddled it — back when the lift borrowed the animation tag and
  // the cap was standing in for "is this an object at all". A lift tag is that
  // judgement now, so a tag above the cap is not the rule working, it is a
  // picture silently shipping flat.
  const LIMIT = Number(render.match(/const LIFT_MAX_AREA = ([\d.]+);/)[1]);
  const lifts = JSON.parse(fs.readFileSync(path.join(ROOT, 'puzzles/lifts.json'), 'utf8'));
  for (const [id, cells] of Object.entries(lifts).filter(([k]) => !k.startsWith('_'))) {
    const p = JSON.parse(fs.readFileSync(path.join(ROOT, 'puzzles', `${id}.json`), 'utf8'));
    const share = cells.reduce((n, i) => n + p.cells[i].a, 0) / (p.width * p.height);
    assert.ok(share <= LIMIT,
      `${id}: lift covers ${(share * 100).toFixed(1)}% of the picture, over the ${(LIMIT * 100).toFixed(0)}% cap — it would never be raised`);
  }
});

test('every source read in this file goes through readSource', () => {
  // The whole reason readSource exists. A bare readFileSync works on every
  // machine anyone develops on and then fails on a Windows runner, which means
  // it fails in a release build rather than here. JSON.parse is immune — CRLF
  // is whitespace to it — so those are left alone.
  const self = readSource('tools/game-logic.test.mjs')
    .replace(/const readSource =[\s\S]*?;\n/, ''); // the one place it is allowed
  const bare = (self.match(/fs\.readFileSync\([^\n]*'utf8'\)/g) ?? [])
    .filter((m) => !self.includes(`JSON.parse(${m}`));
  assert.deepEqual(bare, [],
    'read source with readSource(), or a CRLF checkout silently breaks the match');
});

/* -------------------------------------------------------------- thumbnails */

const { outlineSVG, outlineWeight } = await import('../src/thumbnail.js');

const fakePuzzle = (n) => ({
  width: 400,
  height: 300,
  cells: Array.from({ length: n }, (_, i) => ({ d: `M${i} 0H9V9Z`, a: n - i })),
});

test('the unpainted outline is one path in the picture\'s own coordinates', () => {
  const svg = outlineSVG(fakePuzzle(5));
  assert.match(svg, /viewBox="0 0 400 300"/);
  assert.equal((svg.match(/<path/g) ?? []).length, 1,
    'one path, not one per cell — a 500-cell picture strokes 500 times otherwise');
  assert.match(svg, /vector-effect="non-scaling-stroke"/,
    'stroke width is a display measure; in picture units it is a hairline at one size and a slab at the other');
});

test('the outline carries no style attribute, which the CSP would refuse', () => {
  // The app ships style-src 'self'. An inline style="..." is dropped outright,
  // so everything here has to be a presentation attribute.
  assert.ok(!/style=/.test(outlineSVG(fakePuzzle(4), { stroke: '#123456' })));
});

test('a dense picture drops its smallest cells rather than drawing them all', () => {
  const puzzle = fakePuzzle(500);
  const thumb = outlineWeight(500, 46);
  assert.ok(thumb.maxCells < 500, 'a 46px thumbnail cannot show 500 outlines');
  const svg = outlineSVG(puzzle, thumb);
  // Biggest first: cell 0 has the largest area, the last has the smallest.
  assert.ok(svg.includes('M0 0H9V9Z'), 'the biggest cell was dropped');
  assert.ok(!svg.includes('M499 0H9V9Z'), 'the smallest cell survived the cut');

  // At preview size there is room for everything.
  const preview = outlineWeight(500, 420);
  assert.ok(preview.maxCells >= 500, 'a 420px preview should show the whole picture');
});

test('a sparse picture keeps every cell it has', () => {
  // The cap is what handles density, so a seventeen-cell picture is never cut
  // at any size — there is nothing to gain by dropping a seventh of it.
  const weight = outlineWeight(17, 46);
  assert.ok(weight.maxCells >= 17, 'a 17-cell picture should not be thinned at all');
  assert.equal((outlineSVG(fakePuzzle(17), weight).match(/M\d+ 0H9V9Z/g) ?? []).length, 17);
});

test('the line gets heavier as the picture gets more room', () => {
  const thumb = outlineWeight(500, 46);
  const preview = outlineWeight(500, 420);
  assert.ok(preview.width > thumb.width && preview.opacity > thumb.opacity,
    'the same picture should be drawn more confidently when there is room for it');
});

/* -------------------------------------------------------------------- undo */

test('undo reverses commitFill, and is structurally unavailable once finished', () => {
  const game = readSource('src/game.js');
  const body = game.slice(game.indexOf('function undoLast()'));
  const fn = body.slice(0, body.indexOf('\n}\n') + 2);

  assert.match(fn, /if \(!S\.puzzle \|\| S\.finished \|\| !S\.history\.length\) return;/,
    'undo must refuse on a finished picture and on an empty history');
  // Each of these is something commitFill granted. Missing one leaves the save
  // claiming work that is no longer on the board.
  for (const [what, re] of [
    ['the cell itself', /S\.filled\.delete\(id\)/],
    ['the board', /board\.markUnfilled\(id\)/],
    ["the tub's count", /S\.remaining\[step\.colour\] \+= step\.cells\.length/],
    // `paid`, not `step.cells.length`: an entry can carry cells that were
    // handed over free and never counted on the way in. See the free-cell
    // test above — this line used to assert the version with that bug in it.
    ['the cell tally', /stats\.cells -= paid;/],
    ['the points', /stats\.pointsEarned = Math\.max\(0, \(stats\.pointsEarned \?\? 0\) - step\.points\)/],
    ['the passive hint', /stats\.hintsEarned = Math\.max\(0/],
    ['the undo tally', /stats\.undos = \(stats\.undos \?\? 0\) \+ 1/],
  ]) {
    assert.match(fn, re, `undo does not hand back ${what}`);
  }

  assert.match(readSource('src/render.js'),
    /markUnfilled\(id\) \{/, 'the renderer has no way to clear a cell again');
});

test('half fill is one undo, not one per cell', () => {
  // It is a single ability use; taking it back a cell at a time would be a
  // different thing from what the player did.
  const game = readSource('src/game.js');
  const fn = game.slice(game.indexOf('function autoFillHalfOfHeldColour()'));
  const body = fn.slice(0, fn.indexOf('\n}\n'));
  assert.equal((body.match(/S\.history\.push\(/g) ?? []).length, 1,
    'half fill must record exactly one history entry for the whole batch');
  assert.match(body, /cells: candidates\.slice\(0, n\)\.map/,
    'the entry has to name every cell the batch painted');
  assert.match(body, /points: 0/,
    'half fill grants no points, so undo must not take any away');
});

test('history is per-sitting, and never written to the save', () => {
  const game = readSource('src/game.js');
  assert.match(game, /S\.history = \[\];/, 'loading a picture must clear the history');
  const persisted = game.slice(game.indexOf('function persist'), game.indexOf('function persist') + 900);
  assert.ok(!/history/.test(persisted),
    'an unbounded array of every cell ever painted does not belong in a save');
});

/* --------------------------------------------------------------- workflows */

test('cutting a version asks for the build rather than trusting the tag to', () => {
  // A push made with GITHUB_TOKEN does not trigger another workflow — GitHub
  // blocks that so workflows cannot recurse — so release.yml's `on: push:
  // tags` never fires from weekly-release. Nothing about that failure is
  // visible from outside: the version bumps, the tag lands, the run goes
  // green, and not one installer is built. It hid for 32 releases because
  // every one of them happened to be started by hand.
  const weekly = readSource('.github/workflows/weekly-release.yml');
  assert.match(weekly, /actions: write/,
    'dispatching a workflow needs actions: write');
  assert.match(weekly, /gh workflow run release\.yml --ref/,
    'weekly-release has to ask release.yml to run; the tag will not do it');
  assert.match(weekly, /if: steps\.cut\.outputs\.tag != ''/,
    'and has to skip asking when the guard found nothing worth releasing');

  // The dispatch is only possible while release.yml still accepts one.
  assert.match(readSource('.github/workflows/release.yml'), /workflow_dispatch:/,
    'release.yml must stay dispatchable or the step above silently fails');
});

test('nothing but the publish job is allowed to publish', () => {
  // Asking for the build against the tag, rather than the branch, is what
  // pins a release to the commit it claims to be. It also hands
  // electron-builder the two things it treats as permission to publish on its
  // own — a token and a tag — and it then opens a draft release and uploads
  // into it. That draft is the trap: `gh release view` finds drafts, so the
  // publish job below appends to it rather than creating anything, and the
  // run goes green having shipped a release only its owner can see. v0.7.13
  // shipped that way. Both halves are asserted because either alone leaves a
  // way back into it.
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  for (const [name, script] of Object.entries(pkg.scripts)) {
    if (!script.includes('electron-builder')) continue;
    assert.match(script, /--publish never/,
      `${name} lets electron-builder decide whether to publish`);
  }

  const release = readSource('.github/workflows/release.yml');
  assert.match(release, /gh release edit "\$TAG"[\s\S]{0,200}--draft=false/,
    'the publish job must promote a draft it uploaded into, not leave it hidden');
});

/* ------------------------------------------------------------------- house */

const {
  ROOMS, HOUSE_ITEMS, LIGHTING, PETS, PROP_SLOTS, defaultHouse, itemsFor, starterFor,
  resolveColours, colourKey, colourablesIn, roomColourId, petColourId, buildRoomSVG,
} = await import('../src/house.js');

/** Every prop drawn at its own defaults, which is what an untouched save gets. */
const atDefaults = (item) => item.draw(resolveColours(item.id, item.parts, {}));

test('house catalogue ids are unique across every kind of thing', () => {
  const ids = [...ROOMS, ...HOUSE_ITEMS, ...LIGHTING, ...PETS].map((x) => x.id);
  assert.equal(new Set(ids).size, ids.length, 'two house entries share an id');
});

test('every prop belongs to a real room and a real slot', () => {
  const rooms = new Set(ROOMS.map((r) => r.id));
  for (const item of HOUSE_ITEMS) {
    assert.ok(rooms.has(item.roomId), `${item.id} names unknown room "${item.roomId}"`);
    assert.ok(PROP_SLOTS.includes(item.slot), `${item.id} names unknown slot "${item.slot}"`);
    assert.equal(typeof item.draw, 'function', `${item.id} has no draw()`);
  }
});

test('every room has exactly one free starter in each slot', () => {
  for (const room of ROOMS) {
    for (const slot of PROP_SLOTS) {
      const starters = itemsFor(room.id, slot).filter((i) => i.source === 'starter');
      assert.equal(starters.length, 1,
        `${room.id}/${slot} has ${starters.length} starters, expected exactly 1`);
      assert.equal(starters[0].price, 0, `${starters[0].id} is a starter but is not free`);
    }
  }
});

test('a new house is fully furnished and owns everything it has selected', () => {
  const house = defaultHouse();
  const owned = new Set(house.unlocked);
  assert.ok(owned.has(house.lighting), 'default lighting is not unlocked');
  assert.ok(owned.has(house.pet), 'default pet is not unlocked');
  for (const room of ROOMS) {
    for (const slot of PROP_SLOTS) {
      const id = house.props[room.id][slot];
      assert.equal(id, starterFor(room.id, slot).id, `${room.id}/${slot} is not the starter`);
      assert.ok(owned.has(id), `${id} is selected but not unlocked`);
    }
  }
});

test('everything sold has a price, everything free is a starter', () => {
  for (const item of [...HOUSE_ITEMS, ...LIGHTING, ...PETS]) {
    if (item.source === 'store') assert.ok(item.price > 0, `${item.id} is sold for nothing`);
    else assert.equal(item.price, 0, `${item.id} is a ${item.source} but costs points`);
  }
});

test('boot backfills the house, which neither backend deep-merges', () => {
  const game = readSource('src/game.js');
  assert.match(game, /avatar\.house \?\?= defaultHouse\(\)/,
    'boot() must backfill avatar.house — an existing save replaces it wholesale');
  for (const f of ['src/platform.js', 'electron/main.cjs']) {
    const text = readSource(f);
    assert.match(text, /house: null/, `${f} is missing house in DEFAULT_SAVE.avatar`);
  }
});

test('no prop draws data-slot, which would hijack avatar recolouring', () => {
  for (const item of HOUSE_ITEMS) {
    assert.ok(!/data-slot/.test(atDefaults(item)), `${item.id} emits data-slot`);
  }
});

/* ------------------------------------------------------- recolourable parts */

test('every part declares a unique key, a name and a real hex default', () => {
  const owners = [
    ...HOUSE_ITEMS.map((i) => [i.id, i.parts]),
    ...PETS.map((p) => [petColourId(p.id), p.parts]),
    ...ROOMS.map((r) => [roomColourId(r.id), r.parts]),
  ];
  for (const [id, parts] of owners) {
    assert.ok(parts?.length, `${id} declares no recolourable parts`);
    const keys = new Set();
    for (const part of parts) {
      assert.ok(!keys.has(part.key), `${id} declares "${part.key}" twice`);
      keys.add(part.key);
      assert.match(part.default, /^#[0-9a-f]{6}$/, `${id}.${part.key} default is not a hex colour`);
      assert.ok(part.name?.length, `${id}.${part.key} has no label to show`);
    }
  }
});

test('every colour a prop draws with is one it declared', () => {
  // A draw() reading c.somethingUndeclared puts the string "undefined" into an
  // SVG fill, which paints black and is invisible in review.
  for (const item of HOUSE_ITEMS) {
    assert.ok(!/undefined|NaN/.test(atDefaults(item)), `${item.id} draws with an undeclared part`);
  }
  for (const room of ROOMS) {
    for (const pet of PETS) {
      const svg = buildRoomSVG({ ...defaultHouse(), room: room.id, pet: pet.id }, {});
      assert.ok(!/undefined|NaN/.test(svg), `${room.id}/${pet.id} draws with an undeclared part`);
    }
  }
});

test('an override reaches the drawing, and only that part', () => {
  const house = defaultHouse();
  const bed = HOUSE_ITEMS.find((i) => i.id === 'bd-furn-bed');
  const duvet = bed.parts.find((p) => p.key === 'duvet');
  house.colours[colourKey(bed.id, 'duvet')] = '#123456';

  const svg = buildRoomSVG(house, {});
  assert.ok(svg.includes('#123456'), 'the override never reached the SVG');
  assert.ok(!svg.includes(duvet.default), 'the default is still being drawn as well');
  // The frame shares the bed but not the part, so it must be untouched.
  assert.ok(svg.includes(bed.parts.find((p) => p.key === 'frame').default),
    'overriding one part disturbed another');
});

test('a house with no colours map at all still renders', () => {
  // Every save written before parts were recolourable is exactly this.
  const house = defaultHouse();
  delete house.colours;
  const svg = buildRoomSVG(house, {});
  assert.ok(!/undefined|NaN/.test(svg));
  assert.ok(svg.startsWith('<svg'));
});

test('every data-prop in a scene is something the panel can offer', () => {
  // colourablesIn drives the panel's list; a scene emitting an id it does not
  // return would be selectable and then show no parts.
  for (const room of ROOMS) {
    for (const pet of PETS) {
      const house = { ...defaultHouse(), room: room.id, pet: pet.id };
      const offered = new Set(colourablesIn(house).map((o) => o.id));
      const drawn = [...buildRoomSVG(house, {}).matchAll(/data-prop="([^"]+)"/g)].map((m) => m[1]);
      assert.ok(drawn.length, `${room.id}/${pet.id} has nothing selectable`);
      for (const id of drawn) {
        assert.ok(offered.has(id), `${room.id}/${pet.id} draws "${id}", which the panel never lists`);
      }
    }
  }
});

test('the lighting wash does not swallow taps meant for the room', () => {
  // It is drawn last and covers the whole scene, so without pointer-events
  // none of the props below it can be selected under anything but daylight.
  for (const lighting of LIGHTING) {
    const svg = buildRoomSVG({ ...defaultHouse(), lighting: lighting.id }, {});
    const wash = svg.slice(svg.lastIndexOf('<g pointer-events="none">'));
    assert.ok(wash.startsWith('<g pointer-events="none">'),
      `${lighting.id} is not wrapped in a pointer-events:none group`);
  }
});

test('every data-slot in a room scene comes from the avatar herself', async () => {
  const { buildRoomSVG } = await import('../src/house.js');
  const { defaultAvatarCustomize } = await import('../src/avatar.js');
  const c = defaultAvatarCustomize();
  // The one attribute game.js delegates part-recolouring clicks on, so a scene
  // must never introduce a value the avatar does not own.
  const KNOWN = new Set(['hair', 'skin', 'eyes', 'shirt', 'bottoms', 'dress', 'socks', 'shoes']);
  for (const room of ROOMS) {
    for (const pet of PETS) {
      const house = { ...defaultHouse(), room: room.id, pet: pet.id };
      for (const [, slot] of buildRoomSVG(house, c).matchAll(/data-slot="([^"]+)"/g)) {
        assert.ok(KNOWN.has(slot), `${room.id}/${pet.id} emitted unknown data-slot "${slot}"`);
      }
    }
  }
});

/* ------------------------------------------------- the living element tags */

const SIDECAR = JSON.parse(fs.readFileSync(path.join(ROOT, 'puzzles/animations.json'), 'utf8'));
const TAGS = Object.entries(SIDECAR).filter(([id]) => !id.startsWith('_'));
const puzzleFile = (id) => path.join(ROOT, 'puzzles', `${id}.json`);

test('every animation tag names a real picture, real cells and a real effect', () => {
  for (const [id, tag] of TAGS) {
    assert.ok(fs.existsSync(puzzleFile(id)), `animations.json tags "${id}", which is not a puzzle`);
    assert.ok(LIVING_EFFECTS.includes(tag.effect), `${id}: unknown effect "${tag.effect}"`);
    assert.ok(Array.isArray(tag.cells) && tag.cells.length, `${id}: nothing tagged to move`);
    const { cells } = JSON.parse(fs.readFileSync(puzzleFile(id), 'utf8'));
    for (const i of tag.cells) {
      assert.ok(Number.isInteger(i) && i >= 0 && i < cells.length,
        `${id}: cell ${i} is out of range (0..${cells.length - 1})`);
    }
    for (const k of ['speed', 'amplitude']) {
      if (tag[k] !== undefined) assert.ok(tag[k] > 0, `${id}: ${k} must be positive`);
    }
  }
});

test('the tags survive a re-bake, which is the whole point of the sidecar', () => {
  // writePuzzle() rewrites the puzzle JSON from scratch on every `npm run
  // seed` — which CI runs on every push — so a tag added to that file by hand
  // would silently disappear. It has to be re-injected from here instead.
  const mapify = readSource('tools/mapify.mjs');
  assert.match(mapify, /rest\.animation = animation/,
    'writePuzzle() must inject the animation field from the sidecar');
  assert.match(mapify, /rest\.lift = lift/,
    'writePuzzle() must inject the lift field too, or a re-bake drops it');
  for (const [id, tag] of TAGS) {
    const baked = JSON.parse(fs.readFileSync(puzzleFile(id), 'utf8')).animation;
    assert.deepEqual(baked, tag, `${id}: puzzle JSON is out of date — run \`npm run seed\``);
  }
});

test('an untagged picture carries no animation at all', () => {
  const tagged = new Set(TAGS.map(([id]) => id));
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'puzzles/manifest.json'), 'utf8'));
  for (const { id } of manifest) {
    if (tagged.has(id)) continue;
    const puzzle = JSON.parse(fs.readFileSync(puzzleFile(id), 'utf8'));
    assert.equal(puzzle.animation, undefined, `${id} has an animation but is not tagged`);
  }
});

/* ----------------------------------------------- difficulty + theme tags */

const DIFFICULTIES = ['chunky', 'normal', 'detailed', 'insane'];
const THEMES = ['Animals', 'Flowers', 'Food', 'Fantasy', 'Space', 'Landscape', 'Spooky', 'Abstract', 'Water'];
const PIC_TAGS = Object.entries(
  JSON.parse(fs.readFileSync(path.join(ROOT, 'puzzles/tags.json'), 'utf8')),
).filter(([id]) => !id.startsWith('_'));

test('every tags.json entry names a real picture, a valid difficulty and known themes', () => {
  for (const [id, tag] of PIC_TAGS) {
    assert.ok(fs.existsSync(puzzleFile(id)), `tags.json tags "${id}", which is not a puzzle`);
    assert.ok(DIFFICULTIES.includes(tag.difficulty), `${id}: unknown difficulty "${tag.difficulty}"`);
    assert.ok(Array.isArray(tag.themes), `${id}: themes must be an array`);
    assert.ok(tag.themes.length >= 1 && tag.themes.length <= 3, `${id}: want 1–3 themes`);
    for (const t of tag.themes) assert.ok(THEMES.includes(t), `${id}: unknown theme "${t}"`);
  }
});

test('the manifest is in sync with tags.json (every entry has a valid difficulty)', () => {
  const tags = Object.fromEntries(PIC_TAGS);
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'puzzles/manifest.json'), 'utf8'));
  for (const entry of manifest) {
    assert.ok(DIFFICULTIES.includes(entry.difficulty),
      `${entry.id}: manifest difficulty "${entry.difficulty}" invalid — run \`npm run seed\``);
    const want = tags[entry.id];
    assert.equal(entry.difficulty, want?.difficulty ?? 'normal',
      `${entry.id}: manifest difficulty out of date — run \`node tools/apply-tags.mjs\``);
    assert.deepEqual(entry.themes ?? [], want?.themes ?? [],
      `${entry.id}: manifest themes out of date — run \`node tools/apply-tags.mjs\``);
  }
});

test('tags.json is a sidecar: kept out of the web build, matches the theme list in the UI', () => {
  const apply = readSource('tools/apply-animations.mjs');
  assert.match(apply, /TAG_SIDECARS = new Set\(\[[^\]]*'tags\.json'/,
    'tags.json must be in TAG_SIDECARS so build-web excludes it and the scanners skip it');
  const game = readSource('src/game.js');
  for (const t of THEMES) {
    assert.ok(game.includes(`'${t}'`), `PICTURE_THEMES in game.js is missing "${t}"`);
  }
});

test('the animation window plays for the 5-10 seconds it was asked to', () => {
  const render = readSource('src/render.js');
  const ms = Number(render.match(/const LIVING_DURATION = (\d+)/)[1]);
  assert.ok(ms >= 5000 && ms <= 10000, `LIVING_DURATION is ${ms}ms`);
});

test('the frame loop treats the animation as busy, and it can end itself', () => {
  const game = readSource('src/game.js');
  assert.match(game, /const busy = [^;]*board\.living/s,
    'frame() must run at full rate while the element is alive');
  const render = readSource('src/render.js');
  // The numberOverride mistake: an indefinite flag in `busy` pins the loop to
  // 60fps forever. This one has to clear itself when its window closes.
  assert.match(render, /timeMs >= live\.end\)\s*\{\s*(\/\/[^\n]*\n\s*)*this\.living = null/,
    'drawLiving() must clear this.living once the window has closed');
  assert.match(render, /if \(!next\) this\.living = null/,
    'leaving photo view must end the animation immediately');
});

test('the avatar widget sits in the tray, not on top of the picture', () => {
  const html = readSource('src/index.html');
  const stage = html.slice(html.indexOf('<div id="stage">'), html.indexOf('</footer>'));
  const tray = html.slice(html.indexOf('<footer id="tray">'), html.indexOf('</footer>'));
  assert.ok(tray.includes('id="avatarWidget"'),
    'the avatar widget belongs in the tray with the tubs');
  // The whole point of the move: up to eight ability buttons used to stand on
  // the canvas. Putting it back inside #stage would undo that silently.
  assert.ok(!stage.slice(0, stage.indexOf('<footer id="tray">')).includes('id="avatarWidget"'),
    'the avatar widget is back inside #stage, covering the artwork again');
  assert.match(tray, /id="abilityRow" class="ability-row hidden"/,
    'the ability pop-up must start collapsed, or it covers the picture on load');
});

test('the avatar circle is bigger than a paint tub at both pointer sizes', () => {
  const css = readSource('src/styles.css');

  // Split the sheet into what applies unconditionally and what a touch screen
  // adds. Both matter, and neither can be found by a plain indexOf: the base
  // `.tub` rule sits *after* the first @media block, and the touch sizes for
  // the pill and the tub live in two *separate* `@media (pointer: coarse)`
  // blocks. Scanning naively lands on the wrong rule and passes without ever
  // comparing the sizes it claims to.
  const split = () => {
    let outside = '';
    let coarse = '';
    for (let i = 0; i < css.length; i++) {
      if (css[i] !== '@') { outside += css[i]; continue; }
      const head = css.slice(i, css.indexOf('{', i) + 1);
      let depth = 0;
      let j = css.indexOf('{', i);
      const from = j + 1;
      for (; j < css.length; j++) {
        if (css[j] === '{') depth++;
        else if (css[j] === '}' && --depth === 0) break;
      }
      if (head.startsWith('@media (pointer: coarse)')) coarse += css.slice(from, j);
      i = j;
    }
    return { outside, coarse };
  };

  const widthIn = (text, selector, label) => {
    const at = text.indexOf(selector);
    assert.notEqual(at, -1, `no ${label} rule for ${selector}`);
    const m = text.slice(at).match(/width:\s*(\d+)px/);
    assert.ok(m, `no ${label} width for ${selector}`);
    return Number(m[1]);
  };

  // The ring, not the pill: the pill is inset by the XP sweep, so the ring's
  // outer edge is the circle a player actually sees against the tubs.
  const { outside, coarse } = split();
  assert.ok(widthIn(outside, '.avatar-ring {', 'base') > widthIn(outside, '.tub {', 'base'),
    'the collapsed circle must outsize a tub, or it reads as a stray colour');
  assert.ok(widthIn(coarse, '.avatar-ring {', 'touch') > widthIn(coarse, '.tub {', 'touch'),
    'the circle must still outsize a tub on a touch screen');
});

/* ----------------------------------------------------------- the lift tags */

const LIFTS = Object.entries(
  JSON.parse(fs.readFileSync(path.join(ROOT, 'puzzles/lifts.json'), 'utf8')),
).filter(([id]) => !id.startsWith('_'));

test('every lift tag names a real picture and real cells', () => {
  for (const [id, cells] of LIFTS) {
    assert.ok(fs.existsSync(puzzleFile(id)), `lifts.json tags "${id}", which is not a puzzle`);
    assert.ok(Array.isArray(cells) && cells.length, `${id}: nothing tagged to raise`);
    assert.equal(new Set(cells).size, cells.length, `${id}: the same cell is listed twice`);
    const { cells: all } = JSON.parse(fs.readFileSync(puzzleFile(id), 'utf8'));
    for (const i of cells) {
      assert.ok(Number.isInteger(i) && i >= 0 && i < all.length,
        `${id}: cell ${i} is out of range (0..${all.length - 1})`);
    }
  }
});

test('the lift tags survive a re-bake, same as the animation tags', () => {
  for (const [id, cells] of LIFTS) {
    const baked = JSON.parse(fs.readFileSync(puzzleFile(id), 'utf8')).lift;
    assert.deepEqual(baked, cells, `${id}: puzzle JSON is out of date — run \`npm run seed\``);
  }
});

test('a picture with no liftable subject carries no lift at all', () => {
  const lifted = new Set(LIFTS.map(([id]) => id));
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'puzzles/manifest.json'), 'utf8'));
  for (const { id } of manifest) {
    if (lifted.has(id)) continue;
    const puzzle = JSON.parse(fs.readFileSync(puzzleFile(id), 'utf8'));
    assert.equal(puzzle.lift, undefined, `${id} has a lift but is not tagged`);
  }
});

test('the lift is read from its own tag, never from the animation', () => {
  // The bug this whole tag exists to fix: the animation names what moves in
  // the photo, which on Humpback Whale is one pectoral fin. Deriving the lift
  // from it raised the fin and left the whale flat.
  const render = readSource('src/render.js');
  assert.match(render, /const tagged = puzzle\.lift \?\? \[\]/,
    'setPuzzle() must take the lift cells from puzzle.lift');
  assert.ok(!/puzzle\.animation\?\.cells/.test(render),
    'the lift is reading the animation tag again');
});

test('the two sidecars are kept out of the web build, but the manifest is not', () => {
  const build = readSource('tools/build-web.mjs');
  assert.match(build, /!TAG_SIDECARS\.has\(n\)/,
    'the tag sidecars are build-time only — they must not ship');
  const apply = readSource('tools/apply-animations.mjs');
  const tagOnly = apply.match(/export const TAG_SIDECARS = new Set\(\[([^\]]*)\]\)/)[1];
  assert.ok(!tagOnly.includes('manifest'),
    'the manifest is the client index and has to ship — it is not a sidecar');
  assert.match(apply, /export const SIDECAR_FILES = new Set\(\['manifest\.json', \.\.\.TAG_SIDECARS\]\)/,
    'the scanners skip the manifest as well as the sidecars');
});

/* ------------------------------------------------------- the pictures filter */

test('the pictures list opens showing everything, alphabetical', () => {
  const game = readSource('src/game.js');
  // The filter resets to the widest possible view every time the panel opens,
  // so nothing is ever hidden behind a filter left on from last time.
  assert.match(game,
    /S\.picFilter = \{ q: '', status: 'all', source: 'all', size: 'all', difficulty: 'all', theme: 'all', sort: 'az' \}/,
    'openPanel must reset the picture filter to show-everything, A–Z');
});

test('the filter controls are not rows, so the harness never counts them', () => {
  const game = readSource('src/game.js');
  // check-web enumerates `#panelBody .row` and bands them; a filter chip or the
  // search box carrying `.row` would be mistaken for a picture.
  const bar = game.slice(game.indexOf('function buildPicFilterBar()'),
    game.indexOf('function applyPicFilter()'));
  assert.ok(!/'row|\brow\b/.test(bar.replace(/pic-\w+/g, '')),
    'the filter bar must not use the .row class');
  assert.match(game, /list\.className = 'pic-list'/,
    'picture rows live in their own .pic-list container');
});
