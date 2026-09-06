// Stickers — placeable decorations you stamp onto a picture: hearts, stars,
// shapes, numbers, letters, little animals, aliens. Bought in packs with coins
// (a limited supply, like the special paints); each placement spends one from the
// pack, and a picture's placed stickers persist on its progress entry
// (`progress[id].stickers`), mirrored live in `board.stickers`.
//
// Pure on purpose (no DOM): the catalogue, the pack economy, and
// `stickerTransform` — the per-frame wobble an animated sticker rides — all run in
// node tests. game.js renders the glyphs onto the canvas with `fillText` (system
// + emoji fonts, so no font-src is needed — the "no <text>" rule is about SVG),
// and `render.js` bakes the current frame into the saved PNG.

// A–Z, drawn as text glyphs rather than emoji (there is no clean coloured-emoji
// alphabet), so the Letters pack is flagged `text` and rendered with an outline.
const ALPHABET = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));

export const STICKER_PACKS = [
  {
    id: 'love',
    label: 'Hearts & Stars',
    mark: '💖',
    price: 30,
    grant: 30,
    blurb: 'A rainbow of hearts and a handful of stars.',
    glyphs: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🤍', '🖤', '💖', '💗', '⭐', '🌟', '✨', '💫'],
  },
  {
    id: 'shapes',
    label: 'Shapes',
    mark: '🔷',
    price: 25,
    grant: 30,
    blurb: 'Dots, diamonds and squares in every colour.',
    glyphs: ['🔴', '🟠', '🟡', '🟢', '🔵', '🟣', '⚫', '⚪', '🔺', '🔻', '🔶', '🔷', '🟥', '🟦', '🟩', '⬛', '⬜'],
  },
  {
    id: 'numbers',
    label: 'Numbers',
    mark: '🔢',
    price: 25,
    grant: 20,
    blurb: 'Keycap digits, zero through ten.',
    glyphs: ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟', '#️⃣'],
  },
  {
    id: 'letters',
    label: 'Letters',
    mark: '🔠',
    price: 30,
    grant: 30,
    text: true, // drawn as outlined text glyphs, not emoji
    blurb: 'The whole alphabet — spell out a name.',
    glyphs: ALPHABET,
  },
  {
    id: 'critters',
    label: 'Little Animals',
    mark: '🐝',
    price: 40,
    grant: 25,
    blurb: 'Bugs, beasts and a unicorn.',
    glyphs: ['🐛', '🐝', '🦋', '🐞', '🐢', '🐙', '🦄', '🐬', '🐧', '🐰', '🦊', '🐸', '🐱', '🐶', '🦉', '🐳', '🦕', '🐠'],
  },
  {
    id: 'space',
    label: 'Space & Aliens',
    mark: '👾',
    price: 45,
    grant: 25,
    blurb: 'Aliens, saucers, rockets and moons.',
    glyphs: ['👾', '👽', '🛸', '🚀', '🪐', '☄️', '🌙', '🌛', '🌜', '🌌', '🌠', '🌕', '🌖'],
  },
];

const BY_ID = new Map(STICKER_PACKS.map((p) => [p.id, p]));
// glyph → the FIRST pack that lists it (a couple of glyphs, like stars, could
// recur; the palette carries its own packId per chip, so this is only a fallback).
const GLYPH_PACK = new Map();
for (const p of STICKER_PACKS) for (const g of p.glyphs) if (!GLYPH_PACK.has(g)) GLYPH_PACK.set(g, p.id);

export const isPack = (id) => BY_ID.has(id);
export const packDef = (id) => BY_ID.get(id) ?? null;
export const packOf = (glyph) => GLYPH_PACK.get(glyph) ?? null;

/* --------------------------------------------------------------- inventory */

export function stickerCount(save, id) {
  return save?.stickers?.[id] ?? 0;
}

/** The packs the player owns at least one placement of, in catalogue order. */
export function ownedPacks(save) {
  return STICKER_PACKS.filter((p) => stickerCount(save, p.id) > 0);
}

export function grantStickers(save, id, n = 1) {
  if (!isPack(id) || !save) return;
  save.stickers ??= {};
  save.stickers[id] = (save.stickers[id] ?? 0) + n;
}

/** Spend one placement from a pack. @returns {boolean} whether it happened. */
export function spendSticker(save, id) {
  if (stickerCount(save, id) <= 0) return false;
  save.stickers[id] -= 1;
  return true;
}

/* ------------------------------------------------------------ look & motion */

// The visual style of a placed sticker: flat on the page, or a 3D "pop" (a drop
// shadow that lifts it off the surface). Drawn in render.js; declared here so the
// editor and the tests share one list.
export const STYLES = [
  { id: 'flat', label: 'Flat' },
  { id: '3d', label: '3D pop' },
];

// How a sticker moves. `none` is a still sticker; the rest ride the board's frame
// loop and the saved PNG bakes whatever frame it is on.
export const MOTIONS = [
  { id: 'none', label: 'Still' },
  { id: 'bob', label: 'Bob' },
  { id: 'spin', label: 'Spin' },
  { id: 'pulse', label: 'Pulse' },
  { id: 'flip', label: '3D flip' },
];

export const isStyle = (s) => STYLES.some((x) => x.id === s);
export const isMotion = (m) => MOTIONS.some((x) => x.id === m);

/**
 * The per-frame wobble a sticker rides at time `t` (ms), given a per-sticker
 * `phase` (0..1) so two of the same never pulse in lockstep. Returns offsets to
 * apply around the sticker's own centre:
 *   dx, dy  — translation in units of the sticker's size
 *   scale   — uniform scale multiplier
 *   scaleX  — extra horizontal scale (the 3D-flip squash; can go negative → mirror)
 *   rot     — rotation in radians, added to the sticker's own orientation
 * `none` returns the identity, so a still sticker costs nothing.
 */
export function stickerTransform(motion, t, phase = 0) {
  const ph = phase * Math.PI * 2;
  switch (motion) {
    case 'bob':
      return { dx: 0, dy: 0.14 * Math.sin(t * 0.004 + ph), scale: 1, scaleX: 1, rot: 0 };
    case 'spin':
      return { dx: 0, dy: 0, scale: 1, scaleX: 1, rot: t * 0.0022 + ph };
    case 'pulse':
      return { dx: 0, dy: 0, scale: 1 + 0.12 * Math.sin(t * 0.005 + ph), scaleX: 1, rot: 0 };
    case 'flip':
      // A card-flip: horizontal scale swings through zero, so it reads as turning
      // in 3D. Kept off exact zero so there is always a sliver to draw.
      return { dx: 0, dy: 0, scale: 1, scaleX: Math.cos(t * 0.0035 + ph) || 0.001, rot: 0 };
    default:
      return { dx: 0, dy: 0, scale: 1, scaleX: 1, rot: 0 };
  }
}
