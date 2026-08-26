// Builds the avatar as an inline SVG string from the player's saved
// customization. Every paintable part is its own `<g data-slot="...">`, left
// with no fill of its own so the group's fill is inherited by every child
// shape, and "point at a part" is answered by ordinary DOM delegation on
// `[data-slot]` — no custom hit-testing. (Recolouring re-renders the whole
// string rather than patching the DOM, which is why more than one group may
// safely carry the same data-slot: that's how hair gets a mass *behind* the
// head as well as a cap in front of it.)
//
// Three conventions do most of the visual work:
//
//   * The figure is drawn only from smooth cubic Bézier outlines — no
//     <rect>, no straight outer edges. Overlapping pieces share one flat
//     fill, so their joins vanish and only each piece's own silhouette
//     shows. Symmetric outlines are authored as a right half and mirrored
//     (see mirrorPath), which makes them exactly symmetric for free.
//   * Shading and garment detail — collars, cuffs, seams, pockets — are
//     translucent overlays carrying their OWN fill, which overrides the
//     group's inherited one. Being washes rather than computed darker
//     shades, they read correctly over any colour the player picks:
//     green orc skin, white socks and a neon shirt alike, with no colour
//     maths and one code path.
//   * `customize.style` picks how all of that is lined. Classic is the flat
//     figure those first two conventions describe on their own. Inked adds
//     cel contour linework, and adds it by stroking the very same groups and
//     paths rather than authoring any outline geometry — see the `ink`
//     section below. It is a third pass over the same drawing, not a second
//     drawing, which is why no shape is defined twice and why a garment
//     added tomorrow is inked without being told about it.
//
// Everything geometric comes from metrics() below. Race, gender, face
// shape and the height/weight sliders all feed that one function, and every
// path — skin and cloth — reads only from its output, which is what keeps
// garments sitting on the body's actual contours for every combination.

import { WARDROBE_ITEMS } from './wardrobe.js';

const WARDROBE_BY_ID = new Map(WARDROBE_ITEMS.map((i) => [i.id, i]));

export const DEFAULT_PALETTE = [
  '#e63946', '#f1a208', '#f4d35e', '#6a994e', '#457b9d', '#5f4b8b',
  '#e07a5f', '#3a86ff', '#2ec4b6', '#ff8fb1', '#4a4a4a', '#ffffff',
];

// Frame invariants. The .avatar-pill CSS crop is derived from these three
// numbers, so races and sliders change proportions *within* the frame and
// never the frame itself — the head centre and the ground stay put no
// matter who you build.
const CX = 60;
const HEAD_CY = 38;
const FOOT_Y = 193;
const VIEW_H = 210;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/* ------------------------------------------------------- overlay helpers */

// Exported because house.js draws with the same technique: a child carrying
// its own fill overrides the parent group's, so a wash works over any colour
// underneath with no colour maths.

// The `stroke="none"` on both is what keeps the inked style honest. A wash
// overrides the group's fill by carrying its own; under Inked the group also
// carries a stroke, and a wash that did not override THAT would come back
// outlined — every shading blob ringed in black. Harmless under Classic,
// where the group has no stroke to override, and harmless in house.js, whose
// groups never set one either.
export const shade = (d, a = 0.12) => `<path d="${d}" fill="rgba(0,0,0,${a})" stroke="none"/>`;
export const light = (d, a = 0.12) => `<path d="${d}" fill="rgba(255,255,255,${a})" stroke="none"/>`;
/** A thin seam/fold/lace, drawn as a stroke — `fill:none` is an explicit
 *  override too, and far cheaper than authoring a sliver polygon. */
export const seam = (d, w = 1.2, a = 0.16) =>
  `<path d="${d}" fill="none" stroke="rgba(0,0,0,${a})" stroke-width="${w}" stroke-linecap="round"/>`;
export const seamLight = (d, w = 1.2, a = 0.2) =>
  `<path d="${d}" fill="none" stroke="rgba(255,255,255,${a})" stroke-width="${w}" stroke-linecap="round"/>`;
/** Emits a shape and its mirror — for parts that come in pairs (ears, arms,
 *  legs, shoes) rather than crossing the centreline. */
const pair = (make) => make(1) + make(-1);

/* ------------------------------------------------------------------- ink */

// The Inked style adds contour linework, and it does it by putting a stroke
// on the SAME <g> that already carries the slot's fill. Stroke inherits
// exactly like fill does, so every silhouette, garment shell, sleeve, leg
// tube, shoe and ear picks up a contour from the geometry that is already
// there — and so does every garment added in future. Nothing is authored
// twice, and the line can never drift off the shape it outlines because it
// IS the shape.
//
// It stays fully recolourable for the same reason the washes do: the line is
// one fixed near-black, never a darker shade computed from the fill, so it
// reads over green orc skin and a white sock alike with no colour maths.
// Opaque rather than the translucent black the washes use, for a reason that
// only shows up in `union` below: fattened copies of neighbouring pieces
// overlap, and stacked translucent ink comes out patchily darker where they do.
const INK = '#1d1826';
const INK_W = 1.2;        // a garment's outline
const INK_W_BODY = 1.7;   // the figure's own contour, heavier as cel wants
const INK_W_EYES = 0.45;  // an eye is 5 units across; INK_W would swallow it

