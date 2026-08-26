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
