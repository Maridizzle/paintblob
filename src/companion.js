// Pip — a paint-aproned squirrel who keeps you company while you paint. Turn him
// on and he roams the border of your picture, picks a spot, sits a good long
// while, then scampers somewhere new; now and then he says something friendly and
// SPECIFIC: what he makes of the exact colour in your hand, how long you've been
// at it, a gentle nudge to drink some water.
//
// Pure on purpose (no DOM): the colour-namer, the lines and the timing all run in
// node tests, and the squirrel is a plain SVG string so game.js can drop it on the
// board and tour.js can wear the same apron. game.js owns positioning, the speech
// bubble, and the on/off toggle.

/* ----------------------------------------------------------------- timing */

export const DWELL_MS = 30 * 60 * 1000;       // sit ~30 minutes before moving on
export const DWELL_JITTER_MS = 8 * 60 * 1000; // ± up to 8 min, so he isn't a metronome
export const SCAMPER_MS = 900;                // how long a move takes (matches the CSS tween)
export const BUBBLE_MS = 6800;                // a comment stays up this long
export const COMMENT_GAP_MS = 75 * 1000;      // minimum quiet between any two comments
export const AMBIENT_EVERY_MS = 6 * 60 * 1000;// roughly how often an unprompted line drops

// Playtime milestones (hours) he'll remark on, once each, as the session passes them.
export const PLAY_MILESTONES = [0.5, 1, 2, 3, 4, 6, 8];

/* -------------------------------------------------------------- colour naming */

function hexToHsl(hex) {
  const n = parseInt(String(hex).replace('#', ''), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const l = (max + min) / 2;
  let s = 0, h = 0;
  if (d) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h, s, l };
}

// Hue → a plain colour word. The wheel, walked once; the last bucket wraps to red.
const HUES = [
  [16, 'red'], [32, 'coral'], [45, 'orange'], [62, 'amber'], [76, 'gold'],
  [92, 'chartreuse'], [150, 'green'], [186, 'teal'], [200, 'cyan'], [214, 'sky blue'],
  [248, 'blue'], [268, 'indigo'], [286, 'violet'], [304, 'purple'], [324, 'magenta'],
  [340, 'rose'], [352, 'pink'], [360, 'red'],
];
const hueWord = (h) => (HUES.find(([max]) => h < max) ?? HUES[HUES.length - 1])[1];

/**
 * A friendly, specific name for a #rrggbb colour — derived from its hue, how pale
 * or deep it is, and how muted or vivid. Deterministic (the same colour always
 * gets the same name); the VARIETY in what Pip says comes from the line templates,
 * not from renaming the colour each time. Handles the near-neutrals (whites, greys,
 * blacks) and a few earthy browns so a real palette reads naturally.
 */
export function colorName(hex) {
  const { h, s, l } = hexToHsl(hex);

  // Near-neutrals first — hue is meaningless when there's almost no saturation.
  if (l >= 0.95) return 'soft white';
  if (l <= 0.07) return 'inky black';
  if (s <= 0.12) {
    if (l < 0.22) return 'charcoal';
    if (l < 0.45) return 'slate grey';
    if (l < 0.72) return 'soft grey';
    return 'pale grey';
  }

  // Earthy browns: dark-ish, un-vivid oranges and ambers read as brown, not orange.
  if (h < 45 && l < 0.30 && s < 0.85) return l < 0.18 ? 'chocolate' : 'chestnut';
  if (h >= 20 && h < 55 && l >= 0.30 && l < 0.55 && s < 0.55) return 'warm brown';
  if (h >= 30 && h < 60 && l >= 0.55 && l < 0.78 && s < 0.5) return 'tan';

  const word = hueWord(h);

  // A modifier that says how it feels. A couple of the pairings have their own
  // lovelier name (dusty + rose = "dusty rose" already; pale amber = "buttercream").
  let mod = '';
  if (l > 0.82) mod = 'pale';
  else if (l < 0.28) mod = 'deep';
  else if (s < 0.34) mod = 'dusty';
  else if (s > 0.72 && l > 0.42 && l < 0.64) mod = 'vivid';
  else if (l > 0.64) mod = 'soft';
  else mod = 'rich';

  if (mod === 'pale' && (word === 'amber' || word === 'gold')) return 'buttercream';
  if (mod === 'pale' && word === 'rose') return 'blush';
  if (mod === 'deep' && word === 'blue') return 'navy';
  if (mod === 'deep' && word === 'red') return 'crimson';
  if (mod === 'vivid' && word === 'green') return 'emerald green';
  return `${mod} ${word}`;
}

const cap = (str) => str.charAt(0).toUpperCase() + str.slice(1);
const pick = (arr, rng) => arr[Math.floor(rng() * arr.length) % arr.length];

/* ------------------------------------------------------------------- lines */

