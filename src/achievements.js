// Idle-clicker style achievements: long tiered ladders so there is always a
// next one visible, plus a handful of hidden ones for texture.
//
// Anything with `track` is a plain counter against `goal` and shows a progress
// bar. Anything with `event` is unlocked by the game calling award() directly.

export const ACHIEVEMENTS = [
  // --- the main ladder ------------------------------------------------------
  { id: 'blob-1', icon: '🎨', name: 'First Blob', desc: 'Fill your very first cell.', track: 'cells', goal: 1 },
  { id: 'blob-10', icon: '💧', name: 'Getting Messy', desc: 'Fill 10 cells.', track: 'cells', goal: 10 },
  { id: 'blob-50', icon: '🖌️', name: 'Sploosh', desc: 'Fill 50 cells.', track: 'cells', goal: 50 },
  { id: 'blob-250', icon: '🪣', name: 'Bucket Brigade', desc: 'Fill 250 cells.', track: 'cells', goal: 250 },
  { id: 'blob-1000', icon: '🌊', name: 'Tidal Wave', desc: 'Fill 1,000 cells.', track: 'cells', goal: 1000 },
  { id: 'blob-5000', icon: '🌋', name: 'Chromatic Eruption', desc: 'Fill 5,000 cells.', track: 'cells', goal: 5000 },
  { id: 'blob-25000', icon: '🏆', name: 'Pigment Deity', desc: 'Fill 25,000 cells.', track: 'cells', goal: 25000 },

  // --- pictures -------------------------------------------------------------
  { id: 'pic-1', icon: '🖼️', name: 'Framed', desc: 'Finish a picture.', track: 'puzzles', goal: 1 },
  { id: 'pic-3', icon: '🏛️', name: 'Small Gallery', desc: 'Finish 3 pictures.', track: 'puzzles', goal: 3 },
  { id: 'pic-10', icon: '🎭', name: 'Curator', desc: 'Finish 10 pictures.', track: 'puzzles', goal: 10 },
  { id: 'pic-25', icon: '👑', name: 'Old Master', desc: 'Finish 25 pictures.', track: 'puzzles', goal: 25 },

  // --- habits ---------------------------------------------------------------
  { id: 'switch-100', icon: '🔀', name: 'Indecisive', desc: 'Switch paint tubs 100 times.', track: 'colourSwitches', goal: 100 },
  { id: 'time-1h', icon: '⏳', name: 'Lost an Hour', desc: 'Spend an hour painting.', track: 'seconds', goal: 3600 },
  { id: 'time-10h', icon: '🕰️', name: 'Where Did the Week Go', desc: 'Spend ten hours painting.', track: 'seconds', goal: 36000 },

  // --- skill / flow ---------------------------------------------------------
  { id: 'combo-15', icon: '⚡', name: 'On a Roll', desc: 'Fill 15 cells in a row without a wrong tub.', event: true },
  { id: 'combo-40', icon: '🔥', name: 'Unbroken', desc: 'Fill 40 cells in a row without a wrong tub.', event: true },
  { id: 'rapid-10', icon: '🐇', name: 'Twitchy', desc: 'Fill 10 cells in 10 seconds.', event: true },
  { id: 'tub-empty', icon: '🫗', name: 'Squeezed Dry', desc: 'Use up every cell of one colour.', event: true },
  { id: 'flawless', icon: '💎', name: 'Flawless', desc: 'Finish a picture with no wrong-tub clicks.', event: true },
  { id: 'speedrun', icon: '⏱️', name: 'Wet on Wet', desc: 'Finish a picture in under 90 seconds.', event: true },

  // --- hidden ---------------------------------------------------------------
  { id: 'night-owl', icon: '🦉', name: 'Night Shift', desc: 'Paint something after 2am.', event: true, hidden: true },
  { id: 'patient', icon: '🧘', name: 'Unhurried', desc: 'Let 25 blobs land without clicking mid-flight.', track: 'patientLandings', goal: 25, hidden: true },
  { id: 'ghost', icon: '🤫', name: 'Silent Treatment', desc: 'Fill 20 cells with the sound off.', track: 'mutedCells', goal: 20, hidden: true },
];

const BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

export class Achievements {
  constructor(unlocked = []) {
    this.unlocked = new Set(unlocked);
    this.listeners = [];
  }

  onUnlock(fn) {
    this.listeners.push(fn);
  }

  has(id) {
    return this.unlocked.has(id);
  }

  #fire(def) {
    this.unlocked.add(def.id);
    for (const fn of this.listeners) fn(def);
  }

  /** Unlocks an event-driven achievement. No-op if already earned. */
  award(id) {
    const def = BY_ID.get(id);
    if (!def || this.unlocked.has(id)) return false;
    this.#fire(def);
    return true;
  }

  /** Re-evaluates every counter achievement. Cheap enough to call per click. */
  sync(stats) {
    for (const def of ACHIEVEMENTS) {
      if (!def.track || this.unlocked.has(def.id)) continue;
      if ((stats[def.track] ?? 0) >= def.goal) this.#fire(def);
    }
  }

  /** Sorted for display: unearned-and-closest first, then earned. */
  list(stats) {
    return ACHIEVEMENTS.map((def) => {
      const earned = this.unlocked.has(def.id);
      const value = def.track ? (stats[def.track] ?? 0) : 0;
      const progress = def.track ? Math.min(1, value / def.goal) : earned ? 1 : 0;
      return { ...def, earned, value, progress };
    }).sort((a, b) => {
      if (a.earned !== b.earned) return a.earned ? 1 : -1;
      return b.progress - a.progress;
    });
  }
}

/**
 * Tracks the streaks and timing windows the event achievements care about, so
 * game.js does not have to carry that bookkeeping itself.
 */
export class StreakTracker {
  constructor() {
    this.reset();
  }

  reset() {
    this.combo = 0;
    this.recent = [];
    this.wrongClicks = 0;
  }

  /** @returns {string[]} achievement ids earned by this fill */
  fill(now) {
    this.combo++;
    this.recent.push(now);
    while (this.recent.length && now - this.recent[0] > 10000) this.recent.shift();

    const earned = [];
    if (this.combo >= 15) earned.push('combo-15');
    if (this.combo >= 40) earned.push('combo-40');
    if (this.recent.length >= 10) earned.push('rapid-10');

    const hour = new Date(now).getHours();
    if (hour >= 2 && hour < 5) earned.push('night-owl');
    return earned;
  }

  // Switching tubs deliberately is normal play and must not break the streak —
  // only a wrong-colour click does. Auto-advance between tubs would otherwise
  // make these unreachable on any multi-colour picture.
  wrong() {
    this.wrongClicks++;
    this.combo = 0;
  }
}
