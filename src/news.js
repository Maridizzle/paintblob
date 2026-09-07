// The "What's New" catalogue — a player-facing digest of everything added since
// low-stim mode, shown top to bottom in the #news splash (game.js renders it).
//
// Pure on purpose (no DOM): the list and the seen-gating run in node tests. Each
// entry carries a monotonic `rev`; the save holds the highest rev the player has
// read (`settings.newsSeen`), so adding an entry with a higher rev is all it takes
// to resurface the splash for a returning player — no other bookkeeping. Keep the
// entries in order; the splash starts with low-stim, as the first thing new since.

export const NEWS = [
  {
    rev: 1,
    icon: '🌙',
    title: 'Low-stim mode',
    blurb: 'A calmer paintblob: the moving background and flashy effects switch off and the look stays quiet. Turn it on in Settings.',
  },
  {
    rev: 2,
    icon: '🎡',
    title: 'Four new bonus rounds',
    blurb: 'Shade Match, Colour Mixer, Drip Catch and Palette Memory now weave through free-mode pictures. Tap the corner chip when one pops up — or ignore it.',
  },
  {
    rev: 3,
    icon: '🎁',
    title: 'Bonus perks',
    blurb: 'Win a bonus round and your next few taps each drop an extra cell, free.',
  },
  {
    rev: 4,
    icon: '🗂️',
    title: 'Browse pictures by theme',
    blurb: 'The gallery sorts into categories now, so you can filter down to what you feel like painting.',
  },
  {
    rev: 5,
    icon: '🖼️',
    title: 'Real story artwork',
    blurb: "Chapter One's seven scenes are fully painted now, laid over a stitched-sampler board.",
  },
  {
    rev: 6,
    icon: '🌑',
    title: 'Patina dark mode',
    blurb: 'A new dark theme — hammered copper on black velvet. Pick it in Settings; no unlock needed.',
  },
  {
    rev: 7,
    icon: '🫧',
    title: 'Choose how cells fill in',
    blurb: 'Pick your fill animation: the classic blob, a starburst, a scribble, a bottom-up rise, or instant. Set it in Settings.',
  },
  {
    rev: 8,
    icon: '🖐️',
    title: 'A clearer canvas',
    blurb: 'Undo and the story-path button moved up into the toolbar, so nothing floats over the cell you still need to tap.',
  },
  {
    rev: 9,
    icon: '💾',
    title: 'Save art & back up progress',
    blurb: 'Save any finished picture as an image, and download or restore a backup of your whole save — both in Settings.',
  },
  {
    rev: 10,
    icon: '🎨',
    title: 'Special paints',
    blurb: 'Shimmer, rainbow and oil-slick paints that never stop moving. Buy a pack and paint any cell — even on a finished picture. Find them in Settings → Special paints.',
  },
  {
    rev: 11,
    icon: '🏷️',
    title: 'Stickers',
    blurb: 'Stamp hearts, stars, shapes, letters, numbers, animals and aliens onto a picture — bought in packs, then sized, spun or given a 3D pop. Tap 🏷 in the toolbar to decorate.',
  },

  // ─── NEXT SPLASH BATCH STARTS HERE (rev 12+) ────────────────────────────────
  // Everything above has shipped AND been announced. To avoid resurfacing the
  // splash on every little patch, features that ship between batches are NOT
  // listed the moment they land — they wait here and get announced together in
  // the next batch. Add the next round of entries below this line, continuing at
  // `rev: 12`. Adding any entry bumps NEWS_MAX_REV, which re-shows the splash for
  // returning players, so add them as a batch, not one at a time.
  //
  // Already shipped, waiting to be listed (write these first, in ship order):
  //   • Pip, the painting buddy (v0.7.61) — an optional paint-aproned squirrel
  //     who roams the picture's border and chats about your colours. Toggle in
  //     Settings → "Painting buddy". Suggested: icon 🐿️, title "A painting buddy".
];

/** The highest rev in the catalogue — what "caught up" means. */
export const NEWS_MAX_REV = NEWS.reduce((max, n) => Math.max(max, n.rev), 0);

const seenRev = (save) => save?.settings?.newsSeen ?? 0;

/** Is there an entry the player has not read yet? Drives the auto-splash and the
 *  title-screen badge. */
export function hasUnseenNews(save) {
  return NEWS_MAX_REV > seenRev(save);
}

/** The entries newer than what the player has read, in display order. */
export function unseenNews(save) {
  const seen = seenRev(save);
  return NEWS.filter((n) => n.rev > seen);
}

/** Mark everything read — called when the splash is opened. */
export function markNewsSeen(save) {
  if (save?.settings) save.settings.newsSeen = NEWS_MAX_REV;
}
