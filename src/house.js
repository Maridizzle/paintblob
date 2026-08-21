// The avatar's house: the room she stands in, what's on the walls and floor,
// how it's lit, and which animal is keeping her company.
//
// Pure data plus SVG string builders, no DOM — the same shape wardrobe.js and
// avatar.js already have. game.js owns the panel; this owns what a room looks
// like.
//
// She never leaves. There is no walking, no needs, no timers — it is a
// diorama you decorate, and every piece of it is static.

import { AVATAR_FRAME, avatarInner, shade, light, seam } from './avatar.js';

/* --------------------------------------------------------------- the frame */

// Wide enough for furniture either side of her without shrinking her much.
const W = 260;
const H = 232;         // a little taller than the old 216 — extra floor in front
const FLOOR_Y = 150;   // where the back wall meets the floor
const STAND_Y = 200;   // the line every figure, prop and pet has its base on

// The room is now a shallow open-topped box seen head-on, Paper-Mario style: a
// back wall inset from the frame, two side walls raking forward to the corners,
// a sliver of ceiling and a floor that widens toward the viewer. SIDE is how
// far in the back wall sits (and so how much side wall shows); CEIL_Y is how
// far the back wall's top sits below the frame. Every prop keeps its old
// x-slot — they all fall comfortably inside the back wall / floor footprint —
// so the walls are new scenery around unchanged furniture, not a reflow.
const SIDE = 30;
const CEIL_Y = 12;

// Where everything lives, left to right. Keeping these apart is what stops the
// scene from stacking on itself: at full height she covered whatever was hung
// behind her, so the wall slot sits off to the right of where she stands.
const FURN_X = 48;    // centre of the furniture footprint, against the left wall
const AVATAR_CX = 116;
const WALL_CX = 192;  // centre of whatever is hung on the back wall
const PET_X = 152;
const ACC_X = 208;    // centre of the accent footprint, front right

// She is drawn at four-fifths height. At 1:1 she filled the frame from floor to
// ceiling and the room read as a doll's house built around her; this leaves
// enough wall above her head for the room to be the subject too.
const AVATAR_SCALE = 0.74;

// Derived from the avatar's own frame rather than hard-coded, so if the figure
// ever grows she stays standing on the floor instead of sinking through it.
const AVATAR_TRANSFORM =
  `translate(${AVATAR_CX},${STAND_Y}) scale(${AVATAR_SCALE}) ` +
  `translate(${-AVATAR_FRAME.centreX},${-AVATAR_FRAME.footY})`;

const n = (v) => Math.round(v * 100) / 100;

/** Fills a shape with a flat colour. Colour is passed in per shape rather than
 *  set on a parent group: a prop is several colours at once, and inheriting one
 *  fill down the whole group is exactly what stops a bed having a frame and a
 *  duvet. (The avatar can inherit because each of her groups IS one part.) */
const fill = (d, colour) => `<path d="${d}" fill="${colour}"/>`;
const box = (x, y, w, h, colour, r = 0) =>
  `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${r}" fill="${colour}"/>`;
const boxShade = (x, y, w, h, a = 0.12) =>
  `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="rgba(0,0,0,${a})"/>`;
const boxLight = (x, y, w, h, a = 0.12) =>
  `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="rgba(255,255,255,${a})"/>`;
const circle = (cx, cy, r, colour) =>
  `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="${colour}"/>`;
const ellipse = (cx, cy, rx, ry, colour) =>
  `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx)}" ry="${n(ry)}" fill="${colour}"/>`;
// Rooms are drawn out of angled planes now, so a straight-sided polygon is the
// workhorse the box is built from. Points come in as [x, y] pairs.
const poly = (pts, colour) =>
  `<polygon points="${pts.map(([x, y]) => `${n(x)},${n(y)}`).join(' ')}" fill="${colour}"/>`;
const polyShade = (pts, a = 0.12) => poly(pts, `rgba(0,0,0,${a})`);
const polyLight = (pts, a = 0.12) => poly(pts, `rgba(255,255,255,${a})`);

/** The soft dark ellipse under anything resting on the floor. Without it
 *  props look pasted on rather than standing in the room. */
const contact = (cx, w, a = 0.18) =>
  `<ellipse cx="${n(cx)}" cy="${STAND_Y + 1}" rx="${n(w)}" ry="3" fill="rgba(0,0,0,${a})"/>`;

/* --------------------------------------------------------------- the rooms */

/** A room's three surfaces are the same three for every room, so the parts
 *  list is derived from the colours rather than written out four times. */
const withRoomParts = (r) => ({
  ...r,
  parts: [
    { key: 'wall', name: 'Wall', default: r.wall },
    { key: 'floor', name: 'Floor', default: r.floor },
    { key: 'skirting', name: 'Skirting', default: r.skirting },
  ],
});

export const ROOMS = [
  {
    id: 'bedroom', name: 'Bedroom', unlockLevel: 1,
    wall: '#7a8ba4', floor: '#9a7554', skirting: '#63718a',
  },
  {
    id: 'studio', name: 'Art Studio', unlockLevel: 1,
    wall: '#b9a98f', floor: '#8d8577', skirting: '#9c8d75',
  },
  {
    id: 'kitchen', name: 'Kitchen', unlockLevel: 4,
    wall: '#8fae9c', floor: '#c9c2b4', skirting: '#76917f', tiled: true,
  },
  {
    id: 'library', name: 'Library', unlockLevel: 7,
    wall: '#7c6552', floor: '#6d4f3a', skirting: '#5f4c3d',
  },
  {
    id: 'livingroom', name: 'Living Room', unlockLevel: 5,
    wall: '#c39a8f', floor: '#bd925f', skirting: '#a97f72',
  },
].map(withRoomParts);

const ROOM_BY_ID = new Map(ROOMS.map((r) => [r.id, r]));

/* ---------------------------------------------------------------- colours */

// Every prop, pet and room surface declares the colours a player may set on
// it: `parts`, a list of { key, name, default }. A part is a colour worth
// choosing — a bed's frame, its duvet — not every literal in the drawing. The
// 2px keyholes, drawer shadows and the pale stripe down a book's page block
// stay as they are; a swatch for those would be a swatch for nothing.
//
// None of this touches the shading. shade/light/seam are translucent black and
// white washes rather than computed darker shades (see the note at the top of
// avatar.js), so a prop reads correctly in ANY colour the player picks with no
// colour maths and no per-part rework. That is the whole reason recolouring
// every prop is a mechanical change rather than an art job.
//
// Overrides are stored sparsely, keyed `<ownerId>.<partKey>` — only what was
// actually changed. A player who never touches the bed keeps following its
// default, so a later change to that default still reaches them.

export const colourKey = (ownerId, partKey) => `${ownerId}.${partKey}`;
export const roomColourId = (roomId) => `room:${roomId}`;
export const petColourId = (petId) => `pet:${petId}`;

/** Defaults with any saved overrides laid on top, as a plain {key: hex} map. */
export function resolveColours(ownerId, parts, overrides) {
  const out = {};
  for (const part of parts ?? []) {
    out[part.key] = overrides?.[colourKey(ownerId, part.key)] ?? part.default;
  }
  return out;
}

/* --------------------------------------------------------------- the shell */

// The corners of the open-topped box, named once so the walls, skirting and
// floor all agree on where they meet.
const BX0 = SIDE;          // back wall, left edge
const BX1 = W - SIDE;      // back wall, right edge
// How far into the floor a point at depth y sits, 0 at the back wall to 1 at
// the very front — used to slide the side-wall skirting down its rake.
const floorEdgeX = (y, side) => {
  const t = (y - FLOOR_Y) / (H - FLOOR_Y);
  return side === 'left' ? BX0 * (1 - t) : W - SIDE * (1 - t);
};

/** The room as a shallow box: ceiling sliver, back wall, two raking side walls,
 *  skirting round the base and a floor that widens toward the viewer. Everything
 *  else stands on top. */
function roomShell(room, c) {
  const out = [
    // --- ceiling: a thin band, kept in shadow so the eye reads it as overhead.
    poly([[0, 0], [W, 0], [BX1, CEIL_Y], [BX0, CEIL_Y]], c.wall),
    polyShade([[0, 0], [W, 0], [BX1, CEIL_Y], [BX0, CEIL_Y]], 0.2),

    // --- left side wall: catches the light coming from the upper left.
    poly([[0, 0], [BX0, CEIL_Y], [BX0, FLOOR_Y], [0, H]], c.wall),
    poly([[0, 0], [BX0, CEIL_Y], [BX0, FLOOR_Y], [0, H]], 'url(#sideFade)'),
    polyLight([[0, 0], [BX0, CEIL_Y], [BX0, FLOOR_Y], [0, H]], 0.05),

    // --- right side wall: turned away from the light, so a touch darker.
    poly([[W, 0], [BX1, CEIL_Y], [BX1, FLOOR_Y], [W, H]], c.wall),
    poly([[W, 0], [BX1, CEIL_Y], [BX1, FLOOR_Y], [W, H]], 'url(#sideFade)'),
    polyShade([[W, 0], [BX1, CEIL_Y], [BX1, FLOOR_Y], [W, H]], 0.08),

    // --- back wall, with the same top-light fade the room has always had.
    box(BX0, CEIL_Y, BX1 - BX0, FLOOR_Y - CEIL_Y, c.wall),
    `<rect x="${BX0}" y="${CEIL_Y}" width="${BX1 - BX0}" height="${FLOOR_Y - CEIL_Y}" fill="url(#wallFade)"/>`,

    // --- floor, its boards fanning to the viewer, darkened into the back crease.
    poly([[BX0, FLOOR_Y], [BX1, FLOOR_Y], [W, H], [0, H]], c.floor),
  ];

  // Floor markings, clipped to the floor so they can be drawn as simple lines.
  const marks = [];
  if (room.tiled) {
    // Kitchen: a grid receding to the back wall.
    for (let i = 0; i <= 8; i++) {
      const backX = BX0 + ((BX1 - BX0) * i) / 8;
      const frontX = (W * i) / 8;
      marks.push(seam(`M${n(backX)},${FLOOR_Y} L${n(frontX)},${H}`, 1, 0.1));
    }
    for (const y of [162, 178, 198, 222]) {
      marks.push(seam(`M${n(floorEdgeX(y, 'left'))},${y} L${n(floorEdgeX(y, 'right'))},${y}`, 1, 0.09));
    }
  } else {
    // Floorboards running away from the viewer, fanning out as they near us.
    for (let i = 0; i <= 7; i++) {
      const backX = BX0 + ((BX1 - BX0) * i) / 7;
      const frontX = (W * i) / 7;
      marks.push(seam(`M${n(backX)},${FLOOR_Y} L${n(frontX)},${H}`, 1.1, 0.13));
    }
  }
  out.push(`<g clip-path="url(#floorClip)">${marks.join('')}` +
    `<polygon points="${BX0},${FLOOR_Y} ${BX1},${FLOOR_Y} ${W},${H} 0,${H}" fill="url(#floorDepth)"/></g>`);

  // Skirting board round all three walls, tying them to the floor.
  out.push(
    box(BX0, FLOOR_Y - 6, BX1 - BX0, 6, c.skirting),
    poly([[0, H - 6], [BX0, FLOOR_Y - 6], [BX0, FLOOR_Y], [0, H]], c.skirting),
    poly([[W, H - 6], [BX1, FLOOR_Y - 6], [BX1, FLOOR_Y], [W, H]], c.skirting),
    // A soft occlusion line in the crease where each wall meets the floor.
    boxShade(BX0, FLOOR_Y, BX1 - BX0, 4, 0.16),
    // Corner seams where the side walls fold away from the back wall.
    seam(`M${BX0},${CEIL_Y} L${BX0},${FLOOR_Y}`, 1.1, 0.12),
    seam(`M${BX1},${CEIL_Y} L${BX1},${FLOOR_Y}`, 1.1, 0.12),
  );

  return out.join('');
}

/* --------------------------------------------------------------- lighting */

// Each mood is a wash laid over the finished scene. Because it is an overlay
// rather than a recolour, it works over every room and prop without any of
// them knowing about it.
export const LIGHTING = [
  { id: 'daylight', name: 'Daylight', price: 0, source: 'starter' },
  { id: 'golden', name: 'Golden Hour', price: 260, source: 'store' },
  { id: 'moonlight', name: 'Moonlight', price: 320, source: 'store' },
  { id: 'candlelit', name: 'Candlelit', price: 420, source: 'store' },
  { id: 'sunset', name: 'Sunset', price: 300, source: 'store' },
  { id: 'overcast', name: 'Overcast', price: 220, source: 'store' },
  { id: 'aurora', name: 'Aurora', price: 480, source: 'store' },
  { id: 'rosy', name: 'Rosy Glow', price: 360, source: 'store' },
];

function lightingOverlay(id) {
  if (id === 'golden') {
    return `<rect x="0" y="0" width="${W}" height="${H}" fill="rgba(255,168,74,0.20)"/>` +
      // A slanted shaft, as if through a window on the left.
      fill(`M0,0 L96,0 L52,${H} L0,${H} Z`, 'rgba(255,214,150,0.16)');
  }
  if (id === 'moonlight') {
    return `<rect x="0" y="0" width="${W}" height="${H}" fill="rgba(30,48,92,0.42)"/>` +
      fill(`M0,0 L84,0 L44,${H} L0,${H} Z`, 'rgba(150,190,255,0.12)');
  }
  if (id === 'candlelit') {
    // Warm at the centre, falling away hard at the edges.
    return `<rect x="0" y="0" width="${W}" height="${H}" fill="rgba(60,32,10,0.44)"/>` +
      `<rect x="0" y="0" width="${W}" height="${H}" fill="url(#candleGlow)"/>`;
  }
  if (id === 'sunset') {
    // A hot band low on the sky cooling to magenta up top.
    return `<rect x="0" y="0" width="${W}" height="${H}" fill="url(#sunsetFade)"/>` +
      fill(`M0,0 L110,0 L58,${H} L0,${H} Z`, 'rgba(255,196,120,0.16)');
  }
  if (id === 'overcast') {
    // Flat, cool and low-contrast, like a grey afternoon through the window.
    return `<rect x="0" y="0" width="${W}" height="${H}" fill="rgba(120,132,150,0.30)"/>` +
      `<rect x="0" y="0" width="${W}" height="${FLOOR_Y}" fill="rgba(210,220,235,0.05)"/>`;
  }
  if (id === 'aurora') {
    // Deep night with a green-to-violet shimmer washing down the back wall.
    return `<rect x="0" y="0" width="${W}" height="${H}" fill="rgba(16,26,40,0.46)"/>` +
      `<rect x="0" y="0" width="${W}" height="${H}" fill="url(#auroraGlow)"/>`;
  }
  if (id === 'rosy') {
    // A soft, flattering pink — warm without the orange of golden hour.
    return `<rect x="0" y="0" width="${W}" height="${H}" fill="rgba(255,140,168,0.18)"/>` +
      fill(`M0,0 L100,0 L54,${H} L0,${H} Z`, 'rgba(255,226,234,0.14)');
  }
  return ''; // daylight adds nothing
}

/* -------------------------------------------------------------------- pets */

