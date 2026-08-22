// Pure derivation of the play-stats dashboard shown under the room. Everything
// here reads from a save object and returns display-ready tiles — no DOM, no
// game state — so it stays trivially unit-testable and the renderer stays thin.
//
// Numbers come from two places: the lifetime `stats` counters, and the
// per-picture `progress` records ({ filled: number[], done, seconds }). A stat
// that has no data yet (no finished pictures, no taps) renders as an em dash
// rather than a misleading 0 or NaN.

const DASH = '—';

function fmtDuration(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds || 0));
  const m = Math.floor(s / 60);
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}h ${String(m % 60).padStart(2, '0')}m`;
  }
  return `${m}m ${String(s % 60).padStart(2, '0')}s`;
}

function fmtInt(n) {
  return Math.round(n || 0).toLocaleString();
}

/**
 * @param {object} save the whole save object (needs `stats` and `progress`)
 * @returns {{ title: string, tiles: {label: string, value: string}[] }[]}
 *   Four groups — Streaks, Bests, Totals, Averages — each a list of tiles.
 */
export function computePlayStats(save) {
  const stats = save?.stats ?? {};
  const progress = save?.progress ?? {};

  const done = Object.values(progress).filter((p) => p && p.done);
  const times = done.map((p) => Math.round(p.seconds || 0));
  const sizes = done.map((p) => (Array.isArray(p.filled) ? p.filled.length : 0));

  const min = (xs) => (xs.length ? Math.min(...xs) : null);
  const max = (xs) => (xs.length ? Math.max(...xs) : null);
  const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

  const cells = stats.cells || 0;
  const wrongTaps = stats.wrongTaps || 0;
  const taps = cells + wrongTaps;
  const accuracy = taps > 0 ? (cells / taps) * 100 : null;

  const fastest = min(times);
  const biggest = max(sizes);
  const avgTime = mean(times);
  const avgSize = mean(sizes);

  return [
    {
      title: 'Streaks',
      tiles: [
        { label: 'Day streak', value: stats.dayStreak ? `${fmtInt(stats.dayStreak)}🔥` : DASH },
        { label: 'Best day streak', value: stats.bestDayStreak ? fmtInt(stats.bestDayStreak) : DASH },
        { label: 'Best fill streak', value: stats.bestStreak ? fmtInt(stats.bestStreak) : DASH },
      ],
    },
    {
      title: 'Bests',
      tiles: [
        { label: 'Fastest finish', value: fastest == null ? DASH : fmtDuration(fastest) },
        { label: 'Biggest picture', value: biggest == null ? DASH : `${fmtInt(biggest)} cells` },
        { label: 'Best fill streak', value: stats.bestStreak ? fmtInt(stats.bestStreak) : DASH },
      ],
    },
    {
      title: 'Totals',
      tiles: [
        { label: 'Cells painted', value: fmtInt(cells) },
        { label: 'Pictures done', value: fmtInt(stats.puzzles) },
        { label: 'Time played', value: fmtDuration(stats.seconds) },
        { label: 'Colour switches', value: fmtInt(stats.colourSwitches) },
        { label: 'Undos', value: fmtInt(stats.undos) },
        { label: 'Coins earned', value: fmtInt(stats.pointsEarned) },
      ],
    },
    {
      title: 'Averages',
      tiles: [
        { label: 'Accuracy', value: accuracy == null ? DASH : `${accuracy.toFixed(1)}%` },
        { label: 'Time / picture', value: avgTime == null ? DASH : fmtDuration(avgTime) },
        { label: 'Cells / picture', value: avgSize == null ? DASH : fmtInt(avgSize) },
      ],
    },
  ];
}
