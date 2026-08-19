// Pure ability-charge economy: definitions, unlock gating, charge grant on
// level-up, activate/spend, and a time-windowed "is this effect currently
// live" check. No DOM, no canvas — game.js and render.js each own what an
// ability actually looks or feels like; this just owns whether you can fire
// one right now and for how long it stays on.
//
// Tiered by power: max charges go DOWN as the effect gets stronger, so the
// biggest lever (Half Fill) is the rarest. Unlock level steps one per level
// down this list (L1..L8) — abilities arrive one at a time as you climb,
// weakest first, rather than clumping in the first few levels. `tier` still
// records the power grouping the charge counts follow; it no longer equals
// the unlock level.

export const ABILITIES = [
  {
    id: 'precision-ping', icon: '🎯', name: 'Precision Ping',
    desc: 'Flashes the nearest unfilled cell of your held colour.',
    tier: 1, maxCharges: 5, durationMs: 0, unlockLevel: 1, levelsPerCharge: 1,
  },
  {
    id: 'number-recolor', icon: '🔢', name: 'Number Recolor',
    desc: 'Cycles unfilled numbers to the next ROYGBIV colour — stays that way until used again.',
    tier: 1, maxCharges: 4, durationMs: 0, unlockLevel: 2, levelsPerCharge: 1,
  },
  {
    id: 'colour-flash', icon: '✨', name: 'Colour Flash',
    desc: "Makes every unfilled cell of your held colour flash.",
    tier: 2, maxCharges: 4, durationMs: 4000, unlockLevel: 3, levelsPerCharge: 1,
  },
  {
    id: 'steady-hand', icon: '🤲', name: 'Steady Hand',
    desc: 'Widens your tap radius so near-misses still land.',
    tier: 2, maxCharges: 3, durationMs: 10000, unlockLevel: 4, levelsPerCharge: 1,
  },
  {
    id: 'golden-cell', icon: '🌟', name: 'Golden Cell',
    desc: "Marks one cell of your held colour worth 5x points.",
    tier: 3, maxCharges: 3, durationMs: 15000, unlockLevel: 5, levelsPerCharge: 1,
  },
  {
    id: 'colour-surge', icon: '⚡', name: 'Colour Surge',
    desc: 'Doubles points from every fill while active.',
    tier: 3, maxCharges: 3, durationMs: 8000, unlockLevel: 6, levelsPerCharge: 1,
  },
  {
    id: 'streak-shield', icon: '🛡️', name: 'Streak Shield',
    desc: 'Forgives your next wrong-tub click.',
    tier: 4, maxCharges: 2, durationMs: 15000, unlockLevel: 7, levelsPerCharge: 1,
  },
  {
    id: 'half-fill', icon: '🪄', name: 'Half Fill',
    desc: "Paints half of your held colour's remaining cells outright.",
    tier: 5, maxCharges: 1, durationMs: 0, unlockLevel: 8, levelsPerCharge: 2,
  },
];

const BY_ID = new Map(ABILITIES.map((a) => [a.id, a]));

// Mid-to-high lightness rather than the traditional dark #4B0082/#8F00FF, so
// the single dark outline render.js already draws behind every number stays
// legible for every step of the cycle — no per-colour outline branch needed.
export const NUMBER_RECOLOR_CYCLE = [
  { name: 'Red', hex: '#ff4d4d' },
  { name: 'Orange', hex: '#ff9f40' },
  { name: 'Yellow', hex: '#ffe066' },
  { name: 'Green', hex: '#46d17a' },
  { name: 'Blue', hex: '#4da6ff' },
  { name: 'Indigo', hex: '#7c6bff' },
  { name: 'Violet', hex: '#d17bff' },
];

/** Advances the ROYGBIV cycle by one step, wrapping violet back to red.
 *  `i` is the previously-used index, or absent if never activated. */
export function nextNumberRecolorIndex(i) {
  return ((i ?? -1) + 1) % NUMBER_RECOLOR_CYCLE.length;
}

export function getDef(id) {
  return BY_ID.get(id);
}

export function isUnlocked(def, level) {
  return level >= def.unlockLevel;
}

/** Every ability starts with a full charge pool — it just sits unused until
 *  the player's level reaches unlockLevel, same as the UI gates on it. */
export function defaultAbilityState() {
  const state = {};
  for (const a of ABILITIES) state[a.id] = { charges: a.maxCharges, active: null, sinceCharge: 0 };
  return state;
}

/** Call once for each level gained (e.g. levels 4 then 5 if two were crossed
 *  by one fill) so every unlocked ability's regen counter advances exactly
 *  one level-up at a time — Half Fill's levelsPerCharge of 2 depends on
 *  seeing every individual step, not just the net change. */
export function grantLevelUpCharges(abilityState, newLevel) {
  for (const a of ABILITIES) {
    if (newLevel < a.unlockLevel) continue;
    const s = abilityState[a.id] ?? (abilityState[a.id] = { charges: a.maxCharges, active: null, sinceCharge: 0 });
    s.sinceCharge = (s.sinceCharge ?? 0) + 1;
    if (s.sinceCharge >= a.levelsPerCharge) {
      s.sinceCharge = 0;
      s.charges = Math.min(a.maxCharges, s.charges + 1);
    }
  }
}

/** @returns {boolean} whether a charge was actually spent */
export function activate(abilityState, id, now) {
  const def = BY_ID.get(id);
  if (!def) return false;
  const s = abilityState[id] ?? (abilityState[id] = { charges: def.maxCharges, active: null, sinceCharge: 0 });
  if (s.charges <= 0) return false;
  s.charges--;
  if (def.durationMs > 0) s.active = { start: now, end: now + def.durationMs };
  return true;
}

export function isActive(abilityState, id, now) {
  const s = abilityState[id];
  if (!s?.active) return false;
  if (now >= s.active.end) {
    s.active = null;
    return false;
  }
  return true;
}

/** Ends an active window early, e.g. Streak Shield used up by the wrong-tub
 *  click it was protecting against, rather than waiting out its full window. */
export function consumeActive(abilityState, id) {
  const s = abilityState[id];
  if (s) s.active = null;
}