export const PETS = [
  {
    id: 'cat', name: 'Cat', price: 0, source: 'starter',
    parts: [
      { key: 'body', name: 'Fur', default: '#4a4a52' },
      { key: 'eyes', name: 'Eyes', default: '#f5e06a' },
    ],
  },
  {
    id: 'dog', name: 'Dog', price: 340, source: 'store',
    parts: [
      { key: 'body', name: 'Coat', default: '#b0794a' },
      { key: 'ears', name: 'Ears', default: '#8d5c33' },
      { key: 'muzzle', name: 'Muzzle', default: '#e0c19c' },
      { key: 'eyes', name: 'Eyes & nose', default: '#2a2118' },
    ],
  },
  {
    id: 'rabbit', name: 'Rabbit', price: 300, source: 'store',
    parts: [
      { key: 'body', name: 'Fur', default: '#d8d2c8' },
      { key: 'eyes', name: 'Eyes', default: '#3a2f2a' },
    ],
  },
  {
    id: 'bird', name: 'Bird', price: 380, source: 'store',
    parts: [
      { key: 'body', name: 'Feathers', default: '#5fa8d8' },
      { key: 'wing', name: 'Wing', default: '#3f8cbd' },
      { key: 'beak', name: 'Beak & feet', default: '#f0a83c' },
      { key: 'perch', name: 'Perch', default: '#8a7256' },
    ],
  },
  {
    id: 'fox', name: 'Fox', price: 420, source: 'store',
    parts: [
      { key: 'body', name: 'Coat', default: '#d1762f' },
      { key: 'belly', name: 'Face & chest', default: '#f4ecdd' },
      { key: 'eyes', name: 'Eyes & nose', default: '#2c2620' },
    ],
  },
  {
    id: 'hamster', name: 'Hamster', price: 300, source: 'store',
    parts: [
      { key: 'body', name: 'Fur', default: '#e0b268' },
      { key: 'belly', name: 'Belly & cheeks', default: '#f6ecd6' },
      { key: 'eyes', name: 'Eyes', default: '#2c2620' },
    ],
  },
  {
    id: 'frog', name: 'Frog', price: 320, source: 'store',
    parts: [
      { key: 'body', name: 'Skin', default: '#6fae4e' },
      { key: 'belly', name: 'Belly', default: '#d8e6a4' },
      { key: 'eyes', name: 'Eyes', default: '#2c2620' },
    ],
  },
  {
    id: 'tortoise', name: 'Tortoise', price: 440, source: 'store',
    parts: [
      { key: 'shell', name: 'Shell', default: '#8a6b3e' },
      { key: 'body', name: 'Skin', default: '#7fa25a' },
      { key: 'eyes', name: 'Eyes', default: '#2c2620' },
    ],
  },
];

/* ------------------------------------------------------------- pet wellbeing */

// The pet has four needs you keep topped up. Deliberately NOT health — nothing
// here punishes you. A need only ever droops toward zero and a bit of care
// fills it back up; a neglected pet just looks a little wistful and perks up
// the moment you tend to it. Every meter reads the same way: full is happy.
//
// `label` is the friendly bar name (full = good), `key` is stored under
// house.petStats, `action`/`did` label the care button and its toast, `perDay`
// is how many points the meter sheds over a full day away, and `care` is how
// much one tap gives back. `bonusLove` lets tending any need warm the pet to
// you a little, so attention itself is affection.
export const PET_NEEDS = [
  { key: 'hunger', label: 'Fed', icon: '🍖', action: 'Feed', did: 'Fed', perDay: 42, care: 36, mood: 'hungry' },
  { key: 'cleanliness', label: 'Clean', icon: '🧼', action: 'Groom', did: 'Groomed', perDay: 24, care: 40, mood: 'grubby' },
  { key: 'boredom', label: 'Fun', icon: '🧶', action: 'Play', did: 'Played with', perDay: 34, care: 34, mood: 'bored' },
  { key: 'love', label: 'Loved', icon: '❤️', action: 'Cuddle', did: 'Cuddled', perDay: 28, care: 32, mood: 'lonely' },
];

const PET_NEED_BY_KEY = new Map(PET_NEEDS.map((need) => [need.key, need]));
const clamp01to100 = (v) => Math.max(0, Math.min(100, v));
const DAY_MS = 86400000;

/** A fresh, contented-but-not-perfect pet, so there is always a little to do. */
export function defaultPetStats(now = Date.now()) {
  return { hunger: 72, cleanliness: 78, boredom: 64, love: 58, lastTick: now };
}

/** Age a pet's needs by the real time elapsed since they were last touched.
 *  Pure and idempotent-ish: it advances lastTick, so calling it twice in a row
 *  decays almost nothing the second time. Mutates and returns the same object. */
export function applyPetDecay(petStats, now = Date.now()) {
  if (!petStats) return petStats;
  const last = petStats.lastTick ?? now;
  const days = (now - last) / DAY_MS;
  if (days > 0) {
    for (const need of PET_NEEDS) {
      petStats[need.key] = clamp01to100((petStats[need.key] ?? 60) - need.perDay * days);
    }
  }
  petStats.lastTick = now;
  return petStats;
}

/** Give one need a care top-up, and let the attention warm the pet to you.
 *  Returns the new value of the tended need so the caller can react. */
export function carePet(petStats, key, now = Date.now()) {
  const need = PET_NEED_BY_KEY.get(key);
  if (!need || !petStats) return null;
  petStats[key] = clamp01to100((petStats[key] ?? 0) + need.care);
  // Tending anything but love still earns a little love — being paid attention
  // to is its own affection. The love action itself is already the big hit.
  if (key !== 'love') petStats.love = clamp01to100((petStats.love ?? 0) + 8);
  petStats.lastTick = now;
  return petStats[key];
}

/** A one-word read on how the pet is doing, from the average of its needs, plus
 *  the neediest need so the UI can nudge you toward it. Never grim. */
export function petMood(petStats) {
  const vals = PET_NEEDS.map((need) => petStats?.[need.key] ?? 60);
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  const min = Math.min(...vals);
  const neediest = PET_NEEDS[vals.indexOf(min)];
  let label = 'content';
  if (avg < 40) label = 'wistful';
  else if (avg < 65) label = 'okay';
  else if (avg >= 85) label = 'blissful';
  return { avg, min, neediest, label };
}

/** A little thought bubble over the pet: the neediest need's icon when it wants
 *  something, a heart when it is thoroughly loved, nothing when it is just fine.
 *  Keeps the wellbeing legible in the scene itself, not only in the menu. */
function petEmote(petStats) {
  if (!petStats) return '';
  const mood = petMood(petStats);
  let emoji = '';
  if (mood.min < 35) emoji = mood.neediest.icon;
  else if ((petStats.love ?? 0) >= 88 && mood.avg >= 80) emoji = '❤️';
  if (!emoji) return '';
  const cx = PET_X + 20;
  const cy = STAND_Y - 48;
  return '<g pointer-events="none">' +
    ellipse(cx, cy, 12, 11, 'rgba(255,255,255,0.94)') +
    circle(cx - 9, cy + 10, 2.4, 'rgba(255,255,255,0.9)') +
    circle(cx - 13, cy + 15, 1.5, 'rgba(255,255,255,0.82)') +
    `<text x="${n(cx)}" y="${n(cy + 5)}" font-size="14" text-anchor="middle">${emoji}</text>` +
    '</g>';
}

// All four sit at PET_X on the floor line, at roughly the same visual weight,
// so swapping one for another doesn't change the balance of the scene.

function petMarkup(id, c) {
  if (id === 'cat') {
    const body = c.body;
    return contact(PET_X, 13) +
      // Tail curling round the front of the body — the clearest cat signal
      // at this size after the ears.
      `<path d="M${PET_X + 11},${STAND_Y - 2} q10,2 9,-8 q-1,-6 -6,-5" fill="none" stroke="${body}" stroke-width="4" stroke-linecap="round"/>` +
      fill(`M${PET_X - 10},${STAND_Y} q-1,-16 10,-16 q11,0 10,16 Z`, body) +
      circle(PET_X, STAND_Y - 22, 9, body) +
      fill(`M${PET_X - 8},${STAND_Y - 27} l1,-9 l7,5 Z`, body) +
      fill(`M${PET_X + 8},${STAND_Y - 27} l-1,-9 l-7,5 Z`, body) +
      fill(`M${PET_X - 6.5},${STAND_Y - 28.5} l0.6,-5 l4,3 Z`, 'rgba(255,150,160,0.75)') +
      fill(`M${PET_X + 6.5},${STAND_Y - 28.5} l-0.6,-5 l-4,3 Z`, 'rgba(255,150,160,0.75)') +
      ellipse(PET_X - 3.6, STAND_Y - 23, 1.5, 1.9, c.eyes) +
      ellipse(PET_X + 3.6, STAND_Y - 23, 1.5, 1.9, c.eyes) +
      circle(PET_X, STAND_Y - 19.5, 1.2, 'rgba(255,150,160,0.9)') +
      light(`M${PET_X - 7},${STAND_Y - 26} q7,-4 14,0 q-7,-3 -14,0 Z`, 0.1);
  }

  if (id === 'dog') {
    const body = c.body;
    return contact(PET_X, 15) +
      fill(`M${PET_X - 13},${STAND_Y} q-2,-17 13,-17 q15,0 13,17 Z`, body) +
      // Ears hang beside the muzzle rather than standing up, so it cannot be
      // read as a second cat.
      circle(PET_X, STAND_Y - 24, 9.5, body) +
      fill(`M${PET_X - 9},${STAND_Y - 28} q-6,2 -5,12 q1,5 5,4 Z`, c.ears) +
      fill(`M${PET_X + 9},${STAND_Y - 28} q6,2 5,12 q-1,5 -5,4 Z`, c.ears) +
      ellipse(PET_X, STAND_Y - 18.5, 5, 4, c.muzzle) +
      circle(PET_X, STAND_Y - 20.5, 2, c.eyes) +
      circle(PET_X - 3.6, STAND_Y - 26, 1.5, c.eyes) +
      circle(PET_X + 3.6, STAND_Y - 26, 1.5, c.eyes) +
      `<path d="M${PET_X + 12},${STAND_Y - 6} q9,-3 7,-11" fill="none" stroke="${body}" stroke-width="4" stroke-linecap="round"/>` +
      light(`M${PET_X - 6},${STAND_Y - 12} q6,-3 12,0 q-6,10 -12,0 Z`, 0.08);
  }

  if (id === 'rabbit') {
    const body = c.body;
    return contact(PET_X, 12) +
      fill(`M${PET_X - 10},${STAND_Y} q-2,-15 11,-15 q13,0 11,15 Z`, body) +
      circle(PET_X, STAND_Y - 20, 8, body) +
      // The ears are the whole identity — long, upright, with pink inners.
      ellipse(PET_X - 4, STAND_Y - 34, 3.2, 11, body) +
      ellipse(PET_X + 4.5, STAND_Y - 35, 3.2, 11, body) +
      ellipse(PET_X - 4, STAND_Y - 34, 1.5, 8, 'rgba(240,160,170,0.8)') +
      ellipse(PET_X + 4.5, STAND_Y - 35, 1.5, 8, 'rgba(240,160,170,0.8)') +
      circle(PET_X - 3, STAND_Y - 21, 1.4, c.eyes) +
      circle(PET_X + 3, STAND_Y - 21, 1.4, c.eyes) +
      circle(PET_X, STAND_Y - 17.5, 1.3, 'rgba(230,140,150,0.9)') +
      circle(PET_X + 11, STAND_Y - 4, 4, 'rgba(255,255,255,0.85)') +
      shade(`M${PET_X - 10},${STAND_Y} q-1,-8 4,-12 q-6,5 -4,12 Z`, 0.08);
  }

  if (id === 'bird') {
    // On a perch, so it reads as a kept bird rather than one that wandered in.
    const stand = c.perch;
    const body = c.body;
    const py = STAND_Y - 44;
    return contact(PET_X, 11) +
      ellipse(PET_X, STAND_Y - 2, 11, 3.5, stand) +
      box(PET_X - 2, py, 4, STAND_Y - 4 - py, stand) +
      box(PET_X - 12, py - 2, 24, 3, stand, 1.5) +
      ellipse(PET_X + 1, py - 12, 8, 10, body) +
      circle(PET_X + 1, py - 22, 6, body) +
      fill(`M${PET_X + 6},${py - 22} l7,3 l-7,3 Z`, c.beak) +
      circle(PET_X + 3, py - 23.5, 1.5, '#26313a') +
      fill(`M${PET_X - 3},${py - 14} q-7,6 -2,12 q4,-6 4,-11 Z`, c.wing) +
      `<path d="M${PET_X - 1},${py - 2} l-2,7 M${PET_X + 3},${py - 2} l2,7" stroke="${c.beak}" stroke-width="2" stroke-linecap="round" fill="none"/>` +
      light(`M${PET_X - 3},${py - 26} q6,-4 11,2 q-6,-2 -11,-2 Z`, 0.16);
  }

  if (id === 'fox') {
    const body = c.body;
    const belly = c.belly;
    return contact(PET_X, 15) +
      // Bushy tail curling round the front, tipped white.
      `<path d="M${PET_X + 9},${STAND_Y} q17,1 15,-15" fill="none" stroke="${body}" stroke-width="9" stroke-linecap="round"/>` +
      circle(PET_X + 22, STAND_Y - 15, 5, belly) +
      fill(`M${PET_X - 11},${STAND_Y} q-2,-17 12,-17 q14,0 12,17 Z`, body) +
      // White chest.
      fill(`M${PET_X - 4},${STAND_Y} q-3,-12 4,-14 q7,2 4,14 Z`, belly) +
      circle(PET_X, STAND_Y - 23, 9, body) +
      // Tall pointed ears with dark inners.
      fill(`M${PET_X - 8},${STAND_Y - 28} l-2,-12 l9,7 Z`, body) +
      fill(`M${PET_X + 8},${STAND_Y - 28} l2,-12 l-9,7 Z`, body) +
      fill(`M${PET_X - 7},${STAND_Y - 29} l-0.6,-6 l4,3 Z`, 'rgba(40,30,26,0.5)') +
      fill(`M${PET_X + 7},${STAND_Y - 29} l0.6,-6 l-4,3 Z`, 'rgba(40,30,26,0.5)') +
      // White muzzle mask.
      fill(`M${PET_X},${STAND_Y - 14.5} q-6.5,-1 -6.5,-8 q6.5,-4 6.5,-4 q6.5,0 6.5,4 q0,7 -6.5,8 Z`, belly) +
      ellipse(PET_X - 3.7, STAND_Y - 24, 1.5, 1.9, c.eyes) +
      ellipse(PET_X + 3.7, STAND_Y - 24, 1.5, 1.9, c.eyes) +
      fill(`M${PET_X - 1.6},${STAND_Y - 17} l3.2,0 l-1.6,2.6 Z`, c.eyes) +
      light(`M${PET_X - 7},${STAND_Y - 26} q7,-4 14,0 q-7,-3 -14,0 Z`, 0.1);
  }

  if (id === 'hamster') {
    const body = c.body;
    const belly = c.belly;
    return contact(PET_X, 12) +
      // Almost all head — a round little loaf with tiny ears and fat cheeks.
      fill(`M${PET_X - 12},${STAND_Y} q-2,-20 12,-20 q14,0 12,20 Z`, body) +
      circle(PET_X - 9, STAND_Y - 18, 3.5, body) +
      circle(PET_X + 9, STAND_Y - 18, 3.5, body) +
      // Cream belly and cheek patches.
      ellipse(PET_X, STAND_Y - 5, 8, 8, belly) +
      circle(PET_X - 6, STAND_Y - 11, 3.5, belly) +
      circle(PET_X + 6, STAND_Y - 11, 3.5, belly) +
      ellipse(PET_X - 3.2, STAND_Y - 14, 1.5, 1.9, c.eyes) +
      ellipse(PET_X + 3.2, STAND_Y - 14, 1.5, 1.9, c.eyes) +
      circle(PET_X, STAND_Y - 10.5, 1.1, 'rgba(210,140,150,0.9)') +
      // Little front paws.
      ellipse(PET_X - 3, STAND_Y - 1, 2, 1.6, belly) +
      ellipse(PET_X + 3, STAND_Y - 1, 2, 1.6, belly) +
      light(`M${PET_X - 7},${STAND_Y - 20} q7,-5 14,0 q-7,-3 -14,0 Z`, 0.12);
  }

  if (id === 'frog') {
    const body = c.body;
    const belly = c.belly;
    return contact(PET_X, 15) +
      // Splayed back feet either side.
      ellipse(PET_X - 12, STAND_Y - 1, 5, 3, body) +
      ellipse(PET_X + 12, STAND_Y - 1, 5, 3, body) +
      // Wide low body.
      fill(`M${PET_X - 15},${STAND_Y} q-1,-15 15,-15 q16,0 15,15 Z`, body) +
      ellipse(PET_X, STAND_Y - 3, 9, 6, belly) +
      // Eyes bulging off the top of the head.
      circle(PET_X - 7, STAND_Y - 17, 5, body) +
      circle(PET_X + 7, STAND_Y - 17, 5, body) +
      circle(PET_X - 7, STAND_Y - 18, 2.4, belly) +
      circle(PET_X + 7, STAND_Y - 18, 2.4, belly) +
      circle(PET_X - 7, STAND_Y - 18, 1.4, c.eyes) +
      circle(PET_X + 7, STAND_Y - 18, 1.4, c.eyes) +
      // A wide friendly mouth.
      `<path d="M${PET_X - 8},${STAND_Y - 8} q8,5 16,0" fill="none" stroke="${c.eyes}" stroke-width="1.4" stroke-linecap="round"/>` +
      light(`M${PET_X - 9},${STAND_Y - 12} q9,-4 18,0 q-9,-2 -18,0 Z`, 0.1);
  }

  if (id === 'tortoise') {
    const shell = c.shell;
    const body = c.body;
    return contact(PET_X, 16) +
      // Stubby legs under the shell.
      ellipse(PET_X - 12, STAND_Y - 1, 4, 3, body) +
      ellipse(PET_X + 12, STAND_Y - 1, 4, 3, body) +
      // Head poking out to the right on a little neck.
      box(PET_X + 12, STAND_Y - 12, 7, 6, body, 2) +
      circle(PET_X + 20, STAND_Y - 13, 5, body) +
      circle(PET_X + 21, STAND_Y - 14, 1.3, c.eyes) +
      // Domed shell.
      fill(`M${PET_X - 16},${STAND_Y - 2} q0,-20 16,-20 q16,0 16,20 Z`, shell) +
      // Shell plates, drawn as seams so the shell colour still shows through.
      seam(`M${PET_X},${STAND_Y - 22} L${PET_X},${STAND_Y - 2}`, 1.2, 0.16) +
      seam(`M${PET_X - 9},${STAND_Y - 18} L${PET_X - 12},${STAND_Y - 2}`, 1.2, 0.16) +
      seam(`M${PET_X + 9},${STAND_Y - 18} L${PET_X + 12},${STAND_Y - 2}`, 1.2, 0.16) +
      seam(`M${PET_X - 15},${STAND_Y - 6} q15,-6 30,0`, 1.2, 0.14) +
      light(`M${PET_X - 10},${STAND_Y - 18} q10,-6 20,0 q-10,-3 -20,0 Z`, 0.12);
  }
  return '';
}

