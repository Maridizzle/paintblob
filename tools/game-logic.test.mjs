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
  activate, isActive, consumeActive, NUMBER_RECOLOR_CYCLE, nextNumberRecolorIndex,
} from '../src/abilities.js';
import { WARDROBE_ITEMS } from '../src/wardrobe.js';
import { Burst } from '../src/paint-fx.js';
import {
  buildAvatarSVG, defaultAvatarCustomize, setVariant, VARIANTS, RACE_PROFILE, raceSkinPalette,
} from '../src/avatar.js';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
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
  const def = getDef('precision-ping');
  for (let i = 0; i < def.maxCharges; i++) assert.equal(activate(state, def.id, 0), true);
  assert.equal(state[def.id].charges, 0);
  assert.equal(activate(state, def.id, 0), false);
});

test('activate on an ability with a duration opens an active window isActive sees', () => {
  const state = defaultAbilityState();
  activate(state, 'colour-surge', 1000);
  assert.equal(isActive(state, 'colour-surge', 1500), true);
  assert.equal(isActive(state, 'colour-surge', 1000 + getDef('colour-surge').durationMs + 1), false);
});

test('activate on a zero-duration ability (an instant effect) opens no active window', () => {
  const state = defaultAbilityState();
  activate(state, 'precision-ping', 1000);
  assert.equal(isActive(state, 'precision-ping', 1000), false);
});

test('consumeActive ends a window early, e.g. Streak Shield used up by the click it protected', () => {
  const state = defaultAbilityState();
  activate(state, 'streak-shield', 0);
  assert.equal(isActive(state, 'streak-shield', 10), true);
  consumeActive(state, 'streak-shield');
  assert.equal(isActive(state, 'streak-shield', 10), false);
});

test('isUnlocked gates purely on level vs unlockLevel', () => {
  const def = getDef('half-fill');
  assert.equal(isUnlocked(def, def.unlockLevel - 1), false);
  assert.equal(isUnlocked(def, def.unlockLevel), true);
});

test('grantLevelUpCharges refills one charge per level-up, capped at max, only once unlocked', () => {
  const state = defaultAbilityState();
  const def = getDef('colour-flash'); // unlocks at level 2, maxCharges 4
  activate(state, def.id, 0);
  activate(state, def.id, 0);
  assert.equal(state[def.id].charges, 2);
  grantLevelUpCharges(state, 1); // below unlockLevel: no-op
  assert.equal(state[def.id].charges, 2);
  grantLevelUpCharges(state, 2);
  assert.equal(state[def.id].charges, 3);
  grantLevelUpCharges(state, 3);
  grantLevelUpCharges(state, 4);
  grantLevelUpCharges(state, 5); // would overshoot max without the cap
  assert.equal(state[def.id].charges, def.maxCharges);
});

test('half-fill only regains a charge every second level-up, per its slower levelsPerCharge', () => {
  const state = defaultAbilityState();
  const def = getDef('half-fill'); // unlocks at level 5, maxCharges 1, levelsPerCharge 2
  activate(state, def.id, 0);
  assert.equal(state[def.id].charges, 0);
  grantLevelUpCharges(state, 5);
  assert.equal(state[def.id].charges, 0, 'one level-up since unlock is not enough yet');
  grantLevelUpCharges(state, 6);
  assert.equal(state[def.id].charges, 1, 'the second level-up since unlock grants the charge');
});

