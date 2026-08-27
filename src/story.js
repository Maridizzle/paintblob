// Story mode: the chapters, their stones, and their opening scenes.
//
// Pure data and pure helpers, no DOM — so the chapter can be checked in node
// against the puzzles it names and the themes it hands out, the same way
// themes.js is. game.js draws the board and plays the scene; letters.js draws
// who is speaking; this file is only what is true about the story.
//
// The premise, for anyone reading the code cold: the colours went on strike.
// They did not leave — everything is still coloured, everything still shows up.
// They stopped ANSWERING TO THEIR NAMES. There is no red any more. There is
// that one, and only if you are close enough to point. A paint-by-number is the
// last dictionary left that works — every colour on it still has a number and
// the number still points straight at the colour — so painting one is the
// repair. Chapter one is the Sampler, the cloth where naming was first done,
// which is why the un-naming shows first and worst there.

export const DEFAULT_CHAPTER = 1;

export const CHAPTERS = [
  {
    id: 1,
    title: 'The Sampler',
    // The look a finished chapter hands to the whole-game theme menu. `fae`
    // already carries `chapter: 1` in themes.js; this is the other half of that
    // handshake. Applying it on entry is what makes the chapter feel like
    // somewhere you arrived.
    theme: 'fae',
    blurb: 'The cloth where every colour was first told its name.',

    // The opening cutscene. Each beat is one card: who is speaking, a short
    // eyebrow title, and what they say. Every beat has a face — Y guides, Ee
    // remembers — so the scene reuses the tour's centred-card layout with the
    // squirrel swapped for a letter. Kept to eight beats: the same order of
    // length as the squirrel's first-run lap.
    opening: [
      { speaker: 'Y', title: 'The Sampler',
        body: 'See this cloth? It’s the Sampler. A long time ago every colour and every letter was first shown its own name right here and told: this is you. It has hung on this wall being right about everything ever since. I’m Y, by the way — I’ll be your guide.' },
      { speaker: 'Y', title: 'Until this morning',
        body: 'This morning it’s all still here. Every thread where it was, every colour the colour it was. And not one of them will answer to its name. Go on — point at the sky up there and ask for blue. …It’s still that colour. It just doesn’t come when you call it. None of them do.' },
      { speaker: 'Y', title: 'Why me',
        body: 'You’ll want someone who’s good in a mess like this. I’ve been two different things my whole life — nobody can even agree how to spell my job. So I’m the one who looks at a thing and asks what it actually is, instead of what it’s called. Handy, this week.' },
      { speaker: 'Ee', title: 'Ee, who went short',
        body: 'An old letter leans down out of the border, big and worn soft. “I remember this,” it says. “Not the colours. Us. The year the vowels stopped going long.”' },
      { speaker: 'Ee', title: 'The songs still read',
        body: '“One morning every song your grandmother sang still read perfectly on the page. And not one of them sang. I was Ee — long as a summer afternoon. Now I’m Eh.” A pause. “You get used to it. You shouldn’t.”' },
      { speaker: 'Y', title: 'What they can’t take',
        body: 'But a number never needed a name. Look — a paint-by-number. Every colour on it still has a number, and the number still points dead straight at the colour. It’s the last dictionary left that works. So that’s the plan. We paint.' },
      { speaker: 'Y', title: 'Stone by stone',
        body: 'Seven stones lie across the Sampler. Finish a picture and you hand every colour on it its name back — for good. Two stones are ready for you now. Start with whichever you like; I’ll be along.' },
      { speaker: 'Ee', title: 'One thing first',
        body: 'The old letter isn’t quite finished. “The last time, nobody came. That’s why I’m short.” It settles back down into the cloth until it is only stitches again. “This time somebody came. Paint carefully.”' },
    ],

    // The stepping-stone path. Order is narrative order — the board draws them
    // along a winding thread in this order, and the boss is last. A node is
    // BUILT when it names a puzzle that exists; the two built stones are what
    // opens on a fresh save, and the five without a puzzle draw locked. Adding
    // a puzzle id to one of them later is the whole of unlocking it.
    nodes: [
      { id: 'blue-reportedly', title: 'Blue, Reportedly', kind: 'stone', puzzle: 'blue-reportedly',
        note: 'The sky over the Sampler, which everyone agrees used to be blue.' },
      { id: 'ees-doorway', title: 'Ee’s Doorway', kind: 'stone', puzzle: 'ees-doorway',
        note: 'The arch the old letter came in by. Mind the step; it’s shorter than it was.' },
      { id: 'thread-cupboard', title: 'The Thread Cupboard', kind: 'stone', puzzle: null },
      { id: 'nobodys-red', title: 'Nobody’s Red', kind: 'stone', puzzle: null },
      { id: 'rhyme-that-stopped', title: 'The Rhyme That Stopped', kind: 'stone', puzzle: null },
      { id: 'silent-e', title: 'Silent E Has The Last Word', kind: 'stone', puzzle: null },
      { id: 'wrong-colour-day', title: 'The Wrong-Colour Day', kind: 'boss', puzzle: null },
    ],
  },
];

const BY_ID = new Map(CHAPTERS.map((c) => [c.id, c]));

// Every puzzle id the story lays claim to, so the free-play gallery can keep a
// story picture hidden until it has actually been painted.
const STORY_PUZZLES = new Set(
  CHAPTERS.flatMap((c) => c.nodes.map((n) => n.puzzle).filter(Boolean)),
);

export function isChapter(id) {
  return BY_ID.has(id);
}

/** The chapter id to actually use — a save carrying one this build no longer
 *  ships must fall back rather than strand story mode, the way themeOr does. */
export function chapterOr(id, fallback = DEFAULT_CHAPTER) {
  return isChapter(id) ? id : fallback;
}

export function getChapter(id) {
  return BY_ID.get(id) ?? BY_ID.get(DEFAULT_CHAPTER);
}

/** A brand-new story save: on chapter one, nothing seen yet. */
export function defaultStory() {
  return { chapter: DEFAULT_CHAPTER, seen: {} };
}

export function isStoryPuzzle(id) {
  return STORY_PUZZLES.has(id);
}

export function openingSeen(story, chapterId) {
  return !!story?.seen?.[chapterId];
}

/**
 * One node's state, and the single place the gate lives.
 *
 *   locked  — no puzzle yet: the stone is drawn but cannot be walked to.
 *   done    — its puzzle is finished in the save.
 *   open    — built and not yet finished: playable now.
 *
 * Completion is read straight off save.progress, which is the one source of
 * truth for whether a picture is finished — there is no second done-list to
 * drift from it. Tightening the gate later (a stone behind the one before it,
 * a chapter behind its boss) is a change here and a test, not a UI edit.
 */
export function nodeState(node, save) {
  if (!node?.puzzle) return 'locked';
  return save?.progress?.[node.puzzle]?.done ? 'done' : 'open';
}