/* ------------------------------------------------------------------- props */

// Three slots, deliberately positional — it is what makes the scene layer
// believably and what keeps each room's set feeling like its own place:
//
//   wall       behind her, hung on the back wall
//   furniture  a large floor-standing piece to one side
//   accent     a small thing in front, nearest the viewer
//
// Furniture always stands to her left (viewer's left) and accents to her
// right-front, so no two slots ever fight for the same space.
export const PROP_SLOTS = ['wall', 'furniture', 'accent'];

export const SLOT_LABEL = { wall: 'Wall', furniture: 'Furniture', accent: 'Accent' };

/* -- bedroom ------------------------------------------------------------- */

function bedWindow(c) {
  const frame = c.frame;
  const cx = WALL_CX;
  return box(cx - 34, 26, 68, 62, frame, 3) +
    box(cx - 30, 30, 60, 54, c.sky) +
    // Sky through the glass: a horizon and two clouds, so it is unmistakably
    // outside rather than a blue panel.
    box(cx - 30, 66, 60, 18, c.land) +
    ellipse(cx - 12, 46, 10, 5, 'rgba(255,255,255,0.85)') +
    ellipse(cx + 12, 55, 8, 4, 'rgba(255,255,255,0.7)') +
    box(cx - 1.5, 30, 3, 54, frame) +
    box(cx - 30, 55, 60, 3, frame) +
    boxShade(cx - 30, 30, 60, 5, 0.12) +
    // Curtains gathered at each edge.
    fill(`M${cx - 44},20 q10,32 4,70 l-12,0 l0,-70 Z`, c.curtains) +
    fill(`M${cx + 44},20 q-10,32 -4,70 l12,0 l0,-70 Z`, c.curtains) +
    box(cx - 48, 18, 96, 5, c.rail, 2.5) +
    seam(`M${cx - 38},26 q6,30 2,60`, 1.2, 0.14) +
    seam(`M${cx + 38},26 q-6,30 -2,60`, 1.2, 0.14);
}

function bedBed(c) {
  const frame = c.frame;
  const y = STAND_Y;
  return contact(FURN_X, 44, 0.2) +
    // Headboard, then the mattress block, then the duvet and pillow on top.
    box(FURN_X - 44, y - 74, 12, 74, frame, 3) +
    box(FURN_X + 34, y - 40, 10, 40, frame, 3) +
    box(FURN_X - 36, y - 34, 74, 26, c.mattress, 3) +
    box(FURN_X - 36, y - 8, 74, 8, frame) +
    fill(`M${FURN_X - 36},${y - 28} q40,-8 74,0 l0,20 l-74,0 Z`, c.duvet) +
    box(FURN_X - 30, y - 44, 30, 16, c.pillow, 5) +
    boxShade(FURN_X - 36, y - 12, 74, 4, 0.14) +
    seam(`M${FURN_X - 20},${y - 26} q0,10 0,16`, 1.1, 0.1) +
    seam(`M${FURN_X + 4},${y - 27} q0,10 0,17`, 1.1, 0.1) +
    boxLight(FURN_X - 30, y - 44, 30, 5, 0.18);
}

function bedRug(c) {
  return ellipse(ACC_X, STAND_Y + 4, 34, 10, c.outer) +
    ellipse(ACC_X, STAND_Y + 4, 23, 6.5, c.middle) +
    ellipse(ACC_X, STAND_Y + 4, 11, 3.2, c.inner) +
    `<ellipse cx="${ACC_X}" cy="${STAND_Y + 4}" rx="34" ry="10" fill="none" stroke="rgba(0,0,0,0.14)" stroke-width="1"/>`;
}

/* -- studio -------------------------------------------------------------- */

