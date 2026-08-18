// Builds the avatar as an inline SVG string from the player's saved
// customization. Every paintable part is its own `<g data-slot="...">`, left
// with no fill of its own so the group's fill attribute (set from
// `customize`) is inherited by every child shape — recolouring a part is
// just `group.setAttribute('fill', hex)`, and "point at a part" is answered
// by ordinary DOM delegation on `[data-slot]`, no custom hit-testing.
//
// gender/height/weight are width-swaps and a scale transform rather than
// separate full figures — a handful of table entries, not an art project.

import { WARDROBE_ITEMS } from './wardrobe.js';

const WARDROBE_BY_ID = new Map(WARDROBE_ITEMS.map((i) => [i.id, i]));

export const DEFAULT_PALETTE = [
  '#e63946', '#f1a208', '#f4d35e', '#6a994e', '#457b9d', '#5f4b8b',
  '#e07a5f', '#3a86ff', '#2ec4b6', '#ff8fb1', '#4a4a4a', '#ffffff',
];

export const VARIANTS = {
  gender: ['nb', 'fem', 'masc'],
  hairStyle: ['short', 'long', 'ponytail'],
  eyesStyle: ['round', 'happy', 'sparkle'],
  faceShape: ['oval', 'round', 'square'],
};

export function defaultAvatarCustomize() {
  return {
    gender: 'nb', height: 1, weight: 1,
    hair: { style: 'short', colour: '#3b2a1a' },
    eyes: { style: 'round', colour: '#4a7a8c' },
    face: { shape: 'oval' },
    skin: { colour: '#e0b088' },
    shirt: { itemId: 'shirt-basic', colour: '#c9c9c9' },
    bottoms: { itemId: 'bottoms-basic', colour: '#3a3a3a' },
    dress: { itemId: null, colour: '#c9c9c9' },
    socks: { itemId: 'socks-basic', colour: '#ffffff' },
    shoes: { itemId: 'shoes-basic', colour: '#2a2a2a' },
  };
}

// Shoulder/hip half-widths (from centre x=60), by gender — the "width-swap"
// the plan describes, rather than a transform that would also skew the head.
const TORSO_SHAPE = {
  nb: { shoulder: 20, hip: 18 },
  fem: { shoulder: 17, hip: 22 },
  masc: { shoulder: 23, hip: 17 },
};

// 'square' gets an actual distinct silhouette (a rounded rect) rather than
// just different ellipse radii, so the three face shapes read as genuinely
// different rather than squashed/stretched copies of one oval.
const HEAD_SHAPE = {
  oval: { kind: 'ellipse', rx: 14, ry: 19 },
  round: { kind: 'ellipse', rx: 17, ry: 17 },
  square: { kind: 'rect', hw: 15.5, hh: 16.5, r: 6 },
};

function headMarkup(shape) {
  const h = HEAD_SHAPE[shape] ?? HEAD_SHAPE.oval;
  if (h.kind === 'rect') {
    return `<rect x="${60 - h.hw}" y="${38 - h.hh}" width="${h.hw * 2}" height="${h.hh * 2}" rx="${h.r}"/>`;
  }
  return `<ellipse cx="60" cy="38" rx="${h.rx}" ry="${h.ry}"/>`;
}

function torsoPoints(gender) {
  const t = TORSO_SHAPE[gender] ?? TORSO_SHAPE.nb;
  return {
    shoulderL: 60 - t.shoulder, shoulderR: 60 + t.shoulder,
    hipL: 60 - t.hip, hipR: 60 + t.hip,
  };
}

// A curved torso — rounded shoulders, a waist taper, a curved hip line —
// in place of the flat trapezoid this used to be. Everything downstream
// (arms, clothing, the hips-anchored height/weight scale) still keys off
// the same shoulderL/R, hipL/R landmarks torsoPoints() hands out, so this
// is a self-contained upgrade.
function torsoPath(gender, hemY = 130) {
  const { shoulderL, shoulderR, hipL, hipR } = torsoPoints(gender);
  const topY = 60;
  const waistY = 96;
  const waistL = (shoulderL + hipL) / 2 + 2;
  const waistR = (shoulderR + hipR) / 2 - 2;
  const midHipY = (waistY + hemY) / 2;
  return `M${shoulderL},${topY} ` +
    `Q60,${topY - 4} ${shoulderR},${topY} ` +
    `Q${shoulderR + 3},${topY + 18} ${waistR},${waistY} ` +
    `Q${hipR + 2},${midHipY} ${hipR},${hemY} ` +
    `L${hipL},${hemY} ` +
    `Q${hipL - 2},${midHipY} ${waistL},${waistY} ` +
    `Q${shoulderL - 3},${topY + 18} ${shoulderL},${topY} Z`;
}