const COLOR_TEMPLATES = [
  (n) => `Ooh, ${n}. Lovely pick.`,
  (n) => `${cap(n)} — bold choice!`,
  (n) => `That ${n} is really singing.`,
  (n) => `Mmm, ${n}. Good eye.`,
  (n) => `${cap(n)}? Yes. Yes.`,
  (n) => `Nice — ${n} suits this one.`,
  (n) => `I do love a ${n}.`,
  (n) => `${cap(n)}. You know exactly what you're doing.`,
  (n) => `Reaching for the ${n}, I see. Trust it.`,
];

/** A specific compliment about the exact colour in hand. */
export function colorComment(hex, rng = Math.random) {
  return pick(COLOR_TEMPLATES, rng)(colorName(hex));
}

// Milestone → a small pool of lines. He nods to how long you've stayed and, past
// an hour, quietly reminds you to drink some water.
const PLAY_LINES = {
  0.5: ['Half an hour of colour already. My favourite kind of afternoon.'],
  1: ['An hour together — I feel so loved. 💛', 'A whole hour! Cosy.'],
  2: ['Two hours! Maybe a sip of water, friend? 💧', 'Two hours in. Blink for me? 😊'],
  3: ['Three hours?? I feel SO loved. Also — water, yes? 💧', "Three hours, look at us go. Don't forget to hydrate, friend."],
  4: ['Four hours. You and me, we make a good team.', 'Four hours! Stretch those clever hands.'],
  6: ['Six hours, wow. A snack might be nice. 🥔', 'Six hours. Legend. Please drink something. 💧'],
  8: ["Eight hours. You're unstoppable — but water AND a snack, okay? 🥔💧"],
};

/** The line for a crossed playtime milestone (an entry of PLAY_MILESTONES). */
export function playtimeComment(milestoneHours, rng = Math.random) {
  const lines = PLAY_LINES[milestoneHours];
  return lines ? pick(lines, rng) : null;
}

const AMBIENT = [
  "Take your time. The good ones can't be rushed.",
  "I'll just be over here, admiring.",
  'No notes. Carry on. 🐿️',
  "Ooh, that part's coming along nicely.",
  'Cosy in here.',
  'You make this look easy.',
  "I love watching a picture find itself.",
];
const NEAR_DONE = [
  "So close now — I can feel it!",
  "Nearly there. Don't rush the last bit.",
  "The finish line! Bring it home.",
];
const WELCOME_BACK = [
  'Back again! I saved your spot. 🐿️',
  'Oh good, you’re here. Let’s make something.',
];

/** An unprompted line for a quiet moment: near-done if the picture is almost
 *  finished, a welcome if he just arrived, otherwise something ambient. */
export function ambientComment(ctx = {}, rng = Math.random) {
  if (ctx.justArrived) return pick(WELCOME_BACK, rng);
  if (ctx.filledFrac >= 0.85 && ctx.filledFrac < 1) return pick(NEAR_DONE, rng);
  return pick(AMBIENT, rng);
}

const FINISH = [
  'You DID it. I never doubted us. 🎉',
  'Look at that. Absolutely gorgeous.',
  'Framed-and-on-the-wall good, that.',
];
export function finishComment(rng = Math.random) { return pick(FINISH, rng); }

/* ---------------------------------------------------------------- roaming */

const SIDES = ['top', 'right', 'bottom', 'left'];

/**
 * Where Pip scampers to next: a point on the border of the picture box, expressed
 * as a side + a fraction `t` (0..1) along it, plus which way he should face so he
 * looks INTO the picture. Never the same side twice in a row, so he actually
 * travels rather than shuffling in place. game.js maps this onto the board's rect.
 */
export function nextSpot(prevSide = null, rng = Math.random) {
  const choices = SIDES.filter((s) => s !== prevSide);
  const side = pick(choices, rng);
  const t = 0.12 + rng() * 0.76;               // keep off the very corners
  // Face toward the middle of the picture from wherever he lands.
  let face;
  if (side === 'left') face = 1;
  else if (side === 'right') face = -1;
  else face = t < 0.5 ? 1 : -1;                // top/bottom: look toward centre
  return { side, t, face };
}

/** A dwell time around DWELL_MS, jittered so he isn't a metronome. */
export function dwellTime(rng = Math.random) {
  return DWELL_MS + (rng() * 2 - 1) * DWELL_JITTER_MS;
}

/* ------------------------------------------------------------------- art */