function studioSketches(c) {
  // Pinned drawings. Blank sheets read as paper but not as *sketches*, so each
  // one carries a recognisable subject drawn in pencil grey.
  const pencil = (d, w = 1.2, a = 0.42) =>
    `<path d="${d}" fill="none" stroke="rgba(60,52,44,${a})" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
  const L = WALL_CX - 44;
  const sheets = [
    { x: L, y: 22, w: 34, h: 42, rot: -3, bg: c.paper, art: 'face' },
    { x: L + 40, y: 28, w: 30, h: 36, rot: 4, bg: c.paperAlt, art: 'hills' },
    { x: L + 8, y: 72, w: 30, h: 34, rot: 2, bg: c.paper, art: 'hatch' },
    { x: L + 44, y: 70, w: 34, h: 38, rot: -4, bg: c.paperAlt, art: 'apple' },
  ];
  const drawing = (s0) => {
    const cx = s0.x + s0.w / 2;
    const cy = s0.y + s0.h / 2;
    if (s0.art === 'face') {
      return pencil(`M${cx},${cy - 11} q9,0 9,10 q0,11 -9,11 q-9,0 -9,-11 q0,-10 9,-10 Z`) +
        pencil(`M${cx - 4},${cy - 1} l0,2 M${cx + 4},${cy - 1} l0,2`, 1.4) +
        pencil(`M${cx - 4},${cy + 7} q4,3 8,0`) +
        pencil(`M${cx - 9},${cy - 4} q9,-10 18,0`, 1.1, 0.3);
    }
    if (s0.art === 'hills') {
      return pencil(`M${cx - 12},${cy + 7} q7,-13 13,-3 q5,-9 11,3 Z`) +
        pencil(`M${cx + 4},${cy - 8} a4,4 0 1 0 0.1,0`, 1.1, 0.32) +
        pencil(`M${cx - 12},${cy + 7} l24,0`, 1.1);
    }
    if (s0.art === 'hatch') {
      return [0, 1, 2, 3, 4].map((i) =>
        pencil(`M${cx - 10 + i * 2.2},${cy + 8} l7,-16`, 1.1, 0.22 + i * 0.05)).join('') +
        pencil(`M${cx - 11},${cy + 9} l22,0`, 1.1, 0.34);
    }
    return pencil(`M${cx},${cy - 5} q9,0 8,8 q-1,8 -8,8 q-7,0 -8,-8 q-1,-8 8,-8 Z`) +
      pencil(`M${cx},${cy - 5} q1,-5 -3,-7`, 1.2) +
      pencil(`M${cx},${cy - 7} q5,-3 7,1`, 1.1, 0.3);
  };
  return sheets.map((s0) => {
    const cx = s0.x + s0.w / 2;
    return `<g transform="rotate(${s0.rot} ${cx} ${s0.y + s0.h / 2})">` +
      boxShade(s0.x + 1.5, s0.y + 2, s0.w, s0.h, 0.16) +
      box(s0.x, s0.y, s0.w, s0.h, s0.bg) + drawing(s0) +
      circle(cx, s0.y + 4, 2.2, c.pins) +
      circle(cx - 0.6, s0.y + 3.4, 0.8, 'rgba(255,255,255,0.5)') +
      '</g>';
  }).join('');
}

function studioEasel(c) {
  const wood = c.wood;
  const y = STAND_Y;
  return contact(FURN_X, 34, 0.18) +
    // Two front legs splayed and one back leg, then the canvas resting on the
    // ledge — the A-frame is what makes it an easel and not a table.
    `<path d="M${FURN_X - 26},${y} L${FURN_X - 4},${y - 92}" stroke="${wood}" stroke-width="6" stroke-linecap="round" fill="none"/>` +
    `<path d="M${FURN_X + 26},${y} L${FURN_X + 4},${y - 92}" stroke="${wood}" stroke-width="6" stroke-linecap="round" fill="none"/>` +
    `<path d="M${FURN_X + 14},${y} L${FURN_X + 2},${y - 60}" stroke="${c.woodDark}" stroke-width="5" stroke-linecap="round" fill="none"/>` +
    box(FURN_X - 30, y - 50, 60, 5, wood, 2) +
    box(FURN_X - 26, y - 96, 52, 46, c.canvas, 1) +
    boxShade(FURN_X - 26, y - 96, 52, 46, 0.06) +
    // A half-painted picture on the canvas.
    fill(`M${FURN_X - 22},${y - 58} q14,-16 24,-4 q8,-12 18,2 l0,6 l-42,0 Z`, c.hills) +
    circle(FURN_X + 10, y - 82, 6, c.sun) +
    box(FURN_X - 22, y - 60, 42, 4, c.sky) +
    seam(`M${FURN_X - 26},${y - 50} l52,0`, 1.2, 0.18);
}

function studioPaintRug(c) {
  // A drop cloth with paint on it. The splatters are what name it.
  const cx = ACC_X;
  return ellipse(cx, STAND_Y + 4, 36, 11, c.cloth) +
    `<ellipse cx="${cx}" cy="${STAND_Y + 4}" rx="36" ry="11" fill="none" stroke="rgba(0,0,0,0.13)" stroke-width="1"/>` +
    ellipse(cx - 18, STAND_Y + 2, 7, 2.6, c.splat1) +
    ellipse(cx + 6, STAND_Y + 6, 9, 3, c.splat2) +
    ellipse(cx + 22, STAND_Y, 5, 2, c.splat3) +
    ellipse(cx - 4, STAND_Y - 2, 4, 1.6, c.splat4) +
    circle(cx + 15, STAND_Y + 7, 2, c.splat1) +
    circle(cx - 27, STAND_Y + 6, 1.6, c.splat2);
}

/* -- kitchen ------------------------------------------------------------- */

function kitchenPans(c) {
  // The rail sits high: hung any lower the biggest pan reached past the floor
  // line and disappeared behind her.
  const rail = 40;
  const steel = c.steel;
  const pans = [
    { x: WALL_CX - 28, r: 14, copper: false },
    { x: WALL_CX + 2, r: 11, copper: true },
    { x: WALL_CX + 28, r: 9, copper: false },
  ];
  return box(WALL_CX - 46, rail, 92, 4, c.rail, 2) +
    [-40, 0, 40].map((dx) => circle(WALL_CX + dx, rail + 2, 3, '#6b5c4c')).join('') +
    pans.map((p) => {
      const body = p.copper ? c.copper : steel;
      const cy = rail + 16 + p.r * 0.5;
      return (
        // Hook over the rail.
        `<path d="M${p.x},${rail} q0,7 0,10" stroke="#5f6771" stroke-width="2" fill="none"/>` +
        // A round-bottomed pot rather than a tapering bucket, which is what
        // the first pass read as. The rim and the handle do the rest.
        fill(`M${p.x - p.r},${cy - 3} a${p.r},${p.r} 0 0 0 ${p.r * 2},0 Z`, body) +
        box(p.x - p.r - 1.5, cy - 6, p.r * 2 + 3, 4, p.copper ? c.copperRim : c.steelRim, 1.5) +
        // Handle, straight out to the side — the clearest "this is a pan" cue.
        box(p.x + p.r + 1, cy - 5.2, p.r * 0.9, 2.6, c.handles, 1.2) +
        light(`M${p.x - p.r * 0.6},${cy - 2} a${p.r * 0.6},${p.r * 0.6} 0 0 0 ${p.r * 0.5},${p.r * 0.5} a${p.r * 0.8},${p.r * 0.8} 0 0 1 -${p.r * 0.5},-${p.r * 0.5} Z`, 0.16)
      );
    }).join('');
}

function kitchenStove(c) {
  const body = c.body;
  const y = STAND_Y;
  return contact(FURN_X, 36, 0.2) +
    box(FURN_X - 34, y - 62, 68, 62, body, 3) +
    box(FURN_X - 34, y - 66, 68, 6, c.hob, 3) +
    // Oven door with a dark window and a handle — the parts that say "oven".
    box(FURN_X - 28, y - 46, 56, 34, c.door, 3) +
    box(FURN_X - 23, y - 41, 46, 22, c.window, 2) +
    boxLight(FURN_X - 23, y - 41, 46, 8, 0.12) +
    box(FURN_X - 30, y - 54, 60, 5, c.handle, 2.5) +
    // Four burners seen from a shallow angle, on the hob.
    [-18, -6, 6, 18].map((dx, i) =>
      ellipse(FURN_X + dx * 1.4, y - 69 + (i % 2 ? 3 : 0), 7, 2.6, c.burners)).join('') +
    [-18, 18].map((dx) => circle(FURN_X + dx * 1.4, y - 57, 2.6, c.knobs)).join('') +
    boxShade(FURN_X - 34, y - 12, 68, 12, 0.12);
}

function kitchenMat(c) {
  const cx = ACC_X;
  return `<rect x="${cx - 36}" y="${STAND_Y - 6}" width="72" height="20" rx="4" fill="${c.border}"/>` +
    `<rect x="${cx - 30}" y="${STAND_Y - 2}" width="60" height="12" rx="3" fill="${c.field}"/>` +
    seam(`M${cx - 36},${STAND_Y + 14} l72,0`, 1.1, 0.16) +
    [-24, -8, 8, 24].map((dx) => seam(`M${cx + dx},${STAND_Y - 6} l0,20`, 1, 0.09)).join('');
}

/* -- library ------------------------------------------------------------- */

function libraryPainting(c) {
  // A gilt-framed landscape. The frame's double border and the horizon inside
  // are what stop it reading as a window.
  const cx = WALL_CX;
  return boxShade(cx - 40, 24, 82, 66, 0.18) +
    box(cx - 42, 20, 84, 66, c.frame, 3) +
    box(cx - 36, 26, 72, 54, c.mount) +
    box(cx - 33, 29, 66, 48, c.sky) +
    fill(`M${cx - 33},58 q16,-14 32,-4 q10,-8 34,4 l0,19 l-66,0 Z`, c.hills) +
    circle(cx + 14, 40, 6, c.sun) +
    fill(`M${cx - 33},68 q20,-6 66,-2 l0,11 l-66,0 Z`, c.foreground) +
    boxLight(cx - 33, 29, 66, 10, 0.07) +
    seam(`M${cx - 36},26 l72,0 l0,54 l-72,0 Z`, 1.2, 0.2);
}

function libraryBookcase(c) {
  const wood = c.wood;
  const y = STAND_Y;
  const top = y - 116;
  const shelves = [top + 30, top + 58, top + 86];
  const spines = [c.spine1, c.spine2, c.spine3, c.spine4, c.spine5, c.spine6, c.spine7];
  let out = contact(FURN_X, 40, 0.22) +
    box(FURN_X - 40, top, 80, y - top, wood, 2) +
    box(FURN_X - 35, top + 5, 70, y - top - 10, c.back);
  shelves.forEach((sy, row) => {
    out += box(FURN_X - 35, sy, 70, 5, wood);
    // Books of varying height and lean, packed left to right with a gap.
    let x = FURN_X - 32;
    let i = row * 3;
    while (x < FURN_X + 28) {
      const w = 5 + ((i * 7) % 4);
      const h = 17 + ((i * 5) % 7);
      const lean = (i % 5 === 4) ? 8 : 0;
      const colour = spines[(i + row) % spines.length];
      out += `<g transform="rotate(${lean} ${x + w / 2} ${sy})">` +
        box(x, sy - h, w, h, colour) +
        boxLight(x, sy - h, w, 2.5, 0.16) +
        boxShade(x + w - 1.5, sy - h, 1.5, h, 0.18) +
        '</g>';
      x += w + 1.2;
      i++;
    }
  });
  out += box(FURN_X - 40, y - 8, 80, 8, wood, 1) +
    boxShade(FURN_X - 35, top + 5, 70, 6, 0.2);
  return out;
}

function libraryBookStack(c) {
  // Books lying flat, stacked with a slight offset so the edges read.
  const cx = ACC_X;
  const layers = [
    { w: 44, h: 7, dx: 0, colour: c.book1 },
    { w: 40, h: 6, dx: 3, colour: c.book2 },
    { w: 46, h: 7, dx: -3, colour: c.book3 },
    { w: 34, h: 6, dx: 5, colour: c.book4 },
  ];
  let y = STAND_Y + 2;
  let out = contact(cx, 26, 0.2);
  for (const L of layers) {
    y -= L.h;
    out += box(cx - L.w / 2 + L.dx, y, L.w, L.h, L.colour, 1.5) +
      boxLight(cx - L.w / 2 + L.dx, y, L.w, 1.6, 0.14) +
      // The page block, a paler stripe along the front edge.
      box(cx - L.w / 2 + L.dx + 2, y + L.h - 2.6, L.w - 4, 2.2, 'rgba(245,240,225,0.85)');
  }
  return out;
}

/* -- bedroom, bought ------------------------------------------------------ */

function bedPhotos(c) {
  // A cluster of framed photographs. Different frame colours and one portrait
  // orientation keep it from reading as a single grid.
  const frames = [
    { x: WALL_CX - 40, y: 26, w: 30, h: 36, f: c.frame1, pic: c.pic1 },
    { x: WALL_CX - 4, y: 20, w: 40, h: 30, f: c.frame2, pic: c.pic2 },
    { x: WALL_CX - 26, y: 70, w: 34, h: 28, f: c.frame3, pic: c.pic3 },
    { x: WALL_CX + 14, y: 58, w: 26, h: 34, f: c.frame4, pic: c.pic4 },
  ];
  return frames.map((f) =>
    boxShade(f.x + 1.5, f.y + 2, f.w, f.h, 0.16) +
    box(f.x, f.y, f.w, f.h, f.f, 1.5) +
    box(f.x + 3, f.y + 3, f.w - 6, f.h - 6, f.pic) +
    // A horizon and a head-and-shoulders blob, so each reads as a photo of
    // something rather than as a coloured rectangle.
    fill(`M${f.x + 3},${f.y + f.h - 9} q${f.w / 3},-6 ${f.w - 6},0 l0,6 l-${f.w - 6},0 Z`, 'rgba(0,0,0,0.18)') +
    circle(f.x + f.w / 2, f.y + f.h * 0.45, Math.min(f.w, f.h) * 0.16, 'rgba(255,255,255,0.4)') +
    boxLight(f.x + 3, f.y + 3, f.w - 6, 3, 0.12)).join('');
}

function bedClock(c) {
  const cx = WALL_CX;
  const cy = 58;
  const r = 26;
  return circle(cx + 1.5, cy + 2, r, 'rgba(0,0,0,0.18)') +
    circle(cx, cy, r, c.case) +
    circle(cx, cy, r - 4, c.face) +
    // Twelve ticks, four of them long — the pattern that says clock face.
    [...Array(12)].map((_, i) => {
      const a = (i / 12) * Math.PI * 2;
      const long = i % 3 === 0;
      const r1 = r - (long ? 10 : 7);
      const r2 = r - 5;
      return seam(`M${n(cx + Math.sin(a) * r1)},${n(cy - Math.cos(a) * r1)} ` +
        `L${n(cx + Math.sin(a) * r2)},${n(cy - Math.cos(a) * r2)}`, long ? 1.8 : 1.1, 0.5);
    }).join('') +
    seam(`M${cx},${cy} L${cx + 8},${cy - 9}`, 2, 0.7) +
    seam(`M${cx},${cy} L${cx - 4},${cy - 14}`, 1.6, 0.55) +
    circle(cx, cy, 2.2, '#3a2f24') +
    light(`M${cx - 14},${cy - 12} a18,18 0 0 1 20,-4 a22,22 0 0 0 -20,4 Z`, 0.35);
}

function bedWardrobe(c) {
  const wood = c.carcass;
  const y = STAND_Y;
  const top = y - 118;
  return contact(FURN_X, 36, 0.22) +
    box(FURN_X - 34, top, 68, y - top, wood, 2) +
    box(FURN_X - 36, top - 5, 72, 6, c.trim, 2) +
    // Two doors with a centre gap and a knob each — the wardrobe read.
    box(FURN_X - 30, top + 8, 28, y - top - 20, c.doors, 1.5) +
    box(FURN_X + 2, top + 8, 28, y - top - 20, c.doors, 1.5) +
    box(FURN_X - 24, top + 16, 16, y - top - 40, c.panels, 1) +
    box(FURN_X + 8, top + 16, 16, y - top - 40, c.panels, 1) +
    circle(FURN_X - 4.5, y - 62, 2.6, c.knobs) +
    circle(FURN_X + 4.5, y - 62, 2.6, c.knobs) +
    box(FURN_X - 34, y - 10, 68, 10, c.trim, 1) +
    boxShade(FURN_X + 2, top + 8, 28, y - top - 20, 0.08) +
    boxLight(FURN_X - 30, top + 8, 4, y - top - 20, 0.08);
}

function bedDresser(c) {
  const wood = c.body;
  const y = STAND_Y;
  const top = y - 54;
  return contact(FURN_X, 38, 0.2) +
    // Oval mirror standing on the top, which is what separates a dresser from
    // a plain chest of drawers.
    ellipse(FURN_X, top - 30, 21, 27, c.mirrorFrame) +
    ellipse(FURN_X, top - 30, 17, 23, c.glass) +
    fill(`M${FURN_X - 15},${top - 22} q10,-18 26,-14 q-14,-1 -22,20 Z`, 'rgba(255,255,255,0.42)') +
    box(FURN_X - 6, top - 6, 12, 8, c.mirrorFrame) +
    box(FURN_X - 36, top, 72, 54, wood, 2) +
    [0, 1, 2].map((i) => box(FURN_X - 30, top + 5 + i * 16, 60, 12, c.drawers, 1.5) +
      box(FURN_X - 8, top + 9 + i * 16, 16, 3, c.handles, 1.5)).join('') +
    box(FURN_X - 36, y - 6, 72, 6, c.plinth, 1) +
    boxShade(FURN_X - 36, y - 8, 72, 3, 0.14);
}

function bedPlant(c) {
  const cx = ACC_X;
  const pot = c.pot;
  const leaf = (dx, dy, rot, len) =>
    `<g transform="rotate(${rot} ${n(cx + dx)} ${n(STAND_Y - 26 + dy)})">` +
    ellipse(cx + dx, STAND_Y - 26 + dy - len / 2, 6.5, len / 2, c.leaves) +
    seam(`M${n(cx + dx)},${n(STAND_Y - 26 + dy)} l0,${-len}`, 1, 0.16) + '</g>';
  return contact(cx, 20, 0.2) +
    leaf(-9, -6, -34, 30) + leaf(9, -6, 32, 30) + leaf(-2, -14, -10, 38) +
    leaf(6, -10, 16, 26) + leaf(-13, -2, -58, 22) +
    fill(`M${cx - 15},${STAND_Y - 28} l30,0 l-4,28 l-22,0 Z`, pot) +
    box(cx - 17, STAND_Y - 31, 34, 6, c.rim, 2) +
    shade(`M${cx + 4},${STAND_Y - 28} l11,0 l-4,28 l-9,0 Z`, 0.12) +
    boxLight(cx - 17, STAND_Y - 31, 8, 6, 0.16);
}

function bedLamp(c) {
  const cx = ACC_X;
  const shadeY = STAND_Y - 96;
  return contact(cx, 15, 0.2) +
    ellipse(cx, STAND_Y - 2, 15, 4.5, c.base) +
    box(cx - 2, shadeY + 22, 4, STAND_Y - 4 - shadeY - 22, c.stem) +
    // A proper tapered shade, wider at the bottom, with warm light spilling out.
    fill(`M${cx - 22},${shadeY + 24} l7,-24 l30,0 l7,24 Z`, c.shade) +
    fill(`M${cx - 22},${shadeY + 24} l44,0 l-4,3 l-36,0 Z`, c.shadeUnder) +
    light(`M${cx - 15},${shadeY} l10,0 l-5,24 l-11,0 Z`, 0.3) +
    ellipse(cx, shadeY + 27, 17, 5, 'rgba(255,222,150,0.35)');
}

/* -- studio, bought ------------------------------------------------------- */

function studioPaintShelf(c) {
  // A shelf of paint jars. Different fill heights and a brush jar make it read
  // as a working shelf rather than a row of identical bottles.
  const y = 78;
  const jars = [
    { x: WALL_CX - 38, w: 12, h: 22, c: c.jar1, fillPct: 0.55 },
    { x: WALL_CX - 22, w: 11, h: 18, c: c.jar2, fillPct: 0.8 },
    { x: WALL_CX - 8, w: 13, h: 24, c: c.jar3, fillPct: 0.4 },
    { x: WALL_CX + 9, w: 11, h: 20, c: c.jar4, fillPct: 0.65 },
  ];
  const jarMarkup = jars.map((j) => {
    const top = y - j.h;
    return box(j.x, top, j.w, j.h, 'rgba(236,240,244,0.55)', 1.5) +
      box(j.x, y - j.h * j.fillPct, j.w, j.h * j.fillPct, j.c, 1.5) +
      box(j.x - 1, top - 3, j.w + 2, 3.5, c.lids, 1) +
      boxLight(j.x + 1.5, top + 2, 2.5, j.h - 5, 0.3);
  }).join('');
  // Brushes standing in a pot at the end of the shelf.
  const bx = WALL_CX + 27;
  const brushes = [-4, 0, 4].map((dx, i) =>
    `<path d="M${bx + dx},${y - 12} l${dx * 0.5},${-14 - i * 3}" stroke="${c.brushes}" stroke-width="2.2" stroke-linecap="round" fill="none"/>` +
    circle(bx + dx * 1.5, y - 27 - i * 3, 2.2, [c.jar1, c.jar2, c.jar3][i])).join('');
  return box(WALL_CX - 46, y, 92, 5, c.shelf, 1.5) +
    boxShade(WALL_CX - 46, y + 5, 92, 3, 0.2) +
    [-38, 38].map((dx) => fill(`M${WALL_CX + dx},${y + 5} l6,0 l-6,9 Z`, c.brackets)).join('') +
    jarMarkup + brushes +
    box(bx - 7, y - 14, 14, 14, c.pot, 1.5);
}

function studioWindow(c) {
  // Tall north-light window: many small panes, no curtains, because that is
  // what a studio window looks like.
  const frame = c.frame;
  const x = WALL_CX - 38;
  const w = 76;
  const h = 96;
  const top = 16;
  return boxShade(x + 2, top + 2, w, h, 0.16) +
    box(x - 3, top - 3, w + 6, h + 6, frame, 2) +
    box(x, top, w, h, c.sky) +
    fill(`M${x},${top + h - 30} q20,-16 38,-6 q16,-10 38,4 l0,32 l-76,0 Z`, c.land) +
    circle(x + 54, top + 26, 9, 'rgba(255,255,255,0.6)') +
    [1, 2].map((i) => box(x + (w / 3) * i - 1.5, top, 3, h, frame)).join('') +
    [1, 2, 3].map((i) => box(x, top + (h / 4) * i - 1.5, w, 3, frame)).join('') +
    boxLight(x, top, w, 12, 0.22) +
    box(x - 6, top + h + 3, w + 12, 5, c.sill, 2);
}

function studioDesk(c) {
  const wood = c.wood;
  const y = STAND_Y;
  const boardBack = y - 96;   // top edge of the tilted board
  const boardFront = y - 62;  // bottom edge, nearer the viewer
  return contact(FURN_X, 42, 0.2) +
    // Side frames first, so the board sits on top of them.
    [[-34], [30]].map(([dx]) =>
      box(FURN_X + dx - 3, boardFront - 4, 6, y - boardFront + 4, wood, 2)).join('') +
    box(FURN_X - 34, y - 26, 64, 5, wood) +
    // The board itself: a wedge, thick at the front edge, thin at the back.
    // The tilt is the whole identity of a drafting desk, so it is drawn as an
    // explicit trapezoid rather than a rotated rectangle that reads as a box.
    fill(`M${FURN_X - 38},${boardBack} L${FURN_X + 34},${boardBack + 8} ` +
      `L${FURN_X + 34},${boardFront + 6} L${FURN_X - 38},${boardFront - 2} Z`, wood) +
    fill(`M${FURN_X - 34},${boardBack + 3} L${FURN_X + 30},${boardBack + 10} ` +
      `L${FURN_X + 30},${boardFront + 1} L${FURN_X - 34},${boardFront - 6} Z`, c.board) +
    // A drawing pinned to the board, and the pencil ledge along the front.
    seam(`M${FURN_X - 24},${boardFront - 18} q14,-14 26,-3 q10,-9 20,2`, 1.4, 0.3) +
    seam(`M${FURN_X - 24},${boardFront - 10} l44,4`, 1.2, 0.22) +
    fill(`M${FURN_X - 38},${boardFront - 2} L${FURN_X + 34},${boardFront + 6} ` +
      `L${FURN_X + 34},${boardFront + 11} L${FURN_X - 38},${boardFront + 3} Z`, c.ledge) +
    `<path d="M${FURN_X - 20},${boardFront + 3} l16,2" stroke="${c.pencil}" stroke-width="2.4" stroke-linecap="round" fill="none"/>` +
    boxShade(FURN_X - 34, y - 26, 64, 3, 0.16);
}

function studioTrolley(c) {
  const metal = c.frame;
  const y = STAND_Y;
  const top = y - 74;
  return contact(FURN_X, 32, 0.2) +
    [-26, 26].map((dx) => box(FURN_X + dx - 2, top, 4, y - top - 8, metal, 2)).join('') +
    [top + 4, top + 34, y - 14].map((sy) =>
      box(FURN_X - 30, sy, 60, 5, c.shelves, 1.5) + boxShade(FURN_X - 30, sy + 5, 60, 2.5, 0.18)).join('') +
    // Paint tubes on the top shelf, jars below — the cargo is what names it.
    [-20, -10, 0, 10, 20].map((dx, i) =>
      box(FURN_X + dx - 3.5, top - 12, 7, 12, [c.tube1, c.tube2, c.tube3, c.tube4, c.tube5][i], 2) +
      box(FURN_X + dx - 2, top - 15, 4, 3.5, '#cfd6dc', 1)).join('') +
    [-16, 0, 16].map((dx, i) =>
      box(FURN_X + dx - 7, top + 20, 14, 14, ['rgba(236,240,244,0.5)', c.jar, 'rgba(236,240,244,0.5)'][i], 1.5)).join('') +
    [-24, 24].map((dx) => circle(FURN_X + dx, y - 4, 5, c.wheels) +
      circle(FURN_X + dx, y - 4, 2, metal)).join('');
}

function studioCanvases(c) {
  // Canvases leaning against each other, seen edge-on and face-on.
  const cx = ACC_X;
  return contact(cx, 30, 0.2) +
    `<g transform="rotate(-7 ${cx - 12} ${STAND_Y})">` +
    box(cx - 30, STAND_Y - 46, 34, 46, c.edge, 1) +
    box(cx - 28, STAND_Y - 44, 30, 42, c.face, 1) +
    fill(`M${cx - 28},${STAND_Y - 14} q9,-11 15,-3 q5,-8 15,2 l0,13 l-30,0 Z`, c.painting) +
    circle(cx - 16, STAND_Y - 32, 5, c.sun) +
    '</g>' +
    `<g transform="rotate(6 ${cx + 12} ${STAND_Y})">` +
    box(cx + 2, STAND_Y - 38, 9, 38, c.leaning, 1) +
    boxShade(cx + 2, STAND_Y - 38, 4, 38, 0.16) +
    box(cx + 13, STAND_Y - 44, 7, 44, c.edge, 1) +
    '</g>';
}

function studioStool(c) {
  const wood = c.legs;
  const y = STAND_Y;
  const seatY = y - 44;
  return contact(ACC_X, 20, 0.2) +
    [[-15, -5], [15, 5], [-7, -3]].map(([dx, tx]) =>
      `<path d="M${ACC_X + dx},${y} L${ACC_X + tx},${seatY + 3}" stroke="${wood}" stroke-width="4.5" stroke-linecap="round" fill="none"/>`).join('') +
    seam(`M${ACC_X - 12},${y - 16} L${ACC_X + 12},${y - 16}`, 3, 0.28) +
    ellipse(ACC_X, seatY, 19, 6.5, wood) +
    ellipse(ACC_X, seatY - 2.5, 19, 6.5, c.seat) +
    light(`M${ACC_X - 12},${seatY - 5} a14,5 0 0 1 22,-1 a16,6 0 0 0 -22,1 Z`, 0.2);
}

/* -- kitchen, bought ------------------------------------------------------ */

function kitchenSpices(c) {
  const y = 82;
  const jars = [c.jar1, c.jar2, c.jar3, c.jar4, c.jar5, c.jar6];
  return box(WALL_CX - 46, y, 92, 5, c.shelf, 1.5) +
    boxShade(WALL_CX - 46, y + 5, 92, 3, 0.2) +
    box(WALL_CX - 46, y - 34, 92, 3, c.shelf, 1) +
    jars.map((jar, i) => {
      const x = WALL_CX - 40 + i * 14;
      return box(x, y - 15, 11, 15, jar, 1.5) +
        box(x + 0.5, y - 19, 10, 4, c.lids, 1) +
        boxLight(x + 1.5, y - 13, 2, 11, 0.24) +
        // A paper label band, which is what makes them spice jars.
        box(x + 1, y - 9, 9, 4.5, 'rgba(245,240,228,0.8)');
    }).join('') +
    // A second row on the upper rail, smaller.
    jars.slice(0, 4).map((jar, i) => {
      const x = WALL_CX - 30 + i * 16;
      return box(x, y - 46, 10, 12, jar, 1.5) + box(x + 0.5, y - 49, 9, 3.5, c.lids, 1);
    }).join('');
}

function kitchenWindow(c) {
  const frame = c.frame;
  const cx = WALL_CX;
  return box(cx - 34, 30, 68, 56, frame, 2) +
    box(cx - 29, 35, 58, 46, c.sky) +
    box(cx - 29, 64, 58, 17, c.land) +
    ellipse(cx - 10, 47, 9, 4.5, 'rgba(255,255,255,0.8)') +
    box(cx - 1.5, 35, 3, 46, frame) +
    box(cx - 29, 55, 58, 3, frame) +
    // A sill with a small pot on it — the detail that says kitchen window.
    box(cx - 38, 86, 76, 5, c.sill, 1.5) +
    fill(`M${cx + 14},${86} l14,0 l-2,-11 l-10,0 Z`, c.pot) +
    ellipse(cx + 19, 71, 7, 5, c.plant) +
    ellipse(cx + 15, 68, 4, 3.5, c.plantLight) +
    boxShade(cx - 29, 35, 58, 5, 0.1);
}

function kitchenFridge(c) {
  const body = c.body;
  const y = STAND_Y;
  const top = y - 126;
  return contact(FURN_X, 32, 0.22) +
    box(FURN_X - 30, top, 60, y - top, body, 3) +
    // The split between freezer and fridge, plus two long vertical handles.
    box(FURN_X - 30, top + 40, 60, 2.5, '#b9bfc7') +
    box(FURN_X + 20, top + 8, 4, 26, c.handles, 2) +
    box(FURN_X + 20, top + 50, 4, 42, c.handles, 2) +
    boxLight(FURN_X - 30, top, 8, y - top, 0.14) +
    boxShade(FURN_X + 18, top, 12, y - top, 0.07) +
    // A couple of magnets and a note, which reads instantly as a fridge door.
    box(FURN_X - 22, top + 54, 16, 20, c.note, 1) +
    seam(`M${FURN_X - 19},${top + 60} l10,0 M${FURN_X - 19},${top + 65} l8,0`, 1, 0.25) +
    circle(FURN_X - 24, top + 50, 2.6, c.magnet1) +
    circle(FURN_X - 6, top + 24, 2.6, c.magnet2) +
    box(FURN_X - 30, y - 5, 60, 5, c.plinth, 1);
}

function kitchenCounter(c) {
  const cab = c.cabinet;
  const y = STAND_Y;
  const topY = y - 58;
  return contact(FURN_X, 42, 0.2) +
    box(FURN_X - 40, topY + 5, 80, y - topY - 5, cab, 2) +
    box(FURN_X - 42, topY, 84, 7, c.worktop, 2) +
    // An inset sink basin with a tap arching over it.
    box(FURN_X - 22, topY - 1, 40, 6, c.sink, 1.5) +
    `<path d="M${FURN_X + 12},${topY} q0,-16 -12,-16 q-6,0 -6,5" fill="none" stroke="${c.tap}" stroke-width="3.2" stroke-linecap="round"/>` +
    box(FURN_X + 14, topY - 20, 3, 8, c.tap, 1.5) +
    [0, 1].map((i) => box(FURN_X - 36 + i * 40, topY + 12, 34, 20, c.drawers, 1.5) +
      box(FURN_X - 26 + i * 40, topY + 20, 14, 3, c.handles, 1.5)).join('') +
    [0, 1].map((i) => box(FURN_X - 36 + i * 40, topY + 36, 34, 18, c.drawers, 1.5) +
      box(FURN_X - 26 + i * 40, topY + 43, 14, 3, c.handles, 1.5)).join('') +
    boxShade(FURN_X - 40, y - 6, 80, 6, 0.14);
}

function kitchenHerb(c) {
  const cx = ACC_X;
  // A trio of small pots on a low stand, so it is clearly herbs, not one plant.
  const pot = (dx, h, colour) =>
    fill(`M${cx + dx - 9},${STAND_Y - 14} l18,0 l-2.5,14 l-13,0 Z`, colour) +
    box(cx + dx - 10, STAND_Y - 17, 20, 4, c.rim, 1.5) +
    [[-4, -1], [0, 0], [4, 1]].map(([lx, i]) =>
      ellipse(cx + dx + lx, STAND_Y - 20 - h + i * 2, 4.5, h * 0.5, i ? c.leaves : c.leavesLight)).join('');
  return contact(cx, 30, 0.2) +
    pot(-19, 12, c.pots) + pot(0, 15, c.potMiddle) + pot(19, 11, c.pots);
}

function kitchenCrate(c) {
  const wood = c.wood;
  const cx = ACC_X;
  const y = STAND_Y;
  return contact(cx, 28, 0.2) +
    box(cx - 26, y - 30, 52, 30, wood, 1.5) +
    [0, 1, 2].map((i) => seam(`M${cx - 26},${y - 24 + i * 9} l52,0`, 1.4, 0.22)).join('') +
    box(cx - 26, y - 30, 5, 30, c.ends) +
    box(cx + 21, y - 30, 5, 30, c.ends) +
    // Vegetables spilling over the rim: carrots, a cabbage, tomatoes.
    circle(cx - 13, y - 34, 8, c.cabbage) +
    fill(`M${cx - 18},${y - 36} q5,-6 10,-1 q-5,-2 -10,1 Z`, '#a3c072') +
    circle(cx + 2, y - 33, 6, c.tomatoes) +
    circle(cx + 13, y - 35, 5.5, c.tomatoes) +
    fill(`M${cx + 18},${y - 40} l7,-3 l-2,7 Z`, c.carrots) +
    fill(`M${cx - 24},${y - 38} l6,-4 l0,7 Z`, c.carrots) +
    light(`M${cx - 13},${y - 40} q6,-2 8,3 q-4,-3 -8,-3 Z`, 0.2);
}

/* -- library, bought ------------------------------------------------------ */

function librarySconces(c) {
  // Wall lights. The first pass was a white bar on a small dark plate and read
  // as a symbol rather than an object; the backplate, the curved bracket arm
  // and the drip pan are what make it legible as a sconce.
  const sconce = (cx) => {
    const plateY = 44;
    const panY = 74;
    return ellipse(cx, plateY + 16, 30, 34, 'rgba(255,206,124,0.14)') +
      // Backplate against the wall.
      fill(`M${cx - 9},${plateY} q9,-8 18,0 l0,26 q-9,8 -18,0 Z`, c.backplate) +
      boxLight(cx - 7, plateY + 2, 4, 22, 0.14) +
      // Bracket arm sweeping out and up to the pan.
      `<path d="M${cx},${plateY + 24} q0,10 -14,12 M${cx},${plateY + 24} q0,10 14,12" ` +
      `fill="none" stroke="${c.bracket}" stroke-width="3.4" stroke-linecap="round"/>` +
      [-14, 14].map((dx) =>
        ellipse(cx + dx, panY, 8, 3, c.bracket) +
        box(cx + dx - 3, panY - 17, 6, 17, c.candles, 1) +
        // Melted wax over the pan lip.
        fill(`M${cx + dx - 3},${panY - 2} q3,4 6,0 l0,3 l-6,0 Z`, '#e8e0c8') +
        fill(`M${cx + dx},${panY - 27} q6,7 0,10 q-6,-3 0,-10 Z`, c.flames) +
        fill(`M${cx + dx},${panY - 24} q3,4 0,6 q-3,-2 0,-6 Z`, '#fff2c8') +
        ellipse(cx + dx, panY - 22, 9, 11, 'rgba(255,206,124,0.2)')).join('');
  };
  return sconce(WALL_CX - 36) + sconce(WALL_CX + 36);
}

function libraryArch(c) {
  // A tall arched window onto a night sky. The arch is what distinguishes it
  // from the bedroom's square one.
  const cx = WALL_CX;
  const w = 62;
  const bottom = 116;
  const springs = 56;
  const arch = `M${cx - w / 2},${bottom} L${cx - w / 2},${springs} ` +
    `A${w / 2},${w / 2} 0 0 1 ${cx + w / 2},${springs} L${cx + w / 2},${bottom} Z`;
  const inner = `M${cx - w / 2 + 5},${bottom - 4} L${cx - w / 2 + 5},${springs} ` +
    `A${w / 2 - 5},${w / 2 - 5} 0 0 1 ${cx + w / 2 - 5},${springs} L${cx + w / 2 - 5},${bottom - 4} Z`;
  return fill(arch, c.frame) +
    fill(inner, c.sky) +
    circle(cx + 12, springs + 2, 8, c.moon) +
    [[-14, 34], [6, 22], [-6, 48], [16, 46], [-18, 60]].map(([dx, dy]) =>
      circle(cx + dx, springs + dy, 1.3, 'rgba(255,255,255,0.7)')).join('') +
    fill(`M${cx - w / 2 + 5},${bottom - 4} q30,-18 ${w - 10},0 l0,4 l-${w - 10},0 Z`, c.land) +
    box(cx - 2, springs - 4, 4, bottom - springs, c.frame) +
    box(cx - w / 2 + 5, 86, w - 10, 3.5, c.frame) +
    box(cx - w / 2 - 5, bottom, w + 10, 6, c.sill, 2) +
    seam(`M${cx - w / 2 + 5},${springs} A${w / 2 - 5},${w / 2 - 5} 0 0 1 ${cx + w / 2 - 5},${springs}`, 1.2, 0.24);
}

function libraryDesk(c) {
  const wood = c.wood;
  const y = STAND_Y;
  const topY = y - 66;
  return contact(FURN_X, 44, 0.22) +
    // Two drawer pedestals with a knee hole between them, which is what makes
    // this a desk rather than a cabinet.
    [-1, 1].map((sgn) => {
      const x = FURN_X + (sgn < 0 ? -40 : 18);
      return box(x, topY + 9, 22, y - topY - 9, wood, 1) +
        [0, 1, 2].map((i) => box(x + 3, topY + 15 + i * 18, 16, 14, c.drawers, 1.5) +
          box(x + 8, topY + 21 + i * 18, 7, 2.6, c.handles, 1.5)).join('');
    }).join('') +
    box(FURN_X - 44, topY, 88, 9, c.top, 2) +
    boxLight(FURN_X - 44, topY, 88, 3, 0.14) +
    // An open book, drawn big and pale so it survives the dark room.
    fill(`M${FURN_X - 26},${topY - 2} q11,-7 20,-1 q9,-6 20,1 l-20,5 Z`, c.book) +
    fill(`M${FURN_X - 26},${topY - 2} q11,-7 20,-1 l0,5 q-9,-5 -20,-1 Z`, '#e6dcc4') +
    seam(`M${FURN_X - 20},${topY - 5} l12,-1 M${FURN_X + 2},${topY - 6} l12,1`, 1, 0.26) +
    // A banker's lamp: brass stem, green shade, warm pool of light on the desk.
    ellipse(FURN_X + 30, topY - 1, 9, 3, c.lampBrass) +
    box(FURN_X + 28.5, topY - 26, 3.5, 25, '#d8b465') +
    fill(`M${FURN_X + 16},${topY - 26} l28,0 l-5,-10 l-18,0 Z`, c.lampShade) +
    light(`M${FURN_X + 21},${topY - 34} l18,0 l2,4 l-22,0 Z`, 0.26) +
    ellipse(FURN_X + 30, topY - 22, 15, 5, 'rgba(255,222,150,0.3)') +
    boxShade(FURN_X - 44, topY + 9, 88, 3, 0.18);
}

function libraryGlobe(c) {
  const y = STAND_Y;
  const cy = y - 62;
  const r = 26;
  return contact(FURN_X, 26, 0.2) +
    // Tripod stand.
    [[-18, -3], [18, 3], [0, 0]].map(([dx, tx]) =>
      `<path d="M${FURN_X + dx},${y} L${FURN_X + tx},${cy + r - 2}" stroke="${c.stand}" stroke-width="4.5" stroke-linecap="round" fill="none"/>`).join('') +
    ellipse(FURN_X, y - 22, 15, 4, c.stand) +
    circle(FURN_X, cy, r, c.ocean) +
    // Landmasses. Deliberately not any real map — just enough green to read
    // as a globe rather than a blue ball.
    fill(`M${FURN_X - 18},${cy - 8} q10,-10 20,-2 q8,6 2,12 q-12,6 -18,-2 Z`, c.land) +
    fill(`M${FURN_X + 4},${cy + 8} q9,-4 14,4 q-6,7 -14,2 Z`, c.land) +
    fill(`M${FURN_X - 14},${cy + 12} q7,-3 10,3 q-6,4 -10,-3 Z`, c.landLight) +
    `<path d="M${FURN_X - r - 3},${cy} a${r + 3},${r + 3} 0 0 1 ${(r + 3) * 2},0" fill="none" stroke="${c.meridian}" stroke-width="3.5"/>` +
    seam(`M${FURN_X - r},${cy} l${r * 2},0`, 1, 0.18) +
    light(`M${FURN_X - 15},${cy - 15} a20,20 0 0 1 14,-5 a24,24 0 0 0 -14,5 Z`, 0.28);
}

function libraryRug(c) {
  // A patterned rug in the same shallow perspective as the other floor pieces.
  // The library floor is dark, so the field is deliberately lighter than a real
  // Persian would be — at panel size a dark red rug on dark boards read as a
  // stain rather than as a rug.
  const cx = ACC_X;
  const cy = STAND_Y + 4;
  return ellipse(cx, cy, 42, 13, c.border) +
    `<ellipse cx="${cx}" cy="${cy}" rx="42" ry="13" fill="none" stroke="rgba(0,0,0,0.2)" stroke-width="1"/>` +
    ellipse(cx, cy, 36, 10.5, c.field) +
    `<ellipse cx="${cx}" cy="${cy}" rx="36" ry="10.5" fill="none" stroke="${c.trim}" stroke-width="1.8"/>` +
    ellipse(cx, cy, 26, 7.2, c.border) +
    ellipse(cx, cy, 13, 3.8, c.trim) +
    ellipse(cx, cy, 7, 2, c.centre) +
    [-20, 20].map((dx) => ellipse(cx + dx, cy, 4.5, 2, c.trim)).join('') +
    [-1, 1].map((sgn) => [...Array(5)].map((_, i) =>
      seam(`M${n(cx + sgn * (37 + i * 1.1))},${n(cy - 3.5 + i * 1.7)} l${sgn * 4.5},0`, 1.1, 0.34)).join('')).join('');
}

function libraryCandelabra(c) {
  const cx = ACC_X;
  const y = STAND_Y;
  const armY = y - 74;
  const candle = (dx, h) =>
    box(cx + dx - 2.5, armY - h, 5, h, c.candles, 1) +
    fill(`M${cx + dx},${armY - h - 9} q4.5,5 0,8 q-4.5,-3 0,-8 Z`, c.flames) +
    circle(cx + dx, armY - h - 4, 1.7, 'rgba(255,255,255,0.9)') +
    ellipse(cx + dx, armY - h - 5, 11, 13, 'rgba(255,208,130,0.12)');
  return contact(cx, 16, 0.2) +
    ellipse(cx, y - 2, 16, 5, c.base) +
    box(cx - 2.5, armY, 5, y - 4 - armY, c.stem) +
    ellipse(cx, y - 34, 7, 3, c.cups) +
    `<path d="M${cx - 16},${armY + 2} q0,-12 16,-12 q16,0 16,12" fill="none" stroke="${c.stem}" stroke-width="3.5"/>` +
    [-16, 0, 16].map((dx, i) => box(cx + dx - 4, armY - 4, 8, 5, c.cups, 1.5) + candle(dx, i === 1 ? 20 : 15)).join('');
}

/* -- living room --------------------------------------------------------- */

function lrSofa(c) {
  const x = FURN_X;
  const y = STAND_Y;
  const L = x - 40;
  const W = 84;
  return contact(x + 2, 46, 0.2) +
    box(L + 6, y - 7, 7, 7, c.legs) +
    box(L + W - 13, y - 7, 7, 7, c.legs) +
    box(L, y - 24, W, 20, c.body, 4) +
    box(L, y - 52, W, 32, c.body, 7) +
    box(L - 3, y - 42, 12, 38, c.body, 5) +
    box(L + W - 9, y - 42, 12, 38, c.body, 5) +
    box(L + 9, y - 49, 31, 25, c.cushions, 5) +
    box(L + 44, y - 49, 31, 25, c.cushions, 5) +
    box(L + 9, y - 27, 31, 11, c.cushions, 3) +
    box(L + 44, y - 27, 31, 11, c.cushions, 3) +
    boxShade(L, y - 7, W, 3, 0.14) +
    boxLight(L + 9, y - 49, 31, 5, 0.14) +
    boxLight(L + 44, y - 49, 31, 5, 0.14);
}

function lrTv(c) {
  const x = FURN_X;
  const y = STAND_Y;
  const L = x - 42;
  const W = 86;
  const sT = y - 68;
  return contact(x + 2, 46, 0.2) +
    box(L, y - 22, W, 20, c.cabinet, 3) +
    box(L + 5, y - 18, 24, 12, c.cabinet, 2) +
    box(L + 33, y - 18, 24, 12, c.cabinet, 2) +
    boxShade(L, y - 4, W, 3, 0.16) +
    boxLight(L, y - 22, W, 3, 0.1) +
    box(x - 30, sT, 60, 42, '#2a2e33', 2) +
    box(x - 26, sT + 4, 52, 34, c.screen, 1) +
    box(x - 26, sT + 24, 52, 14, c.screenImage) +
    circle(x + 12, sT + 13, 4, 'rgba(255,240,180,0.85)') +
    box(x - 2, y - 26, 4, 4, '#2a2e33') +
    light(`M${x - 26},${sT + 4} l24,0 l-9,34 l-15,0 Z`, 0.06);
}

function lrArmchair(c) {
  const x = FURN_X;
  const y = STAND_Y;
  const L = x - 26;
  const W = 56;
  return contact(x, 32, 0.2) +
    box(L + 4, y - 7, 6, 7, c.legs) +
    box(L + W - 10, y - 7, 6, 7, c.legs) +
    box(L, y - 22, W, 18, c.body, 4) +
    box(L, y - 50, W, 30, c.body, 7) +
    box(L - 3, y - 40, 11, 36, c.body, 5) +
    box(L + W - 8, y - 40, 11, 36, c.body, 5) +
    box(L + 8, y - 47, W - 16, 24, c.cushion, 5) +
    box(L + 8, y - 25, W - 16, 11, c.cushion, 3) +
    boxShade(L, y - 7, W, 3, 0.14) +
    boxLight(L + 8, y - 47, W - 16, 5, 0.14);
}

function lrCanvas(c) {
  const cx = WALL_CX;
  const top = 28;
  const w = 76;
  const h = 54;
  const L = cx - w / 2;
  return box(L - 3, top - 3, w + 6, h + 6, c.frame, 2) +
    box(L, top, w, h, c.sky) +
    fill(`M${L},${top + h} l0,-20 q${w / 2},-15 ${w},0 l0,20 Z`, c.hills) +
    circle(L + w - 18, top + 15, 8, c.sun) +
    boxShade(L, top, w, 4, 0.1) +
    `<rect x="${L - 3}" y="${top - 3}" width="${w + 6}" height="${h + 6}" fill="none" stroke="rgba(0,0,0,0.12)" stroke-width="1"/>`;
}

function lrShelf(c) {
  const cx = WALL_CX;
  const y = 74;
  const L = cx - 40;
  const W = 80;
  return box(L, y, W, 6, c.shelf, 1) +
    boxShade(L, y + 6, W, 3, 0.12) +
    box(L + 6, y - 22, 5, 22, c.books) +
    box(L + 12, y - 26, 5, 26, c.books) +
    box(L + 18, y - 20, 5, 20, c.books) +
    fill(`M${L + 26},${y} l0,-16 l6,0 l4,16 Z`, c.books) +
    fill(`M${cx + 8},${y} q-5,-4 -3,-14 q1,-5 6,-5 q5,0 6,5 q2,10 -3,14 Z`, c.vase) +
    fill(`M${cx + 11},${y - 16} q-2,-11 -6,-13 q6,1 6,11 Z`, c.plant) +
    fill(`M${cx + 11},${y - 16} q2,-12 7,-14 q-7,2 -7,12 Z`, c.plant);
}

function lrClock(c) {
  const cx = WALL_CX;
  const cy = 54;
  const r = 14;
  let rays = '';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const x1 = cx + Math.cos(a) * (r + 4);
    const y1 = cy + Math.sin(a) * (r + 4);
    const x2 = cx + Math.cos(a) * (r + 13);
    const y2 = cy + Math.sin(a) * (r + 13);
    rays += `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke="${c.rays}" stroke-width="2.4" stroke-linecap="round"/>`;
  }
  return rays +
    circle(cx, cy, r, c.face) +
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(0,0,0,0.12)" stroke-width="1"/>` +
    `<path d="M${cx},${cy} l0,-8 M${cx},${cy} l6,3" stroke="${c.hands}" stroke-width="1.7" stroke-linecap="round" fill="none"/>` +
    circle(cx, cy, 1.7, c.hands);
}

