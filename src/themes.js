// The palettes the whole app can be worn in.
//
// A theme is nothing but a set of overrides on the custom properties :root
// declares in styles.css — ground, accents, glows, and the decorative gradient
// stacks. The CSS does all the work; this is only the catalogue the settings
// picker reads from, and that story mode will later read from to hand one over
// when a chapter is finished. Pure data, no DOM, so the ids can be checked in
// node against the stylesheet that has to implement them.
//
// `void` is the look the app shipped in and is therefore :root itself rather
// than a [data-theme] block — which is why it needs no overrides to exist.

export const DEFAULT_THEME = 'void';

export const THEMES = [
  {
    id: 'void',
    label: 'Void',
    blurb: 'Ink-black dead space, cyan and neon green ripped across it.',
  },
  {
    id: 'fae',
    label: 'Tee Vibes',
    blurb: 'Rose-magenta and gold. Cloth, paper and yarn, stitched by hand.',
    // Chapter one's aesthetic. Every colour in it is magenta's family or gold;
    // nothing here is allowed to reach for cyan, which is the whole point of a
    // chapter looking like somewhere you have arrived rather than a reskin.
    chapter: 1,
  },
  {
    id: 'cobalt',
    label: 'Cobalt',
    blurb: 'The first colour, answered: deep-space black lit by crystalline blue.',
    // Earned by beating chapter one's boss — the day the FIRST colour, blue,
    // answered to its name again. A blue locked absolutely: deepest navy at the
    // cores, royal cobalt and electric cerulean on the lit edges, ice white at
    // the highlights, glacial teal in the shadows, all on deep-space black so
    // every blue glows with a cold internal fire. Later chapters earn their own
    // colour in this same crystalline register; the full spectrum is the story's
    // end, not its first stone. `unlockedBy` names the puzzle whose completion
    // opens it; the settings picker draws it locked until then (see
    // themeUnlocked).
    unlockedBy: 'wrong-colour-day',
  },
  {
    id: 'bloom',
    label: 'Wildlight',
    blurb: 'A bioluminescent jungle: emerald and jade lit from within, gold at every light source.',
    // Chapter two's FIRST-act look — the lush, over-grown, glowing world just
    // past the Sampler's frame, maximal jewel colour (Act II strips it to
    // black). It is also earned for keeping anywhere by beating the Hoarder, the
    // mini-boss that caps Act I, so it carries `unlockedBy` like cobalt does.
    // (`chapter` is documentary; the ambient hand-off is story.js chapterTheme.)
    chapter: 2,
    unlockedBy: 'the-hoarder',
  },
  {
    id: 'nightcut',
    label: 'Nightcut',
    blurb: 'Black and white only. One light, and everything it carves out of the dark.',
    // Chapter two's SECOND-act look — the moment the colour goes out of the
    // world. Tenebrism as carved darkness: black is solid, one white light,
    // midtones collapse. Worn by Act II automatically (story.js chapterTheme
    // flips to it the moment the Hoarder is beaten); earned for keeping anywhere
    // by beating the chapter boss, The Fade — whose stone ships with Act II, so
    // until then the picker draws this locked, which is exactly right.
    chapter: 2,
    unlockedBy: 'the-fade',
  },
];

const BY_ID = new Map(THEMES.map((t) => [t.id, t]));

export function isTheme(id) {
  return BY_ID.has(id);
}

/** The theme to actually apply — a save carrying an id this build no longer
 *  ships must fall back rather than leave the app unstyled. */
export function themeOr(id, fallback = DEFAULT_THEME) {
  return isTheme(id) ? id : fallback;
}

export function themeLabel(id) {
  return BY_ID.get(id)?.label ?? BY_ID.get(DEFAULT_THEME).label;
}

/**
 * Whether a theme is available to wear. A theme with no `unlockedBy` is always
 * on; one that names a puzzle is earned by finishing it — read straight off
 * save.progress, the one source of truth for what is done, so there is no
 * second unlock-list to drift from it. A missing save reads as nothing earned.
 */
export function themeUnlocked(id, save) {
  const t = BY_ID.get(id);
  if (!t?.unlockedBy) return true;
  return !!save?.progress?.[t.unlockedBy]?.done;
}