/** A tapered limb: full width at `topHalf` narrowing to `botHalf`, bowed
 *  gently outward on the far side from the body. `dir` is -1 for a limb
 *  extending left of `attachX`, +1 for one extending right — the inner
 *  edge (against the torso/hip) stays a plain vertical since it's the same
 *  flat "skin" fill as whatever it overlaps, so the seam is invisible. */
function limbPath(attachX, dir, topY, botY, topHalf, botHalf, bow) {
  const outerTopX = attachX + dir * topHalf;
  const outerBotX = attachX + dir * botHalf;
  const outerBowX = attachX + dir * (Math.max(topHalf, botHalf) + bow);
  const midY = (topY + botY) / 2;
  return `<path d="M${attachX},${topY} L${outerTopX},${topY} ` +
    `Q${outerBowX},${midY} ${outerBotX},${botY} L${attachX},${botY} ` +
    `Q${attachX + dir * 2},${midY} ${attachX},${topY} Z"/>`;
}

function hairPaths(style) {
  // Brows live in the hair group (not a slot of their own) so they always
  // colour-match the hair, the way real brows do.
  const brows = '<path d="M45,29 Q51.5,25.8 58,28.2 L58,30.4 Q51.5,28.4 45,31 Z"/>' +
    '<path d="M62,28.2 Q68.5,25.8 75,29 L75,31 Q68.5,28.4 62,30.4 Z"/>';
  switch (style) {
    case 'long':
      return '<path d="M40,34 Q41,14 60,12 Q79,14 80,34 Q80,23 60,21 Q40,23 40,34 Z"/>' +
        '<path d="M39,32 Q35,50 39,72 Q44,55 43,32 Z"/>' +
        '<path d="M81,32 Q85,50 81,72 Q76,55 77,32 Z"/>' + brows;
    case 'ponytail':
      return '<path d="M40,34 Q41,14 60,12 Q79,14 80,34 Q80,23 60,21 Q40,23 40,34 Z"/>' +
        '<path d="M78,30 Q96,36 92,58 Q90,68 82,70 Q90,52 78,38 Z"/>' + brows;
    case 'short':
    default:
      return '<path d="M40,34 Q41,13 60,11 Q79,13 80,34 Q80,22 60,20 Q40,22 40,34 Z"/>' + brows;
  }
}

// A small white highlight dot per eye, with its own explicit `fill` so it
// overrides the group's inherited eye-colour fill — same override trick the
// mouth below uses. Purely decorative; still resolves to data-slot="eyes".
const EYE_SPARKLE = '<circle cx="53" cy="34.6" r="0.9" fill="#fff"/><circle cx="69" cy="34.6" r="0.9" fill="#fff"/>';

function eyesShapes(style) {
  switch (style) {
    case 'happy':
      return '<ellipse cx="52" cy="37" rx="3.4" ry="1.4"/><ellipse cx="68" cy="37" rx="3.4" ry="1.4"/>';
    case 'sparkle':
      return `<circle cx="52" cy="36" r="3.6"/><circle cx="68" cy="36" r="3.6"/>${EYE_SPARKLE}`;
    case 'round':
    default:
      return `<circle cx="52" cy="36" r="2.8"/><circle cx="68" cy="36" r="2.8"/>${EYE_SPARKLE}`;
  }
}

// A small mouth, given its own explicit fill (a soft rose) so it overrides
// the inherited skin-tone fill of the group it lives in — the same
// override technique the eye sparkle uses.
const MOUTH = '<path d="M55,45 Q60,48.5 65,45 Q60,47 55,45 Z" fill="rgba(150,74,74,0.65)"/>';

/** Resolves a worn item's shape style, falling back to 'basic' for an id the
 *  catalogue no longer has — a stored save can outlive a wardrobe rebalance. */
function styleOf(itemId) {
  return WARDROBE_BY_ID.get(itemId)?.style ?? 'basic';
}