function lrTable(c) {
  const x = ACC_X;
  const y = STAND_Y + 6;
  const L = x - 30;
  const W = 60;
  return contact(x, 34, 0.2) +
    box(L + 3, y - 14, 5, 14, c.legs) +
    box(L + W - 8, y - 14, 5, 14, c.legs) +
    box(L, y - 20, W, 8, c.top, 2) +
    boxLight(L, y - 20, W, 3, 0.16) +
    boxShade(L, y - 12, W, 2, 0.14) +
    box(L + 8, y - 24, 18, 4, c.item, 1) +
    fill(`M${L + W - 16},${y - 21} q0,-6 6,-6 q6,0 6,6 Z`, c.item) +
    `<path d="M${L + W - 4},${y - 25} q4,0 4,3 q0,3 -4,3" fill="none" stroke="${c.item}" stroke-width="1.4"/>`;
}

function lrPlant(c) {
  const x = ACC_X;
  const y = STAND_Y;
  return contact(x, 16, 0.2) +
    fill(`M${x - 12},${y} l3,-22 l18,0 l3,22 Z`, c.pot) +
    box(x - 15, y - 24, 30, 5, c.rim, 1) +
    `<path d="M${x},${y - 22} q-3,-24 -14,-34" fill="none" stroke="${c.stem}" stroke-width="2.5"/>` +
    `<path d="M${x},${y - 22} q3,-28 16,-40" fill="none" stroke="${c.stem}" stroke-width="2.5"/>` +
    `<path d="M${x},${y - 22} q0,-22 2,-30" fill="none" stroke="${c.stem}" stroke-width="2.5"/>` +
    ellipse(x - 15, y - 56, 11, 8, c.leaves) +
    ellipse(x + 16, y - 62, 12, 9, c.leaves) +
    ellipse(x + 2, y - 54, 10, 8, c.leaves) +
    seam(`M${x - 15},${y - 60} l0,8`, 1.1, 0.14) +
    seam(`M${x + 16},${y - 66} l0,9`, 1.1, 0.14) +
    light(`M${x + 10},${y - 66} q6,-3 11,3 q-6,-2 -11,-3 Z`, 0.1);
}