// Pip's apron: a linen bib with straps, a pocket seam and a handful of paint
// splatters. Fixed-colour accents (solid fills, stroke none) so it reads the same
// in every theme — the "multicolor" idiom, same as a sticker or a garment panel.
// Shared with the tour squirrel so both wear the identical apron.
export function apronMarkup() {
  return `<g class="sq-apron" aria-hidden="true">
      <!-- straps up to the neck -->
      <path d="M41 62 L50 50 L52 51 L43 63 Z" fill="#e7dcc4"/>
      <path d="M57 63 L61 50 L63 51 L59 64 Z" fill="#e7dcc4"/>
      <!-- the bib -->
      <path d="M40 61 C46 57 54 57 59 62 C61 68 61 80 57 86 C52 90 44 90 40 86 C36 80 36 67 40 61 Z" fill="#f1e7d2"/>
      <!-- a soft inner shadow so it sits on the belly, not floats -->
      <path d="M40 61 C44 58 49 57 53 58 C47 60 43 66 43 74 C43 82 47 87 53 88 C46 89 41 86 40 82 C37 76 37 67 40 61 Z" fill="rgba(120,96,60,0.12)"/>
      <!-- pocket seam -->
      <path d="M40 76 C46 74 54 74 59 76" stroke="rgba(120,96,60,0.35)" stroke-width="1.1" fill="none"/>
      <!-- paint splatters -->
      <circle cx="45" cy="68" r="2.3" fill="#e0453f"/>
      <circle cx="54" cy="66" r="1.7" fill="#2f74d0"/>
      <circle cx="49" cy="81" r="2.6" fill="#f2b134"/>
      <circle cx="56" cy="82" r="1.6" fill="#3aa564"/>
      <circle cx="43" cy="73" r="1.3" fill="#c94db0"/>
      <circle cx="52.5" cy="72" r="1" fill="#e0453f"/>
    </g>`;
}

/**
 * Pip at rest: the tour squirrel's tail, body and head (so he's unmistakably the
 * same friend), the pointing arm swapped for two paws holding a little brush, and
 * the apron on. Authored facing right; `.sq-flip` mirrors him. Uses the shared
 * `.sq-fur` / `.sq-eye` / `.sq-nose` tokens, so he re-colours with the tour squirrel.
 */
export function companionSVG() {
  return `<svg class="sq" viewBox="0 0 100 100" width="72" height="72" aria-hidden="true">
    <g class="sq-flip">
      <g class="sq-tail">
        <path class="sq-fur" d="M34 84 C10 82 6 58 16 40 C22 29 36 24 44 30 C34 33 24 44 24 58 C24 72 34 78 44 78 Z"/>
        <path class="sq-fur" d="M20 44 C15 33 22 22 34 20 C44 18 52 26 50 34 C45 27 36 26 30 32 C24 38 22 44 26 52 Z"/>
        <path d="M18 42 C14 31 21 21 33 19 C40 18 45 21 47 25 C41 22 34 24 29 30 C23 37 21 45 24 54 Z" fill="rgba(255,255,255,0.14)"/>
        <path d="M34 84 C16 82 10 62 17 45 C13 60 18 76 36 79 Z" fill="rgba(0,0,0,0.12)"/>
      </g>

      <path class="sq-fur" d="M40 88 C24 88 20 74 24 62 C28 50 40 44 52 46 C66 48 74 58 74 70 C74 82 62 88 52 88 Z"/>
      <path d="M46 86 C36 85 33 74 37 65 C41 57 50 55 57 59 C50 58 44 63 43 71 C42 79 47 84 54 85 Z" fill="rgba(255,244,224,0.55)"/>

      <!-- back foot -->
      <path class="sq-fur" d="M40 84 C36 88 34 92 40 93 C47 94 54 92 54 88 C54 84 48 83 40 84 Z"/>

      ${apronMarkup()}

      <!-- two front paws resting on the apron, holding the brush -->
      <path class="sq-fur" d="M40 82 C36 82 34 86 38 88 C42 90 46 88 46 84 C46 81 43 81 40 82 Z"/>
      <path class="sq-fur" d="M56 80 C60 78 64 79 64 83 C64 87 59 88 55 86 C52 84 53 81 56 80 Z"/>
      <!-- a wee paintbrush, tip loaded -->
      <g class="sq-brush">
        <path d="M60 82 L74 60 L77 62 L63 84 Z" fill="#b98a4e"/>
        <path d="M73 62 L79 58 L81 61 L76 65 Z" fill="#d9d3c6"/>
        <path d="M78 58 C82 53 85 52 84 57 C83 61 80 62 78 60 Z" fill="#2f74d0"/>
      </g>

      <!-- head -->
      <path class="sq-fur" d="M56 40 C54 26 64 16 76 16 C88 16 94 26 92 38 C90 50 80 56 70 54 C62 52 57 47 56 40 Z"/>
      <path class="sq-fur" d="M64 20 C60 10 64 4 70 6 C76 8 76 16 72 22 Z"/>
      <path d="M66 18 C63 12 65 8 69 9 C72 10 72 15 70 19 Z" fill="rgba(0,0,0,0.14)"/>
      <path d="M60 42 C58 33 63 25 71 24 C64 28 61 35 63 44 Z" fill="rgba(255,255,255,0.12)"/>
      <path class="sq-nose" d="M90 36 C94 35 96 37 95 40 C94 43 90 43 88 41 Z"/>
      <circle class="sq-eye" cx="79" cy="33" r="4.4"/>
      <circle cx="80.6" cy="31.4" r="1.5" fill="rgba(255,255,255,0.9)"/>
    </g>
  </svg>`;
}
