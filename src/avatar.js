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

const HEAD_SHAPE = {
  oval: { rx: 14, ry: 20 },
  round: { rx: 18, ry: 18 },
  square: { rx: 18, ry: 16 },
};

function torsoPoints(gender) {
  const t = TORSO_SHAPE[gender] ?? TORSO_SHAPE.nb;
  return {
    shoulderL: 60 - t.shoulder, shoulderR: 60 + t.shoulder,
    hipL: 60 - t.hip, hipR: 60 + t.hip,
  };
}

function torsoPath(gender, hemY = 130) {
  const { shoulderL, shoulderR, hipL, hipR } = torsoPoints(gender);
  return `M${shoulderL},62 L${shoulderR},62 L${hipR},${hemY} L${hipL},${hemY} Z`;
}

function hairPaths(style) {
  switch (style) {
    case 'long':
      return '<path d="M42,30 Q60,10 78,30 L78,40 Q60,24 42,40 Z"/>' +
        '<rect x="38" y="28" width="9" height="46" rx="4.5"/>' +
        '<rect x="73" y="28" width="9" height="46" rx="4.5"/>';
    case 'ponytail':
      return '<path d="M42,30 Q60,10 78,30 L78,40 Q60,24 42,40 Z"/>' +
        '<path d="M76,32 Q92,40 86,64 Q82,50 74,42 Z"/>';
    case 'short':
    default:
      return '<path d="M42,30 Q60,8 78,30 L78,40 Q60,22 42,40 Z"/>';
  }
}

function eyesShapes(style) {
  switch (style) {
    case 'happy':
      return '<ellipse cx="52" cy="37" rx="3.4" ry="1.4"/><ellipse cx="68" cy="37" rx="3.4" ry="1.4"/>';
    case 'sparkle':
      return '<circle cx="52" cy="36" r="3.6"/><circle cx="68" cy="36" r="3.6"/>';
    case 'round':
    default:
      return '<circle cx="52" cy="36" r="2.8"/><circle cx="68" cy="36" r="2.8"/>';
  }
}

/** Resolves a worn item's shape style, falling back to 'basic' for an id the
 *  catalogue no longer has — a stored save can outlive a wardrobe rebalance. */
function styleOf(itemId) {
  return WARDROBE_BY_ID.get(itemId)?.style ?? 'basic';
}

function shirtPath(gender, style) {
  const { shoulderL, shoulderR, hipL, hipR } = torsoPoints(gender);
  const neckY = style === 'vneck' ? 76 : 62;
  const notch = style === 'vneck'
    ? `M${shoulderL},62 L${shoulderR},62 L${hipR},118 L${hipL},118 Z M55,62 L60,${neckY} L65,62 Z`
    : `M${shoulderL},62 L${shoulderR},62 L${hipR},118 L${hipL},118 Z`;
  const sleeves = `<rect x="${shoulderL - 14}" y="64" width="14" height="22" rx="6"/>` +
    `<rect x="${shoulderR}" y="64" width="14" height="22" rx="6"/>`;
  return `<path d="${notch}" fill-rule="evenodd"/>${sleeves}`;
}

function bottomsPath(gender, style) {
  const { hipL, hipR } = torsoPoints(gender);
  const kneeY = style === 'shorts' ? 148 : 190;
  const gap = 3;
  const midL = (hipL + hipR) / 2 - gap;
  const midR = (hipL + hipR) / 2 + gap;
  return `<path d="M${hipL},130 L${midL},130 L${midL},${kneeY} L${hipL + 3},${kneeY} Z"/>` +
    `<path d="M${midR},130 L${hipR},130 L${hipR - 3},${kneeY} L${midR},${kneeY} Z"/>`;
}

function dressPath(gender, style) {
  const { shoulderL, shoulderR, hipL, hipR } = torsoPoints(gender);
  const hemY = style === 'flowy' ? 176 : 168;
  const flare = style === 'flowy' ? 16 : 6;
  const sleeves = `<rect x="${shoulderL - 14}" y="64" width="14" height="22" rx="6"/>` +
    `<rect x="${shoulderR}" y="64" width="14" height="22" rx="6"/>`;
  return `<path d="M${shoulderL},62 L${shoulderR},62 L${hipR + flare},${hemY} L${hipL - flare},${hemY} Z"/>${sleeves}`;
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
  const head = HEAD_SHAPE[c.face?.shape] ?? HEAD_SHAPE.oval;
  const { shoulderL, shoulderR, hipL, hipR } = torsoPoints(gender);
  const legGap = 3;
  const midL = (hipL + hipR) / 2 - legGap;
  const midR = (hipL + hipR) / 2 + legGap;
  const legY = c.dress?.itemId ? 168 : 190;

  const skinParts =
    `<rect x="${hipL + 3}" y="130" width="${midL - hipL - 3}" height="60" rx="6"/>` +
    `<rect x="${midR}" y="130" width="${hipR - midR - 3}" height="60" rx="6"/>` +
    `${torsoTag(gender)}` +
    `<rect x="${shoulderL - 14}" y="64" width="14" height="58" rx="7"/>` +
    `<rect x="${shoulderR}" y="64" width="14" height="58" rx="7"/>` +
    `<rect x="54" y="52" width="12" height="12" rx="3"/>` +
    `<ellipse cx="60" cy="38" rx="${head.rx}" ry="${head.ry}"/>`;

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