function lrPouffe(c) {
  const x = ACC_X;
  const y = STAND_Y + 4;
  return contact(x, 22, 0.2) +
    ellipse(x, y - 2, 20, 8, c.body) +
    box(x - 20, y - 14, 40, 12, c.body) +
    ellipse(x, y - 14, 20, 7, c.top) +
    `<ellipse cx="${x}" cy="${y - 14}" rx="20" ry="7" fill="none" stroke="rgba(0,0,0,0.1)" stroke-width="1"/>` +
    seam(`M${x - 9},${y - 16} l0,11`, 1, 0.12) +
    seam(`M${x + 9},${y - 16} l0,11`, 1, 0.12) +
    boxShade(x - 20, y - 4, 40, 3, 0.12);
}

/* -- extra accents for the original rooms -------------------------------- */

function bedBeanbag(c) {
  const x = ACC_X;
  const y = STAND_Y + 2;
  return contact(x, 26, 0.22) +
    ellipse(x, y - 8, 26, 18, c.body) +
    ellipse(x, y - 20, 16, 9, c.top) +
    light(`M${x - 12},${y - 24} q12,-5 22,2 q-11,-3 -22,-2 Z`, 0.12) +
    seam(`M${x - 16},${y - 6} q16,7 30,-2`, 1.1, 0.12);
}

function studioPaintCans(c) {
  const x = ACC_X;
  const y = STAND_Y;
  return contact(x, 20, 0.2) +
    box(x - 16, y - 16, 32, 16, c.can1, 2) +
    ellipse(x, y - 16, 16, 4, c.can1) +
    box(x - 4, y - 30, 26, 14, c.can2, 2) +
    ellipse(x + 9, y - 30, 13, 3.5, c.can2) +
    fill(`M${x - 16},${y - 10} q-4,6 0,12 q4,-6 3,-12 Z`, c.drip) +
    boxShade(x - 16, y - 2, 32, 3, 0.12) +
    boxLight(x - 16, y - 16, 32, 3, 0.12) +
    boxLight(x - 4, y - 30, 26, 3, 0.12);
}

function kitchenStool(c) {
  const x = ACC_X;
  const y = STAND_Y;
  return contact(x, 18, 0.2) +
    box(x - 13, y - 15, 5, 15, c.legs) +
    box(x + 8, y - 15, 5, 15, c.legs) +
    box(x - 11, y - 8, 22, 3, c.legs) +
    box(x - 16, y - 22, 32, 7, c.seat, 2) +
    boxLight(x - 16, y - 22, 32, 2.5, 0.16) +
    boxShade(x - 16, y - 16, 32, 2, 0.12);
}