const inkAttrs = (w) =>
  ` stroke="${INK}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;

/**
 * Outlines the UNION of a slot's pieces rather than each piece separately.
 *
 * The naive thing — stroking every shape — undoes the convention this whole
 * file is built on (see the header): overlapping pieces share one flat fill so
 * their joins vanish, and a sleeve, a leg tube and a sock band each carrying
 * its own outline brings every one of those joins back as a hard line. The
 * figure stops reading as a dressed body and starts reading as stacked slabs.
 *
 * So the group is drawn twice: once fattened and flooded with ink, then again
 * normally on top. The top pass covers everything but a `w`-wide fringe, which
 * is the union's outer edge and nothing else. Two details make it exact:
 * a wash carries its own `fill` and `stroke="none"`, so it refuses the flood
 * and contributes nothing; and every fattened mark that lands inside the
 * silhouette is painted over, so only the outside survives.
 */
const union = (inner, w) =>
  `<g fill="${INK}"${inkAttrs(w * 2)}>${inner}</g>${inner}`;

/* ---------------------------------------------------------------- styles */

// What each style switches on. Kept as flags rather than one name checked in
// forty places, because they compose: Gouache is Inked plus paint texture,
// and Anime is that plus a different face.
const STYLE = {
  classic: {},
  inked: { ink: true },
  soft: { soft: true },
  gouache: { ink: true, paint: true },
  anime: { ink: true, paint: true, anime: true },
  neon: { glass: true },
};

/**
 * The same copy-the-slot trick `union` uses, for the overlays that need a
 * silhouette of a slot rather than an outline of it — Soft's form shadow and
 * rim light. The washes have to come out of the copy first: they carry their
 * own fill, so they would ignore the gradient and simply paint themselves a
 * second time on top of the real ones.
 */
// Strips every element carrying a fill of its OWN, which leaves exactly the
// shapes that inherit the slot's colour — the forms. That is the set an
// overlay wants: washes would ignore the gradient and repaint themselves, and
// a copy of the white of an eye would blot out the iris beneath it.
const formsOnly = (s) =>
  s.replace(/<(?:path|rect|circle|ellipse)\b[^>]*?\sfill="[^"]*"[^>]*?\/>/g, '');

/**
 * The gradients and filters the richer styles reference, emitted by
 * avatarInner so they travel with the figure into house.js's room scene too.
 *
 * Every id is `av-`-prefixed for one specific reason: the avatar is live in
 * TWO svg documents at once (the tray pill and the panel stage), and nests
 * inside the room's svg, which carries defs of its own. `url(#id)` resolves
 * document-wide in HTML, so an unprefixed `#form` would collide with the
 * room's. Duplicate `av-` ids across the pill and the stage are harmless:
 * both render the same customize, so the definitions are identical.
 *
 * The gradients are userSpaceOnUse over the 120x210 frame, not the default
 * objectBoundingBox — bounding-box units would restart the gradient inside
 * every separate shape, lighting a sleeve from a different direction than the
 * torso it hangs off. One frame-wide ramp means one light source.
 */
function defsFor(S) {
  if (!S.soft && !S.paint && !S.glass) return '';
  const out = ['<defs>'];
  if (S.soft) {
    out.push('<linearGradient id="av-form" gradientUnits="userSpaceOnUse" x1="22" y1="6" x2="104" y2="200">' +
      '<stop offset="0" stop-color="rgba(0,0,0,0)"/>' +
      '<stop offset="0.42" stop-color="rgba(0,0,0,0.04)"/>' +
      '<stop offset="1" stop-color="rgba(0,0,0,0.26)"/></linearGradient>');
    // Kept low: this is a copy of the figure showing through a 0.7-unit offset,
    // so the alpha is the whole brightness of the rim. At 0.9 it stopped being
    // light wrapping an edge and became a wire drawn along one.
    out.push('<linearGradient id="av-rim" gradientUnits="userSpaceOnUse" x1="26" y1="4" x2="94" y2="150">' +
      '<stop offset="0" stop-color="rgba(255,255,255,0.44)"/>' +
      '<stop offset="0.45" stop-color="rgba(255,255,255,0.14)"/>' +
      '<stop offset="1" stop-color="rgba(255,255,255,0)"/></linearGradient>');
    out.push('<radialGradient id="av-ground" cx="0.5" cy="0.5" r="0.5">' +
      '<stop offset="0" stop-color="rgba(0,0,0,0.45)"/>' +
      '<stop offset="1" stop-color="rgba(0,0,0,0)"/></radialGradient>');
  }
  if (S.paint) {
    // Two turbulences doing two different jobs. The coarse one displaces the
    // artwork so every edge wanders the way a loaded brush does — which is
    // hue-agnostic by construction, since it moves geometry and never touches
    // colour. The fine one is paper tooth, composited back INSIDE the figure
    // so the grain stops at her silhouette instead of fogging the panel.
    out.push('<filter id="av-paint" x="-8%" y="-5%" width="116%" height="110%">' +
      '<feTurbulence type="fractalNoise" baseFrequency="0.028" numOctaves="3" seed="7" result="warp"/>' +
      '<feDisplacementMap in="SourceGraphic" in2="warp" scale="3.4" ' +
      'xChannelSelector="R" yChannelSelector="G" result="wob"/>' +
      '<feTurbulence type="fractalNoise" baseFrequency="0.62" numOctaves="2" seed="3" result="tooth"/>' +
      '<feColorMatrix in="tooth" type="matrix" result="grey" values="' +
      '0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0.46 0"/>' +
      '<feComposite in="grey" in2="wob" operator="in" result="inked"/>' +
      '<feBlend in="wob" in2="inked" mode="overlay"/></filter>');
  }
  if (S.glass) {
    out.push('<filter id="av-glow" x="-30%" y="-18%" width="160%" height="136%">' +
      '<feGaussianBlur in="SourceAlpha" stdDeviation="1.5" result="b"/>' +
      '<feFlood flood-color="#35e9ff" flood-opacity="0.5" result="c"/>' +
      '<feComposite in="c" in2="b" operator="in" result="glow"/>' +
      '<feMerge><feMergeNode in="glow"/>' +
      '<feMergeNode in="SourceGraphic"/></feMerge></filter>');
    out.push('<linearGradient id="av-sheen" gradientUnits="userSpaceOnUse" x1="18" y1="0" x2="86" y2="205">' +
      '<stop offset="0" stop-color="rgba(53,233,255,0.16)"/>' +
      '<stop offset="0.4" stop-color="rgba(255,255,255,0.10)"/>' +
      '<stop offset="0.58" stop-color="rgba(77,255,145,0.04)"/>' +
      '<stop offset="1" stop-color="rgba(77,255,145,0.14)"/></linearGradient>');
  }
  out.push('</defs>');
  return out.join('');
}

const n = (v) => Number(v).toFixed(2);
const seg = (c1, c2, to) => ({ c1, c2, to });

/**
 * Closes a perfectly symmetric outline from a right-half description.
 * `start` and the final segment's `to` must both sit on x = CX; the left
 * half is this same list mirrored about CX and walked backwards (reversing
 * a cubic just swaps its two control points). Authoring one side means the
 * two can never drift apart.
 */
function mirrorPath(start, segs) {
  const p = ([x, y]) => `${n(x)},${n(y)}`;
  const m = ([x, y]) => `${n(2 * CX - x)},${n(y)}`;
  let d = `M${p(start)}`;
  for (const s of segs) d += ` C${p(s.c1)} ${p(s.c2)} ${p(s.to)}`;
  for (let i = segs.length - 1; i >= 0; i--) {
    const from = i ? segs[i - 1].to : start;
    d += ` C${m(segs[i].c2)} ${m(segs[i].c1)} ${m(from)}`;
  }
  return `${d} Z`;
}

/* ------------------------------------------------------------- variation */

export const VARIANTS = {
  race: ['human', 'elf', 'dwarf', 'orc', 'halfling', 'tiefling'],
  gender: ['nb', 'fem', 'masc'],
  hairStyle: ['short', 'long', 'ponytail'],
  eyesStyle: ['round', 'happy', 'sparkle'],
  faceShape: ['oval', 'round', 'square'],
  // How the figure is drawn rather than what it is made of, so it composes
  // with every axis above instead of multiplying the geometry. Anime is the
  // one that also changes shape — see animeEyes — because a face is where
  // that style actually lives.
  style: ['inked', 'anime', 'gouache', 'soft', 'neon', 'classic'],
};

// Shoulder/hip half-widths and a waist multiplier, by gender. Hips stay
// well inside the shoulder line: the arms hang just outside the ribcage,
// so a torso as wide as the shoulders would swallow them entirely.
const TORSO_SHAPE = {
  nb: { shoulder: 20, hip: 15, waist: 1.0 },
  fem: { shoulder: 17.5, hip: 18.5, waist: 0.86 },
  masc: { shoulder: 23, hip: 14.5, waist: 1.06 },
};

// Face shape drives the same four skull numbers race does, so the two
// compose instead of fighting. `chin` is chin *tension*: low pulls the
// chin square and flat, high rounds it off.
const FACE_SHAPE = {
  oval: { rx: 1.0, ry: 1.0, cheek: 1.0, jaw: 0.74, chin: 0.55 },
  round: { rx: 1.12, ry: 0.9, cheek: 1.08, jaw: 0.88, chin: 0.92 },
  square: { rx: 1.04, ry: 0.96, cheek: 1.02, jaw: 0.98, chin: 0.24 },
};

/**
 * `head` scales the whole skull, `legs` is the fraction of shoulder-to-floor
 * that is leg (which is what actually reads as "short" or "leggy"), `build`
 * scales shoulder/hip width, `neck` the neck length. `jaw`/`cheek`/`brow`
 * shape the face; `ear` and `extras` add the distinguishing silhouette bits.
 */
export const RACE_PROFILE = {
  human: {
    label: 'Human',
    head: 1.0, legs: 0.52, build: 1.0, neck: 1.0,
    jaw: 1.0, cheek: 1.0, brow: 0.5, ear: 'round', extras: [],
    skin: ['#f5d5b8', '#e0b088', '#c98d5e', '#a26a3f', '#7a4b2b', '#5a3520'],
  },
  elf: {
    label: 'Elf',
    head: 0.93, legs: 0.58, build: 0.87, neck: 1.3,
    jaw: 0.8, cheek: 0.96, brow: 0.2, ear: 'long', extras: [],
    skin: ['#f7e3d3', '#f0d8c0', '#e2c6ad', '#d9e6e2', '#e6dcf2', '#c9a887'],
  },
  dwarf: {
    label: 'Dwarf',
    head: 1.16, legs: 0.42, build: 1.22, neck: 0.6,
    jaw: 1.16, cheek: 1.06, brow: 1.0, ear: 'round', extras: ['beard'],
    skin: ['#f0c8a0', '#d99b6c', '#c07a4e', '#a2603a', '#e8b48c', '#7d4a2e'],
  },
  orc: {
    label: 'Orc',
    head: 1.06, legs: 0.5, build: 1.3, neck: 0.65,
    jaw: 1.24, cheek: 1.02, brow: 1.3, ear: 'broad', extras: ['tusks'],
    skin: ['#9bbf6e', '#7a9c5a', '#5d7c44', '#4a6a52', '#6f8f7a', '#8a8f66'],
  },
  halfling: {
    label: 'Halfling',
    head: 1.2, legs: 0.44, build: 0.96, neck: 0.85,
    jaw: 0.92, cheek: 1.12, brow: 0.3, ear: 'roundBig', extras: [],
    skin: ['#f7dcbd', '#e8bd93', '#d3a071', '#b5804f', '#8f6238', '#f0cba6'],
  },
  tiefling: {
    label: 'Tiefling',
    head: 0.98, legs: 0.54, build: 0.94, neck: 1.1,
    jaw: 0.9, cheek: 0.98, brow: 0.7, ear: 'point', extras: ['horns'],
    skin: ['#d2716f', '#b4595c', '#8f3f45', '#6d2c36', '#c98fa0', '#7b4a6e'],
  },
};

/** The suggested skin tones for a race — offered alongside (never instead
 *  of) the current picture's palette in the customize tab. */
export function raceSkinPalette(race) {
  return (RACE_PROFILE[race] ?? RACE_PROFILE.human).skin;
}

export function defaultAvatarCustomize() {
  return {
    race: 'human', gender: 'nb', height: 1, weight: 1, style: 'inked',
    hair: { style: 'short', colour: '#3b2a1a' },
    eyes: { style: 'round', colour: '#4a7a8c' },
    face: { shape: 'oval' },
    skin: { colour: RACE_PROFILE.human.skin[1] },
    shirt: { itemId: 'shirt-basic', colour: '#c9c9c9' },
    bottoms: { itemId: 'bottoms-basic', colour: '#3a3a3a' },
    dress: { itemId: null, colour: '#c9c9c9' },
    socks: { itemId: 'socks-basic', colour: '#ffffff' },
    shoes: { itemId: 'shoes-basic', colour: '#2a2a2a' },
  };
}

/* --------------------------------------------------------------- metrics */

/**
 * Every landmark the rest of the file draws from. Each line depends only on
 * the ones above it, so race/gender/face/slider changes propagate in one
 * pass — and because cloth reads the same numbers as skin, a garment can't
 * drift off the body it's drawn on.
 *
 * height and weight fold in here rather than as an outer scale transform:
 * a transform anchored at the hips pushed a tall avatar's crown clean out
 * of the viewBox, and it would have multiplied with a race's own build
 * instead of composing with it. Height biases leg *fraction* (a tall person
 * has long legs, not a giant head) and weight becomes a girth multiplier.
 */
function metrics(c) {
  const P = RACE_PROFILE[c.race] ?? RACE_PROFILE.human;
  const G = TORSO_SHAPE[c.gender] ?? TORSO_SHAPE.nb;
  const F = FACE_SHAPE[c.face?.shape] ?? FACE_SHAPE.oval;
  const h = clamp(c.height ?? 1, 0.85, 1.2);
  const w = clamp(c.weight ?? 1, 0.8, 1.3);
  const girth = 0.9 + (w - 0.8) * 0.4;

  const headRy = 18.5 * P.head * F.ry;
  const headRx = 14 * P.head * F.rx * (0.97 + girth * 0.05);
  const chinY = HEAD_CY + headRy;
  const neckLen = 9 * P.neck * (0.94 + h * 0.06);
  const shoulderY = chinY + neckLen * 0.8;
  const shoulderHalf = G.shoulder * P.build * girth;
  const hipHalf = G.hip * P.build * girth;
  const span = FOOT_Y - shoulderY;
  const legFrac = clamp(P.legs + (h - 1) * 0.35, 0.38, 0.64);
  const hipY = shoulderY + span * (1 - legFrac);
  const legLen = FOOT_Y - hipY;
  const thighH = hipHalf * 0.46;

  return {
    P,
    // Carried on the metrics object rather than threaded through forty
    // signatures: every markup function below already receives M, so the
    // style reaches all of them without one of them changing shape.
    ...(STYLE[c.style ?? 'inked'] ?? STYLE.inked),
    headRx,
    headRy,
    crownY: HEAD_CY - headRy,
    chinY,
    browY: HEAD_CY - headRy * 0.26,
    eyeY: HEAD_CY - headRy * 0.04,
    noseY: HEAD_CY + headRy * 0.22,
    mouthY: HEAD_CY + headRy * 0.46,
    cheekY: HEAD_CY + headRy * 0.2,
    browHalf: headRx * 0.9,
    cheekHalf: headRx * F.cheek * P.cheek,
    jawHalf: headRx * F.jaw * P.jaw,
    jawY: HEAD_CY + headRy * 0.62,
    chinTension: F.chin,
    earX: headRx * F.cheek * P.cheek - 1,
    earY: HEAD_CY - headRy * 0.04 + 2,

    neckLen,
    neckHalf: headRx * 0.36,
    shoulderY,
    shoulderHalf,
    hipHalf,
    hipY,
    waistY: shoulderY + (hipY - shoulderY) * 0.62,
    waistHalf: (shoulderHalf * 0.30 + hipHalf * 0.34) * G.waist,
    chestY: shoulderY + (hipY - shoulderY) * 0.28,
    armpitY: shoulderY + 14 * (span / 136),

    legLen,
    legCx: hipHalf * 0.5,
    thighH,
    kneeH: thighH * 0.7,
    calfH: thighH * 0.66,
    ankleH: thighH * 0.42,
    crotchY: hipY + 8,
    kneeY: hipY + legLen * 0.5,
    ankleY: FOOT_Y - 9,

    // The arm hangs just inside the shoulder line, so its outer edge and
    // the deltoid agree while its inner edge clears the narrowed waist.
    armCx: shoulderHalf - shoulderHalf * 0.3 * 0.5,
    upperH: shoulderHalf * 0.3,
    elbowH: shoulderHalf * 0.3 * 0.82,
    wristH: shoulderHalf * 0.3 * 0.58,
    elbowY: shoulderY + (hipY - shoulderY) * 0.62,
    wristY: hipY + 6,
  };
}

/* ------------------------------------------------------------ silhouette */

/**
 * Neck, torso, both arms and both legs as ONE closed outline. Running down
 * the outside of a limb and back up its inside makes the arm gap and the
 * crotch V concavities *of a single contour* rather than gaps between
 * abutted shapes — which is the whole difference between this and a figure
 * that reads as assembled blocks.
 */
function bodyOutline(M) {
  const handY = M.wristY + M.wristH * 1.3;
  return mirrorPath([CX, M.chinY - 2], [
    // neck
    seg([CX + M.neckHalf * 0.7, M.chinY - 1], [CX + M.neckHalf, M.chinY + 3],
      [CX + M.neckHalf, M.shoulderY - 3]),
    // trapezius into the deltoid cap
    seg([CX + M.neckHalf + 2, M.shoulderY - 2], [CX + M.armCx + M.upperH - 3, M.shoulderY - 3],
      [CX + M.armCx + M.upperH, M.shoulderY + 3]),
    // upper arm, outer edge
    seg([CX + M.armCx + M.upperH + 1.2, M.shoulderY + 16], [CX + M.armCx + M.elbowH + 1, M.elbowY - 10],
      [CX + M.armCx + M.elbowH, M.elbowY]),
    // forearm, outer edge
    seg([CX + M.armCx + M.elbowH - 0.4, M.elbowY + 12], [CX + M.armCx + M.wristH + 0.8, M.wristY - 8],
      [CX + M.armCx + M.wristH, M.wristY]),
    // hand — a rounded paddle, no fingers at this size
    seg([CX + M.armCx + M.wristH + 1.4, handY + 2], [CX + M.armCx - M.wristH - 1.4, handY + 2],
      [CX + M.armCx - M.wristH * 0.9, M.wristY]),
    // back up the inside of the arm
    seg([CX + M.armCx - M.wristH - 0.6, M.wristY - 14], [CX + M.armCx - M.upperH * 0.8, M.armpitY + 12],
      [CX + M.armCx - M.upperH * 0.62, M.armpitY]),
    // armpit into the waist
    seg([CX + M.armCx - M.upperH * 0.5, M.armpitY + 5], [CX + M.waistHalf + 1.5, M.waistY - 12],
      [CX + M.waistHalf, M.waistY]),
    // waist over the hip
    seg([CX + M.waistHalf + 1, M.waistY + 10], [CX + M.hipHalf, M.hipY - 12],
      [CX + M.hipHalf, M.hipY]),
    // hip down the outer thigh to the knee
    seg([CX + M.hipHalf - 0.5, M.hipY + 9], [CX + M.legCx + M.kneeH + 1.5, M.kneeY - 14],
      [CX + M.legCx + M.kneeH, M.kneeY]),
    // knee to ankle
    seg([CX + M.legCx + M.kneeH - 0.6, M.kneeY + 14], [CX + M.legCx + M.ankleH + 0.8, M.ankleY - 8],
      [CX + M.legCx + M.ankleH, M.ankleY]),
    // the foot
    seg([CX + M.legCx + M.ankleH + 1.2, FOOT_Y - 2], [CX + M.legCx + M.ankleH + 1, FOOT_Y],
      [CX + M.legCx - M.ankleH * 0.7, FOOT_Y]),
    // inner ankle back up to the knee
    seg([CX + M.legCx - M.ankleH - 0.6, FOOT_Y - 5], [CX + M.legCx - M.calfH * 0.62, M.ankleY - 6],
      [CX + M.legCx - M.calfH * 0.55, M.kneeY]),
    // inner thigh into the crotch
    seg([CX + M.legCx - M.calfH * 0.5, M.kneeY - 16], [CX + 2.5, M.crotchY + 7],
      [CX, M.crotchY]),
  ]);
}

/** The skull: temples widest, tapering through the cheek to the jaw and
 *  chin. One path covers every face shape × race combination. */
function headOutline(M) {
  const chinW = M.jawHalf * M.chinTension;
  return mirrorPath([CX, M.crownY], [
    seg([CX + M.headRx * 0.6, M.crownY], [CX + M.browHalf + 0.5, M.browY - M.headRy * 0.42],
      [CX + M.browHalf + 0.5, M.browY]),
    seg([CX + M.cheekHalf, M.browY + M.headRy * 0.22], [CX + M.cheekHalf, M.cheekY - 2],
      [CX + M.cheekHalf, M.cheekY]),
    seg([CX + M.cheekHalf, M.cheekY + 3], [CX + M.jawHalf, M.jawY - 3.5],
      [CX + M.jawHalf, M.jawY]),
    seg([CX + M.jawHalf * 0.94, M.jawY + (M.chinY - M.jawY) * 0.55], [CX + chinW, M.chinY],
      [CX, M.chinY]),
  ]);
}

function earMarkup(M) {
  const kind = M.P.ear;
  const spec = {
    round: { out: 3.4, up: 4.6, w: 2.6 },
    roundBig: { out: 4.6, up: 6.2, w: 3.5 },
    point: { out: 8, up: 8, w: 2.8 },
    long: { out: 13, up: 13, w: 2.6 },
    broad: { out: 10, up: 5, w: 4.2 },
  }[kind] ?? { out: 3.4, up: 4.6, w: 2.6 };
  return pair((d) => {
    const x = CX + d * M.earX;
    const y = M.earY;
    const tipX = x + d * spec.out;
    const tipY = y - spec.up;
    return `<path d="M${n(x)},${n(y - spec.w)} ` +
      `C${n(x + d * spec.out * 0.55)},${n(y - spec.w - spec.up * 0.35)} ` +
      `${n(tipX - d * 1)},${n(tipY + 2)} ${n(tipX)},${n(tipY)} ` +
      `C${n(tipX - d * 1.5)},${n(tipY + spec.up * 0.55)} ` +
      `${n(x + d * spec.w * 1.2)},${n(y + spec.w * 0.6)} ${n(x)},${n(y + spec.w * 1.5)} Z"/>` +
      shade(`M${n(x + d * 0.6)},${n(y - spec.w * 0.5)} ` +
        `C${n(x + d * (spec.w + 0.6))},${n(y - spec.w * 0.4)} ` +
        `${n(x + d * (spec.w + 0.4))},${n(y + spec.w * 0.5)} ${n(x + d * 0.4)},${n(y + spec.w * 0.8)} Z`, 0.14);
  });
}

/**
 * Extras that belong on top of the hair rather than under it. Emitted into
 * a second `skin` group after the hair — harmless because recolouring
 * re-renders the whole string, and `closest('[data-slot]')` resolves a tap
 * on a horn to the skin slot either way.
 */
function raceExtrasOverHair(M) {
  if (!M.P.extras.includes('horns')) return '';
  // Solid mid-tone rather than the translucent wash used everywhere else:
  // horns are the one feature that sticks out past the silhouette onto the
  // backdrop, and a dark wash vanished completely against the widget pill's
  // near-black background. This reads on both the light panel and the pill.
  return pair((d) => {
    const x = CX + d * M.browHalf * 0.86;
    const y = M.crownY + 3;
    return `<path d="M${n(x + d * 1.5)},${n(y + 3)} C${n(x + d * 4)},${n(y - 3)} ` +
      `${n(x + d * 6)},${n(y - 7)} ${n(x + d * 7.5)},${n(y - 12)} ` +
      `C${n(x + d * 4.5)},${n(y - 9.5)} ${n(x + d * 1)},${n(y - 3)} ${n(x - d * 3.5)},${n(y + 3.5)} Z" ` +
      `fill="#8d7183"/>` +
      seamLight(`M${n(x + d * 1)},${n(y + 1)} C${n(x + d * 3.4)},${n(y - 4)} ` +
        `${n(x + d * 5.4)},${n(y - 8)} ${n(x + d * 6.6)},${n(y - 11)}`, 1, 0.3);
  });
}

function raceExtras(M) {
  const out = [];
  if (M.P.extras.includes('tusks')) {
    // Ivory, explicitly — a tusk must not inherit green skin.
    // Rooted at the lower lip and curving up over it — short and stout, or
    // at this scale they read as tear streaks rather than tusks.
    out.push(pair((d) => {
      const x = CX + d * M.jawHalf * 0.5;
      const y = M.mouthY + 2.6;
      return `<path d="M${n(x - d * 2.1)},${n(y)} C${n(x - d * 2.4)},${n(y - 3.4)} ` +
        `${n(x + d * 0.6)},${n(y - 4.6)} ${n(x + d * 1.7)},${n(y - 5.6)} ` +
        `C${n(x + d * 2.4)},${n(y - 3)} ${n(x + d * 2.1)},${n(y + 0.4)} ${n(x - d * 2.1)},${n(y)} Z" ` +
        `fill="#f3ece0"/>`;
    }));
  }
  return out.join('');
}

/** Nose, mouth and the skin shading. Nine shapes, and the nose alone is the
 *  single biggest "reads as a face" gain over the old flat oval. */
/** Anime shorthand for the nose and mouth: a single tick where the nostril
 *  shadow would be, and a mouth small enough to sit under those large eyes
 *  without competing with them. */
function animeNoseMouth(M) {
  const w = M.headRx * 0.1;
  return [
    shade(`M${n(CX - w * 0.4)},${n(M.noseY - 1.2)} Q${n(CX + w * 1.5)},${n(M.noseY + 0.4)} ` +
      `${n(CX - w * 0.2)},${n(M.noseY + 1.4)} Q${n(CX + w * 0.3)},${n(M.noseY)} ` +
      `${n(CX - w * 0.4)},${n(M.noseY - 1.2)} Z`, 0.22),
    `<path d="M${n(CX - M.headRx * 0.15)},${n(M.mouthY + 0.6)} ` +
      `Q${n(CX)},${n(M.mouthY + 2.8)} ${n(CX + M.headRx * 0.15)},${n(M.mouthY + 0.6)} ` +
      `Q${n(CX)},${n(M.mouthY + 1.5)} ${n(CX - M.headRx * 0.15)},${n(M.mouthY + 0.6)} Z" ` +
      `fill="rgba(150,74,74,0.66)" stroke="none"/>`,
  ].join('');
}

function faceAndShading(M) {
  const noseW = M.headRx * 0.16;
  if (M.anime) {
    return animeNoseMouth(M) + [
      shade(`M${n(CX - M.jawHalf * 0.8)},${n(M.chinY - 1)} ` +
        `Q${n(CX)},${n(M.chinY + M.neckLen * 0.55)} ${n(CX + M.jawHalf * 0.8)},${n(M.chinY - 1)} ` +
        `Q${n(CX)},${n(M.chinY + 1)} ${n(CX - M.jawHalf * 0.8)},${n(M.chinY - 1)} Z`, 0.15),
      // A blush across the cheeks, which is doing the work the shading used to.
      pair((d) => shade(`M${n(CX + d * M.cheekHalf * 0.42)},${n(M.cheekY + 1)} ` +
        `Q${n(CX + d * M.cheekHalf * 0.78)},${n(M.cheekY - 1.6)} ` +
        `${n(CX + d * M.cheekHalf * 0.92)},${n(M.cheekY + 1.4)} ` +
        `Q${n(CX + d * M.cheekHalf * 0.7)},${n(M.cheekY + 3.4)} ` +
        `${n(CX + d * M.cheekHalf * 0.42)},${n(M.cheekY + 1)} Z`, 0.08)),
      shade(`M${n(CX + M.waistHalf * 0.98)},${n(M.armpitY)} ` +
        `C${n(CX + M.waistHalf + 1)},${n(M.waistY)} ${n(CX + M.hipHalf)},${n(M.hipY - 12)} ` +
        `${n(CX + M.hipHalf)},${n(M.hipY)} ` +
        `L${n(CX + M.hipHalf - 5)},${n(M.hipY)} ` +
        `C${n(CX + M.hipHalf - 5)},${n(M.hipY - 12)} ${n(CX + M.waistHalf - 4)},${n(M.waistY)} ` +
        `${n(CX + M.waistHalf * 0.98 - 4)},${n(M.armpitY)} Z`, 0.09),
      pair((d) => shade(`M${n(CX + d * (M.legCx - M.thighH * 0.55))},${n(M.crotchY)} ` +
        `C${n(CX + d * (M.legCx - M.calfH * 0.6))},${n(M.kneeY)} ` +
        `${n(CX + d * (M.legCx - M.ankleH * 0.7))},${n(M.ankleY - 10)} ` +
        `${n(CX + d * (M.legCx - M.ankleH * 0.6))},${n(M.ankleY)} ` +
        `L${n(CX + d * (M.legCx - M.ankleH * 0.6 + 3))},${n(M.ankleY)} ` +
        `C${n(CX + d * (M.legCx - M.calfH * 0.5 + 3))},${n(M.kneeY)} ` +
        `${n(CX + d * (M.legCx - M.thighH * 0.5 + 3))},${n(M.crotchY + 6)} ` +
        `${n(CX + d * (M.legCx - M.thighH * 0.55 + 2))},${n(M.crotchY)} Z`, 0.07)),
    ].join('');
  }
  return [
    // nose — a soft wedge with a lit bridge beside it
    shade(`M${n(CX)},${n(M.noseY - M.headRy * 0.2)} ` +
      `C${n(CX + noseW * 0.7)},${n(M.noseY - 2)} ${n(CX + noseW * 1.5)},${n(M.noseY)} ` +
      `${n(CX + noseW * 1.1)},${n(M.noseY + 1.6)} ` +
      `C${n(CX)},${n(M.noseY + 2.6)} ${n(CX - noseW * 1.1)},${n(M.noseY + 1.6)} ` +
      `${n(CX - noseW * 1.5)},${n(M.noseY)} Z`, 0.13),
    light(`M${n(CX - noseW * 0.5)},${n(M.noseY - M.headRy * 0.28)} ` +
      `C${n(CX - noseW * 0.1)},${n(M.noseY - 3)} ${n(CX - noseW * 0.2)},${n(M.noseY - 1)} ` +
      `${n(CX - noseW * 0.7)},${n(M.noseY + 0.4)} Z`, 0.12),
    // mouth
    `<path d="M${n(CX - M.headRx * 0.3)},${n(M.mouthY)} ` +
      `Q${n(CX)},${n(M.mouthY + 3.2)} ${n(CX + M.headRx * 0.3)},${n(M.mouthY)} ` +
      `Q${n(CX)},${n(M.mouthY + 1.4)} ${n(CX - M.headRx * 0.3)},${n(M.mouthY)} Z" ` +
      `fill="rgba(150,74,74,0.62)" stroke="none"/>`,
    light(`M${n(CX - M.headRx * 0.2)},${n(M.mouthY + 2.4)} ` +
      `Q${n(CX)},${n(M.mouthY + 3.6)} ${n(CX + M.headRx * 0.2)},${n(M.mouthY + 2.4)} ` +
      `Q${n(CX)},${n(M.mouthY + 3)} ${n(CX - M.headRx * 0.2)},${n(M.mouthY + 2.4)} Z`, 0.14),
    // brow ridge — heavier for orc/dwarf
    shade(`M${n(CX - M.browHalf * 0.85)},${n(M.browY + 1)} ` +
      `Q${n(CX)},${n(M.browY - 1.4)} ${n(CX + M.browHalf * 0.85)},${n(M.browY + 1)} ` +
      `Q${n(CX)},${n(M.browY + 2.6)} ${n(CX - M.browHalf * 0.85)},${n(M.browY + 1)} Z`,
    0.05 + M.P.brow * 0.09),
    // lit forehead and cheek, upper-left
    light(`M${n(CX - M.browHalf * 0.8)},${n(M.browY - 2)} ` +
      `C${n(CX - M.browHalf * 0.5)},${n(M.crownY + 2)} ${n(CX - 1)},${n(M.crownY + 2)} ` +
      `${n(CX - 1)},${n(M.browY - 3)} Z`, 0.1),
    light(`M${n(CX - M.cheekHalf * 0.86)},${n(M.cheekY - 1)} ` +
      `C${n(CX - M.cheekHalf * 0.5)},${n(M.cheekY + 3)} ${n(CX - M.cheekHalf * 0.3)},${n(M.cheekY + 1)} ` +
      `${n(CX - M.cheekHalf * 0.4)},${n(M.cheekY - 3)} Z`, 0.09),
    // under-chin shadow onto the neck
    shade(`M${n(CX - M.jawHalf * 0.8)},${n(M.chinY - 1)} ` +
      `Q${n(CX)},${n(M.chinY + M.neckLen * 0.55)} ${n(CX + M.jawHalf * 0.8)},${n(M.chinY - 1)} ` +
      `Q${n(CX)},${n(M.chinY + 1)} ${n(CX - M.jawHalf * 0.8)},${n(M.chinY - 1)} Z`, 0.15),
    // torso core shadow hugging the right silhouette
    shade(`M${n(CX + M.waistHalf * 0.98)},${n(M.armpitY)} ` +
      `C${n(CX + M.waistHalf + 1)},${n(M.waistY)} ${n(CX + M.hipHalf)},${n(M.hipY - 12)} ` +
      `${n(CX + M.hipHalf)},${n(M.hipY)} ` +
      `L${n(CX + M.hipHalf - 5)},${n(M.hipY)} ` +
      `C${n(CX + M.hipHalf - 5)},${n(M.hipY - 12)} ${n(CX + M.waistHalf - 4)},${n(M.waistY)} ` +
      `${n(CX + M.waistHalf * 0.98 - 4)},${n(M.armpitY)} Z`, 0.09),
    // lit left shoulder cap
    light(`M${n(CX - M.armCx - M.upperH)},${n(M.shoulderY + 4)} ` +
      `C${n(CX - M.armCx - M.upperH + 1)},${n(M.shoulderY - 3)} ${n(CX - M.neckHalf - 3)},${n(M.shoulderY - 3)} ` +
      `${n(CX - M.neckHalf)},${n(M.shoulderY)} ` +
      `C${n(CX - M.neckHalf - 4)},${n(M.shoulderY + 2)} ${n(CX - M.armCx - M.upperH + 2)},${n(M.shoulderY + 7)} ` +
      `${n(CX - M.armCx - M.upperH)},${n(M.shoulderY + 4)} Z`, 0.11),
    // inner-leg shadow, both legs
    pair((d) => shade(`M${n(CX + d * (M.legCx - M.thighH * 0.55))},${n(M.crotchY)} ` +
      `C${n(CX + d * (M.legCx - M.calfH * 0.6))},${n(M.kneeY)} ` +
      `${n(CX + d * (M.legCx - M.ankleH * 0.7))},${n(M.ankleY - 10)} ` +
      `${n(CX + d * (M.legCx - M.ankleH * 0.6))},${n(M.ankleY)} ` +
      `L${n(CX + d * (M.legCx - M.ankleH * 0.6 + 3))},${n(M.ankleY)} ` +
      `C${n(CX + d * (M.legCx - M.calfH * 0.5 + 3))},${n(M.kneeY)} ` +
      `${n(CX + d * (M.legCx - M.thighH * 0.5 + 3))},${n(M.crotchY + 6)} ` +
      `${n(CX + d * (M.legCx - M.thighH * 0.55 + 2))},${n(M.crotchY)} Z`, 0.07)),
  ].join('');
}

/* ------------------------------------------------------------------ hair */

function hairBack(style, M) {
  const { crownY, cheekHalf, headRx } = M;
  if (style === 'long') {
    return `<path d="M${n(CX - cheekHalf - 2)},${n(M.browY)} ` +
      `C${n(CX - cheekHalf - 5)},${n(M.chinY + 18)} ${n(CX - cheekHalf - 3)},${n(M.shoulderY + 22)} ` +
      `${n(CX - cheekHalf + 1)},${n(M.shoulderY + 26)} ` +
      `L${n(CX + cheekHalf - 1)},${n(M.shoulderY + 26)} ` +
      `C${n(CX + cheekHalf + 3)},${n(M.shoulderY + 22)} ${n(CX + cheekHalf + 5)},${n(M.chinY + 18)} ` +
      `${n(CX + cheekHalf + 2)},${n(M.browY)} Z"/>` +
      shade(`M${n(CX + cheekHalf * 0.3)},${n(M.browY + 4)} ` +
        `C${n(CX + cheekHalf + 2)},${n(M.chinY + 14)} ${n(CX + cheekHalf)},${n(M.shoulderY + 20)} ` +
        `${n(CX + cheekHalf - 1)},${n(M.shoulderY + 26)} ` +
        `L${n(CX + cheekHalf - 6)},${n(M.shoulderY + 26)} ` +
        `C${n(CX + cheekHalf - 5)},${n(M.chinY + 14)} ${n(CX + cheekHalf * 0.2)},${n(M.browY + 6)} ` +
        `${n(CX + cheekHalf * 0.3)},${n(M.browY + 4)} Z`, 0.12);
  }
  if (style === 'ponytail') {
    const x = CX + cheekHalf + 1;
    return `<path d="M${n(x - 2)},${n(crownY + 6)} ` +
      `C${n(x + 12)},${n(crownY + 10)} ${n(x + 15)},${n(M.chinY + 6)} ${n(x + 9)},${n(M.chinY + 20)} ` +
      `C${n(x + 6)},${n(M.chinY + 26)} ${n(x + 1)},${n(M.chinY + 24)} ${n(x + 2)},${n(M.chinY + 18)} ` +
      `C${n(x + 6)},${n(M.chinY + 4)} ${n(x + 4)},${n(crownY + 14)} ${n(x - 4)},${n(crownY + 10)} Z"/>` +
      shade(`M${n(x + 2)},${n(crownY + 9)} C${n(x + 11)},${n(crownY + 14)} ${n(x + 11)},${n(M.chinY + 8)} ` +
        `${n(x + 6)},${n(M.chinY + 19)} C${n(x + 9)},${n(M.chinY + 6)} ${n(x + 7)},${n(crownY + 15)} ` +
        `${n(x + 2)},${n(crownY + 9)} Z`, 0.12);
  }
  return '';
}

function hairFront(style, M) {
  const { crownY, browY, browHalf, cheekHalf, headRx, headRy } = M;
  // The cap follows the skull curve, so it fits every race head size.
  const cap = mirrorPath([CX, crownY - 2.5], [
    seg([CX + headRx * 0.62, crownY - 2.5], [CX + cheekHalf + 1.5, browY - headRy * 0.4],
      [CX + cheekHalf + 1.5, browY + 1]),
    seg([CX + cheekHalf + 1, browY - 1], [CX + browHalf * 0.94, browY - 3],
      [CX + browHalf * 0.7, browY - 3.2]),
    seg([CX + browHalf * 0.4, browY - 3.6], [CX + browHalf * 0.2, crownY + 4],
      [CX, crownY + 3.2]),
  ]);
  const sheen = light(`M${n(CX - browHalf * 0.75)},${n(crownY + 4)} ` +
    `C${n(CX - browHalf * 0.4)},${n(crownY - 0.5)} ${n(CX + browHalf * 0.15)},${n(crownY - 0.8)} ` +
    `${n(CX + browHalf * 0.45)},${n(crownY + 2.5)} ` +
    `C${n(CX + browHalf * 0.1)},${n(crownY + 1.5)} ${n(CX - browHalf * 0.4)},${n(crownY + 2)} ` +
    `${n(CX - browHalf * 0.75)},${n(crownY + 4)} Z`, 0.15);
  // Brows live in the hair group so they always colour-match, as real ones do.
  // `stroke="none"` opts them out of the Inked outline the same way a wash
  // opts out: a brow is only about a unit and a half thick, so a line down
  // both sides of one nearly triples it, and a tripled brow meeting a lined
  // eye below turns the whole face into a mask.
  const brows = pair((d) => `<path d="M${n(CX + d * browHalf * 0.28)},${n(browY + 2.6)} ` +
    `Q${n(CX + d * browHalf * 0.6)},${n(browY + 0.4)} ${n(CX + d * browHalf * 0.92)},${n(browY + 2.2)} ` +
    `L${n(CX + d * browHalf * 0.92)},${n(browY + 3.6)} ` +
    `Q${n(CX + d * browHalf * 0.6)},${n(browY + 2)} ${n(CX + d * browHalf * 0.28)},${n(browY + 4)} Z" ` +
    `stroke="none"/>`);
  const capTag = `<path d="${cap}"/>`;
  // Also out of the Inked outline, and for the same reason as the brows: a
  // sideburn is a two-unit spike sitting at eye level, so a line round it
  // fills it in and leaves a hard dark hook crowding the eye. Unlined it
  // stays what it was drawn to be — hair, reading as part of the cap it
  // touches.
  const sideburns = style === 'short'
    ? pair((d) => `<path d="M${n(CX + d * (cheekHalf + 0.5))},${n(browY + 1)} ` +
        `L${n(CX + d * (cheekHalf + 1.5))},${n(M.cheekY - 1)} ` +
        `L${n(CX + d * (cheekHalf - 1.5))},${n(M.cheekY - 2)} Z" stroke="none"/>`)
    : '';
  const beard = M.P.extras.includes('beard') ? beardMarkup(M) : '';
  // The "angel ring" — the band of shine anime hair carries across the crown.
  // A wash like every other highlight here, so it works over any hair colour.
  // Two short bands rather than one across the whole crown: the cap dips to a
  // parting at the centreline, so a single band spills off the hair and lights
  // up the forehead under it. Broken shine is what anime hair does anyway.
  const ring = M.anime
    ? pair((d) => {
      const y = crownY + headRy * 0.2;
      const x0 = CX + d * browHalf * 0.36;
      const x1 = CX + d * browHalf * 0.84;
      return light(`M${n(x0)},${n(y + 1.1)} Q${n((x0 + x1) / 2)},${n(y - 1.9)} ${n(x1)},${n(y + 1.4)} ` +
        `Q${n((x0 + x1) / 2)},${n(y + 0.5)} ${n(x0)},${n(y + 1.1)} Z`, 0.32);
    })
    : '';
  return capTag + sideburns + sheen + ring + brows + beard;
}

function beardMarkup(M) {
  const { cheekHalf, chinY, jawHalf, mouthY } = M;
  const bottom = chinY + M.headRy * 0.62;
  // Sideburns start at the cheekbone, not the eyeline — any higher and the
  // beard reads as a mask over the whole face.
  const topY = M.cheekY + 3;
  return `<path d="M${n(CX - cheekHalf - 0.5)},${n(topY)} ` +
    `C${n(CX - cheekHalf - 2)},${n(chinY - 2)} ${n(CX - jawHalf * 0.9)},${n(bottom - 2)} ` +
    `${n(CX)},${n(bottom)} ` +
    `C${n(CX + jawHalf * 0.9)},${n(bottom - 2)} ${n(CX + cheekHalf + 2)},${n(chinY - 2)} ` +
    `${n(CX + cheekHalf + 0.5)},${n(topY)} ` +
    `C${n(CX + cheekHalf * 0.55)},${n(mouthY + 1)} ${n(CX - cheekHalf * 0.55)},${n(mouthY + 1)} ` +
    `${n(CX - cheekHalf - 0.5)},${n(topY)} Z"/>` +
    // moustache, then a shadow separating it from the lower lip
    `<path d="M${n(CX - jawHalf * 0.6)},${n(mouthY - 2.4)} ` +
    `Q${n(CX)},${n(mouthY - 4.5)} ${n(CX + jawHalf * 0.6)},${n(mouthY - 2.4)} ` +
    `Q${n(CX)},${n(mouthY + 0.6)} ${n(CX - jawHalf * 0.6)},${n(mouthY - 2.4)} Z"/>` +
    shade(`M${n(CX - jawHalf * 0.5)},${n(mouthY + 3.4)} ` +
      `Q${n(CX)},${n(mouthY + 5.4)} ${n(CX + jawHalf * 0.5)},${n(mouthY + 3.4)} ` +
      `Q${n(CX)},${n(mouthY + 4.2)} ${n(CX - jawHalf * 0.5)},${n(mouthY + 3.4)} Z`, 0.12) +
    light(`M${n(CX - jawHalf * 0.7)},${n(chinY + 3)} ` +
      `Q${n(CX - jawHalf * 0.2)},${n(chinY + 7)} ${n(CX + jawHalf * 0.1)},${n(chinY + 4)} ` +
      `Q${n(CX - jawHalf * 0.2)},${n(chinY + 5.5)} ${n(CX - jawHalf * 0.7)},${n(chinY + 3)} Z`, 0.1);
}

/* ------------------------------------------------------------------ eyes */

/**
 * The anime eye: tall rather than round, iris nearly filling the opening,
 * banded dark at the top and bright at the bottom, a big off-centre highlight
 * and a small opposing one, under a lash line heavy enough to be the darkest
 * mark on the face.
 *
 * Both bands sit wholly INSIDE the iris on purpose. The usual way to draw
 * them is to clip an oversized shape to the iris, and a clipPath would need
 * an id — which this file has none of, because the figure is live in two svg
 * documents at once and nests inside the room's, where `url(#id)` resolves
 * document-wide. Sizing them to fit needs no clip and no id.
 */
function animeEyes(M) {
  const ex = M.browHalf * 0.58;
  const ey = M.eyeY + 1.4;
  const r = M.headRx * 0.29;
  const h = r * 1.3;
  return pair((d) => {
    const x = CX + d * ex;
    return `<ellipse cx="${n(x)}" cy="${n(ey)}" rx="${n(r)}" ry="${n(h)}" fill="#fdfdff"/>` +
      `<ellipse cx="${n(x)}" cy="${n(ey + h * 0.04)}" rx="${n(r * 0.8)}" ry="${n(h * 0.88)}"/>` +
      `<ellipse cx="${n(x)}" cy="${n(ey - h * 0.26)}" rx="${n(r * 0.78)}" ry="${n(h * 0.5)}" ` +
      `fill="rgba(0,0,0,0.32)" stroke="none"/>` +
      `<ellipse cx="${n(x)}" cy="${n(ey + h * 0.44)}" rx="${n(r * 0.6)}" ry="${n(h * 0.32)}" ` +
      `fill="rgba(255,255,255,0.34)" stroke="none"/>` +
      `<ellipse cx="${n(x)}" cy="${n(ey + h * 0.04)}" rx="${n(r * 0.3)}" ry="${n(h * 0.44)}" ` +
      `fill="rgba(0,0,0,0.78)" stroke="none"/>` +
      `<ellipse cx="${n(x - r * 0.33)}" cy="${n(ey - h * 0.4)}" rx="${n(r * 0.3)}" ` +
      `ry="${n(h * 0.24)}" fill="#ffffff" stroke="none"/>` +
      `<circle cx="${n(x + r * 0.36)}" cy="${n(ey + h * 0.42)}" r="${n(r * 0.14)}" ` +
      `fill="rgba(255,255,255,0.9)" stroke="none"/>` +
      // Lash line, then the outward flick that reads as the eye's outer corner.
      seam(`M${n(x - r * 1.04)},${n(ey - h * 0.58)} Q${n(x)},${n(ey - h * 1.34)} ` +
        `${n(x + r * 1.02)},${n(ey - h * 0.62)}`, 2.3, 0.84) +
      seam(`M${n(x + d * r * 0.98)},${n(ey - h * 0.62)} L${n(x + d * r * 1.46)},${n(ey - h * 1.02)}`,
        1.5, 0.72) +
      seam(`M${n(x - r * 0.7)},${n(ey + h * 0.94)} Q${n(x)},${n(ey + h * 1.12)} ` +
        `${n(x + r * 0.7)},${n(ey + h * 0.92)}`, 0.8, 0.3);
  });
}

function eyesShapes(style, M) {
  if (M.anime) return animeEyes(M);
  const ex = M.browHalf * 0.55;
  const ey = M.eyeY + 1;
  const r = M.headRx * 0.19;
  if (style === 'happy') {
    // Already line art, so Inked only leans on it — a touch heavier and
    // darker, to sit alongside the contour the rest of the figure now has.
    return pair((d) => seam(`M${n(CX + d * (ex - r * 1.3))},${n(ey + 0.6)} ` +
      `Q${n(CX + d * ex)},${n(ey - r * 1.5)} ${n(CX + d * (ex + r * 1.3))},${n(ey + 0.6)}`,
    M.ink ? 2 : 1.6, M.ink ? 0.72 : 0.62)) +
      pair((d) => `<ellipse cx="${n(CX + d * ex)}" cy="${n(ey + 1.6)}" rx="${n(r * 0.5)}" ` +
        `ry="${n(r * 0.3)}" stroke="none"/>`);
  }
  const big = style === 'sparkle';
  const irisR = big ? r * 1.15 : r * 0.86;
  // The sclera and the iris take the group's (already fine) line — a rim on
  // the white and on the iris is exactly what a cel eye wants. The pupil and
  // the catchlights explicitly refuse it: the pupil is dark enough already,
  // and a ring on a highlight barely a unit across erases the highlight.
  return pair((d) => {
    const x = CX + d * ex;
    return `<ellipse cx="${n(x)}" cy="${n(ey)}" rx="${n(r * 1.32)}" ry="${n(r * 1.12)}" fill="#fff"/>` +
      `<circle cx="${n(x)}" cy="${n(ey)}" r="${n(irisR)}"/>` +
      `<circle cx="${n(x)}" cy="${n(ey)}" r="${n(irisR * 0.46)}" fill="rgba(0,0,0,0.75)" stroke="none"/>` +
      `<circle cx="${n(x + 0.9)}" cy="${n(ey - 1)}" r="${n(irisR * 0.3)}" fill="#fff" stroke="none"/>` +
      (big ? `<circle cx="${n(x - 1)}" cy="${n(ey + 1)}" r="${n(irisR * 0.16)}" fill="#fff" stroke="none"/>` : '') +
      seam(`M${n(x - r * 1.32)},${n(ey - r * 0.5)} Q${n(x)},${n(ey - r * 1.5)} ${n(x + r * 1.32)},${n(ey - r * 0.5)}`,
        0.9, 0.32);
  });
}

/* -------------------------------------------------------------- garments */

/** Resolves a worn item's shape style, falling back to 'basic' for an id the
 *  catalogue no longer has — a stored save can outlive a wardrobe rebalance. */
function styleOf(itemId) {
  return WARDROBE_BY_ID.get(itemId)?.style ?? 'basic';
}

/**
 * A garment shell: the torso contour plus `puff` units of cloth. Because it
 * reads the same landmarks the body does, it sits on the figure for every
 * race/gender/slider combination by construction.
 */
function shell(M, { puff = 2, topY, hemY, neckDip = 4, inset = 0, flare = 0 }) {
  const sh = M.shoulderHalf - inset + puff;
  const wa = M.waistHalf + puff;
  const hp = M.hipHalf + puff;
  const hem = hp + flare;
  const midY = (M.hipY + hemY) / 2;
  return mirrorPath([CX, topY + neckDip], [
    seg([CX + sh * 0.45, topY + neckDip * 0.95], [CX + sh * 0.82, topY + 0.5], [CX + sh, topY + 1]),
    seg([CX + sh + 1, M.armpitY], [CX + wa + 1.5, M.waistY - 10], [CX + wa, M.waistY]),
    seg([CX + wa + 1, M.waistY + 10], [CX + hp, M.hipY - 10], [CX + hp, M.hipY]),
    seg([CX + hp + flare * 0.45, midY], [CX + hem, hemY - 6], [CX + hem, hemY]),
    seg([CX + hem * 0.62, hemY + 4], [CX + hem * 0.3, hemY + 5], [CX, hemY + 5]),
  ]);
}

/** Sleeves, as a pair of tapered tubes down the arm. */
function sleeves(M, hemY, puff = 2) {
  return pair((d) => {
    const cx = CX + d * M.armCx;
    const up = M.upperH + puff;
    const lo = M.elbowH + puff * 0.9;
    return `<path d="M${n(cx - d * up)},${n(M.shoulderY + 1)} ` +
      `C${n(cx - d * (up + 0.5))},${n(M.shoulderY - 3)} ${n(cx + d * (up - 0.5))},${n(M.shoulderY - 3.5)} ` +
      `${n(cx + d * up)},${n(M.shoulderY + 1)} ` +
      `C${n(cx + d * (up + 1))},${n(M.shoulderY + 14)} ${n(cx + d * (lo + 0.5))},${n(hemY - 8)} ` +
      `${n(cx + d * lo)},${n(hemY)} ` +
      `C${n(cx + d * lo * 0.4)},${n(hemY + 2.5)} ${n(cx - d * lo * 0.4)},${n(hemY + 2.5)} ` +
      `${n(cx - d * lo)},${n(hemY)} ` +
      `C${n(cx - d * (lo + 0.5))},${n(hemY - 8)} ${n(cx - d * (up + 1))},${n(M.shoulderY + 14)} ` +
      `${n(cx - d * up)},${n(M.shoulderY + 1)} Z"/>`;
  });
}

/** One trouser/sock/boot leg tube. */
function legTube(M, d, { puff = 1.5, topY, hemY }) {
  const cx = CX + d * M.legCx;
  const th = M.thighH + puff;
  const kn = M.kneeH + puff;
  const an = M.ankleH + puff;
  const kneeY = clamp(M.kneeY, topY + 2, hemY - 2);
  return `<path d="M${n(cx - th)},${n(topY)} L${n(cx + th)},${n(topY)} ` +
    `C${n(cx + th)},${n(kneeY - 10)} ${n(cx + kn)},${n(kneeY - 4)} ${n(cx + kn)},${n(kneeY)} ` +
    `C${n(cx + kn)},${n(hemY - 10)} ${n(cx + an)},${n(hemY - 5)} ${n(cx + an)},${n(hemY)} ` +
    `L${n(cx - an)},${n(hemY)} ` +
    `C${n(cx - an)},${n(hemY - 5)} ${n(cx - kn)},${n(hemY - 10)} ${n(cx - kn)},${n(kneeY)} ` +
    `C${n(cx - kn)},${n(kneeY - 4)} ${n(cx - th)},${n(kneeY - 10)} ${n(cx - th)},${n(topY)} Z"/>`;
}

/**
 * The sculpted cloth shading shared by shirts and dress bodices: a deep core
 * shadow down both flanks, a soft highlight ridge down the centre, chest and
 * waist fold creases, and an under-sleeve shadow. This is what gives a garment
 * cloth weight instead of reading as a flat cutout — the difference the
 * "cheap/flat" complaint was about.
 */
function bodiceShade(M, { sh, hp, hemY, puff, sleeved = true }) {
  const out = [
    // deep core shadow, both flanks
    pair((d) => shade(`M${n(CX + d * sh * 0.9)},${n(M.armpitY)} ` +
      `C${n(CX + d * (M.waistHalf + puff + 1))},${n(M.waistY)} ${n(CX + d * hp)},${n(M.hipY - 8)} ` +
      `${n(CX + d * hp)},${n(hemY)} L${n(CX + d * (hp - 6))},${n(hemY)} ` +
      `C${n(CX + d * (hp - 6))},${n(M.hipY - 8)} ${n(CX + d * (M.waistHalf + puff - 4))},${n(M.waistY)} ` +
      `${n(CX + d * (sh * 0.9 - 5))},${n(M.armpitY)} Z`, 0.15)),
    // centre highlight ridge
    light(`M${n(CX - sh * 0.15)},${n(M.chestY - 1)} C${n(CX - sh * 0.1)},${n(M.waistY)} ` +
      `${n(CX - sh * 0.1)},${n(M.hipY)} ${n(CX - sh * 0.13)},${n(hemY - 2)} L${n(CX + sh * 0.05)},${n(hemY - 2)} ` +
      `C${n(CX + sh * 0.08)},${n(M.hipY)} ${n(CX + sh * 0.08)},${n(M.waistY)} ${n(CX + sh * 0.04)},${n(M.chestY - 1)} Z`, 0.09),
    // chest fold creases + a waist crease
    pair((d) => seam(`M${n(CX + d * sh * 0.34)},${n(M.chestY + 3)} ` +
      `Q${n(CX + d * sh * 0.2)},${n((M.chestY + M.waistY) / 2)} ${n(CX + d * sh * 0.26)},${n(M.waistY + 2)}`, 0.9, 0.11)),
    seam(`M${n(CX - sh * 0.48)},${n(M.waistY + 6)} Q${n(CX)},${n(M.waistY + 10)} ${n(CX + sh * 0.48)},${n(M.waistY + 6)}`, 0.9, 0.09),
  ];
  if (sleeved) {
    out.push(pair((d) => shade(`M${n(CX + d * (M.armCx + M.upperH * 0.2))},${n(M.shoulderY + 6)} ` +
      `Q${n(CX + d * (M.armCx + M.elbowH))},${n((M.shoulderY + M.elbowY) / 2)} ` +
      `${n(CX + d * (M.armCx + M.elbowH * 0.4))},${n(M.elbowY - 3)} ` +
      `L${n(CX + d * (M.armCx - M.elbowH * 0.2))},${n(M.elbowY - 3)} Z`, 0.08)));
  }
  return out.join('');
}

/** A short row of buttons + centre placket down the shirt front. */
function placket(M, topY, botY) {
  const out = [seam(`M${n(CX)},${n(topY)} L${n(CX)},${n(botY)}`, 0.8, 0.12)];
  const n2 = 3;
  for (let i = 0; i < n2; i++) {
    const y = topY + 3 + i * (botY - topY - 5) / (n2 - 1);
    out.push(`<circle cx="${n(CX)}" cy="${n(y)}" r="1.1" fill="rgba(255,255,255,0.4)" stroke="none"/>` +
      `<circle cx="${n(CX)}" cy="${n(y)}" r="1.1" fill="none" stroke="rgba(0,0,0,0.28)" stroke-width="0.5"/>`);
  }
  return out.join('');
}

const RIB_STYLES = new Set(['hoodie', 'sweater']);

function shirtMarkup(M, style) {
  const hemY = style === 'hoodie' ? M.hipY + 12 : style === 'sweater' ? M.hipY + 9
    : style === 'crop' ? M.hipY - 2 : M.hipY + 6;
  const puff = style === 'hoodie' ? 3.4 : style === 'sweater' ? 3 : style === 'tank' ? 1.4 : 2;
  const inset = style === 'tank' ? M.shoulderHalf * 0.36 : 0;
  const neckDip = style === 'vneck' ? M.headRx * 0.85 : style === 'polo' ? 5
    : style === 'turtleneck' ? 2 : 4;
  const body = shell(M, { puff, topY: M.shoulderY, hemY, neckDip, inset });
  const longSleeve = style === 'hoodie' || style === 'sweater' || style === 'buttonup'
    || style === 'turtleneck';
  const sleeveHemY = longSleeve ? M.wristY - 2 : M.elbowY - 2;
  const out = [`<path d="${body}"/>`];

  if (style !== 'tank') out.push(sleeves(M, sleeveHemY, puff));

  // sculpted cloth shading (deep flanks, highlight ridge, fold creases)
  const sh = M.shoulderHalf + puff;
  const hp = M.hipHalf + puff;
  out.push(bodiceShade(M, { sh, hp, hemY, puff, sleeved: style !== 'tank' }));

  if (style === 'vneck') {
    out.push(pair((d) => seam(`M${n(CX + d * sh * 0.5)},${n(M.shoulderY + 2)} ` +
      `L${n(CX)},${n(M.shoulderY + neckDip)}`, 2.2, 0.18)));
  } else if (style === 'tank') {
    out.push(seam(`M${n(CX - sh + inset)},${n(M.shoulderY + 1.5)} ` +
      `Q${n(CX)},${n(M.shoulderY + neckDip + 1.5)} ${n(CX + sh - inset)},${n(M.shoulderY + 1.5)}`, 1.5, 0.18));
  } else if (style === 'buttonup' || style === 'polo') {
    // a fold-down collar: two triangular points meeting at the neck
    out.push(pair((d) => `<path d="M${n(CX)},${n(M.shoulderY + 2)} ` +
      `L${n(CX + d * sh * 0.34)},${n(M.shoulderY - 1)} L${n(CX + d * sh * 0.28)},${n(M.shoulderY + 8)} Z" ` +
      `fill="rgba(0,0,0,0.12)" stroke="none"/>`));
    out.push(pair((d) => seamLight(`M${n(CX)},${n(M.shoulderY + 2)} ` +
      `L${n(CX + d * sh * 0.34)},${n(M.shoulderY - 1)} L${n(CX + d * sh * 0.28)},${n(M.shoulderY + 8)}`, 0.7, 0.16)));
  } else if (style === 'turtleneck') {
    // A rolled knit collar covering the neck up to the chin.
    const nw = M.headRx * 0.62;
    const colTop = M.chinY - 1;
    out.push(`<rect x="${n(CX - nw)}" y="${n(colTop)}" width="${n(nw * 2)}" ` +
      `height="${n(M.shoulderY + 5 - colTop)}" rx="${n(nw * 0.7)}"/>`);
    out.push([-0.6, 0, 0.6].map((f) => seam(`M${n(CX + f * nw)},${n(colTop + 2)} ` +
      `L${n(CX + f * nw)},${n(M.shoulderY + 3)}`, 0.8, 0.14)).join(''));
    out.push(shade(`M${n(CX - nw)},${n(colTop + 2)} Q${n(CX)},${n(colTop + 5)} ${n(CX + nw)},${n(colTop + 2)} ` +
      `L${n(CX + nw)},${n(colTop + 6)} Q${n(CX)},${n(colTop + 9)} ${n(CX - nw)},${n(colTop + 6)} Z`, 0.14));
  } else {
    // crew collar, double-stitched
    out.push(seam(`M${n(CX - sh * 0.42)},${n(M.shoulderY + 1)} ` +
      `Q${n(CX)},${n(M.shoulderY + neckDip + 2)} ${n(CX + sh * 0.42)},${n(M.shoulderY + 1)}`, 2.6, 0.22));
    out.push(seam(`M${n(CX - sh * 0.4)},${n(M.shoulderY + 3)} ` +
      `Q${n(CX)},${n(M.shoulderY + neckDip + 4)} ${n(CX + sh * 0.4)},${n(M.shoulderY + 3)}`, 0.7, 0.14));
  }

  if (style === 'buttonup') {
    // full placket + buttons + a chest pocket
    out.push(placket(M, M.shoulderY + 8, hemY - 3));
    const pkX = CX - sh * 0.5, pkY = M.chestY + 2, pkW = sh * 0.34, pkH = sh * 0.34;
    out.push(seam(`M${n(pkX)},${n(pkY)} L${n(pkX)},${n(pkY + pkH)} L${n(pkX + pkW)},${n(pkY + pkH)} L${n(pkX + pkW)},${n(pkY)}`, 1, 0.16));
    out.push(seam(`M${n(pkX)},${n(pkY)} L${n(pkX + pkW)},${n(pkY)}`, 1.4, 0.12));
  } else if (style === 'polo') {
    // short placket, two buttons
    out.push(seam(`M${n(CX)},${n(M.shoulderY + 6)} L${n(CX)},${n(M.chestY + 8)}`, 0.8, 0.12));
    out.push([0, 1].map((i) => `<circle cx="${n(CX)}" cy="${n(M.shoulderY + 10 + i * 6)}" r="1" fill="rgba(255,255,255,0.4)" stroke="none"/>`).join(''));
  }

  if (style === 'hoodie') {
    // The hood reads as a roll bunched around the neck base — it needs no
    // z-order surgery (the shirt group necessarily paints after skin) and
    // it lands inside the widget crop, so a hoodie is visible in the pill.
    out.push(`<path d="M${n(CX - sh * 0.72)},${n(M.shoulderY + 3)} ` +
      `C${n(CX - sh * 0.66)},${n(M.chinY - 1)} ${n(CX + sh * 0.66)},${n(M.chinY - 1)} ` +
      `${n(CX + sh * 0.72)},${n(M.shoulderY + 3)} ` +
      `C${n(CX + sh * 0.4)},${n(M.shoulderY + 7)} ${n(CX - sh * 0.4)},${n(M.shoulderY + 7)} ` +
      `${n(CX - sh * 0.72)},${n(M.shoulderY + 3)} Z"/>`);
    out.push(shade(`M${n(CX - sh * 0.52)},${n(M.shoulderY + 3.4)} ` +
      `C${n(CX - sh * 0.46)},${n(M.chinY + 2)} ${n(CX + sh * 0.46)},${n(M.chinY + 2)} ` +
      `${n(CX + sh * 0.52)},${n(M.shoulderY + 3.4)} ` +
      `C${n(CX + sh * 0.3)},${n(M.shoulderY + 5.6)} ${n(CX - sh * 0.3)},${n(M.shoulderY + 5.6)} ` +
      `${n(CX - sh * 0.52)},${n(M.shoulderY + 3.4)} Z`, 0.18));
    // drawstrings
    out.push(pair((d) => seamLight(`M${n(CX + d * sh * 0.2)},${n(M.shoulderY + 6)} ` +
      `Q${n(CX + d * sh * 0.26)},${n(M.chestY + 4)} ${n(CX + d * sh * 0.18)},${n(M.chestY + 12)}`, 1.6, 0.24)));
    out.push(pair((d) => `<circle cx="${n(CX + d * sh * 0.18)}" cy="${n(M.chestY + 13)}" r="1.1" fill="rgba(255,255,255,0.28)" stroke="none"/>`));
    // kangaroo pocket
    const pkTop = M.waistY + (hemY - M.waistY) * 0.42;
    out.push(seam(`M${n(CX - M.hipHalf * 0.72)},${n(pkTop)} ` +
      `L${n(CX - M.hipHalf * 0.78)},${n(hemY - 5)} L${n(CX + M.hipHalf * 0.78)},${n(hemY - 5)} ` +
      `L${n(CX + M.hipHalf * 0.72)},${n(pkTop)}`, 1.3, 0.17));
    out.push(pair((d) => seam(`M${n(CX + d * M.hipHalf * 0.72)},${n(pkTop)} ` +
      `L${n(CX + d * M.hipHalf * 0.5)},${n(pkTop + 4)}`, 1.6, 0.22)));
  }

  if (RIB_STYLES.has(style)) {
    // knit: ribbed hem + cuffs. The hoodie above already added its hood and
    // pocket; the sweater is the same knit treatment with a plain neck.
    out.push(ribBand(CX - M.hipHalf - puff + 1, CX + M.hipHalf + puff - 1, hemY - 4.5, 4.5, 5));
    out.push(pair((d) => ribBand(CX + d * M.armCx - M.elbowH - 1.5, CX + d * M.armCx + M.elbowH + 1.5,
      sleeveHemY - 3.5, 3.5, 3)));
  } else if (style !== 'tank') {
    // plain cuffs + hem line
    out.push(pair((d) => seam(`M${n(CX + d * M.armCx - M.elbowH - 1)},${n(sleeveHemY - 1.5)} ` +
      `L${n(CX + d * M.armCx + M.elbowH + 1)},${n(sleeveHemY - 1.5)}`, 1.8, 0.15)));
    out.push(seam(`M${n(CX - M.hipHalf - puff + 2)},${n(hemY - 1)} ` +
      `Q${n(CX)},${n(hemY + 3)} ${n(CX + M.hipHalf + puff - 2)},${n(hemY - 1)}`, 1.5, 0.13));
  } else {
    out.push(seam(`M${n(CX - M.hipHalf - puff + 2)},${n(hemY - 1)} ` +
      `Q${n(CX)},${n(hemY + 3)} ${n(CX + M.hipHalf + puff - 2)},${n(hemY - 1)}`, 1.5, 0.13));
  }
  return out.join('');
}

/** A ribbed band — the cuff/hem detail that makes knitwear read as knitwear. */
function ribBand(x0, x1, y, h, ticks) {
  let out = `<rect x="${n(x0)}" y="${n(y)}" width="${n(x1 - x0)}" height="${n(h)}" rx="1.4" fill="rgba(0,0,0,0.17)" stroke="none"/>`;
  for (let i = 1; i < ticks; i++) {
    const x = x0 + ((x1 - x0) * i) / ticks;
    out += seam(`M${n(x)},${n(y + 0.6)} L${n(x)},${n(y + h - 0.6)}`, 0.7, 0.1);
  }
  return out;
}

const BOTTOMS_HEM = { basic: 1.0, capri: 0.72, shorts: 0.34, joggers: 1.0 };

/** An A-line skirt: one flared shell from the waist to the upper thigh, with
 *  radiating pleat folds. Structurally unlike the leg tubes, so it's its own
 *  branch rather than a parametric tweak. */
function skirtMarkup(M) {
  const puff = 1.6;
  const topY = M.hipY - 2;
  const hemY = M.hipY + M.legLen * 0.34;
  const wa = M.hipHalf + puff;
  const flare = M.hipHalf * 0.7 + 6;
  const hemHalf = wa + flare;
  const midY = (topY + hemY) / 2;
  const body = mirrorPath([CX, topY - 1], [
    seg([CX + wa * 0.6, topY - 1], [CX + wa, topY], [CX + wa, topY + 2]),
    seg([CX + wa + flare * 0.35, midY], [CX + hemHalf, hemY - 7], [CX + hemHalf, hemY]),
    seg([CX + hemHalf * 0.6, hemY + 5], [CX + hemHalf * 0.28, hemY + 6], [CX, hemY + 6]),
  ]);
  const out = [`<path d="${body}"/>`];
  // waistband
  out.push(`<rect x="${n(CX - wa)}" y="${n(topY - 2)}" width="${n(wa * 2)}" height="5" rx="1.6" fill="rgba(0,0,0,0.18)" stroke="none"/>`);
  // pleat folds radiating from the waist
  for (let i = 1; i < 5; i++) {
    const t = i / 5;
    const x0 = CX + (t - 0.5) * 2 * wa * 0.85;
    const x1 = CX + (t - 0.5) * 2 * hemHalf * 0.95;
    out.push(seam(`M${n(x0)},${n(topY + 3)} Q${n((x0 + x1) / 2)},${n(midY)} ${n(x1)},${n(hemY - 2)}`, 0.9, 0.1));
  }
  // flank core shadow + a hem band
  out.push(pair((d) => shade(`M${n(CX + d * (wa - 1))},${n(topY + 3)} C${n(CX + d * (wa + flare * 0.35))},${n(midY)} ${n(CX + d * (hemHalf - 1))},${n(hemY - 6)} ${n(CX + d * (hemHalf - 1))},${n(hemY)} L${n(CX + d * (hemHalf - 7))},${n(hemY)} C${n(CX + d * (hemHalf - 7))},${n(hemY - 6)} ${n(CX + d * (wa + flare * 0.3 - 5))},${n(midY)} ${n(CX + d * (wa - 5))},${n(topY + 3)} Z`, 0.11)));
  out.push(seam(`M${n(CX - hemHalf * 0.94)},${n(hemY - 1)} Q${n(CX)},${n(hemY + 4)} ${n(CX + hemHalf * 0.94)},${n(hemY - 1)}`, 1.8, 0.15));
  return out.join('');
}

function bottomsMarkup(M, style) {
  if (style === 'skirt') return skirtMarkup(M);
  const frac = BOTTOMS_HEM[style] ?? 1;
  const hemY = (style === 'basic' || style === 'joggers') ? M.ankleY - 1 : M.hipY + M.legLen * frac;
  const topY = M.hipY - 2;
  const puff = style === 'joggers' ? 2 : 1.6;
  const out = [pair((d) => legTube(M, d, { puff, topY, hemY }))];
  // the seat/crotch join
  out.push(`<path d="M${n(CX - M.hipHalf - puff)},${n(topY)} L${n(CX + M.hipHalf + puff)},${n(topY)} ` +
    `L${n(CX + M.hipHalf + puff - 1)},${n(M.crotchY + 2)} ` +
    `Q${n(CX)},${n(M.crotchY - 3)} ${n(CX - M.hipHalf - puff + 1)},${n(M.crotchY + 2)} Z"/>`);
  // waistband, fly, button
  out.push(`<rect x="${n(CX - M.hipHalf - puff)}" y="${n(topY - 1)}" width="${n((M.hipHalf + puff) * 2)}" height="5" rx="1.6" fill="rgba(0,0,0,0.18)" stroke="none"/>`);
  out.push(seam(`M${n(CX)},${n(topY + 5)} L${n(CX)},${n(topY + 15)}`, 1.2, 0.25));
  out.push(`<circle cx="${n(CX)}" cy="${n(topY + 1.5)}" r="1.2" fill="rgba(0,0,0,0.3)" stroke="none"/>`);
  // front pockets
  out.push(pair((d) => seam(`M${n(CX + d * (M.hipHalf * 0.52))},${n(topY + 5)} ` +
    `Q${n(CX + d * (M.hipHalf + puff - 1))},${n(topY + 9)} ${n(CX + d * (M.hipHalf + puff - 1.5))},${n(topY + 15)}`,
  1.2, 0.16)));
  // deep inner-leg core shadow
  out.push(pair((d) => shade(`M${n(CX + d * (M.legCx - M.thighH * 0.5))},${n(M.crotchY)} ` +
    `C${n(CX + d * (M.legCx - M.calfH * 0.55))},${n(M.kneeY)} ` +
    `${n(CX + d * (M.legCx - M.ankleH * 0.6))},${n(hemY - 8)} ${n(CX + d * (M.legCx - M.ankleH * 0.55))},${n(hemY)} ` +
    `L${n(CX + d * (M.legCx - M.ankleH * 0.55 + 4))},${n(hemY)} ` +
    `C${n(CX + d * (M.legCx - M.calfH * 0.45 + 3))},${n(M.kneeY)} ` +
    `${n(CX + d * (M.legCx - M.thighH * 0.45 + 3))},${n(M.crotchY + 6)} ` +
    `${n(CX + d * (M.legCx - M.thighH * 0.5 + 2))},${n(M.crotchY)} Z`, 0.12)));
  // outer-thigh highlight for roundness
  out.push(pair((d) => light(`M${n(CX + d * (M.legCx + M.thighH * 0.42))},${n(M.crotchY + 4)} ` +
    `C${n(CX + d * (M.legCx + M.kneeH * 0.5))},${n(M.kneeY)} ` +
    `${n(CX + d * (M.legCx + M.ankleH * 0.5))},${n(hemY - 10)} ${n(CX + d * (M.legCx + M.ankleH * 0.45))},${n(hemY - 2)} ` +
    `L${n(CX + d * (M.legCx + M.ankleH * 0.45 - 3))},${n(hemY - 2)} ` +
    `C${n(CX + d * (M.legCx + M.kneeH * 0.4 - 2))},${n(M.kneeY)} ` +
    `${n(CX + d * (M.legCx + M.thighH * 0.32 - 2))},${n(M.crotchY + 6)} ` +
    `${n(CX + d * (M.legCx + M.thighH * 0.42 - 2))},${n(M.crotchY + 4)} Z`, 0.07)));
  // knee folds (double, if the leg reaches past the knee)
  if (hemY > M.kneeY + 6) {
    out.push(pair((d) => seam(`M${n(CX + d * M.legCx - M.kneeH)},${n(M.kneeY + 2)} ` +
      `Q${n(CX + d * M.legCx)},${n(M.kneeY + 5)} ${n(CX + d * M.legCx + M.kneeH)},${n(M.kneeY + 2)}`, 0.9, 0.1)));
    out.push(pair((d) => seam(`M${n(CX + d * M.legCx - M.kneeH * 0.9)},${n(M.kneeY + 6)} ` +
      `Q${n(CX + d * M.legCx)},${n(M.kneeY + 9)} ${n(CX + d * M.legCx + M.kneeH * 0.9)},${n(M.kneeY + 6)}`, 0.7, 0.08)));
  }
  if (style === 'joggers') {
    // drawstring at the waist + ribbed ankle cuffs
    out.push(pair((d) => seamLight(`M${n(CX + d * 3)},${n(topY + 4)} L${n(CX + d * 5)},${n(topY + 12)}`, 1.4, 0.24)));
    out.push(pair((d) => ribBand(CX + d * M.legCx - M.ankleH - puff, CX + d * M.legCx + M.ankleH + puff, hemY - 5, 5, 4)));
  } else {
    // hem cuffs
    const cuffH = style === 'shorts' ? 3.6 : 3;
    out.push(pair((d) => `<rect x="${n(CX + d * M.legCx - M.ankleH - puff)}" y="${n(hemY - cuffH)}" ` +
      `width="${n((M.ankleH + puff) * 2)}" height="${n(cuffH)}" rx="1.2" fill="rgba(0,0,0,0.15)" stroke="none"/>`));
  }
  return out.join('');
}

const DRESS = {
  mini: { hem: 0.28, flare: 4, folds: 3 },
  basic: { hem: 0.55, flare: 9, folds: 4 },
  sundress: { hem: 0.5, flare: 13, folds: 4 },
  flowy: { hem: 0.72, flare: 21, folds: 5 },
  gown: { hem: 0.98, flare: 30, folds: 6 },
  wrap: { hem: 0.56, flare: 12, folds: 4 },
  pinafore: { hem: 0.5, flare: 10, folds: 4 },
};

function dressMarkup(M, style) {
  const D = DRESS[style] ?? DRESS.basic;
  const hemY = M.hipY + M.legLen * D.hem;
  const puff = 1.6;
  const sleeveless = style === 'sundress' || style === 'pinafore';
  // A sundress has a wide scooped neck; a gown a deep one; a wrap a soft V.
  const neckDip = sleeveless ? M.headRx * 0.7 : style === 'gown' ? M.headRx * 0.75
    : style === 'wrap' ? M.headRx * 0.7 : 4;
  const inset = sleeveless ? M.shoulderHalf * 0.34 : 0;
  const body = shell(M, { puff, topY: M.shoulderY, hemY, neckDip, flare: D.flare, inset });
  const out = [`<path d="${body}"/>`];
  if (sleeveless) {
    // thin shoulder straps instead of sleeves
    out.push(pair((d) => `<rect x="${n(CX + d * M.shoulderHalf * 0.5 - 1.6)}" y="${n(M.shoulderY - 2)}" width="3.2" height="8" rx="1.4"/>`));
    out.push(seam(`M${n(CX - M.shoulderHalf * 0.5 + inset * 0.3)},${n(M.shoulderY + 2)} Q${n(CX)},${n(M.shoulderY + neckDip + 2)} ${n(CX + M.shoulderHalf * 0.5 - inset * 0.3)},${n(M.shoulderY + 2)}`, 1.4, 0.16));
  } else {
    out.push(sleeves(M, M.shoulderY + (M.elbowY - M.shoulderY) * 0.5, puff));
  }
  // bodice core shadow + centre highlight (the sculpted upgrade)
  const shb = M.shoulderHalf + puff;
  out.push(pair((d) => shade(`M${n(CX + d * shb * 0.8)},${n(M.armpitY)} C${n(CX + d * (M.waistHalf + puff))},${n(M.waistY - 4)} ${n(CX + d * (M.waistHalf + puff))},${n(M.waistY)} ${n(CX + d * (M.waistHalf + puff - 3))},${n(M.waistY)} C${n(CX + d * (M.waistHalf + puff - 3))},${n(M.waistY - 4)} ${n(CX + d * (shb * 0.8 - 4))},${n(M.armpitY)} ${n(CX + d * (shb * 0.8 - 4))},${n(M.armpitY)} Z`, 0.12)));
  out.push(light(`M${n(CX - shb * 0.14)},${n(M.chestY)} L${n(CX + shb * 0.06)},${n(M.chestY)} L${n(CX + shb * 0.05)},${n(M.waistY - 1)} L${n(CX - shb * 0.12)},${n(M.waistY - 1)} Z`, 0.08));
  // princess seams and a waistband
  out.push(pair((d) => seam(`M${n(CX + d * M.shoulderHalf * 0.5)},${n(M.shoulderY + 4)} ` +
    `Q${n(CX + d * M.waistHalf * 0.75)},${n(M.chestY)} ${n(CX + d * M.waistHalf * 0.6)},${n(M.waistY)}`, 1, 0.12)));
  out.push(`<rect x="${n(CX - M.waistHalf - puff)}" y="${n(M.waistY - 2)}" ` +
    `width="${n((M.waistHalf + puff) * 2)}" height="4" rx="1.4" fill="rgba(0,0,0,0.18)" stroke="none"/>`);
  if (style === 'wrap') {
    // The crossed-over front: one diagonal edge from shoulder to the waist knot,
    // its overlap shaded, and a little tie at the side.
    out.push(seam(`M${n(CX + M.shoulderHalf * 0.42)},${n(M.shoulderY + neckDip)} ` +
      `L${n(CX - M.waistHalf * 0.7)},${n(M.waistY - 1)}`, 1.8, 0.2));
    out.push(shade(`M${n(CX + M.shoulderHalf * 0.42)},${n(M.shoulderY + neckDip)} ` +
      `L${n(CX - M.waistHalf * 0.7)},${n(M.waistY - 1)} L${n(CX - M.waistHalf - puff)},${n(M.waistY - 1)} ` +
      `L${n(CX - M.shoulderHalf * 0.2)},${n(M.armpitY)} Z`, 0.1));
    out.push(seam(`M${n(CX - M.waistHalf * 0.7)},${n(M.waistY)} q-6,3 -10,1`, 1.6, 0.22));
  }
  if (style === 'pinafore') {
    // A square bib panel across the chest, outlined so it reads as a pinafore
    // over the (implied) top.
    const bw = M.shoulderHalf * 0.46;
    out.push(seam(`M${n(CX - bw)},${n(M.shoulderY + 5)} L${n(CX - bw)},${n(M.waistY - 2)} ` +
      `L${n(CX + bw)},${n(M.waistY - 2)} L${n(CX + bw)},${n(M.shoulderY + 5)}`, 1.4, 0.18));
    out.push(pair((d) => `<circle cx="${n(CX + d * bw * 0.7)}" cy="${n(M.shoulderY + 6)}" r="1.1" fill="rgba(255,255,255,0.4)" stroke="none"/>`));
  }
  // skirt folds radiating from the waist
  const hemHalf = M.hipHalf + puff + D.flare;
  for (let i = 1; i < D.folds; i++) {
    const t = i / D.folds;
    const x0 = CX + (t - 0.5) * 2 * M.waistHalf * 0.9;
    const x1 = CX + (t - 0.5) * 2 * hemHalf * 0.94;
    out.push(seam(`M${n(x0)},${n(M.waistY + 3)} Q${n((x0 + x1) / 2)},${n((M.waistY + hemY) / 2)} ${n(x1)},${n(hemY - 2)}`,
      0.9, 0.09));
  }
  // Edge bands traced from the skirt's OWN curve, offset inward — anything
  // hand-approximated bulges outside the silhouette once the flare is big.
  const hp = M.hipHalf + puff;
  const midY = (M.hipY + hemY) / 2;
  const skirtBand = (d, w, paint, a) => {
    const e = (off) => [
      [CX + d * (hp - off), M.hipY],
      [CX + d * (hp + D.flare * 0.45 - off), midY],
      [CX + d * (hemHalf - off), hemY - 6],
      [CX + d * (hemHalf - off), hemY],
    ];
    const o = e(0);
    const i = e(w);
    return paint(`M${n(o[0][0])},${n(o[0][1])} ` +
      `C${n(o[1][0])},${n(o[1][1])} ${n(o[2][0])},${n(o[2][1])} ${n(o[3][0])},${n(o[3][1])} ` +
      `L${n(i[3][0])},${n(i[3][1])} ` +
      `C${n(i[2][0])},${n(i[2][1])} ${n(i[1][0])},${n(i[1][1])} ${n(i[0][0])},${n(i[0][1])} Z`, a);
  };
  out.push(skirtBand(1, Math.max(5, D.flare * 0.3), shade, 0.1));
  out.push(skirtBand(-1, Math.max(4, D.flare * 0.22), light, 0.09));
  if (style === 'gown' || style === 'mini') {
    out.push(seam(`M${n(CX - hemHalf * 0.92)},${n(hemY - 1)} Q${n(CX)},${n(hemY + 4)} ${n(CX + hemHalf * 0.92)},${n(hemY - 1)}`,
      2, 0.16));
  }
  if (style === 'gown') {
    out.push(seam(`M${n(CX)},${n(M.waistY + 3)} L${n(CX)},${n(hemY - 3)}`, 1, 0.12));
  }
  return out.join('');
}

const SOCK_TOP = { ankle: 0.06, basic: 0.22, tall: 0.62, knee: 0.46 };

function socksMarkup(M, style) {
  const topY = M.ankleY - M.legLen * (SOCK_TOP[style] ?? SOCK_TOP.basic);
  const out = [pair((d) => legTube(M, d, { puff: 0.9, topY, hemY: FOOT_Y }))];
  out.push(pair((d) => `<rect x="${n(CX + d * M.legCx - M.ankleH - 1.6)}" y="${n(topY)}" ` +
    `width="${n((M.ankleH + 1.6) * 2)}" height="3.4" rx="1.2" fill="rgba(0,0,0,0.16)" stroke="none"/>`));
  out.push(pair((d) => seam(`M${n(CX + d * M.legCx - M.ankleH - 1)},${n(topY + 5.5)} ` +
    `L${n(CX + d * M.legCx + M.ankleH + 1)},${n(topY + 5.5)}`, 1, 0.12)));
  out.push(pair((d) => shade(`M${n(CX + d * (M.legCx - M.ankleH - 0.6))},${n(topY + 2)} ` +
    `L${n(CX + d * (M.legCx - M.ankleH * 0.3))},${n(topY + 2)} ` +
    `L${n(CX + d * (M.legCx - M.ankleH * 0.3))},${n(FOOT_Y)} ` +
    `L${n(CX + d * (M.legCx - M.ankleH - 0.4))},${n(FOOT_Y)} Z`, 0.08)));
  return out.join('');
}

function shoesMarkup(M, style) {
  const an = M.ankleH + 1.6;
  const toe = an * 1.65;
  return pair((d) => {
    const cx = CX + d * M.legCx;
    const top = style === 'boots' ? M.ankleY - M.legLen * 0.2 : M.ankleY - 1;
    const solY = FOOT_Y + 3;
    const out = [];
    if (style === 'heels') {
      out.push(`<path d="M${n(cx - an)},${n(top)} L${n(cx + an)},${n(top)} ` +
        `C${n(cx + an + 1)},${n(solY - 6)} ${n(cx + toe)},${n(solY - 3)} ${n(cx + toe + 1)},${n(solY - 1)} ` +
        `L${n(cx - an * 0.9)},${n(solY - 1)} Z"/>`);
      out.push(`<path d="M${n(cx - an * 0.85)},${n(solY - 2)} L${n(cx - an * 0.3)},${n(solY - 2)} ` +
        `L${n(cx - an * 0.45)},${n(solY + 3)} L${n(cx - an * 0.8)},${n(solY + 3)} Z"/>`);
      out.push(seam(`M${n(cx - an * 0.9)},${n(solY - 1.4)} L${n(cx + toe)},${n(solY - 1.4)}`, 1.4, 0.18));
      out.push(seam(`M${n(cx - an)},${n(top + 1.5)} Q${n(cx)},${n(top + 4)} ${n(cx + an)},${n(top + 1.5)}`, 1.1, 0.14));
      return out.join('');
    }
    if (style === 'sandals') {
      out.push(`<path d="M${n(cx - an)},${n(solY - 2)} C${n(cx - an)},${n(solY + 1)} ${n(cx + toe)},${n(solY + 1)} ` +
        `${n(cx + toe)},${n(solY - 2)} C${n(cx + toe - 2)},${n(solY - 4)} ${n(cx - an + 1)},${n(solY - 4)} ` +
        `${n(cx - an)},${n(solY - 2)} Z"/>`);
      out.push(`<path d="M${n(cx - an * 0.7)},${n(solY - 4)} L${n(cx + toe * 0.55)},${n(solY - 9)} ` +
        `L${n(cx + toe * 0.72)},${n(solY - 7.4)} L${n(cx - an * 0.5)},${n(solY - 2.6)} Z"/>`);
      out.push(`<path d="M${n(cx - an * 0.7)},${n(solY - 8.4)} L${n(cx + toe * 0.6)},${n(solY - 4)} ` +
        `L${n(cx + toe * 0.5)},${n(solY - 2.4)} L${n(cx - an * 0.55)},${n(solY - 6.8)} Z"/>`);
      out.push(seam(`M${n(cx - an)},${n(solY - 2.2)} L${n(cx + toe)},${n(solY - 2.2)}`, 1, 0.12));
      return out.join('');
    }
    if (style === 'loafers') {
      // A low slip-on with a saddle band across the top.
      out.push(`<path d="M${n(cx - an)},${n(solY - 3)} ` +
        `C${n(cx - an)},${n(solY + 1)} ${n(cx + toe)},${n(solY + 1)} ${n(cx + toe)},${n(solY - 3)} ` +
        `C${n(cx + toe - 1)},${n(solY - 6.5)} ${n(cx + an * 0.4)},${n(solY - 8)} ${n(cx - an * 0.2)},${n(solY - 7.5)} ` +
        `C${n(cx - an * 0.7)},${n(solY - 7)} ${n(cx - an)},${n(solY - 5)} ${n(cx - an)},${n(solY - 3)} Z"/>`);
      out.push(`<rect x="${n(cx - an * 0.12)}" y="${n(solY - 7.8)}" width="${n(an * 0.7)}" height="3" rx="1" fill="rgba(0,0,0,0.24)" stroke="none"/>`);
      out.push(`<path d="M${n(cx - an)},${n(solY - 2)} C${n(cx - an)},${n(solY + 1.5)} ${n(cx + toe)},${n(solY + 1.5)} ` +
        `${n(cx + toe)},${n(solY - 2)} L${n(cx + toe)},${n(solY - 0.5)} C${n(cx + toe)},${n(solY + 2.5)} ` +
        `${n(cx - an)},${n(solY + 2.5)} ${n(cx - an)},${n(solY - 0.5)} Z" fill="rgba(0,0,0,0.24)" stroke="none"/>`);
      out.push(seam(`M${n(cx - an * 0.2)},${n(solY - 6.8)} Q${n(cx + an * 0.7)},${n(solY - 5.2)} ${n(cx + toe * 0.9)},${n(solY - 3.4)}`, 1, 0.14));
      return out.join('');
    }
    if (style === 'flats' || style === 'maryjane') {
      // A low ballet slipper: rounded toe, scooped topline, thin sole.
      out.push(`<path d="M${n(cx - an)},${n(solY - 3)} ` +
        `C${n(cx - an)},${n(solY + 1)} ${n(cx + toe)},${n(solY + 1)} ${n(cx + toe)},${n(solY - 3)} ` +
        `C${n(cx + toe - 1)},${n(solY - 6)} ${n(cx + an * 0.4)},${n(solY - 7)} ${n(cx - an * 0.2)},${n(solY - 6.5)} ` +
        `C${n(cx - an * 0.7)},${n(solY - 6)} ${n(cx - an)},${n(solY - 5)} ${n(cx - an)},${n(solY - 3)} Z"/>`);
      // topline scoop + a thin sole line
      out.push(seam(`M${n(cx - an * 0.2)},${n(solY - 6.4)} Q${n(cx + an * 0.7)},${n(solY - 5)} ${n(cx + toe * 0.9)},${n(solY - 3.4)}`, 1, 0.14));
      out.push(`<path d="M${n(cx - an)},${n(solY - 2)} C${n(cx - an)},${n(solY + 1.5)} ${n(cx + toe)},${n(solY + 1.5)} ${n(cx + toe)},${n(solY - 2)} L${n(cx + toe)},${n(solY - 0.5)} C${n(cx + toe)},${n(solY + 2.5)} ${n(cx - an)},${n(solY + 2.5)} ${n(cx - an)},${n(solY - 0.5)} Z" fill="rgba(0,0,0,0.22)" stroke="none"/>`);
      if (style === 'maryjane') {
        // instep strap + button
        out.push(`<rect x="${n(cx + an * 0.1)}" y="${n(solY - 8)}" width="2.6" height="6" rx="1" fill="rgba(0,0,0,0.32)" stroke="none"/>`);
        out.push(`<circle cx="${n(cx + an * 0.1 + 1.3)}" cy="${n(solY - 8)}" r="1" fill="rgba(255,255,255,0.4)" stroke="none"/>`);
      }
      return out.join('');
    }
    // sneaker / boot shell
    out.push(`<path d="M${n(cx - an)},${n(top)} L${n(cx + an)},${n(top)} ` +
      `C${n(cx + an + 0.5)},${n(solY - 8)} ${n(cx + toe - 1)},${n(solY - 5)} ${n(cx + toe)},${n(solY - 2)} ` +
      `C${n(cx + toe)},${n(solY + 1)} ${n(cx - an)},${n(solY + 1)} ${n(cx - an)},${n(solY - 2)} Z"/>`);
    out.push(`<path d="M${n(cx - an)},${n(solY - 3)} C${n(cx - an)},${n(solY + 1)} ${n(cx + toe)},${n(solY + 1)} ` +
      `${n(cx + toe)},${n(solY - 3)} L${n(cx + toe)},${n(solY - 1)} ` +
      `C${n(cx + toe)},${n(solY + 2)} ${n(cx - an)},${n(solY + 2)} ${n(cx - an)},${n(solY - 1)} Z" fill="rgba(0,0,0,0.2)" stroke="none"/>`);
    if (style === 'boots') {
      out.push(`<rect x="${n(cx - an)}" y="${n(top)}" width="${n(an * 2)}" height="3.4" rx="1.2" fill="rgba(0,0,0,0.18)" stroke="none"/>`);
      out.push(seam(`M${n(cx - an * 0.8)},${n(top + 7)} L${n(cx + an * 0.8)},${n(top + 9)}`, 1.2, 0.2));
      out.push(seam(`M${n(cx - an * 0.8)},${n(top + 12)} L${n(cx + an * 0.8)},${n(top + 14)}`, 1.2, 0.2));
      out.push(seam(`M${n(cx - an)},${n(solY - 7)} L${n(cx + toe * 0.8)},${n(solY - 7)}`, 1, 0.14));
    } else {
      out.push(seam(`M${n(cx + toe * 0.3)},${n(solY - 6.5)} Q${n(cx + toe * 0.7)},${n(solY - 5)} ` +
        `${n(cx + toe * 0.92)},${n(solY - 2.6)}`, 1.1, 0.14));
      out.push(seam(`M${n(cx - an * 0.7)},${n(top + 2.5)} L${n(cx + an * 0.5)},${n(top + 3.5)}`, 1.1, 0.2));
      out.push(seam(`M${n(cx - an * 0.7)},${n(top + 6)} L${n(cx + an * 0.5)},${n(top + 7)}`, 1.1, 0.2));
      out.push(seam(`M${n(cx - an * 0.55)},${n(top + 1.5)} L${n(cx - an * 0.2)},${n(top + 8)}`, 1, 0.12));
    }
    return out.join('');
  });
}

/* ----------------------------------------------------------------- build */

/** The frame every avatar path is authored against. Exported so house.js can
 *  stand her on its floor without re-deriving the numbers — if the figure
 *  ever grows, the room follows rather than letting her sink or float. */
export const AVATAR_FRAME = { width: 120, height: VIEW_H, footY: FOOT_Y, centreX: CX };

/**
 * The avatar's groups without the wrapping <svg>, so a scene can place her
 * inside a larger frame. buildAvatarSVG() is this plus the wrapper.
 *
 * @param {object} customize  S.save.avatar.customize
 * @returns {string}  a run of <g data-slot=...> elements
 */
export function avatarInner(customize) {
  const c = customize ?? {};
  const M = metrics(c);
  const hairStyle = c.hair?.style ?? 'short';
  const dressed = !!c.dress?.itemId;

  // Every part() call takes the whole metrics object, because which overlays
  // and linework a slot gets is a property of the style, not of the slot.
  const ink = M;
  const parts = [
    // Hair behind the head first — a separate group with the same data-slot,
    // which is safe because recolouring re-renders rather than patching.
    part('hair', c.hair?.colour, hairBack(hairStyle, M), ink),
    // `rim`, and heavier: this is the figure's own contour, and the jaw over
    // the neck and the ears behind the skull are lines worth having.
    part('skin', c.skin?.colour,
      `<path d="${bodyOutline(M)}"/><path d="${headOutline(M)}"/>` +
      earMarkup(M) + raceExtras(M) + faceAndShading(M),
      ink, { mode: 'rim', weight: INK_W_BODY }),
    // `union`, so the line lands on the outside of the white and nowhere
    // else. `rim` here put a ring round the iris as well, and two concentric
    // rings inside a shape five units across is not an eye, it is a target.
    part('eyes', c.eyes?.colour, eyesShapes(c.eyes?.style ?? 'round', M),
      ink, { weight: INK_W_EYES }),
    part('hair', c.hair?.colour, hairFront(hairStyle, M), ink),
    part('skin', c.skin?.colour, raceExtrasOverHair(M), ink,
      { mode: 'rim', weight: INK_W_BODY }),
  ];

  if (dressed) {
    parts.push(part('dress', c.dress?.colour, dressMarkup(M, styleOf(c.dress.itemId)), ink));
  } else {
    parts.push(part('shirt', c.shirt?.colour, shirtMarkup(M, styleOf(c.shirt?.itemId)), ink));
    parts.push(part('bottoms', c.bottoms?.colour, bottomsMarkup(M, styleOf(c.bottoms?.itemId)), ink));
  }
  parts.push(part('socks', c.socks?.colour, socksMarkup(M, styleOf(c.socks?.itemId)), ink));
  parts.push(part('shoes', c.shoes?.colour, shoesMarkup(M, styleOf(c.shoes?.itemId)), ink));

  // Soft stands her on something: a contact shadow under the feet, which is
  // most of what stops a figure looking pasted onto its background.
  const ground = M.soft
    ? `<ellipse cx="${n(CX)}" cy="${n(FOOT_Y + 4)}" rx="${n(M.hipHalf * 1.6)}" ry="4.6" ` +
      `fill="url(#av-ground)"/>`
    : '';
  const body = parts.join('');
  // One filter over the whole figure rather than per slot — the paint wobble
  // has to cross a hem for a sleeve and the arm inside it to wander together,
  // and the glow has to see the silhouette, not eight separate ones.
  const wrapped = M.paint ? `<g filter="url(#av-paint)">${body}</g>`
    : M.glass ? `<g filter="url(#av-glow)">${body}</g>`
      : body;
  return defsFor(M) + ground + wrapped;
}

/**
 * @param {object} customize  S.save.avatar.customize
 * @returns {string}  a full <svg>...</svg> string, viewBox 0 0 120 210
 */
export function buildAvatarSVG(customize) {
  return `<svg viewBox="0 0 120 ${VIEW_H}" xmlns="http://www.w3.org/2000/svg">${avatarInner(customize)}</svg>`;
}

/**
 * @param mode  How the Inked style lines this slot.
 *   `union` — outline the slot's outer edge only, joins invisible. What
 *     clothing wants: a sleeve is part of a shirt, not a shape on top of one.
 *   `rim` — line every shape, internal ones included. What a face and an eye
 *     want: the jaw, the ears and the ring around an iris are all edges worth
 *     drawing. Safe here because the body is already ONE closed contour
 *     (see bodyOutline), so there are no limb joins to expose.
 */
function part(slot, colour, inner, M, { mode = 'union', weight = INK_W } = {}) {
  if (!inner) return '';
  const open = `<g data-slot="${slot}" fill="${colour ?? '#999'}"`;
  // Soft: a rim-lit copy offset up and left so only its lit fringe survives
  // under the real one, and a form shadow over the top. Both are gradient
  // fills over a copy of the slot's own forms, so the light follows the body
  // rather than sitting on it as a decal — and both are still black and white
  // over whatever colour the player picked.
  if (M.soft) {
    const forms = formsOnly(inner);
    return `${open}>` +
      `<g transform="translate(-0.7,-0.7)" fill="url(#av-rim)">${forms}</g>` +
      inner +
      `<g fill="url(#av-form)">${forms}</g></g>`;
  }
  if (M.glass) {
    return `${open}>${inner}<g fill="url(#av-sheen)">${formsOnly(inner)}</g></g>`;
  }
  if (!M.ink) return `${open}>${inner}</g>`;
  return mode === 'rim'
    ? `${open}${inkAttrs(weight)}>${inner}</g>`
    : `${open}>${union(inner, weight)}</g>`;
}

/** Mutates `customize` in place, ignoring a key/value pair that is not one of
 *  the known style variants — the caller (a button click) can only ever send
 *  a value it itself listed, but this keeps a stray save edit harmless too. */
export function setVariant(customize, slot, value) {
  if (slot === 'race') {
    if (!VARIANTS.race.includes(value)) return;
    // Deliberately does NOT touch skin.colour: silently overwriting a colour
    // the player chose is worse than offering the race's palette one tap away.
    customize.race = value;
    return;
  }
  if (slot === 'gender') {
    if (!VARIANTS.gender.includes(value)) return;
    customize.gender = value;
    return;
  }
  // Top-level like race and gender, not a `.style` on a sub-object — it is
  // about the whole figure, so it is not owned by any one part of it.
  if (slot === 'style') {
    if (!VARIANTS.style.includes(value)) return;
    customize.style = value;
    return;
  }
  if (slot === 'face') {
    if (!VARIANTS.faceShape.includes(value)) return;
    customize.face.shape = value;
    return;
  }
  const list = { hair: VARIANTS.hairStyle, eyes: VARIANTS.eyesStyle }[slot];
  if (!list || !list.includes(value)) return;
  customize[slot].style = value;
}
