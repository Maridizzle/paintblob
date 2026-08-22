// Unit tests for the play-stats dashboard derivation. computePlayStats is a
// pure function of the save object, so it exercises fully without a browser:
// retroactive totals/bests/averages from `stats` + `progress`, the new
// accuracy and streak fields, and the empty-save case that must never NaN.

import test from 'node:test';
import assert from 'node:assert/strict';

import { computePlayStats } from '../src/playstats.js';

/** Flatten every group's tiles into one label -> value map for easy lookup. */
function tilesOf(save) {
  const map = {};
  for (const group of computePlayStats(save)) {
    for (const tile of group.tiles) map[`${group.title}/${tile.label}`] = tile.value;
  }
  return map;
}

test('empty save renders dashes, never NaN or 0-as-record', () => {
  const groups = computePlayStats({ stats: {}, progress: {} });
  const titles = groups.map((g) => g.title);
  assert.deepEqual(titles, ['Streaks', 'Bests', 'Totals', 'Averages']);

  const t = tilesOf({ stats: {}, progress: {} });
  // No finished pictures -> min/max/mean stats are the em dash.
  assert.equal(t['Bests/Fastest finish'], '—');
  assert.equal(t['Bests/Biggest picture'], '—');
  assert.equal(t['Averages/Time / picture'], '—');
  assert.equal(t['Averages/Cells / picture'], '—');
  assert.equal(t['Averages/Accuracy'], '—');
  // Totals still read zero rather than a dash — a real count.
  assert.equal(t['Totals/Cells painted'], '0');
  assert.equal(t['Totals/Pictures done'], '0');
  // No value anywhere should be the string "NaN".
  for (const v of Object.values(t)) assert.doesNotMatch(v, /NaN/);
});

test('retroactive totals come straight from stats counters', () => {
  const t = tilesOf({
    stats: {
      cells: 1234, puzzles: 7, seconds: 3661, colourSwitches: 42,
      undos: 3, pointsEarned: 999,
    },
    progress: {},
  });
  assert.equal(t['Totals/Cells painted'], '1,234');
  assert.equal(t['Totals/Pictures done'], '7');
  assert.equal(t['Totals/Time played'], '1h 01m'); // 3661s -> 61m -> 1h 01m
  assert.equal(t['Totals/Colour switches'], '42');
  assert.equal(t['Totals/Undos'], '3');
  assert.equal(t['Totals/Coins earned'], '999');
});

test('bests and averages derive from finished progress entries only', () => {
  const save = {
    stats: { cells: 300 },
    progress: {
      a: { done: true, seconds: 40, filled: new Array(50).fill(0) },
      b: { done: true, seconds: 120, filled: new Array(150).fill(0) },
      // Unfinished entry must be ignored by every derived stat.
      c: { done: false, seconds: 5, filled: new Array(999).fill(0) },
    },
  };
  const t = tilesOf(save);
  assert.equal(t['Bests/Fastest finish'], '0m 40s');       // min of {40,120}
  assert.equal(t['Bests/Biggest picture'], '150 cells');   // max of {50,150}
  assert.equal(t['Averages/Time / picture'], '1m 20s');    // mean(40,120)=80s
  assert.equal(t['Averages/Cells / picture'], '100');      // mean(50,150)=100
});

test('accuracy is cells / (cells + wrongTaps)', () => {
  const t = tilesOf({ stats: { cells: 90, wrongTaps: 10 }, progress: {} });
  assert.equal(t['Averages/Accuracy'], '90.0%');

  // A flawless player (no wrong taps) is 100%, not a dash.
  const t2 = tilesOf({ stats: { cells: 50, wrongTaps: 0 }, progress: {} });
  assert.equal(t2['Averages/Accuracy'], '100.0%');

  // No taps at all -> dash, no division by zero.
  const t3 = tilesOf({ stats: {}, progress: {} });
  assert.equal(t3['Averages/Accuracy'], '—');
});

test('streak fields surface in both the Streaks and Bests groups', () => {
  const t = tilesOf({
    stats: { dayStreak: 4, bestDayStreak: 9, bestStreak: 37 },
    progress: {},
  });
  assert.equal(t['Streaks/Day streak'], '4🔥');
  assert.equal(t['Streaks/Best day streak'], '9');
  assert.equal(t['Streaks/Best fill streak'], '37');
  assert.equal(t['Bests/Best fill streak'], '37');
});

test('tolerates a missing save without throwing', () => {
  assert.doesNotThrow(() => computePlayStats(undefined));
  assert.doesNotThrow(() => computePlayStats({}));
});