function libraryFern(c) {
  const x = ACC_X;
  const baseY = STAND_Y - 20;
  const frond = (dx, dy, bend) => `<path d="M${x},${baseY} q${bend},${dy * 0.5} ${dx},${dy}" ` +
    `fill="none" stroke="${c.fronds}" stroke-width="2.6" stroke-linecap="round"/>`;
  return contact(x, 16, 0.2) +
    fill(`M${x - 11},${STAND_Y} l2,-18 l18,0 l2,18 Z`, c.pot) +
    box(x - 13, baseY - 4, 26, 5, c.rim, 1) +
    frond(-20, -30, -14) +
    frond(-11, -40, -6) +
    frond(0, -44, 0) +
    frond(11, -40, 6) +
    frond(20, -30, 14) +
    frond(-16, -20, -10) +
    frond(16, -20, 10) +
    light(`M${x - 3},${baseY - 40} q4,-2 7,2 q-4,-2 -7,-2 Z`, 0.12);
}

/* ---------------------------------------------------------------- catalogue */

// One starter per slot per room, so a room is furnished the moment it opens;
// the rest are bought. Prices sit against the level curve in points.js, like
// the wardrobe's — a genuine saving goal, not an impulse buy.
/** Compact part list — [key, label, default] rather than an object apiece,
 *  because the catalogue below is 200-odd of them and the shape never varies. */
const parts = (...triples) => triples.map(([key, name, def]) => ({ key, name, default: def }));

export const HOUSE_ITEMS = [
  {
    id: 'bd-wall-window', roomId: 'bedroom', slot: 'wall', name: 'Curtained Window',
    price: 0, source: 'starter', draw: bedWindow,
    parts: parts(['frame', 'Frame', '#e8e2d6'], ['sky', 'Sky', '#9fd0e8'],
      ['land', 'Hills', '#a8cf9a'], ['curtains', 'Curtains', '#c96f7a'],
      ['rail', 'Curtain rail', '#8a6a4e']),
  },
  {
    id: 'bd-furn-bed', roomId: 'bedroom', slot: 'furniture', name: 'Bed',
    price: 0, source: 'starter', draw: bedBed,
    parts: parts(['frame', 'Frame', '#8a6a4e'], ['mattress', 'Mattress', '#f0ece2'],
      ['duvet', 'Duvet', '#7fa7c4'], ['pillow', 'Pillow', '#f7f4ec']),
  },
  {
    id: 'bd-acc-rug', roomId: 'bedroom', slot: 'accent', name: 'Round Rug',
    price: 0, source: 'starter', draw: bedRug,
    parts: parts(['outer', 'Outer ring', '#c2708a'], ['middle', 'Middle ring', '#d98fa4'],
      ['inner', 'Centre', '#f0b9c6']),
  },
  {
    id: 'bd-wall-photos', roomId: 'bedroom', slot: 'wall', name: 'Photo Wall',
    price: 220, source: 'store', draw: bedPhotos,
    parts: parts(['frame1', 'Frame, top left', '#d8c49a'],
      ['pic1', 'Photo, top left', '#7d9bb5'], ['frame2', 'Frame, top right', '#8a6a4e'],
      ['pic2', 'Photo, top right', '#a8926f'], ['frame3', 'Frame, lower left', '#c2a0a8'],
      ['pic3', 'Photo, lower left', '#88a58a'], ['frame4', 'Frame, lower right', '#7f8f9e'],
      ['pic4', 'Photo, lower right', '#c4a37c']),
  },
  {
    id: 'bd-wall-clock', roomId: 'bedroom', slot: 'wall', name: 'Wall Clock',
    price: 260, source: 'store', draw: bedClock,
    parts: parts(['case', 'Case', '#5f4b38'], ['face', 'Face', '#f2ece0']),
  },
  {
    id: 'bd-furn-wardrobe', roomId: 'bedroom', slot: 'furniture', name: 'Wardrobe',
    price: 480, source: 'store', draw: bedWardrobe,
    parts: parts(['carcass', 'Carcass', '#8a6a4e'], ['trim', 'Cornice & plinth', '#7a5c42'],
      ['doors', 'Doors', '#9c7a58'], ['panels', 'Door panels', '#8e6e4e'],
      ['knobs', 'Knobs', '#e0c887']),
  },
  {
    id: 'bd-furn-dresser', roomId: 'bedroom', slot: 'furniture', name: 'Dresser',
    price: 520, source: 'store', draw: bedDresser,
    parts: parts(['body', 'Body', '#9c7346'], ['drawers', 'Drawers', '#b08a58'],
      ['handles', 'Handles', '#5f4529'], ['plinth', 'Plinth', '#83612f'],
      ['mirrorFrame', 'Mirror frame', '#7a5c3c'], ['glass', 'Glass', '#bcd2dd']),
  },
  {
    id: 'bd-acc-plant', roomId: 'bedroom', slot: 'accent', name: 'Potted Plant',
    price: 180, source: 'store', draw: bedPlant,
    parts: parts(['pot', 'Pot', '#c07a52'], ['rim', 'Pot rim', '#d18f63'],
      ['leaves', 'Leaves', '#5f9455']),
  },
  {
    id: 'bd-acc-lamp', roomId: 'bedroom', slot: 'accent', name: 'Floor Lamp',
    price: 240, source: 'store', draw: bedLamp,
    parts: parts(['shade', 'Shade', '#e8cf9a'], ['shadeUnder', 'Shade underside', '#c9ab74'],
      ['stem', 'Stem', '#5c5148'], ['base', 'Base', '#4a4038']),
  },

  {
    id: 'st-wall-sketches', roomId: 'studio', slot: 'wall', name: 'Pinned Sketches',
    price: 0, source: 'starter', draw: studioSketches,
    parts: parts(['paper', 'Sheets', '#f4f0e4'], ['paperAlt', 'Sheets, warmer', '#efe8d8'],
      ['pins', 'Pins', '#c85a4a']),
  },
  {
    id: 'st-furn-easel', roomId: 'studio', slot: 'furniture', name: 'Easel',
    price: 0, source: 'starter', draw: studioEasel,
    parts: parts(['wood', 'Frame', '#a8814f'], ['woodDark', 'Back leg', '#8d6a3f'],
      ['canvas', 'Canvas', '#f6f2e6'], ['hills', 'Hills', '#8fb98a'],
      ['sun', 'Sun', '#f2c65c'], ['sky', 'Sky band', '#7aa9c6']),
  },
  {
    id: 'st-acc-dropcloth', roomId: 'studio', slot: 'accent', name: 'Drop Cloth',
    price: 0, source: 'starter', draw: studioPaintRug,
    parts: parts(['cloth', 'Cloth', '#ded7c6'], ['splat1', 'Splash, red', '#d0604f'],
      ['splat2', 'Splash, blue', '#4f86bd'], ['splat3', 'Splash, yellow', '#e0b34a'],
      ['splat4', 'Splash, green', '#6fa86a']),
  },
  {
    id: 'st-wall-shelf', roomId: 'studio', slot: 'wall', name: 'Paint Shelf',
    price: 240, source: 'store', draw: studioPaintShelf,
    parts: parts(['shelf', 'Shelf', '#9c8a70'], ['brackets', 'Brackets', '#8a7a62'],
      ['jar1', 'Jar, red', '#c8523f'], ['jar2', 'Jar, blue', '#3f7fb5'],
      ['jar3', 'Jar, yellow', '#e0b34a'], ['jar4', 'Jar, green', '#5f9455'],
      ['lids', 'Lids', '#8d8478'], ['brushes', 'Brush handles', '#a9803f'],
      ['pot', 'Brush pot', '#8d6a45']),
  },
  {
    id: 'st-wall-window', roomId: 'studio', slot: 'wall', name: 'North Window',
    price: 300, source: 'store', draw: studioWindow,
    parts: parts(['frame', 'Frame', '#e6e0d2'], ['sky', 'Sky', '#b6d8e6'],
      ['land', 'Hills', '#8fae7f'], ['sill', 'Sill', '#cfc7b6']),
  },
  {
    id: 'st-furn-desk', roomId: 'studio', slot: 'furniture', name: 'Drafting Desk',
    price: 520, source: 'store', draw: studioDesk,
    parts: parts(['wood', 'Frame', '#a07a4e'], ['board', 'Board', '#f4efe1'],
      ['ledge', 'Pencil ledge', '#8d6a3f'], ['pencil', 'Pencil', '#c8894a']),
  },
  {
    id: 'st-furn-trolley', roomId: 'studio', slot: 'furniture', name: 'Paint Trolley',
    price: 440, source: 'store', draw: studioTrolley,
    parts: parts(['frame', 'Frame', '#8f97a1'], ['shelves', 'Shelves', '#b3bac2'],
      ['tube1', 'Tube, red', '#c8523f'], ['tube2', 'Tube, blue', '#3f7fb5'],
      ['tube3', 'Tube, yellow', '#e0b34a'], ['tube4', 'Tube, green', '#5f9455'],
      ['tube5', 'Tube, purple', '#8b5ea8'], ['jar', 'Jar', '#6fa86a'],
      ['wheels', 'Wheels', '#4c525a']),
  },
  {
    id: 'st-acc-canvases', roomId: 'studio', slot: 'accent', name: 'Stacked Canvases',
    price: 200, source: 'store', draw: studioCanvases,
    parts: parts(['edge', 'Canvas edges', '#d8cfba'], ['face', 'Canvas face', '#f2ecdc'],
      ['painting', 'Painting', '#7fa8c4'], ['sun', 'Sun', '#e8b658'],
      ['leaning', 'Leaning canvas', '#c4b699']),
  },
  {
    id: 'st-acc-stool', roomId: 'studio', slot: 'accent', name: 'Wooden Stool',
    price: 190, source: 'store', draw: studioStool,
    parts: parts(['seat', 'Seat', '#c2954d'], ['legs', 'Legs', '#a9803f']),
  },

  {
    id: 'kt-wall-pans', roomId: 'kitchen', slot: 'wall', name: 'Hanging Pans',
    price: 0, source: 'starter', draw: kitchenPans,
    parts: parts(['rail', 'Rail', '#7a6a58'], ['steel', 'Steel pans', '#7d858f'],
      ['steelRim', 'Steel rims', '#98a1ab'], ['copper', 'Copper pan', '#c08048'],
      ['copperRim', 'Copper rim', '#d99a5e'], ['handles', 'Handles', '#4a5058']),
  },
  {
    id: 'kt-furn-stove', roomId: 'kitchen', slot: 'furniture', name: 'Stove',
    price: 0, source: 'starter', draw: kitchenStove,
    parts: parts(['body', 'Body', '#d9dade'], ['hob', 'Hob', '#eceef1'],
      ['door', 'Oven door', '#3d4148'], ['window', 'Oven window', '#6f7885'],
      ['handle', 'Handle', '#9aa1ab'], ['burners', 'Burners', '#4a4f57'],
      ['knobs', 'Knobs', '#7f868f']),
  },
  {
    id: 'kt-acc-mat', roomId: 'kitchen', slot: 'accent', name: 'Floor Mat',
    price: 0, source: 'starter', draw: kitchenMat,
    parts: parts(['border', 'Border', '#c9793f'], ['field', 'Field', '#e0995c']),
  },
  {
    id: 'kt-wall-spices', roomId: 'kitchen', slot: 'wall', name: 'Spice Shelf',
    price: 250, source: 'store', draw: kitchenSpices,
    parts: parts(['shelf', 'Shelves', '#a8907a'], ['jar1', 'Jar 1', '#c8683f'],
      ['jar2', 'Jar 2', '#d8b04a'], ['jar3', 'Jar 3', '#7f9a4f'], ['jar4', 'Jar 4', '#a84f3f'],
      ['jar5', 'Jar 5', '#c9a06a'], ['jar6', 'Jar 6', '#6f8f5f'], ['lids', 'Lids', '#6d6055']),
  },
  {
    id: 'kt-wall-window', roomId: 'kitchen', slot: 'wall', name: 'Kitchen Window',
    price: 310, source: 'store', draw: kitchenWindow,
    parts: parts(['frame', 'Frame', '#f0ebdd'], ['sky', 'Sky', '#a6d2e0'],
      ['land', 'Hills', '#93b884'], ['sill', 'Sill', '#e0d8c6'], ['pot', 'Pot', '#c07a52'],
      ['plant', 'Plant', '#5f9455'], ['plantLight', 'Plant, lighter', '#6faa5f']),
  },
  {
    id: 'kt-furn-fridge', roomId: 'kitchen', slot: 'furniture', name: 'Fridge',
    price: 560, source: 'store', draw: kitchenFridge,
    parts: parts(['body', 'Body', '#e2e5e9'], ['handles', 'Handles', '#8f97a1'],
      ['note', 'Note', '#f6f2e6'], ['magnet1', 'Magnet, red', '#c8523f'],
      ['magnet2', 'Magnet, blue', '#3f7fb5'], ['plinth', 'Plinth', '#c2c8cf']),
  },
  {
    id: 'kt-furn-counter', roomId: 'kitchen', slot: 'furniture', name: 'Sink Counter',
    price: 500, source: 'store', draw: kitchenCounter,
    parts: parts(['cabinet', 'Cabinet', '#c9a375'], ['worktop', 'Worktop', '#4f5560'],
      ['sink', 'Sink', '#9aa3ad'], ['tap', 'Tap', '#b3bac2'],
      ['drawers', 'Drawer fronts', '#dcbb8e'], ['handles', 'Handles', '#7d6041']),
  },
  {
    id: 'kt-acc-herbs', roomId: 'kitchen', slot: 'accent', name: 'Potted Herbs',
    price: 200, source: 'store', draw: kitchenHerb,
    parts: parts(['pots', 'Outer pots', '#c07a52'], ['potMiddle', 'Middle pot', '#b9704a'],
      ['rim', 'Pot rims', '#d18f63'], ['leaves', 'Leaves', '#5f9455'],
      ['leavesLight', 'Leaves, lighter', '#6faa5f']),
  },
  {
    id: 'kt-acc-crate', roomId: 'kitchen', slot: 'accent', name: 'Veg Crate',
    price: 230, source: 'store', draw: kitchenCrate,
    parts: parts(['wood', 'Slats', '#b08a58'], ['ends', 'End posts', '#9c7648'],
      ['cabbage', 'Cabbage', '#8fae5f'], ['tomatoes', 'Tomatoes', '#c8503f'],
      ['carrots', 'Carrots', '#e08a3c']),
  },

  {
    id: 'lb-wall-painting', roomId: 'library', slot: 'wall', name: 'Framed Landscape',
    price: 0, source: 'starter', draw: libraryPainting,
    parts: parts(['frame', 'Gilt frame', '#c9a253'], ['mount', 'Inner frame', '#8a6f3c'],
      ['sky', 'Sky', '#4d6b7d'], ['hills', 'Hills', '#3f5c4a'], ['sun', 'Sun', '#e8d18a'],
      ['foreground', 'Foreground', '#33493c']),
  },
  {
    id: 'lb-furn-bookcase', roomId: 'library', slot: 'furniture', name: 'Bookcase',
    price: 0, source: 'starter', draw: libraryBookcase,
    parts: parts(['wood', 'Carcass', '#5b3f2c'], ['back', 'Back panel', '#3f2b1d'],
      ['spine1', 'Spine, red', '#b8524a'], ['spine2', 'Spine, blue', '#3f6f92'],
      ['spine3', 'Spine, gold', '#d0a24e'], ['spine4', 'Spine, green', '#6a8f5c'],
      ['spine5', 'Spine, purple', '#8b5ea8'], ['spine6', 'Spine, orange', '#c4713a'],
      ['spine7', 'Spine, teal', '#4f7f7a']),
  },
  {
    id: 'lb-acc-books', roomId: 'library', slot: 'accent', name: 'Stack of Books',
    price: 0, source: 'starter', draw: libraryBookStack,
    parts: parts(['book1', 'Bottom book', '#8b5ea8'], ['book2', 'Second book', '#b8524a'],
      ['book3', 'Third book', '#3f6f92'], ['book4', 'Top book', '#d0a24e']),
  },
  {
    id: 'lb-wall-sconces', roomId: 'library', slot: 'wall', name: 'Candle Sconces',
    price: 280, source: 'store', draw: librarySconces,
    parts: parts(['backplate', 'Backplates', '#8a6f45'], ['bracket', 'Brackets', '#a9803f'],
      ['candles', 'Candles', '#f4eeda'], ['flames', 'Flames', '#ffcf6a']),
  },
  {
    id: 'lb-wall-arch', roomId: 'library', slot: 'wall', name: 'Arched Window',
    price: 360, source: 'store', draw: libraryArch,
    parts: parts(['frame', 'Frame', '#7d6448'], ['sky', 'Night sky', '#22304e'],
      ['moon', 'Moon', '#e8e2c4'], ['land', 'Treeline', '#2c3a26'],
      ['sill', 'Sill', '#8a6f52']),
  },
  {
    id: 'lb-furn-desk', roomId: 'library', slot: 'furniture', name: 'Reading Desk',
    price: 580, source: 'store', draw: libraryDesk,
    parts: parts(['wood', 'Pedestals', '#7d5636'], ['top', 'Desktop', '#8d6242'],
      ['drawers', 'Drawer fronts', '#9c7048'], ['handles', 'Handles', '#4f3722'],
      ['book', 'Open book', '#faf5e8'], ['lampShade', 'Lamp shade', '#2f7a52'],
      ['lampBrass', 'Lamp brass', '#c9a253']),
  },
  {
    id: 'lb-furn-globe', roomId: 'library', slot: 'furniture', name: 'Standing Globe',
    price: 620, source: 'store', draw: libraryGlobe,
    parts: parts(['stand', 'Stand', '#6b4a30'], ['ocean', 'Ocean', '#3f7fb5'],
      ['land', 'Land', '#5f9455'], ['landLight', 'Land, lighter', '#6faa5f'],
      ['meridian', 'Meridian', '#c9a253']),
  },
  {
    id: 'lb-acc-rug', roomId: 'library', slot: 'accent', name: 'Patterned Rug',
    price: 260, source: 'store', draw: libraryRug,
    parts: parts(['border', 'Border', '#a8524a'], ['field', 'Field', '#c46a56'],
      ['trim', 'Trim', '#f0d08a'], ['centre', 'Centre', '#8d3f3a']),
  },
  {
    id: 'lb-acc-candelabra', roomId: 'library', slot: 'accent', name: 'Candelabra',
    price: 300, source: 'store', draw: libraryCandelabra,
    parts: parts(['base', 'Base', '#7a6242'], ['stem', 'Stem', '#8a6f45'],
      ['cups', 'Candle cups', '#a9803f'], ['candles', 'Candles', '#f0e8d2'],
      ['flames', 'Flames', '#ffcf6a']),
  },

  /* -- extra accents for the original rooms ----------------------------- */
  {
    id: 'bd-acc-beanbag', roomId: 'bedroom', slot: 'accent', name: 'Bean Bag',
    price: 260, source: 'store', draw: bedBeanbag,
    parts: parts(['body', 'Body', '#c2708a'], ['top', 'Top panel', '#d98fa4']),
  },
  {
    id: 'st-acc-paintcans', roomId: 'studio', slot: 'accent', name: 'Paint Tins',
    price: 200, source: 'store', draw: studioPaintCans,
    parts: parts(['can1', 'Lower tin', '#5f86bd'], ['can2', 'Upper tin', '#d0604f'],
      ['drip', 'Drip', '#e0b34a']),
  },
  {
    id: 'kt-acc-stool', roomId: 'kitchen', slot: 'accent', name: 'Step Stool',
    price: 220, source: 'store', draw: kitchenStool,
    parts: parts(['seat', 'Seat', '#c2b089'], ['legs', 'Legs', '#8a7a5c']),
  },
  {
    id: 'lb-acc-fern', roomId: 'library', slot: 'accent', name: 'Potted Fern',
    price: 240, source: 'store', draw: libraryFern,
    parts: parts(['pot', 'Pot', '#a9683f'], ['rim', 'Pot rim', '#bd7c4e'],
      ['fronds', 'Fronds', '#5f8c4a']),
  },

  /* -- living room ------------------------------------------------------ */
  {
    id: 'lr-wall-canvas', roomId: 'livingroom', slot: 'wall', name: 'Landscape Canvas',
    price: 0, source: 'starter', draw: lrCanvas,
    parts: parts(['frame', 'Frame', '#e6dcc8'], ['sky', 'Sky', '#bcd6e2'],
      ['hills', 'Hills', '#8fb083'], ['sun', 'Sun', '#f2ce6a']),
  },
  {
    id: 'lr-furn-sofa', roomId: 'livingroom', slot: 'furniture', name: 'Sofa',
    price: 0, source: 'starter', draw: lrSofa,
    parts: parts(['body', 'Frame', '#6f8fa6'], ['cushions', 'Cushions', '#8fb0c4'],
      ['legs', 'Legs', '#5a4432']),
  },
  {
    id: 'lr-acc-table', roomId: 'livingroom', slot: 'accent', name: 'Coffee Table',
    price: 0, source: 'starter', draw: lrTable,
    parts: parts(['top', 'Top', '#9c7048'], ['legs', 'Legs', '#7a5636'],
      ['item', 'Books & mug', '#c86f5e']),
  },
  {
    id: 'lr-wall-shelf', roomId: 'livingroom', slot: 'wall', name: 'Floating Shelf',
    price: 240, source: 'store', draw: lrShelf,
    parts: parts(['shelf', 'Shelf', '#9c7048'], ['books', 'Books', '#c07a52'],
      ['vase', 'Vase', '#7fa2b8'], ['plant', 'Sprig', '#6f9c5a']),
  },
  {
    id: 'lr-wall-clock', roomId: 'livingroom', slot: 'wall', name: 'Sunburst Clock',
    price: 280, source: 'store', draw: lrClock,
    parts: parts(['rays', 'Rays', '#c9a253'], ['face', 'Face', '#f2ece0'],
      ['hands', 'Hands', '#3a2f24']),
  },
  {
    id: 'lr-furn-tv', roomId: 'livingroom', slot: 'furniture', name: 'TV & Console',
    price: 520, source: 'store', draw: lrTv,
    parts: parts(['cabinet', 'Cabinet', '#8a6a4e'], ['screen', 'Screen', '#3c6a86'],
      ['screenImage', 'On screen', '#7fae7a']),
  },
  {
    id: 'lr-furn-armchair', roomId: 'livingroom', slot: 'furniture', name: 'Armchair',
    price: 460, source: 'store', draw: lrArmchair,
    parts: parts(['body', 'Frame', '#b06a58'], ['cushion', 'Cushion', '#d0917c'],
      ['legs', 'Legs', '#5a4432']),
  },
  {
    id: 'lr-acc-plant', roomId: 'livingroom', slot: 'accent', name: 'Monstera',
    price: 220, source: 'store', draw: lrPlant,
    parts: parts(['pot', 'Pot', '#c88a5a'], ['rim', 'Pot rim', '#d69c6a'],
      ['stem', 'Stems', '#5f8c4a'], ['leaves', 'Leaves', '#5f9455']),
  },
  {
    id: 'lr-acc-pouffe', roomId: 'livingroom', slot: 'accent', name: 'Round Pouffe',
    price: 200, source: 'store', draw: lrPouffe,
    parts: parts(['body', 'Sides', '#c28a6a'], ['top', 'Top', '#d6a082']),
  },
];

