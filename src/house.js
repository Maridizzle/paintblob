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
const H = 216;
const FLOOR_Y = 150;   // where the back wall meets the floor
const STAND_Y = 200;   // the line every figure, prop and pet has its base on

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
const AVATAR_SCALE = 0.8;

// Derived from the avatar's own frame rather than hard-coded, so if the figure
// ever grows she stays standing on the floor instead of sinking through it.
const AVATAR_TRANSFORM =
  `translate(${AVATAR_CX},${STAND_Y}) scale(${AVATAR_SCALE}) ` +
  `translate(${-AVATAR_FRAME.centreX},${-AVATAR_FRAME.footY})`;

const n = (v) => Math.round(v * 100) / 100;

/** Fills a shape with a flat colour. Props are not player-recoloured, so the
 *  colour lives on the shape rather than on a parent group. */
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

/** The soft dark ellipse under anything resting on the floor. Without it
 *  props look pasted on rather than standing in the room. */
const contact = (cx, w, a = 0.18) =>
  `<ellipse cx="${n(cx)}" cy="${STAND_Y + 1}" rx="${n(w)}" ry="3" fill="rgba(0,0,0,${a})"/>`;

/* --------------------------------------------------------------- the rooms */

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
];

const ROOM_BY_ID = new Map(ROOMS.map((r) => [r.id, r]));

/** Back wall, skirting board and floor. Everything else stands on top. */
function roomShell(room) {
  const out = [
    box(0, 0, W, FLOOR_Y, room.wall),
    // The wall is lighter towards the top, which reads as light falling from
    // above and stops a big flat rectangle looking like a colour swatch.
    `<rect x="0" y="0" width="${W}" height="${FLOOR_Y}" fill="url(#wallFade)"/>`,
    box(0, FLOOR_Y, W, H - FLOOR_Y, room.floor),
    box(0, FLOOR_Y - 6, W, 6, room.skirting),
    boxShade(0, FLOOR_Y, W, 4, 0.16),
  ];

  if (room.tiled) {
    // Kitchen floor: a grid, converging slightly so it reads as receding.
    for (let i = 0; i <= 8; i++) {
      const x = (i / 8) * W;
      out.push(seam(`M${n(W / 2 + (x - W / 2) * 0.55)},${FLOOR_Y} L${n(x)},${H}`, 1, 0.1));
    }
    for (const y of [158, 170, 186, H - 4]) out.push(seam(`M0,${y} L${W},${y}`, 1, 0.09));
  } else {
    // Floorboards running away from the viewer.
    for (let i = 0; i <= 7; i++) {
      const x = (i / 7) * W;
      out.push(seam(`M${n(W / 2 + (x - W / 2) * 0.5)},${FLOOR_Y} L${n(x)},${H}`, 1.1, 0.13));
    }
  }
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
  return ''; // daylight adds nothing
}

/* -------------------------------------------------------------------- pets */

export const PETS = [
  { id: 'cat', name: 'Cat', price: 0, source: 'starter' },
  { id: 'dog', name: 'Dog', price: 340, source: 'store' },
  { id: 'rabbit', name: 'Rabbit', price: 300, source: 'store' },
  { id: 'bird', name: 'Bird', price: 380, source: 'store' },
];

// All four sit at PET_X on the floor line, at roughly the same visual weight,
// so swapping one for another doesn't change the balance of the scene.

