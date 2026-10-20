// Last Light — keep the windows lit.
//
// Chapter Two's own minigame, the dusk-road sibling of chapter one's Swap. A
// black street of eight windows, each with a lamp in it that is slowly going
// out. Tap a window to turn its lamp back up. Keep every one of them burning
// until the clock runs out, and the street stays lit; let one go fully dark
// and stay dark, and the round is lost. It is the chapter's whole argument in
// one board — a light stays on only while somebody keeps looking at it — and
// it is the same muscle The Fade's fight will ask for: attention, spread thin,
// never dropped.
//
// Pure arithmetic and none of the drawing, so it runs in node the way swap.js
// and overtime.js do: the windows, their drain, the relight, and the one
// judgement — is a window dark enough for long enough to lose on. game.js
// draws the street and runs the clock.
//
// It is the Swap's sibling, not its twin. The Swap is KNOWLEDGE (which name
// belongs to which colour); Last Light is ATTENTION (which lamp is lowest right
// now). Nothing here is ever a question of what is correct, only of what is
// being looked after — so the two never feel like one round reskinned.

export const WINDOWS = 8;
export const SECONDS = 50;

// How fast a lamp goes out, in light-per-second, at the round's open: a full
// lamp lasts about twelve seconds untended. Each window carries a little
// jitter so they never fall in step, and the whole street speeds up as the
// round goes on (RAMP: the drain is this many times faster at the final second
// than at the first), which is where the round gets its pressure — by the end
// a lamp lasts about six seconds, so eight of them want a tap every second or
// so, which is brisk for a paint game and no more. Low-stim damps both: a
// slower street that never accelerates.
export const BASE_DRAIN = 0.085;
export const JITTER = 0.25;      // ± share of BASE_DRAIN per window
export const RAMP = 1.8;
export const LOW_STIM_DRAIN = 0.6; // multiplier on the drain under low-stim

// A dark lamp is not the loss — a lamp that stays dark is. A window at zero
// for longer than this is one nobody is looking after any more.
export const DARK_GRACE = 3;

// A tap does not reset a lamp to full in one go; it adds a good pour of light,
// capped at full. So a lamp let fall to nothing takes a beat to come back,
// which is the cost of having looked away.
export const RELIGHT = 0.75;

/**
 * A fresh street: every lamp full, every window carrying its own drain rate,
 * every dark-clock at zero. rng is injectable for the tests.
 */
export function newStreet(rng = Math.random) {
  const rates = [];
  for (let i = 0; i < WINDOWS; i++) {
    rates.push(BASE_DRAIN * (1 + (rng() * 2 - 1) * JITTER));
  }
  return {
    light: new Array(WINDOWS).fill(1),
    rates,
    dark: new Array(WINDOWS).fill(0), // seconds each window has sat at zero
  };
}

/** The drain multiplier at a point in the round, 0..1 of the way through. */
export function rampAt(progress, lowStim = false) {
  if (lowStim) return LOW_STIM_DRAIN;
  const t = Math.max(0, Math.min(1, progress));
  return 1 + (RAMP - 1) * t;
}

/**
 * Advances the street by `dt` seconds at `progress` (0..1) through the round.
 * Pure: returns a new street plus `lost` — true the moment any window has been
 * dark past the grace — and `darkest`, the index of that window (or of the
 * lowest lamp, for the HUD), so the caller never has to re-derive either.
 */
export function step(street, dt, progress, lowStim = false) {
  const mult = rampAt(progress, lowStim);
  const light = street.light.map((l, i) => Math.max(0, l - street.rates[i] * mult * dt));
  const dark = street.dark.map((d, i) => (light[i] <= 0 ? d + dt : 0));
  let lost = false;
  let darkest = 0;
  for (let i = 0; i < WINDOWS; i++) {
    if (dark[i] > DARK_GRACE) lost = true;
    if (light[i] < light[darkest] || (light[i] === light[darkest] && dark[i] > dark[darkest])) darkest = i;
  }
  return { street: { light, rates: street.rates, dark }, lost, darkest };
}

/** Turns lamp `i` back up. Pure: the caller keeps the old street. */
export function relight(street, i) {
  if (i < 0 || i >= WINDOWS) return street;
  const light = [...street.light];
  light[i] = Math.min(1, light[i] + RELIGHT);
  const dark = [...street.dark];
  dark[i] = 0;
  return { light, rates: street.rates, dark };
}

/** How many windows are still burning (light above a flicker). */
export function litCount(street) {
  return street.light.filter((l) => l > 0.02).length;
}