/** Short tapered sleeve puffs at the shoulder, reusing the same limb-taper
 *  shape as the arms underneath but shorter and a touch rounder. */
function sleevePaths(gender) {
  const { shoulderL, shoulderR } = torsoPoints(gender);
  return limbPath(shoulderL, -1, 62, 86, 15, 12, 3) + limbPath(shoulderR, 1, 62, 86, 15, 12, 3);
}

function shirtPath(gender, style) {
  const { shoulderL, shoulderR, hipL, hipR } = torsoPoints(gender);
  const hemY = 118;
  // How far down the neckline dips at the centre — below the shoulder line
  // (y=62), not above it, so the shirt's fill actually opens toward the
  // chest (exposing the skin group underneath) rather than climbing up
  // toward the chin.
  const neckDipY = style === 'vneck' ? 84 : 66;
  const waistY = 92;
  // Control points pulled *inward* of the shoulder-hip midpoint (toward the
  // centreline, x=60) so the curve actually nips at the waist instead of
  // bulging outward past the shoulders.
  const waistL = (shoulderL + hipL) / 2 + 3;
  const waistR = (shoulderR + hipR) / 2 - 3;
  const notch = `M${shoulderL},62 Q60,${neckDipY} ${shoulderR},62 ` +
    `Q${waistR},${waistY} ${hipR},${hemY} Q60,${hemY + 5} ${hipL},${hemY} Q${waistL},${waistY} ${shoulderL},62 Z`;
  return `<path d="${notch}"/>${sleevePaths(gender)}`;
}

function bottomsPath(gender, style) {
  const { hipL, hipR } = torsoPoints(gender);
  const hemY = style === 'shorts' ? 148 : 188;
  const gap = 3;
  const midL = (hipL + hipR) / 2 - gap;
  const midR = (hipL + hipR) / 2 + gap;
  const flare = style === 'shorts' ? 1 : 2;
  return `<path d="M${hipL},130 L${midL},130 Q${midL - 1},${(130 + hemY) / 2} ${midL - flare},${hemY} ` +
    `L${hipL + 3 + flare},${hemY} Q${hipL + 2},${(130 + hemY) / 2} ${hipL},130 Z"/>` +
    `<path d="M${midR},130 L${hipR},130 Q${hipR - 2},${(130 + hemY) / 2} ${hipR - 3 - flare},${hemY} ` +
    `L${midR + flare},${hemY} Q${midR + 1},${(130 + hemY) / 2} ${midR},130 Z"/>`;
}

function dressPath(gender, style) {
  const { shoulderL, shoulderR, hipL, hipR } = torsoPoints(gender);
  const hemY = style === 'flowy' ? 178 : 168;
  const flare = style === 'flowy' ? 20 : 8;
  const midHemY = 100 + (hemY - 100) * 0.55;
  const bodice = `M${shoulderL},62 Q60,58 ${shoulderR},62 Q${shoulderR + 2},84 ${hipR},130`;
  const skirt = `Q${hipR + flare * 0.6},${midHemY} ${hipR + flare},${hemY} ` +
    `Q60,${hemY + 6} ${hipL - flare},${hemY} Q${hipL - flare * 0.6},${midHemY} ${hipL},130`;
  const close = `Q${shoulderL - 2},84 ${shoulderL},62 Z`;
  return `<path d="${bodice} ${skirt} ${close}"/>${sleevePaths(gender)}`;
}

function socksShapes(gender, style) {
  const { hipL, hipR } = torsoPoints(gender);
  const gap = 3;
  const midL = (hipL + hipR) / 2 - gap;
  const midR = (hipL + hipR) / 2 + gap;
  const h = style === 'tall' ? 26 : 12;
  const y = 190 - h;
  return `<rect x="${hipL + 2}" y="${y}" width="${midL - hipL - 2}" height="${h}" rx="3"/>` +
    `<rect x="${midR}" y="${y}" width="${hipR - midR - 2}" height="${h}" rx="3"/>`;
}