const ITEM_BY_ID = new Map(HOUSE_ITEMS.map((i) => [i.id, i]));
const PET_BY_ID = new Map(PETS.map((p) => [p.id, p]));

/** Every prop for one room slot, in catalogue order. */
export function itemsFor(roomId, slot) {
  return HOUSE_ITEMS.filter((i) => i.roomId === roomId && i.slot === slot);
}

/** The free prop a room falls back to for a slot. */
export function starterFor(roomId, slot) {
  return itemsFor(roomId, slot).find((i) => i.source === 'starter') ?? null;
}

export function defaultHouse() {
  const props = {};
  for (const room of ROOMS) {
    props[room.id] = {};
    for (const slot of PROP_SLOTS) props[room.id][slot] = starterFor(room.id, slot)?.id ?? null;
  }
  return {
    room: ROOMS[0].id,
    lighting: 'daylight',
    pet: 'cat',
    // Whether the figure is drawn in the scene at all — some players want the
    // room and pet to be the whole picture.
    hideAvatar: false,
    // A name the player gives whichever pet is currently keeping them company.
    petName: '',
    // The four wellbeing meters (see PET_NEEDS). Kept here with the rest of the
    // scene state so it saves and migrates on the same path as everything else.
    petStats: defaultPetStats(),
    props,
    // Sparse on purpose: only parts actually changed are stored, so a player
    // who never touched the bed keeps following its default and a later change
    // to that default still reaches them.
    colours: {},
    // Starters are listed so the store UI has one rule — owned means listed —
    // rather than "listed, or free, or…".
    unlocked: [
      ...HOUSE_ITEMS.filter((i) => i.source === 'starter').map((i) => i.id),
      ...LIGHTING.filter((l) => l.source === 'starter').map((l) => l.id),
      ...PETS.filter((p) => p.source === 'starter').map((p) => p.id),
    ],
  };
}

/**
 * Everything the current scene is actually showing that can be recoloured, in
 * draw order. Derived here rather than reassembled in game.js, so the panel
 * can never offer a prop that is not on screen — switching rooms swaps the
 * whole set, and a pet can be absent entirely.
 */
export function colourablesIn(house) {
  const h = house ?? defaultHouse();
  const room = ROOM_BY_ID.get(h.room) ?? ROOMS[0];
  const chosen = h.props?.[room.id] ?? {};
  const out = [{ id: roomColourId(room.id), name: room.name, parts: room.parts }];
  for (const slot of PROP_SLOTS) {
    const item = ITEM_BY_ID.get(chosen[slot]) ?? starterFor(room.id, slot);
    if (item && item.roomId === room.id) out.push({ id: item.id, name: item.name, parts: item.parts });
  }
  const pet = PET_BY_ID.get(h.pet);
  if (pet) out.push({ id: petColourId(pet.id), name: pet.name, parts: pet.parts });
  return out;
}

/* ------------------------------------------------------------------ render */

const DEFS =
  '<defs>' +
  '<linearGradient id="wallFade" x1="0" y1="0" x2="0" y2="1">' +
  '<stop offset="0" stop-color="rgba(255,255,255,0.10)"/>' +
  '<stop offset="1" stop-color="rgba(0,0,0,0.10)"/>' +
  '</linearGradient>' +
  '<radialGradient id="candleGlow" cx="0.5" cy="0.55" r="0.6">' +
  '<stop offset="0" stop-color="rgba(255,196,110,0.42)"/>' +
  '<stop offset="1" stop-color="rgba(255,196,110,0)"/>' +
  '</radialGradient>' +
  // Sunset lighting: magenta up high, hot amber low.
  '<linearGradient id="sunsetFade" x1="0" y1="0" x2="0" y2="1">' +
  '<stop offset="0" stop-color="rgba(196,74,132,0.34)"/>' +
  '<stop offset="0.55" stop-color="rgba(255,120,80,0.20)"/>' +
  '<stop offset="1" stop-color="rgba(255,180,110,0.12)"/>' +
  '</linearGradient>' +
  // Aurora lighting: a green-to-violet shimmer strongest across the back wall.
  '<linearGradient id="auroraGlow" x1="0" y1="0" x2="0.3" y2="1">' +
  '<stop offset="0" stop-color="rgba(92,224,168,0.26)"/>' +
  '<stop offset="0.5" stop-color="rgba(96,176,220,0.14)"/>' +
  '<stop offset="1" stop-color="rgba(150,110,220,0.18)"/>' +
  '</linearGradient>' +
  // Floor darkens toward the back wall (ambient occlusion in the crease) and
  // toward the two side walls, so the plane reads as receding rather than flat.
  `<linearGradient id="floorDepth" x1="0" y1="${FLOOR_Y}" x2="0" y2="${H}" gradientUnits="userSpaceOnUse">` +
  '<stop offset="0" stop-color="rgba(0,0,0,0.22)"/>' +
  '<stop offset="0.35" stop-color="rgba(0,0,0,0.04)"/>' +
  '<stop offset="1" stop-color="rgba(255,255,255,0.05)"/>' +
  '</linearGradient>' +
  // A soft top-down sheen for the side walls, brighter where they meet the
  // ceiling and falling into shadow at the floor.
  `<linearGradient id="sideFade" x1="0" y1="${CEIL_Y}" x2="0" y2="${FLOOR_Y}" gradientUnits="userSpaceOnUse">` +
  '<stop offset="0" stop-color="rgba(255,255,255,0.10)"/>' +
  '<stop offset="1" stop-color="rgba(0,0,0,0.16)"/>' +
  '</linearGradient>' +
  `<clipPath id="floorClip"><polygon points="${SIDE},${FLOOR_Y} ${W - SIDE},${FLOOR_Y} ${W},${H} 0,${H}"/></clipPath>` +
  '</defs>';

/**
 * The whole scene: room, props, the avatar standing in it, pet, and the
 * lighting wash over the top.
 *
 * Nothing here carries `data-slot` except the avatar's own groups — game.js
 * delegates part-recolouring clicks on that attribute, and a prop wearing one
 * would hijack it. Props announce themselves with `data-prop` instead, which
 * is a separate delegation: clicking the scene picks an OBJECT, and its parts
 * are then chosen from a list. Wrapping each individual part would be the
 * obvious alternative and is the wrong one — a drawer handle is three pixels
 * wide, and the shading washes sit on top of the parts they shade, so half the
 * clicks would land on an overlay rather than on the thing under it.
 *
 * @param {object} house      S.save.avatar.house
 * @param {object} customize  S.save.avatar.customize
 * @returns {string}  a full <svg>...</svg> string, viewBox 0 0 260 216
 */
export function buildRoomSVG(house, customize) {
  const h = house ?? defaultHouse();
  const overrides = h.colours ?? {};
  const room = ROOM_BY_ID.get(h.room) ?? ROOMS[0];
  const chosen = h.props?.[room.id] ?? {};
  const prop = (slot) => {
    const item = ITEM_BY_ID.get(chosen[slot]) ?? starterFor(room.id, slot);
    if (!item || item.roomId !== room.id) return '';
    return `<g data-prop="${item.id}">${item.draw(resolveColours(item.id, item.parts, overrides))}</g>`;
  };

  const pet = PET_BY_ID.get(h.pet);

  // Back to front: anything later covers anything earlier.
  const scene = [
    `<g data-prop="${roomColourId(room.id)}">` +
      roomShell(room, resolveColours(roomColourId(room.id), room.parts, overrides)) + '</g>',
    prop('wall'),
    prop('furniture'),
    // The avatar can step out of the scene entirely — some players want the
    // room and pet as the subject, not the figure. Mirrors the pet's own
    // always-optional treatment just below.
    h.hideAvatar ? '' : `<g transform="${AVATAR_TRANSFORM}">${avatarInner(customize)}</g>`,
    pet
      ? `<g data-prop="${petColourId(pet.id)}">` +
        petMarkup(pet.id, resolveColours(petColourId(pet.id), pet.parts, overrides)) + '</g>'
      : '',
    pet ? petEmote(h.petStats) : '',
    prop('accent'),
    // Last, and over everything — so it must not swallow the taps meant for
    // what is underneath it.
    `<g pointer-events="none">${lightingOverlay(h.lighting)}</g>`,
  ];

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${DEFS}${scene.join('')}</svg>`;
}
