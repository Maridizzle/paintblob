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

/* -- bedroom, bought ------------------------------------------------------ */

function bedPhotos() {
  // A cluster of framed photographs. Different frame colours and one portrait
  // orientation keep it from reading as a single grid.
  const frames = [
    { x: WALL_CX - 40, y: 26, w: 30, h: 36, f: '#d8c49a', pic: '#7d9bb5' },
    { x: WALL_CX - 4, y: 20, w: 40, h: 30, f: '#8a6a4e', pic: '#a8926f' },
    { x: WALL_CX - 26, y: 70, w: 34, h: 28, f: '#c2a0a8', pic: '#88a58a' },
    { x: WALL_CX + 14, y: 58, w: 26, h: 34, f: '#7f8f9e', pic: '#c4a37c' },
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

function bedClock() {
  const cx = WALL_CX;
  const cy = 58;
  const r = 26;
  return circle(cx + 1.5, cy + 2, r, 'rgba(0,0,0,0.18)') +
    circle(cx, cy, r, '#5f4b38') +
    circle(cx, cy, r - 4, '#f2ece0') +
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

function bedWardrobe() {
  const wood = '#8a6a4e';
  const y = STAND_Y;
  const top = y - 118;
  return contact(FURN_X, 36, 0.22) +
    box(FURN_X - 34, top, 68, y - top, wood, 2) +
    box(FURN_X - 36, top - 5, 72, 6, '#7a5c42', 2) +
    // Two doors with a centre gap and a knob each — the wardrobe read.
    box(FURN_X - 30, top + 8, 28, y - top - 20, '#9c7a58', 1.5) +
    box(FURN_X + 2, top + 8, 28, y - top - 20, '#9c7a58', 1.5) +
    box(FURN_X - 24, top + 16, 16, y - top - 40, '#8e6e4e', 1) +
    box(FURN_X + 8, top + 16, 16, y - top - 40, '#8e6e4e', 1) +
    circle(FURN_X - 4.5, y - 62, 2.6, '#e0c887') +
    circle(FURN_X + 4.5, y - 62, 2.6, '#e0c887') +
    box(FURN_X - 34, y - 10, 68, 10, '#7a5c42', 1) +
    boxShade(FURN_X + 2, top + 8, 28, y - top - 20, 0.08) +
    boxLight(FURN_X - 30, top + 8, 4, y - top - 20, 0.08);
}

function bedDresser() {
  const wood = '#9c7346';
  const y = STAND_Y;
  const top = y - 54;
  return contact(FURN_X, 38, 0.2) +
    // Oval mirror standing on the top, which is what separates a dresser from
    // a plain chest of drawers.
    ellipse(FURN_X, top - 30, 21, 27, '#7a5c3c') +
    ellipse(FURN_X, top - 30, 17, 23, '#bcd2dd') +
    fill(`M${FURN_X - 15},${top - 22} q10,-18 26,-14 q-14,-1 -22,20 Z`, 'rgba(255,255,255,0.42)') +
    box(FURN_X - 6, top - 6, 12, 8, '#7a5c3c') +
    box(FURN_X - 36, top, 72, 54, wood, 2) +
    [0, 1, 2].map((i) => box(FURN_X - 30, top + 5 + i * 16, 60, 12, '#b08a58', 1.5) +
      box(FURN_X - 8, top + 9 + i * 16, 16, 3, '#5f4529', 1.5)).join('') +
    box(FURN_X - 36, y - 6, 72, 6, '#83612f', 1) +
    boxShade(FURN_X - 36, y - 8, 72, 3, 0.14);
}

function bedPlant() {
  const cx = ACC_X;
  const pot = '#c07a52';
  const leaf = (dx, dy, rot, len) =>
    `<g transform="rotate(${rot} ${n(cx + dx)} ${n(STAND_Y - 26 + dy)})">` +
    ellipse(cx + dx, STAND_Y - 26 + dy - len / 2, 6.5, len / 2, '#5f9455') +
    seam(`M${n(cx + dx)},${n(STAND_Y - 26 + dy)} l0,${-len}`, 1, 0.16) + '</g>';
  return contact(cx, 20, 0.2) +
    leaf(-9, -6, -34, 30) + leaf(9, -6, 32, 30) + leaf(-2, -14, -10, 38) +
    leaf(6, -10, 16, 26) + leaf(-13, -2, -58, 22) +
    fill(`M${cx - 15},${STAND_Y - 28} l30,0 l-4,28 l-22,0 Z`, pot) +
    box(cx - 17, STAND_Y - 31, 34, 6, '#d18f63', 2) +
    shade(`M${cx + 4},${STAND_Y - 28} l11,0 l-4,28 l-9,0 Z`, 0.12) +
    boxLight(cx - 17, STAND_Y - 31, 8, 6, 0.16);
}

function bedLamp() {
  const cx = ACC_X;
  const shadeY = STAND_Y - 96;
  return contact(cx, 15, 0.2) +
    ellipse(cx, STAND_Y - 2, 15, 4.5, '#4a4038') +
    box(cx - 2, shadeY + 22, 4, STAND_Y - 4 - shadeY - 22, '#5c5148') +
    // A proper tapered shade, wider at the bottom, with warm light spilling out.
    fill(`M${cx - 22},${shadeY + 24} l7,-24 l30,0 l7,24 Z`, '#e8cf9a') +
    fill(`M${cx - 22},${shadeY + 24} l44,0 l-4,3 l-36,0 Z`, '#c9ab74') +
    light(`M${cx - 15},${shadeY} l10,0 l-5,24 l-11,0 Z`, 0.3) +
    ellipse(cx, shadeY + 27, 17, 5, 'rgba(255,222,150,0.35)');
}

/* -- studio, bought ------------------------------------------------------- */

function studioPaintShelf() {
  // A shelf of paint jars. Different fill heights and a brush jar make it read
  // as a working shelf rather than a row of identical bottles.
  const y = 78;
  const jars = [
    { x: WALL_CX - 38, w: 12, h: 22, c: '#c8523f', fillPct: 0.55 },
    { x: WALL_CX - 22, w: 11, h: 18, c: '#3f7fb5', fillPct: 0.8 },
    { x: WALL_CX - 8, w: 13, h: 24, c: '#e0b34a', fillPct: 0.4 },
    { x: WALL_CX + 9, w: 11, h: 20, c: '#5f9455', fillPct: 0.65 },
  ];
  const jarMarkup = jars.map((j) => {
    const top = y - j.h;
    return box(j.x, top, j.w, j.h, 'rgba(236,240,244,0.55)', 1.5) +
      box(j.x, y - j.h * j.fillPct, j.w, j.h * j.fillPct, j.c, 1.5) +
      box(j.x - 1, top - 3, j.w + 2, 3.5, '#8d8478', 1) +
      boxLight(j.x + 1.5, top + 2, 2.5, j.h - 5, 0.3);
  }).join('');
  // Brushes standing in a pot at the end of the shelf.
  const bx = WALL_CX + 27;
  const brushes = [-4, 0, 4].map((dx, i) =>
    `<path d="M${bx + dx},${y - 12} l${dx * 0.5},${-14 - i * 3}" stroke="#a9803f" stroke-width="2.2" stroke-linecap="round" fill="none"/>` +
    circle(bx + dx * 1.5, y - 27 - i * 3, 2.2, ['#c8523f', '#3f7fb5', '#e0b34a'][i])).join('');
  return box(WALL_CX - 46, y, 92, 5, '#9c8a70', 1.5) +
    boxShade(WALL_CX - 46, y + 5, 92, 3, 0.2) +
    [-38, 38].map((dx) => fill(`M${WALL_CX + dx},${y + 5} l6,0 l-6,9 Z`, '#8a7a62')).join('') +
    jarMarkup + brushes +
    box(bx - 7, y - 14, 14, 14, '#8d6a45', 1.5);
}

function studioWindow() {
  // Tall north-light window: many small panes, no curtains, because that is
  // what a studio window looks like.
  const frame = '#e6e0d2';
  const x = WALL_CX - 38;
  const w = 76;
  const h = 96;
  const top = 16;
  return boxShade(x + 2, top + 2, w, h, 0.16) +
    box(x - 3, top - 3, w + 6, h + 6, frame, 2) +
    box(x, top, w, h, '#b6d8e6') +
    fill(`M${x},${top + h - 30} q20,-16 38,-6 q16,-10 38,4 l0,32 l-76,0 Z`, '#8fae7f') +
    circle(x + 54, top + 26, 9, 'rgba(255,255,255,0.6)') +
    [1, 2].map((i) => box(x + (w / 3) * i - 1.5, top, 3, h, frame)).join('') +
    [1, 2, 3].map((i) => box(x, top + (h / 4) * i - 1.5, w, 3, frame)).join('') +
    boxLight(x, top, w, 12, 0.22) +
    box(x - 6, top + h + 3, w + 12, 5, '#cfc7b6', 2);
}

function studioDesk() {
  const wood = '#a07a4e';
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
      `L${FURN_X + 30},${boardFront + 1} L${FURN_X - 34},${boardFront - 6} Z`, '#f4efe1') +
    // A drawing pinned to the board, and the pencil ledge along the front.
    seam(`M${FURN_X - 24},${boardFront - 18} q14,-14 26,-3 q10,-9 20,2`, 1.4, 0.3) +
    seam(`M${FURN_X - 24},${boardFront - 10} l44,4`, 1.2, 0.22) +
    fill(`M${FURN_X - 38},${boardFront - 2} L${FURN_X + 34},${boardFront + 6} ` +
      `L${FURN_X + 34},${boardFront + 11} L${FURN_X - 38},${boardFront + 3} Z`, '#8d6a3f') +
    `<path d="M${FURN_X - 20},${boardFront + 3} l16,2" stroke="#c8894a" stroke-width="2.4" stroke-linecap="round" fill="none"/>` +
    boxShade(FURN_X - 34, y - 26, 64, 3, 0.16);
}

function studioTrolley() {
  const metal = '#8f97a1';
  const y = STAND_Y;
  const top = y - 74;
  return contact(FURN_X, 32, 0.2) +
    [-26, 26].map((dx) => box(FURN_X + dx - 2, top, 4, y - top - 8, metal, 2)).join('') +
    [top + 4, top + 34, y - 14].map((sy) =>
      box(FURN_X - 30, sy, 60, 5, '#b3bac2', 1.5) + boxShade(FURN_X - 30, sy + 5, 60, 2.5, 0.18)).join('') +
    // Paint tubes on the top shelf, jars below — the cargo is what names it.
    [-20, -10, 0, 10, 20].map((dx, i) =>
      box(FURN_X + dx - 3.5, top - 12, 7, 12, ['#c8523f', '#3f7fb5', '#e0b34a', '#5f9455', '#8b5ea8'][i], 2) +
      box(FURN_X + dx - 2, top - 15, 4, 3.5, '#cfd6dc', 1)).join('') +
    [-16, 0, 16].map((dx, i) =>
      box(FURN_X + dx - 7, top + 20, 14, 14, ['rgba(236,240,244,0.5)', '#6fa86a', 'rgba(236,240,244,0.5)'][i], 1.5)).join('') +
    [-24, 24].map((dx) => circle(FURN_X + dx, y - 4, 5, '#4c525a') +
      circle(FURN_X + dx, y - 4, 2, '#8f97a1')).join('');
}

function studioCanvases() {
  // Canvases leaning against each other, seen edge-on and face-on.
  const cx = ACC_X;
  return contact(cx, 30, 0.2) +
    `<g transform="rotate(-7 ${cx - 12} ${STAND_Y})">` +
    box(cx - 30, STAND_Y - 46, 34, 46, '#d8cfba', 1) +
    box(cx - 28, STAND_Y - 44, 30, 42, '#f2ecdc', 1) +
    fill(`M${cx - 28},${STAND_Y - 14} q9,-11 15,-3 q5,-8 15,2 l0,13 l-30,0 Z`, '#7fa8c4') +
    circle(cx - 16, STAND_Y - 32, 5, '#e8b658') +
    '</g>' +
    `<g transform="rotate(6 ${cx + 12} ${STAND_Y})">` +
    box(cx + 2, STAND_Y - 38, 9, 38, '#c4b699', 1) +
    boxShade(cx + 2, STAND_Y - 38, 4, 38, 0.16) +
    box(cx + 13, STAND_Y - 44, 7, 44, '#d8cfba', 1) +
    '</g>';
}

function studioStool() {
  const wood = '#a9803f';
  const y = STAND_Y;
  const seatY = y - 44;
  return contact(ACC_X, 20, 0.2) +
    [[-15, -5], [15, 5], [-7, -3]].map(([dx, tx]) =>
      `<path d="M${ACC_X + dx},${y} L${ACC_X + tx},${seatY + 3}" stroke="${wood}" stroke-width="4.5" stroke-linecap="round" fill="none"/>`).join('') +
    seam(`M${ACC_X - 12},${y - 16} L${ACC_X + 12},${y - 16}`, 3, 0.28) +
    ellipse(ACC_X, seatY, 19, 6.5, wood) +
    ellipse(ACC_X, seatY - 2.5, 19, 6.5, '#c2954d') +
    light(`M${ACC_X - 12},${seatY - 5} a14,5 0 0 1 22,-1 a16,6 0 0 0 -22,1 Z`, 0.2);
}

/* -- kitchen, bought ------------------------------------------------------ */

function kitchenSpices() {
  const y = 82;
  const jars = ['#c8683f', '#d8b04a', '#7f9a4f', '#a84f3f', '#c9a06a', '#6f8f5f'];
  return box(WALL_CX - 46, y, 92, 5, '#a8907a', 1.5) +
    boxShade(WALL_CX - 46, y + 5, 92, 3, 0.2) +
    box(WALL_CX - 46, y - 34, 92, 3, '#a8907a', 1) +
    jars.map((c, i) => {
      const x = WALL_CX - 40 + i * 14;
      return box(x, y - 15, 11, 15, c, 1.5) +
        box(x + 0.5, y - 19, 10, 4, '#6d6055', 1) +
        boxLight(x + 1.5, y - 13, 2, 11, 0.24) +
        // A paper label band, which is what makes them spice jars.
        box(x + 1, y - 9, 9, 4.5, 'rgba(245,240,228,0.8)');
    }).join('') +
    // A second row on the upper rail, smaller.
    jars.slice(0, 4).map((c, i) => {
      const x = WALL_CX - 30 + i * 16;
      return box(x, y - 46, 10, 12, c, 1.5) + box(x + 0.5, y - 49, 9, 3.5, '#6d6055', 1);
    }).join('');
}

function kitchenWindow() {
  const frame = '#f0ebdd';
  const cx = WALL_CX;
  return box(cx - 34, 30, 68, 56, frame, 2) +
    box(cx - 29, 35, 58, 46, '#a6d2e0') +
    box(cx - 29, 64, 58, 17, '#93b884') +
    ellipse(cx - 10, 47, 9, 4.5, 'rgba(255,255,255,0.8)') +
    box(cx - 1.5, 35, 3, 46, frame) +
    box(cx - 29, 55, 58, 3, frame) +
    // A sill with a small pot on it — the detail that says kitchen window.
    box(cx - 38, 86, 76, 5, '#e0d8c6', 1.5) +
    fill(`M${cx + 14},${86} l14,0 l-2,-11 l-10,0 Z`, '#c07a52') +
    ellipse(cx + 19, 71, 7, 5, '#5f9455') +
    ellipse(cx + 15, 68, 4, 3.5, '#6faa5f') +
    boxShade(cx - 29, 35, 58, 5, 0.1);
}

function kitchenFridge() {
  const body = '#e2e5e9';
  const y = STAND_Y;
  const top = y - 126;
  return contact(FURN_X, 32, 0.22) +
    box(FURN_X - 30, top, 60, y - top, body, 3) +
    // The split between freezer and fridge, plus two long vertical handles.
    box(FURN_X - 30, top + 40, 60, 2.5, '#b9bfc7') +
    box(FURN_X + 20, top + 8, 4, 26, '#8f97a1', 2) +
    box(FURN_X + 20, top + 50, 4, 42, '#8f97a1', 2) +
    boxLight(FURN_X - 30, top, 8, y - top, 0.14) +
    boxShade(FURN_X + 18, top, 12, y - top, 0.07) +
    // A couple of magnets and a note, which reads instantly as a fridge door.
    box(FURN_X - 22, top + 54, 16, 20, '#f6f2e6', 1) +
    seam(`M${FURN_X - 19},${top + 60} l10,0 M${FURN_X - 19},${top + 65} l8,0`, 1, 0.25) +
    circle(FURN_X - 24, top + 50, 2.6, '#c8523f') +
    circle(FURN_X - 6, top + 24, 2.6, '#3f7fb5') +
    box(FURN_X - 30, y - 5, 60, 5, '#c2c8cf', 1);
}

function kitchenCounter() {
  const cab = '#c9a375';
  const y = STAND_Y;
  const topY = y - 58;
  return contact(FURN_X, 42, 0.2) +
    box(FURN_X - 40, topY + 5, 80, y - topY - 5, cab, 2) +
    box(FURN_X - 42, topY, 84, 7, '#4f5560', 2) +
    // An inset sink basin with a tap arching over it.
    box(FURN_X - 22, topY - 1, 40, 6, '#9aa3ad', 1.5) +
    `<path d="M${FURN_X + 12},${topY} q0,-16 -12,-16 q-6,0 -6,5" fill="none" stroke="#b3bac2" stroke-width="3.2" stroke-linecap="round"/>` +
    box(FURN_X + 14, topY - 20, 3, 8, '#b3bac2', 1.5) +
    [0, 1].map((i) => box(FURN_X - 36 + i * 40, topY + 12, 34, 20, '#dcbb8e', 1.5) +
      box(FURN_X - 26 + i * 40, topY + 20, 14, 3, '#7d6041', 1.5)).join('') +
    [0, 1].map((i) => box(FURN_X - 36 + i * 40, topY + 36, 34, 18, '#dcbb8e', 1.5) +
      box(FURN_X - 26 + i * 40, topY + 43, 14, 3, '#7d6041', 1.5)).join('') +
    boxShade(FURN_X - 40, y - 6, 80, 6, 0.14);
}

function kitchenHerb() {
  const cx = ACC_X;
  // A trio of small pots on a low stand, so it is clearly herbs, not one plant.
  const pot = (dx, h, colour) =>
    fill(`M${cx + dx - 9},${STAND_Y - 14} l18,0 l-2.5,14 l-13,0 Z`, colour) +
    box(cx + dx - 10, STAND_Y - 17, 20, 4, '#d18f63', 1.5) +
    [[-4, -1], [0, 0], [4, 1]].map(([lx, i]) =>
      ellipse(cx + dx + lx, STAND_Y - 20 - h + i * 2, 4.5, h * 0.5, i ? '#5f9455' : '#6faa5f')).join('');
  return contact(cx, 30, 0.2) +
    pot(-19, 12, '#c07a52') + pot(0, 15, '#b9704a') + pot(19, 11, '#c07a52');
}

function kitchenCrate() {
  const wood = '#b08a58';
  const cx = ACC_X;
  const y = STAND_Y;
  return contact(cx, 28, 0.2) +
    box(cx - 26, y - 30, 52, 30, wood, 1.5) +
    [0, 1, 2].map((i) => seam(`M${cx - 26},${y - 24 + i * 9} l52,0`, 1.4, 0.22)).join('') +
    box(cx - 26, y - 30, 5, 30, '#9c7648') +
    box(cx + 21, y - 30, 5, 30, '#9c7648') +
    // Vegetables spilling over the rim: carrots, a cabbage, tomatoes.
    circle(cx - 13, y - 34, 8, '#8fae5f') +
    fill(`M${cx - 18},${y - 36} q5,-6 10,-1 q-5,-2 -10,1 Z`, '#a3c072') +
    circle(cx + 2, y - 33, 6, '#c8503f') +
    circle(cx + 13, y - 35, 5.5, '#c8503f') +
    fill(`M${cx + 18},${y - 40} l7,-3 l-2,7 Z`, '#e08a3c') +
    fill(`M${cx - 24},${y - 38} l6,-4 l0,7 Z`, '#e08a3c') +
    light(`M${cx - 13},${y - 40} q6,-2 8,3 q-4,-3 -8,-3 Z`, 0.2);
}

/* -- library, bought ------------------------------------------------------ */

function librarySconces() {
  // Wall lights. The first pass was a white bar on a small dark plate and read
  // as a symbol rather than an object; the backplate, the curved bracket arm
  // and the drip pan are what make it legible as a sconce.
  const sconce = (cx) => {
    const plateY = 44;
    const panY = 74;
    return ellipse(cx, plateY + 16, 30, 34, 'rgba(255,206,124,0.14)') +
      // Backplate against the wall.
      fill(`M${cx - 9},${plateY} q9,-8 18,0 l0,26 q-9,8 -18,0 Z`, '#8a6f45') +
      boxLight(cx - 7, plateY + 2, 4, 22, 0.14) +
      // Bracket arm sweeping out and up to the pan.
      `<path d="M${cx},${plateY + 24} q0,10 -14,12 M${cx},${plateY + 24} q0,10 14,12" ` +
      `fill="none" stroke="#a9803f" stroke-width="3.4" stroke-linecap="round"/>` +
      [-14, 14].map((dx) =>
        ellipse(cx + dx, panY, 8, 3, '#a9803f') +
        box(cx + dx - 3, panY - 17, 6, 17, '#f4eeda', 1) +
        // Melted wax over the pan lip.
        fill(`M${cx + dx - 3},${panY - 2} q3,4 6,0 l0,3 l-6,0 Z`, '#e8e0c8') +
        fill(`M${cx + dx},${panY - 27} q6,7 0,10 q-6,-3 0,-10 Z`, '#ffcf6a') +
        fill(`M${cx + dx},${panY - 24} q3,4 0,6 q-3,-2 0,-6 Z`, '#fff2c8') +
        ellipse(cx + dx, panY - 22, 9, 11, 'rgba(255,206,124,0.2)')).join('');
  };
  return sconce(WALL_CX - 36) + sconce(WALL_CX + 36);
}

function libraryArch() {
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
  return fill(arch, '#7d6448') +
    fill(inner, '#22304e') +
    circle(cx + 12, springs + 2, 8, '#e8e2c4') +
    [[-14, 34], [6, 22], [-6, 48], [16, 46], [-18, 60]].map(([dx, dy]) =>
      circle(cx + dx, springs + dy, 1.3, 'rgba(255,255,255,0.7)')).join('') +
    fill(`M${cx - w / 2 + 5},${bottom - 4} q30,-18 ${w - 10},0 l0,4 l-${w - 10},0 Z`, '#2c3a26') +
    box(cx - 2, springs - 4, 4, bottom - springs, '#7d6448') +
    box(cx - w / 2 + 5, 86, w - 10, 3.5, '#7d6448') +
    box(cx - w / 2 - 5, bottom, w + 10, 6, '#8a6f52', 2) +
    seam(`M${cx - w / 2 + 5},${springs} A${w / 2 - 5},${w / 2 - 5} 0 0 1 ${cx + w / 2 - 5},${springs}`, 1.2, 0.24);
}

function libraryDesk() {
  const wood = '#7d5636';
  const y = STAND_Y;
  const topY = y - 66;
  return contact(FURN_X, 44, 0.22) +
    // Two drawer pedestals with a knee hole between them, which is what makes
    // this a desk rather than a cabinet.
    [-1, 1].map((sgn) => {
      const x = FURN_X + (sgn < 0 ? -40 : 18);
      return box(x, topY + 9, 22, y - topY - 9, wood, 1) +
        [0, 1, 2].map((i) => box(x + 3, topY + 15 + i * 18, 16, 14, '#9c7048', 1.5) +
          box(x + 8, topY + 21 + i * 18, 7, 2.6, '#4f3722', 1.5)).join('');
    }).join('') +
    box(FURN_X - 44, topY, 88, 9, '#8d6242', 2) +
    boxLight(FURN_X - 44, topY, 88, 3, 0.14) +
    // An open book, drawn big and pale so it survives the dark room.
    fill(`M${FURN_X - 26},${topY - 2} q11,-7 20,-1 q9,-6 20,1 l-20,5 Z`, '#faf5e8') +
    fill(`M${FURN_X - 26},${topY - 2} q11,-7 20,-1 l0,5 q-9,-5 -20,-1 Z`, '#e6dcc4') +
    seam(`M${FURN_X - 20},${topY - 5} l12,-1 M${FURN_X + 2},${topY - 6} l12,1`, 1, 0.26) +
    // A banker's lamp: brass stem, green shade, warm pool of light on the desk.
    ellipse(FURN_X + 30, topY - 1, 9, 3, '#c9a253') +
    box(FURN_X + 28.5, topY - 26, 3.5, 25, '#d8b465') +
    fill(`M${FURN_X + 16},${topY - 26} l28,0 l-5,-10 l-18,0 Z`, '#2f7a52') +
    light(`M${FURN_X + 21},${topY - 34} l18,0 l2,4 l-22,0 Z`, 0.26) +
    ellipse(FURN_X + 30, topY - 22, 15, 5, 'rgba(255,222,150,0.3)') +
    boxShade(FURN_X - 44, topY + 9, 88, 3, 0.18);
}

function libraryGlobe() {
  const y = STAND_Y;
  const cy = y - 62;
  const r = 26;
  return contact(FURN_X, 26, 0.2) +
    // Tripod stand.
    [[-18, -3], [18, 3], [0, 0]].map(([dx, tx]) =>
      `<path d="M${FURN_X + dx},${y} L${FURN_X + tx},${cy + r - 2}" stroke="#6b4a30" stroke-width="4.5" stroke-linecap="round" fill="none"/>`).join('') +
    ellipse(FURN_X, y - 22, 15, 4, '#6b4a30') +
    circle(FURN_X, cy, r, '#3f7fb5') +
    // Landmasses. Deliberately not any real map — just enough green to read
    // as a globe rather than a blue ball.
    fill(`M${FURN_X - 18},${cy - 8} q10,-10 20,-2 q8,6 2,12 q-12,6 -18,-2 Z`, '#5f9455') +
    fill(`M${FURN_X + 4},${cy + 8} q9,-4 14,4 q-6,7 -14,2 Z`, '#5f9455') +
    fill(`M${FURN_X - 14},${cy + 12} q7,-3 10,3 q-6,4 -10,-3 Z`, '#6faa5f') +
    `<path d="M${FURN_X - r - 3},${cy} a${r + 3},${r + 3} 0 0 1 ${(r + 3) * 2},0" fill="none" stroke="#c9a253" stroke-width="3.5"/>` +
    seam(`M${FURN_X - r},${cy} l${r * 2},0`, 1, 0.18) +
    light(`M${FURN_X - 15},${cy - 15} a20,20 0 0 1 14,-5 a24,24 0 0 0 -14,5 Z`, 0.28);
}

function libraryRug() {
  // A patterned rug in the same shallow perspective as the other floor pieces.
  // The library floor is dark, so the field is deliberately lighter than a real
  // Persian would be — at panel size a dark red rug on dark boards read as a
  // stain rather than as a rug.
  const cx = ACC_X;
  const cy = STAND_Y + 4;
  return ellipse(cx, cy, 42, 13, '#a8524a') +
    `<ellipse cx="${cx}" cy="${cy}" rx="42" ry="13" fill="none" stroke="rgba(0,0,0,0.2)" stroke-width="1"/>` +
    ellipse(cx, cy, 36, 10.5, '#c46a56') +
    `<ellipse cx="${cx}" cy="${cy}" rx="36" ry="10.5" fill="none" stroke="#f0d08a" stroke-width="1.8"/>` +
    ellipse(cx, cy, 26, 7.2, '#a8524a') +
    ellipse(cx, cy, 13, 3.8, '#f0d08a') +
    ellipse(cx, cy, 7, 2, '#8d3f3a') +
    [-20, 20].map((dx) => ellipse(cx + dx, cy, 4.5, 2, '#f0d08a')).join('') +
    [-1, 1].map((sgn) => [...Array(5)].map((_, i) =>
      seam(`M${n(cx + sgn * (37 + i * 1.1))},${n(cy - 3.5 + i * 1.7)} l${sgn * 4.5},0`, 1.1, 0.34)).join('')).join('');
}

function libraryCandelabra() {
  const cx = ACC_X;
  const y = STAND_Y;
  const armY = y - 74;
  const candle = (dx, h) =>
    box(cx + dx - 2.5, armY - h, 5, h, '#f0e8d2', 1) +
    fill(`M${cx + dx},${armY - h - 9} q4.5,5 0,8 q-4.5,-3 0,-8 Z`, '#ffcf6a') +
    circle(cx + dx, armY - h - 4, 1.7, 'rgba(255,255,255,0.9)') +
    ellipse(cx + dx, armY - h - 5, 11, 13, 'rgba(255,208,130,0.12)');
  return contact(cx, 16, 0.2) +
    ellipse(cx, y - 2, 16, 5, '#7a6242') +
    box(cx - 2.5, armY, 5, y - 4 - armY, '#8a6f45') +
    ellipse(cx, y - 34, 7, 3, '#a9803f') +
    `<path d="M${cx - 16},${armY + 2} q0,-12 16,-12 q16,0 16,12" fill="none" stroke="#8a6f45" stroke-width="3.5"/>` +
    [-16, 0, 16].map((dx, i) => box(cx + dx - 4, armY - 4, 8, 5, '#a9803f', 1.5) + candle(dx, i === 1 ? 20 : 15)).join('');
}

/* ---------------------------------------------------------------- catalogue */

// One starter per slot per room, so a room is furnished the moment it opens;
// the rest are bought. Prices sit against the level curve in points.js, like
// the wardrobe's — a genuine saving goal, not an impulse buy.
export const HOUSE_ITEMS = [
  { id: 'bd-wall-window', roomId: 'bedroom', slot: 'wall', name: 'Curtained Window', price: 0, source: 'starter', draw: bedWindow },
  { id: 'bd-furn-bed', roomId: 'bedroom', slot: 'furniture', name: 'Bed', price: 0, source: 'starter', draw: bedBed },
  { id: 'bd-acc-rug', roomId: 'bedroom', slot: 'accent', name: 'Round Rug', price: 0, source: 'starter', draw: bedRug },
  { id: 'bd-wall-photos', roomId: 'bedroom', slot: 'wall', name: 'Photo Wall', price: 220, source: 'store', draw: bedPhotos },
  { id: 'bd-wall-clock', roomId: 'bedroom', slot: 'wall', name: 'Wall Clock', price: 260, source: 'store', draw: bedClock },
  { id: 'bd-furn-wardrobe', roomId: 'bedroom', slot: 'furniture', name: 'Wardrobe', price: 480, source: 'store', draw: bedWardrobe },
  { id: 'bd-furn-dresser', roomId: 'bedroom', slot: 'furniture', name: 'Dresser', price: 520, source: 'store', draw: bedDresser },
  { id: 'bd-acc-plant', roomId: 'bedroom', slot: 'accent', name: 'Potted Plant', price: 180, source: 'store', draw: bedPlant },
  { id: 'bd-acc-lamp', roomId: 'bedroom', slot: 'accent', name: 'Floor Lamp', price: 240, source: 'store', draw: bedLamp },

  { id: 'st-wall-sketches', roomId: 'studio', slot: 'wall', name: 'Pinned Sketches', price: 0, source: 'starter', draw: studioSketches },
  { id: 'st-furn-easel', roomId: 'studio', slot: 'furniture', name: 'Easel', price: 0, source: 'starter', draw: studioEasel },
  { id: 'st-acc-dropcloth', roomId: 'studio', slot: 'accent', name: 'Drop Cloth', price: 0, source: 'starter', draw: studioPaintRug },
  { id: 'st-wall-shelf', roomId: 'studio', slot: 'wall', name: 'Paint Shelf', price: 240, source: 'store', draw: studioPaintShelf },
  { id: 'st-wall-window', roomId: 'studio', slot: 'wall', name: 'North Window', price: 300, source: 'store', draw: studioWindow },
  { id: 'st-furn-desk', roomId: 'studio', slot: 'furniture', name: 'Drafting Desk', price: 520, source: 'store', draw: studioDesk },
  { id: 'st-furn-trolley', roomId: 'studio', slot: 'furniture', name: 'Paint Trolley', price: 440, source: 'store', draw: studioTrolley },
  { id: 'st-acc-canvases', roomId: 'studio', slot: 'accent', name: 'Stacked Canvases', price: 200, source: 'store', draw: studioCanvases },
  { id: 'st-acc-stool', roomId: 'studio', slot: 'accent', name: 'Wooden Stool', price: 190, source: 'store', draw: studioStool },

  { id: 'kt-wall-pans', roomId: 'kitchen', slot: 'wall', name: 'Hanging Pans', price: 0, source: 'starter', draw: kitchenPans },
  { id: 'kt-furn-stove', roomId: 'kitchen', slot: 'furniture', name: 'Stove', price: 0, source: 'starter', draw: kitchenStove },
  { id: 'kt-acc-mat', roomId: 'kitchen', slot: 'accent', name: 'Floor Mat', price: 0, source: 'starter', draw: kitchenMat },
  { id: 'kt-wall-spices', roomId: 'kitchen', slot: 'wall', name: 'Spice Shelf', price: 250, source: 'store', draw: kitchenSpices },
  { id: 'kt-wall-window', roomId: 'kitchen', slot: 'wall', name: 'Kitchen Window', price: 310, source: 'store', draw: kitchenWindow },
  { id: 'kt-furn-fridge', roomId: 'kitchen', slot: 'furniture', name: 'Fridge', price: 560, source: 'store', draw: kitchenFridge },
  { id: 'kt-furn-counter', roomId: 'kitchen', slot: 'furniture', name: 'Sink Counter', price: 500, source: 'store', draw: kitchenCounter },
  { id: 'kt-acc-herbs', roomId: 'kitchen', slot: 'accent', name: 'Potted Herbs', price: 200, source: 'store', draw: kitchenHerb },
  { id: 'kt-acc-crate', roomId: 'kitchen', slot: 'accent', name: 'Veg Crate', price: 230, source: 'store', draw: kitchenCrate },

  { id: 'lb-wall-painting', roomId: 'library', slot: 'wall', name: 'Framed Landscape', price: 0, source: 'starter', draw: libraryPainting },
  { id: 'lb-furn-bookcase', roomId: 'library', slot: 'furniture', name: 'Bookcase', price: 0, source: 'starter', draw: libraryBookcase },
  { id: 'lb-acc-books', roomId: 'library', slot: 'accent', name: 'Stack of Books', price: 0, source: 'starter', draw: libraryBookStack },
  { id: 'lb-wall-sconces', roomId: 'library', slot: 'wall', name: 'Candle Sconces', price: 280, source: 'store', draw: librarySconces },
  { id: 'lb-wall-arch', roomId: 'library', slot: 'wall', name: 'Arched Window', price: 360, source: 'store', draw: libraryArch },
  { id: 'lb-furn-desk', roomId: 'library', slot: 'furniture', name: 'Reading Desk', price: 580, source: 'store', draw: libraryDesk },
  { id: 'lb-furn-globe', roomId: 'library', slot: 'furniture', name: 'Standing Globe', price: 620, source: 'store', draw: libraryGlobe },
  { id: 'lb-acc-rug', roomId: 'library', slot: 'accent', name: 'Patterned Rug', price: 260, source: 'store', draw: libraryRug },
  { id: 'lb-acc-candelabra', roomId: 'library', slot: 'accent', name: 'Candelabra', price: 300, source: 'store', draw: libraryCandelabra },
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