function shoesShapes(gender, style) {
  const { hipL, hipR } = torsoPoints(gender);
  const gap = 3;
  const midL = (hipL + hipR) / 2 - gap;
  const midR = (hipL + hipR) / 2 + gap;
  const cxL = (hipL + midL) / 2;
  const cxR = (midR + hipR) / 2;
  if (style === 'boots') {
    return `<rect x="${cxL - 6}" y="176" width="12" height="18" rx="4"/>` +
      `<rect x="${cxR - 6}" y="176" width="12" height="18" rx="4"/>`;
  }
  return `<ellipse cx="${cxL}" cy="192" rx="9" ry="5.5"/><ellipse cx="${cxR}" cy="192" rx="9" ry="5.5"/>`;
}

/**
 * @param {object} customize  S.save.avatar.customize
 * @returns {string}  a full <svg>...</svg> string, viewBox 0 0 120 220
 */
export function buildAvatarSVG(customize) {
  const c = customize;
  const gender = c.gender ?? 'nb';
  const { shoulderL, shoulderR, hipL, hipR } = torsoPoints(gender);
  const legGap = 3;
  const midL = (hipL + hipR) / 2 - legGap;
  const midR = (hipL + hipR) / 2 + legGap;
  // Feet always draw around y=190-198 regardless of outfit, so the viewBox
  // stays a constant height too — a dress covers the upper legs but must
  // never clip the feet it doesn't reach.
  const legY = 190;

  const skinParts =
    limbPath(midL, -1, 130, legY, midL - hipL - 3, (midL - hipL - 3) * 0.72, 1) +
    limbPath(midR, 1, 130, legY, hipR - midR - 3, (hipR - midR - 3) * 0.72, 1) +
    torsoTag(gender) +
    limbPath(shoulderL, -1, 64, 118, 13, 8, 3) +
    limbPath(shoulderR, 1, 64, 118, 13, 8, 3) +
    '<circle cx="' + (shoulderL - 10) + '" cy="120" r="4.2"/>' +
    '<circle cx="' + (shoulderR + 10) + '" cy="120" r="4.2"/>' +
    '<rect x="54" y="50" width="12" height="14" rx="4"/>' +
    headMarkup(c.face?.shape) +
    MOUTH;

  const dressed = !!c.dress?.itemId;

  const parts = [
    part('skin', c.skin?.colour, skinParts),
    part('hair', c.hair?.colour, hairPaths(c.hair?.style)),
    part('eyes', c.eyes?.colour, eyesShapes(c.eyes?.style)),
  ];
  if (dressed) {
    parts.push(part('dress', c.dress?.colour, dressPath(gender, styleOf(c.dress.itemId))));
  } else {
    parts.push(part('shirt', c.shirt?.colour, shirtPath(gender, styleOf(c.shirt?.itemId))));
    parts.push(part('bottoms', c.bottoms?.colour, bottomsPath(gender, styleOf(c.bottoms?.itemId))));
  }
  parts.push(part('socks', c.socks?.colour, socksShapes(gender, styleOf(c.socks?.itemId))));
  parts.push(part('shoes', c.shoes?.colour, shoesShapes(gender, styleOf(c.shoes?.itemId))));

  // height/weight are a uniform scale of the whole figure, anchored at the
  // hips (y=130) so a taller avatar grows upward from the same footing
  // rather than sinking its feet through the floor.
  const sx = Math.max(0.8, Math.min(1.3, c.weight ?? 1));
  const sy = Math.max(0.85, Math.min(1.2, c.height ?? 1));
  const body = `<g transform="translate(60,130) scale(${sx},${sy}) translate(-60,-130)">${parts.join('')}</g>`;

  return `<svg viewBox="0 0 120 ${legY + 20}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
}

function torsoTag(gender) {
  return `<path d="${torsoPath(gender)}"/>`;
}

function part(slot, colour, inner) {
  return `<g data-slot="${slot}" fill="${colour ?? '#999'}">${inner}</g>`;
}

/** Mutates `customize` in place, ignoring a key/value pair that is not one of
 *  the known style variants — the caller (a button click) can only ever send
 *  a value it itself listed, but this keeps a stray save edit harmless too. */
export function setVariant(customize, slot, value) {
  const list = { hair: VARIANTS.hairStyle, eyes: VARIANTS.eyesStyle }[slot];
  if (slot === 'face') {
    if (!VARIANTS.faceShape.includes(value)) return;
    customize.face.shape = value;
    return;
  }
  if (slot === 'gender') {
    if (!VARIANTS.gender.includes(value)) return;
    customize.gender = value;
    return;
  }
  if (!list || !list.includes(value)) return;
  customize[slot].style = value;
}