test('nextNumberRecolorIndex starts at red and wraps violet back to red', () => {
  let i;
  i = nextNumberRecolorIndex(i);
  assert.equal(i, 0, 'first-ever activation lands on red');
  for (let step = 1; step < NUMBER_RECOLOR_CYCLE.length; step++) i = nextNumberRecolorIndex(i);
  assert.equal(i, NUMBER_RECOLOR_CYCLE.length - 1, 'cycled through every colour once');
  i = nextNumberRecolorIndex(i);
  assert.equal(i, 0, 'violet wraps back to red');
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
  const text = fs.readFileSync(path.join(ROOT, 'src/game.js'), 'utf8');
  const ids = [...text.matchAll(/achievements\.award\('([^']+)'\)/g)].map((m) => m[1]);
  assert.ok(ids.length > 0, 'sanity check: the scan should find some award() calls');
  for (const id of ids) assert.ok(IDS.has(id), `game.js awards unknown achievement id "${id}"`);
});

test('every achievement id pushed by StreakTracker exists in ACHIEVEMENTS', () => {
  const text = fs.readFileSync(path.join(ROOT, 'src/achievements.js'), 'utf8');
  const ids = [...text.matchAll(/earned\.push\('([^']+)'\)/g)].map((m) => m[1]);
  assert.ok(ids.length > 0, 'sanity check: the scan should find some earned.push() calls');
  for (const id of ids) assert.ok(IDS.has(id), `StreakTracker pushes unknown achievement id "${id}"`);
});

test('every achievement id checked with unlocked.has() in achievements.js exists in ACHIEVEMENTS', () => {
  const text = fs.readFileSync(path.join(ROOT, 'src/achievements.js'), 'utf8');
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
  for (const race of VARIANTS.race) {
    for (const gender of VARIANTS.gender) {
      for (const shape of VARIANTS.faceShape) {
        for (const hair of VARIANTS.hairStyle) {
          for (const eyes of VARIANTS.eyesStyle) {
            const c = defaultAvatarCustomize();
            c.race = race;
            c.gender = gender;
            c.face.shape = shape;
            c.hair.style = hair;
            c.eyes.style = eyes;
            yield [`${race}/${gender}/${shape}/${hair}/${eyes}`, c];
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
    const text = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.match(text, /race: 'human'/, `${f} is missing race in DEFAULT_SAVE`);
  }
  // The backfill is the only path that reaches an existing save, since
  // neither backend deep-merges `avatar`.
  const game = fs.readFileSync(path.join(ROOT, 'src/game.js'), 'utf8');
  assert.match(game, /customize\.race \?\?= 'human'/,
    'boot() must backfill customize.race or every returning player loses their avatar');
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
  const text = fs.readFileSync(path.join(ROOT, 'src/game.js'), 'utf8');
  const constructions = [...text.matchAll(/new Burst\(\{[\s\S]*?\}\)/g)];
  assert.equal(constructions.length, 1, 'expected exactly one Burst construction site');
  assert.match(constructions[0][0], /opacity:/, 'the blob opacity setting is not reaching the Burst');
});

test('both DEFAULT_SAVE literals ship the blob opacity, and boot backfills it', () => {
  for (const f of ['src/platform.js', 'electron/main.cjs']) {
    const text = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.match(text, /settings: \{[^}]*opacity:/, `${f} is missing opacity in DEFAULT_SAVE.settings`);
  }
  const game = fs.readFileSync(path.join(ROOT, 'src/game.js'), 'utf8');
  assert.match(game, /settings\.opacity \?\?=/, 'boot() should backfill settings.opacity');
});

test('every panel renderer bands its list', () => {
  const text = fs.readFileSync(path.join(ROOT, 'src/game.js'), 'utf8');
  // Each renderer's body, from its signature to the next top-level function.
  for (const name of ['renderPictures', 'renderTrophies', 'renderAvatarPanel', 'renderSettings']) {
    const start = text.indexOf(`function ${name}(`);
    assert.ok(start > 0, `${name} is missing from game.js`);
    const end = text.indexOf('\nfunction ', start + 1);
    const body = text.slice(start, end === -1 ? text.length : end);
    assert.match(body, /\bband\(/, `${name} does not band its rows`);
  }
});

test('the band tint is distinct from both the base row and the hover tint', () => {
  const css = fs.readFileSync(path.join(ROOT, 'src/styles.css'), 'utf8');
  const tint = (selector) => {
    const m = css.match(new RegExp(`${selector}\\s*\\{[^}]*background: (rgba\\([^)]*\\))`));
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