function petMarkup(id) {
  if (id === 'cat') {
    const body = '#4a4a52';
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
      ellipse(PET_X - 3.6, STAND_Y - 23, 1.5, 1.9, '#f5e06a') +
      ellipse(PET_X + 3.6, STAND_Y - 23, 1.5, 1.9, '#f5e06a') +
      circle(PET_X, STAND_Y - 19.5, 1.2, 'rgba(255,150,160,0.9)') +
      light(`M${PET_X - 7},${STAND_Y - 26} q7,-4 14,0 q-7,-3 -14,0 Z`, 0.1);
  }

  if (id === 'dog') {
    const body = '#b0794a';
    return contact(PET_X, 15) +
      fill(`M${PET_X - 13},${STAND_Y} q-2,-17 13,-17 q15,0 13,17 Z`, body) +
      // Ears hang beside the muzzle rather than standing up, so it cannot be
      // read as a second cat.
      circle(PET_X, STAND_Y - 24, 9.5, body) +
      fill(`M${PET_X - 9},${STAND_Y - 28} q-6,2 -5,12 q1,5 5,4 Z`, '#8d5c33') +
      fill(`M${PET_X + 9},${STAND_Y - 28} q6,2 5,12 q-1,5 -5,4 Z`, '#8d5c33') +
      ellipse(PET_X, STAND_Y - 18.5, 5, 4, '#e0c19c') +
      circle(PET_X, STAND_Y - 20.5, 2, '#2a2118') +
      circle(PET_X - 3.6, STAND_Y - 26, 1.5, '#2a2118') +
      circle(PET_X + 3.6, STAND_Y - 26, 1.5, '#2a2118') +
      `<path d="M${PET_X + 12},${STAND_Y - 6} q9,-3 7,-11" fill="none" stroke="${body}" stroke-width="4" stroke-linecap="round"/>` +
      light(`M${PET_X - 6},${STAND_Y - 12} q6,-3 12,0 q-6,10 -12,0 Z`, 0.08);
  }

  if (id === 'rabbit') {
    const body = '#d8d2c8';
    return contact(PET_X, 12) +
      fill(`M${PET_X - 10},${STAND_Y} q-2,-15 11,-15 q13,0 11,15 Z`, body) +
      circle(PET_X, STAND_Y - 20, 8, body) +
      // The ears are the whole identity — long, upright, with pink inners.
      ellipse(PET_X - 4, STAND_Y - 34, 3.2, 11, body) +
      ellipse(PET_X + 4.5, STAND_Y - 35, 3.2, 11, body) +
      ellipse(PET_X - 4, STAND_Y - 34, 1.5, 8, 'rgba(240,160,170,0.8)') +
      ellipse(PET_X + 4.5, STAND_Y - 35, 1.5, 8, 'rgba(240,160,170,0.8)') +
      circle(PET_X - 3, STAND_Y - 21, 1.4, '#3a2f2a') +
      circle(PET_X + 3, STAND_Y - 21, 1.4, '#3a2f2a') +
      circle(PET_X, STAND_Y - 17.5, 1.3, 'rgba(230,140,150,0.9)') +
      circle(PET_X + 11, STAND_Y - 4, 4, 'rgba(255,255,255,0.85)') +
      shade(`M${PET_X - 10},${STAND_Y} q-1,-8 4,-12 q-6,5 -4,12 Z`, 0.08);
  }

  if (id === 'bird') {
    // On a perch, so it reads as a kept bird rather than one that wandered in.
    const stand = '#8a7256';
    const body = '#5fa8d8';
    const py = STAND_Y - 44;
    return contact(PET_X, 11) +
      ellipse(PET_X, STAND_Y - 2, 11, 3.5, stand) +
      box(PET_X - 2, py, 4, STAND_Y - 4 - py, stand) +
      box(PET_X - 12, py - 2, 24, 3, stand, 1.5) +
      ellipse(PET_X + 1, py - 12, 8, 10, body) +
      circle(PET_X + 1, py - 22, 6, body) +
      fill(`M${PET_X + 6},${py - 22} l7,3 l-7,3 Z`, '#f0a83c') +
      circle(PET_X + 3, py - 23.5, 1.5, '#26313a') +
      fill(`M${PET_X - 3},${py - 14} q-7,6 -2,12 q4,-6 4,-11 Z`, '#3f8cbd') +
      `<path d="M${PET_X - 1},${py - 2} l-2,7 M${PET_X + 3},${py - 2} l2,7" stroke="#f0a83c" stroke-width="2" stroke-linecap="round" fill="none"/>` +
      light(`M${PET_X - 3},${py - 26} q6,-4 11,2 q-6,-2 -11,-2 Z`, 0.16);
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

function bedWindow() {
  const frame = '#e8e2d6';
  const cx = WALL_CX;
  return box(cx - 34, 26, 68, 62, frame, 3) +
    box(cx - 30, 30, 60, 54, '#9fd0e8') +
    // Sky through the glass: a horizon and two clouds, so it is unmistakably
    // outside rather than a blue panel.
    box(cx - 30, 66, 60, 18, '#a8cf9a') +
    ellipse(cx - 12, 46, 10, 5, 'rgba(255,255,255,0.85)') +
    ellipse(cx + 12, 55, 8, 4, 'rgba(255,255,255,0.7)') +
    box(cx - 1.5, 30, 3, 54, frame) +
    box(cx - 30, 55, 60, 3, frame) +
    boxShade(cx - 30, 30, 60, 5, 0.12) +
    // Curtains gathered at each edge.
    fill(`M${cx - 44},20 q10,32 4,70 l-12,0 l0,-70 Z`, '#c96f7a') +
    fill(`M${cx + 44},20 q-10,32 -4,70 l12,0 l0,-70 Z`, '#c96f7a') +
    box(cx - 48, 18, 96, 5, '#8a6a4e', 2.5) +
    seam(`M${cx - 38},26 q6,30 2,60`, 1.2, 0.14) +
    seam(`M${cx + 38},26 q-6,30 -2,60`, 1.2, 0.14);
}

function bedBed() {
  const frame = '#8a6a4e';
  const y = STAND_Y;
  return contact(FURN_X, 44, 0.2) +
    // Headboard, then the mattress block, then the duvet and pillow on top.
    box(FURN_X - 44, y - 74, 12, 74, frame, 3) +
    box(FURN_X + 34, y - 40, 10, 40, frame, 3) +
    box(FURN_X - 36, y - 34, 74, 26, '#f0ece2', 3) +
    box(FURN_X - 36, y - 8, 74, 8, frame) +
    fill(`M${FURN_X - 36},${y - 28} q40,-8 74,0 l0,20 l-74,0 Z`, '#7fa7c4') +
    box(FURN_X - 30, y - 44, 30, 16, '#f7f4ec', 5) +
    boxShade(FURN_X - 36, y - 12, 74, 4, 0.14) +
    seam(`M${FURN_X - 20},${y - 26} q0,10 0,16`, 1.1, 0.1) +
    seam(`M${FURN_X + 4},${y - 27} q0,10 0,17`, 1.1, 0.1) +
    boxLight(FURN_X - 30, y - 44, 30, 5, 0.18);
}

function bedRug() {
  return ellipse(ACC_X, STAND_Y + 4, 34, 10, '#c2708a') +
    ellipse(ACC_X, STAND_Y + 4, 23, 6.5, '#d98fa4') +
    ellipse(ACC_X, STAND_Y + 4, 11, 3.2, '#f0b9c6') +
    `<ellipse cx="${ACC_X}" cy="${STAND_Y + 4}" rx="34" ry="10" fill="none" stroke="rgba(0,0,0,0.14)" stroke-width="1"/>`;
}

/* -- studio -------------------------------------------------------------- */

function studioSketches() {
  // Pinned drawings. Blank sheets read as paper but not as *sketches*, so each
  // one carries a recognisable subject drawn in pencil grey.
  const pencil = (d, w = 1.2, a = 0.42) =>
    `<path d="${d}" fill="none" stroke="rgba(60,52,44,${a})" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
  const L = WALL_CX - 44;
  const sheets = [
    { x: L, y: 22, w: 34, h: 42, rot: -3, bg: '#f4f0e4', art: 'face' },
    { x: L + 40, y: 28, w: 30, h: 36, rot: 4, bg: '#efe8d8', art: 'hills' },
    { x: L + 8, y: 72, w: 30, h: 34, rot: 2, bg: '#f4f0e4', art: 'hatch' },
    { x: L + 44, y: 70, w: 34, h: 38, rot: -4, bg: '#efe8d8', art: 'apple' },
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
      circle(cx, s0.y + 4, 2.2, '#c85a4a') +
      circle(cx - 0.6, s0.y + 3.4, 0.8, 'rgba(255,255,255,0.5)') +
      '</g>';
  }).join('');
}

function studioEasel() {
  const wood = '#a8814f';
  const y = STAND_Y;
  return contact(FURN_X, 34, 0.18) +
    // Two front legs splayed and one back leg, then the canvas resting on the
    // ledge — the A-frame is what makes it an easel and not a table.
    `<path d="M${FURN_X - 26},${y} L${FURN_X - 4},${y - 92}" stroke="${wood}" stroke-width="6" stroke-linecap="round" fill="none"/>` +
    `<path d="M${FURN_X + 26},${y} L${FURN_X + 4},${y - 92}" stroke="${wood}" stroke-width="6" stroke-linecap="round" fill="none"/>` +
    `<path d="M${FURN_X + 14},${y} L${FURN_X + 2},${y - 60}" stroke="#8d6a3f" stroke-width="5" stroke-linecap="round" fill="none"/>` +
    box(FURN_X - 30, y - 50, 60, 5, wood, 2) +
    box(FURN_X - 26, y - 96, 52, 46, '#f6f2e6', 1) +
    boxShade(FURN_X - 26, y - 96, 52, 46, 0.06) +
    // A half-painted picture on the canvas.
    fill(`M${FURN_X - 22},${y - 58} q14,-16 24,-4 q8,-12 18,2 l0,6 l-42,0 Z`, '#8fb98a') +
    circle(FURN_X + 10, y - 82, 6, '#f2c65c') +
    box(FURN_X - 22, y - 60, 42, 4, '#7aa9c6') +
    seam(`M${FURN_X - 26},${y - 50} l52,0`, 1.2, 0.18);
}

function studioPaintRug() {
  // A drop cloth with paint on it. The splatters are what name it.
  const cx = ACC_X;
  return ellipse(cx, STAND_Y + 4, 36, 11, '#ded7c6') +
    `<ellipse cx="${cx}" cy="${STAND_Y + 4}" rx="36" ry="11" fill="none" stroke="rgba(0,0,0,0.13)" stroke-width="1"/>` +
    ellipse(cx - 18, STAND_Y + 2, 7, 2.6, '#d0604f') +
    ellipse(cx + 6, STAND_Y + 6, 9, 3, '#4f86bd') +
    ellipse(cx + 22, STAND_Y, 5, 2, '#e0b34a') +
    ellipse(cx - 4, STAND_Y - 2, 4, 1.6, '#6fa86a') +
    circle(cx + 15, STAND_Y + 7, 2, '#d0604f') +
    circle(cx - 27, STAND_Y + 6, 1.6, '#4f86bd');
}

/* -- kitchen ------------------------------------------------------------- */

function kitchenPans() {
  // The rail sits high: hung any lower the biggest pan reached past the floor
  // line and disappeared behind her.
  const rail = 40;
  const steel = '#7d858f';
  const pans = [
    { x: WALL_CX - 28, r: 14, copper: false },
    { x: WALL_CX + 2, r: 11, copper: true },
    { x: WALL_CX + 28, r: 9, copper: false },
  ];
  return box(WALL_CX - 46, rail, 92, 4, '#7a6a58', 2) +
    [-40, 0, 40].map((dx) => circle(WALL_CX + dx, rail + 2, 3, '#6b5c4c')).join('') +
    pans.map((p) => {
      const body = p.copper ? '#c08048' : steel;
      const cy = rail + 16 + p.r * 0.5;
      return (
        // Hook over the rail.
        `<path d="M${p.x},${rail} q0,7 0,10" stroke="#5f6771" stroke-width="2" fill="none"/>` +
        // A round-bottomed pot rather than a tapering bucket, which is what
        // the first pass read as. The rim and the handle do the rest.
        fill(`M${p.x - p.r},${cy - 3} a${p.r},${p.r} 0 0 0 ${p.r * 2},0 Z`, body) +
        box(p.x - p.r - 1.5, cy - 6, p.r * 2 + 3, 4, p.copper ? '#d99a5e' : '#98a1ab', 1.5) +
        // Handle, straight out to the side — the clearest "this is a pan" cue.
        box(p.x + p.r + 1, cy - 5.2, p.r * 0.9, 2.6, '#4a5058', 1.2) +
        light(`M${p.x - p.r * 0.6},${cy - 2} a${p.r * 0.6},${p.r * 0.6} 0 0 0 ${p.r * 0.5},${p.r * 0.5} a${p.r * 0.8},${p.r * 0.8} 0 0 1 -${p.r * 0.5},-${p.r * 0.5} Z`, 0.16)
      );
    }).join('');
}

function kitchenStove() {
  const body = '#d9dade';
  const y = STAND_Y;
  return contact(FURN_X, 36, 0.2) +
    box(FURN_X - 34, y - 62, 68, 62, body, 3) +
    box(FURN_X - 34, y - 66, 68, 6, '#eceef1', 3) +
    // Oven door with a dark window and a handle — the parts that say "oven".
    box(FURN_X - 28, y - 46, 56, 34, '#3d4148', 3) +
    box(FURN_X - 23, y - 41, 46, 22, '#6f7885', 2) +
    boxLight(FURN_X - 23, y - 41, 46, 8, 0.12) +
    box(FURN_X - 30, y - 54, 60, 5, '#9aa1ab', 2.5) +
    // Four burners seen from a shallow angle, on the hob.
    [-18, -6, 6, 18].map((dx, i) =>
      ellipse(FURN_X + dx * 1.4, y - 69 + (i % 2 ? 3 : 0), 7, 2.6, '#4a4f57')).join('') +
    [-18, 18].map((dx) => circle(FURN_X + dx * 1.4, y - 57, 2.6, '#7f868f')).join('') +
    boxShade(FURN_X - 34, y - 12, 68, 12, 0.12);
}

function kitchenMat() {
  const cx = ACC_X;
  return `<rect x="${cx - 36}" y="${STAND_Y - 6}" width="72" height="20" rx="4" fill="#c9793f"/>` +
    `<rect x="${cx - 30}" y="${STAND_Y - 2}" width="60" height="12" rx="3" fill="#e0995c"/>` +
    seam(`M${cx - 36},${STAND_Y + 14} l72,0`, 1.1, 0.16) +
    [-24, -8, 8, 24].map((dx) => seam(`M${cx + dx},${STAND_Y - 6} l0,20`, 1, 0.09)).join('');
}

/* -- library ------------------------------------------------------------- */

function libraryPainting() {
  // A gilt-framed landscape. The frame's double border and the horizon inside
  // are what stop it reading as a window.
  const cx = WALL_CX;
  return boxShade(cx - 40, 24, 82, 66, 0.18) +
    box(cx - 42, 20, 84, 66, '#c9a253', 3) +
    box(cx - 36, 26, 72, 54, '#8a6f3c') +
    box(cx - 33, 29, 66, 48, '#4d6b7d') +
    fill(`M${cx - 33},58 q16,-14 32,-4 q10,-8 34,4 l0,19 l-66,0 Z`, '#3f5c4a') +
    circle(cx + 14, 40, 6, '#e8d18a') +
    fill(`M${cx - 33},68 q20,-6 66,-2 l0,11 l-66,0 Z`, '#33493c') +
    boxLight(cx - 33, 29, 66, 10, 0.07) +
    seam(`M${cx - 36},26 l72,0 l0,54 l-72,0 Z`, 1.2, 0.2);
}

function libraryBookcase() {
  const wood = '#5b3f2c';
  const y = STAND_Y;
  const top = y - 116;
  const shelves = [top + 30, top + 58, top + 86];
  const spines = ['#b8524a', '#3f6f92', '#d0a24e', '#6a8f5c', '#8b5ea8', '#c4713a', '#4f7f7a'];
  let out = contact(FURN_X, 40, 0.22) +
    box(FURN_X - 40, top, 80, y - top, wood, 2) +
    box(FURN_X - 35, top + 5, 70, y - top - 10, '#3f2b1d');
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

function libraryBookStack() {
  // Books lying flat, stacked with a slight offset so the edges read.
  const cx = ACC_X;
  const layers = [
    { w: 44, h: 7, dx: 0, colour: '#8b5ea8' },
    { w: 40, h: 6, dx: 3, colour: '#b8524a' },
    { w: 46, h: 7, dx: -3, colour: '#3f6f92' },
    { w: 34, h: 6, dx: 5, colour: '#d0a24e' },
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

/* ---------------------------------------------------------------- catalogue */

// One starter per slot per room, so a room is furnished the moment it opens;
// the rest are bought. Prices sit against the level curve in points.js, like
// the wardrobe's — a genuine saving goal, not an impulse buy.
export const HOUSE_ITEMS = [
  { id: 'bd-wall-window', roomId: 'bedroom', slot: 'wall', name: 'Curtained Window', price: 0, source: 'starter', draw: bedWindow },
  { id: 'bd-furn-bed', roomId: 'bedroom', slot: 'furniture', name: 'Bed', price: 0, source: 'starter', draw: bedBed },
  { id: 'bd-acc-rug', roomId: 'bedroom', slot: 'accent', name: 'Round Rug', price: 0, source: 'starter', draw: bedRug },

  { id: 'st-wall-sketches', roomId: 'studio', slot: 'wall', name: 'Pinned Sketches', price: 0, source: 'starter', draw: studioSketches },
  { id: 'st-furn-easel', roomId: 'studio', slot: 'furniture', name: 'Easel', price: 0, source: 'starter', draw: studioEasel },
  { id: 'st-acc-dropcloth', roomId: 'studio', slot: 'accent', name: 'Drop Cloth', price: 0, source: 'starter', draw: studioPaintRug },

  { id: 'kt-wall-pans', roomId: 'kitchen', slot: 'wall', name: 'Hanging Pans', price: 0, source: 'starter', draw: kitchenPans },
  { id: 'kt-furn-stove', roomId: 'kitchen', slot: 'furniture', name: 'Stove', price: 0, source: 'starter', draw: kitchenStove },
  { id: 'kt-acc-mat', roomId: 'kitchen', slot: 'accent', name: 'Floor Mat', price: 0, source: 'starter', draw: kitchenMat },

  { id: 'lb-wall-painting', roomId: 'library', slot: 'wall', name: 'Framed Landscape', price: 0, source: 'starter', draw: libraryPainting },
  { id: 'lb-furn-bookcase', roomId: 'library', slot: 'furniture', name: 'Bookcase', price: 0, source: 'starter', draw: libraryBookcase },
  { id: 'lb-acc-books', roomId: 'library', slot: 'accent', name: 'Stack of Books', price: 0, source: 'starter', draw: libraryBookStack },
];

const ITEM_BY_ID = new Map(HOUSE_ITEMS.map((i) => [i.id, i]));

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
    props,
    // Starters are listed so the store UI has one rule — owned means listed —
    // rather than "listed, or free, or…".
    unlocked: [
      ...HOUSE_ITEMS.filter((i) => i.source === 'starter').map((i) => i.id),
      ...LIGHTING.filter((l) => l.source === 'starter').map((l) => l.id),
      ...PETS.filter((p) => p.source === 'starter').map((p) => p.id),
    ],
  };
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
  '</defs>';

/**
 * The whole scene: room, props, the avatar standing in it, pet, and the
 * lighting wash over the top.
 *
 * Nothing here carries `data-slot` except the avatar's own groups — game.js
 * delegates part-recolouring clicks on that attribute, and a prop wearing one
 * would hijack it.
 *
 * @param {object} house      S.save.avatar.house
 * @param {object} customize  S.save.avatar.customize
 * @returns {string}  a full <svg>...</svg> string, viewBox 0 0 260 216
 */
export function buildRoomSVG(house, customize) {
  const h = house ?? defaultHouse();
  const room = ROOM_BY_ID.get(h.room) ?? ROOMS[0];
  const chosen = h.props?.[room.id] ?? {};
  const prop = (slot) => {
    const item = ITEM_BY_ID.get(chosen[slot]) ?? starterFor(room.id, slot);
    return item && item.roomId === room.id ? item.draw() : '';
  };

  // Back to front: anything later covers anything earlier.
  const scene = [
    roomShell(room),
    prop('wall'),
    prop('furniture'),
    `<g transform="${AVATAR_TRANSFORM}">${avatarInner(customize)}</g>`,
    h.pet ? petMarkup(h.pet) : '',
    prop('accent'),
    lightingOverlay(h.lighting),
  ];

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${DEFS}${scene.join('')}</svg>`;
}
