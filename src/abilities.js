// Pure ability-charge economy: definitions, unlock gating, charge grant on
// level-up, activate/spend, and a time-windowed "is this effect currently
// live" check. No DOM, no canvas — game.js and render.js each own what an
// ability actually looks or feels like; this just owns whether you can fire
// one right now and for how long it stays on.
//
// Every ability DOES something you can see — a reveal, a screen filter, or a
// mass fill. The old set leaked slots to invisible point-multipliers and
// barely-there nudges (a wider tap radius, a one-cell ping); those are gone.
// What is left is five levers that change the board in front of you.
//
// Tiered by power: max charges go DOWN as the effect gets stronger, so the
// biggest lever (Floodgate) is the rarest. Unlock level steps one per level
// down this list (L1..L5) — they arrive one at a time as you climb, the
// cheapest reveal first, the picture-moving fills last. `tier` records the
// power grouping the charge counts follow; it is not the unlock level.
//
// Ids are kept stable where an ability survived the cull (colour-flash,
// half-fill), so a returning player keeps the charges they had banked; the cut
// ids simply stop being read (their saved state sits harmless and unused).

export const ABILITIES = [
  {
    id: 'colour-flash', icon: '✨', name: 'Beacon',
    desc: 'Every unfilled cell of your held colour pulses — find them all at a glance.',
    tier: 1, maxCharges: 5, durationMs: 8000, unlockLevel: 1, levelsPerCharge: 1,
  },
  {
    id: 'focus', icon: '🔎', name: 'Focus',
    desc: 'The whole picture greys out except your held colour, so it leaps off the board.',
    tier: 2, maxCharges: 4, durationMs: 12000, unlockLevel: 2, levelsPerCharge: 1,
  },
  {
    id: 'prism', icon: '🌈', name: 'Prism',
    desc: 'One cell of every colour fills at once, scattered across the picture.',
    tier: 3, maxCharges: 3, durationMs: 0, unlockLevel: 3, levelsPerCharge: 1,
  },
  {
    id: 'explode', icon: '💥', name: 'Explode',
    desc: "A third of your held colour's remaining cells burst outward, filled.",
    tier: 4, maxCharges: 2, durationMs: 0, unlockLevel: 4, levelsPerCharge: 1,
  },
  {
    id: 'half-fill', icon: '🌊', name: 'Floodgate',
    desc: "Half of your held colour's remaining cells fill at once.",
    tier: 5, maxCharges: 1, durationMs: 0, unlockLevel: 5, levelsPerCharge: 2,
  },
  {
    // The sixth rung. Its effect read-back is already live in game.js's tryPaint
    // (a wider tap slack while active), so only this catalogue row is needed.
    id: 'steady-hand', icon: '🤲', name: 'Steady Hand',
    desc: 'Widens your tap radius so near-misses still land.',
    tier: 6, maxCharges: 3, durationMs: 10000, unlockLevel: 6, levelsPerCharge: 1,
  },
];

const BY_ID = new Map(ABILITIES.map((a) => [a.id, a]));

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
