// Story mode: the chapters, their stones, and their scenes.
//
// Pure data and pure helpers, no DOM — so the chapter can be checked in node
// against the puzzles it names and the themes it hands out, the same way
// themes.js is. game.js draws the board and plays the scenes; letters.js draws
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
    label: 'One',
    // Named in the "Continue" subtitle and anywhere a chapter's place is spoken.
    place: 'the Sampler',
    // The story-mode bonus round this chapter offers (game.js dispatches on it).
    storyRound: 'swap',
    // Where the seven stones sit on the board, first→last — a thread winding up
    // the cloth. Percentages of the path box, hand-placed so the walk climbs.
    // Lives on the chapter (not game.js) so each chapter carries its own path.
    spots: [[30, 90], [64, 81], [39, 69], [69, 56], [33, 44], [61, 31], [48, 16]],

    // The stepping-stone path. Order is narrative order — the board draws them
    // along a winding thread in this order, the boss is last, and each stone
    // opens only once the one before it is finished (see nodeState). Every stone
    // names a puzzle; a null puzzle would draw permanently locked, kept as an
    // option for a stone whose art is not baked yet.
    nodes: [
      { id: 'blue-reportedly', title: 'Blue, Reportedly', kind: 'stone', puzzle: 'blue-reportedly',
        note: 'The sky over the Sampler, which everyone agrees used to be blue.' },
      { id: 'ees-doorway', title: 'Ee’s Doorway', kind: 'stone', puzzle: 'ees-doorway',
        note: 'The arch the old letter came in by. Mind the step; it’s shorter than it was.' },
      { id: 'thread-cupboard', title: 'The Thread Cupboard', kind: 'stone', puzzle: 'thread-cupboard',
        note: 'Where every colour was wound onto its own spool and labelled. Tidy once.' },
      { id: 'nobodys-red', title: 'Nobody’s Red', kind: 'stone', puzzle: 'nobodys-red',
        note: 'A red that answers to no one. A colour with no name will take any you give it.' },
      { id: 'rhyme-that-stopped', title: 'The Rhyme That Stopped', kind: 'stone', puzzle: 'rhyme-that-stopped',
        note: 'A nursery rhyme that still scans on the page and no longer sings.' },
      { id: 'silent-e', title: 'Silent E Has The Last Word', kind: 'stone', puzzle: 'silent-e',
        note: 'An E gone quiet, holding the last word of a sentence nobody can finish.' },
      { id: 'wrong-colour-day', title: 'The Wrong-Colour Day', kind: 'boss', puzzle: 'wrong-colour-day',
        // The original fight. Its mode + tuning live in boss.js under this kit id.
        kit: 'attrition',
        note: 'The bottom of the Sampler, where the un-naming happened and still lives.' },
    ],

    // The cutscenes, in the order they can fire. Each is a run of beats — who
    // speaks, an eyebrow title, and what they say — played once and then
    // remembered (see sceneSeen). A scene's `trigger` says when it earns the
    // screen:
    //   onEnter      — the chapter opening, the first time story mode is entered.
    //   afterDone    — an interstitial, the next time you reach the board after
    //                  that stone is finished (see pendingBoardScene).
    //   beforeStone  — plays when you tap that stone, before its puzzle loads.
    // The boss intro is a beforeStone so X gets the last word before the fight,
    // not after you have already walked past it on the board.
    scenes: [
      {
        id: 'opening', trigger: { onEnter: true },
        beats: [
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
            body: 'Seven stones lie across the Sampler. Finish a picture and you hand every colour on it its name back — for good, and the next stone lights up. The first is ready for you now. I’ll be along.' },
          { speaker: 'Ee', title: 'One thing first',
            body: 'The old letter isn’t quite finished. “The last time, nobody came. That’s why I’m short.” It settles back down into the cloth until it is only stitches again. “This time somebody came. Paint carefully.”' },
        ],
      },
      {
        id: 'thread', trigger: { afterDone: 'ees-doorway' },
        beats: [
          { speaker: 'Y', title: 'It’s working',
            body: 'Look back down the path. The sky answers to blue again; the doorway knows its own colours. Where you’ve painted, the names have STUCK — for good. I wasn’t certain they would, and I’d have told you if I were the sort to say so.' },
          { speaker: 'Ee', title: 'Into the middle of it',
            body: 'Ee leans back out of the border. “Ahead is the Thread Cupboard — where every colour was wound onto its own spool and labelled. If the un-naming started anywhere tidy, it started there. And past it: a red that belongs to no one. Mind that one. A colour with no name left will answer to any name you give it — even the wrong one.”' },
          { speaker: 'Y', title: 'Onward',
            body: 'The next stone lit up the moment you finished the last. That’s the whole trick — paint one true and the path lets you a step further. Go on.' },
        ],
      },
      {
        id: 'rhyme', trigger: { afterDone: 'nobodys-red' },
        beats: [
          { speaker: 'Y', title: 'It felt that',
            body: 'Something changed when you handed that red a name. The Sampler went quiet — not the peaceful kind. The held-breath kind. I think whatever did all this just felt someone undoing its morning’s work. I think it’s watching the thread now.' },
          { speaker: 'Ee', title: 'Near the bottom',
            body: 'Ee’s voice drops. “Ahead is a nursery rhyme — one of mine, once. It scanned. It rang. Children set their feet to it. Now it only reads. Past that, an E gone silent, holding the last word of a sentence nobody can finish. And under those two is the bottom of the Sampler, where it all started. Where it still lives.”' },
          { speaker: 'Y', title: 'Two more',
            body: 'Two stones left before the last one. Paint them true and the way down opens. I won’t pretend I’m not nervous — but being two things at once means being nervous and going anyway, and I’m good at that one.' },
        ],
      },
      {
        id: 'boss', trigger: { beforeStone: 'wrong-colour-day' },
        beats: [
          { speaker: 'X', title: 'The last stone',
            body: 'The thread at the bottom of the Sampler pulls taut, and a shape stands up out of it — two strokes, crossed, no colour of its own. “You’ve been busy,” it says. “Handing names back all up the cloth. I spent one morning taking them. Look how much further one morning gets you.”' },
          { speaker: 'X', title: 'What I am',
            body: '“I’m X. The mark you make when the name is gone — the box you tick when it could be anything. Watch: cross out a name and the colour’s still there. Right where it was. It just can’t be ASKED for any more. Nothing missing. Nothing moved. Nothing works. Tidy, isn’t it.”' },
          { speaker: 'Ee', title: 'Not this time',
            body: 'Ee rises up out of the border, taller than you have seen it — worn through, and planted. “I know you. You’re the reason I’m short. Nobody came, last time; you were counting on that.” It sets itself between you and the dark at the bottom of the cloth. “Somebody came.”' },
          { speaker: 'Y', title: 'The Wrong-Colour Day',
            body: '“This whole picture is the day it happened,” I tell you, low. “Every colour in it sitting exactly where it belongs and answering to nothing. Paint it — all of it — and you don’t just name a sky or a door. You give the whole Sampler its voice back. This is the last stone. This is the chapter.”' },
          { speaker: 'X', title: 'Then paint',
            body: 'X does not move aside. It doesn’t have to. “Go on,” it says, almost kind. “Give them their names. I’ll be right here the whole time, learning how many I can take back off the wet paint. Brush up.” Last one.' },
        ],
      },
      {
        // Chapter One's landing — the first time you return to the board after the
        // boss is beaten (afterDone). The win is deliberately LOCAL: this one cloth
        // is saved. Ee is still short (its length is a far-off payoff, not this
        // chapter), and the cliffhanger is world-sized — X was one hand, and while
        // you painted your seven stones the silence took the rest of the world.
        id: 'epilogue', trigger: { afterDone: 'wrong-colour-day' },
        beats: [
          { speaker: 'Y', title: 'This cloth is done',
            body: 'The last cell takes its colour and the Sampler lets out a breath. Ask the sky for blue now — go on. …It came. Every thread on this cloth answers to its own name again, and X won’t be lifting them off it. You did it. You gave the Sampler its voice back.' },
          { speaker: 'Ee', title: 'Still short',
            body: 'You look to Ee, waiting for it to come up long again. It doesn’t. It stays squat in the border, worn and short. “No,” it says, gently, before you can ask. “Not me. Not yet. I’m not this cloth’s letter — I’m everyone’s. I go long again when the last cloth does, not the first.” A tired warmth. “Don’t look so stricken. You just proved it can be done. That’s more than I had this morning.”' },
          { speaker: 'X', title: 'One cloth',
            body: 'Where the paint took hold X has worn to almost nothing — two grey strokes with the weave showing through. It does not rage. It nearly smiles. “One cloth,” it says. “You saved one cloth. Do you know how many there are? I only ever touched this one — I was shown the stroke, out past the edge, by a patient hand that has never once worked in mornings.” Almost gone: “And while you painted your seven little stones… it did the rest. Go on. Look past the frame.”' },
          { speaker: 'Y', title: 'The whole world',
            body: 'Y turns and looks past the edge of the Sampler, out beyond the wall, and goes very still. “Oh,” it says, quietly. Out there — every field, every face, every picture on every wall — the colours are all exactly where they belong, bright as ever, and not one of them answers to anything. The silence isn’t in the cloth any more. It’s in the world. “It didn’t stop when we beat it,” Y says. “It spread while we won.”' },
          { speaker: 'Ee', title: 'One cloth at a time',
            body: 'Ee draws itself up as tall as short will let it. “One cloth at a time is how a world gets painted,” it says. “And un-painted. And — maybe — painted back. You did the first one; the Sampler will hold.” A stitch of a smile, worn but real. “Rest the brush. Chapter One is yours.” A beat, and past the frame the whole world goes on being silent. “The world is Chapter Two. Come back sharper.”' },
        ],
      },
    ],
  },

  // ------------------------------------------------------------- Chapter Two
  // The saga's first leg out past the Sampler's frame, into the dusk-lit wild.
  // Two acts; this drop is Act I (Act II — The Fade — and the chapter's close
  // land next). The ultimate villain (the "patient hand" of Chapter One's
  // epilogue) stays offscreen for a long time yet; what you meet here is the
  // first of many lesser marks — the Hoarder — a different KIND of fight (its
  // mode + tuning are the `hoarder` kit in boss.js).
  //
  // Act I wears the `bloom` look (a bioluminescent jungle, maximal jewel
  // colour). Act II will strip that to carved black-and-white (`nightcut`) at
  // the act break — the colour visibly draining as the un-naming deepens.
  //
  // Scene bodies below are PROVISIONAL stubs — the structure (triggers,
  // speakers, order) is what is wired; the final prose is authored separately.
  {
    id: 2,
    label: 'Two',
    title: 'Into the Dusk',
    place: 'the dusk road',
    theme: 'bloom',
    // The stone whose completion ends Act I. When Act II ships, `theme2` will
    // take over here (see chapterTheme) so beating the Hoarder darkens the world.
    actBreak: 'the-hoarder',
    // Act I reuses The Swap for now; the dusk-flavoured "Last Light" round (and
    // the storyRound dispatch that reads this field) land in the next drop.
    storyRound: 'swap',
    blurb: 'Out past the frame, where the light is going and the wild keeps its own names.',
    spots: [[28, 88], [62, 76], [36, 60], [66, 46], [46, 26]],

    nodes: [
      { id: 'dusk-gate', title: 'The Dusk Gate', kind: 'stone', puzzle: 'dusk-gate',
        note: 'The last archway of the Sampler; past it the wall ends and the wild begins, already going dark.' },
      { id: 'glowvine-path', title: 'The Glowvine Path', kind: 'stone', puzzle: 'glowvine-path',
        note: 'A path the jungle took back. The only light left is the light the leaves make for themselves.' },
      { id: 'mandala-clearing', title: 'The Mandala Clearing', kind: 'stone', puzzle: 'mandala-clearing',
        note: 'A clearing where the leaves grew in a perfect wheel — an order nobody imposed, and nobody can ask for now.' },
      { id: 'moth-lantern', title: 'The Moth Lantern', kind: 'stone', puzzle: 'moth-lantern',
        note: 'One lantern still lit, and the moths that keep its name for it, spelling it out in circles.' },
      { id: 'the-hoarder', title: 'The Hoarder', kind: 'boss', puzzle: 'the-hoarder',
        // A targeted colour-thief — always freezes the colour in your hand. Its
        // mode + tuning are the `hoarder` kit in boss.js.
        kit: 'hoarder',
        note: 'Something out here has been collecting colours it can no longer name — and it does not share.' },
    ],

    scenes: [
      {
        id: 'opening', trigger: { onEnter: true },
        beats: [
          { speaker: 'Y', title: 'Past the frame',
            body: '(placeholder — Fable) The Sampler is behind you now, and the wall with it. Ahead is the world the epilogue warned about: everything where it belongs, the light going amber then grey, and not one colour answering when you call it.' },
          { speaker: 'Ee', title: 'Still short',
            body: '(placeholder — Fable) Ee comes along, still squat and worn. One cloth at a time, it says. This is the next one — and the road out here is longer than any stone on the Sampler.' },
        ],
      },
      {
        id: 'mid-boss', trigger: { beforeStone: 'the-hoarder' },
        beats: [
          { speaker: 'Ee', title: 'It hoards',
            body: '(placeholder — Fable) Ee stops you. Whatever this is, it does not un-name the way X did. It grabs. Whatever colour is in your hand, it will reach for that one — and keep reaching.' },
          { speaker: 'Y', title: 'Keep moving',
            body: '(placeholder — Fable) So do not settle, Y says. It takes the colour you are using; take up another and paint on. It can only hold one at a time. Brush up.' },
        ],
      },
    ],
  },
];

const BY_ID = new Map(CHAPTERS.map((c) => [c.id, c]));

// Every puzzle id the story lays claim to, so the free-play gallery can keep a
// story picture hidden until it has actually been painted.
const STORY_PUZZLES = new Set(
  CHAPTERS.flatMap((c) => c.nodes.map((n) => n.puzzle).filter(Boolean)),
);

// The boss stones' puzzle ids — the ones the boss fight runs on. A chapter has
// exactly one, but a Set keeps the lookup the same shape as STORY_PUZZLES.
const BOSS_PUZZLES = new Set(
  CHAPTERS.flatMap((c) => c.nodes.filter((n) => n.kind === 'boss').map((n) => n.puzzle).filter(Boolean)),
);

export function isBossPuzzle(id) {
  return BOSS_PUZZLES.has(id);
}

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

/** The save key a scene is remembered under. Per-scene now, not per-chapter, so
 *  the opening and each interstitial are each played exactly once. */
export function sceneKey(chapterId, sceneId) {
  return `${chapterId}:${sceneId}`;
}

/**
 * Whether a scene has already played. Reads the per-scene key, and — so a save
 * from when there was only one flag per chapter does not replay the opening —
 * treats the old `seen[chapterId] === true` as the opening having been seen.
 */
export function sceneSeen(story, chapterId, sceneId) {
  if (story?.seen?.[sceneKey(chapterId, sceneId)]) return true;
  return sceneId === 'opening' && !!story?.seen?.[chapterId];
}

/** Back-compat shim for the one caller that only cares about the opening. */
export function openingSeen(story, chapterId) {
  return sceneSeen(story, chapterId, 'opening');
}

/** The chapter's opening scene (the onEnter one), or undefined. */
export function onEnterScene(chapter) {
  return chapter?.scenes?.find((s) => s.trigger?.onEnter);
}

/** The scene that plays when `node` is tapped, if any (the boss intro), or
 *  undefined. Seen-ness is the caller's to check. */
export function beforeStoneScene(chapter, nodeId) {
  return chapter?.scenes?.find((s) => s.trigger?.beforeStone === nodeId);
}

/**
 * The interstitial owed on arriving at the board: the first afterDone scene
 * whose stone is finished and which has not played yet. Returns the scene or
 * null. The single place "is a cutscene due right now" is decided, so game.js
 * only has to play what it hands back.
 */
export function pendingBoardScene(chapter, save) {
  if (!chapter?.scenes) return null;
  for (const scene of chapter.scenes) {
    const after = scene.trigger?.afterDone;
    if (!after) continue;
    if (!isNodeDone(chapter, after, save)) continue;
    if (sceneSeen(save?.story, chapter.id, scene.id)) continue;
    return scene;
  }
  return null;
}

/** Whether the stone named by `nodeId` is finished in the save. */
function isNodeDone(chapter, nodeId, save) {
  const node = chapter?.nodes?.find((n) => n.id === nodeId);
  return !!(node?.puzzle && save?.progress?.[node.puzzle]?.done);
}

/**
 * One stone's state, and the single place the gate lives.
 *
 *   locked  — not reachable yet: either no puzzle, or the stone before it in
 *             the path is not finished (progressive unlock).
 *   done    — its puzzle is finished in the save.
 *   open    — reachable and not yet finished: playable now.
 *
 * `prevDone` is whether the stone before this one on the path is finished;
 * true for the first stone, which has nothing in front of it. Keeping the
 * progression in one boolean the caller supplies leaves this a pure function of
 * one node — the board walks the list and carries prevDone forward. Completion
 * is read straight off save.progress, the one source of truth, so a done stone
 * still reads done even if the chain in front of it were somehow incomplete.
 */
export function nodeState(node, save, prevDone = true) {
  if (!node?.puzzle) return 'locked';
  if (save?.progress?.[node.puzzle]?.done) return 'done';
  return prevDone ? 'open' : 'locked';
}

/**
 * The boss "kit" a boss puzzle fights under. A boss node names its kit; the
 * mode and tuning that kit id selects live in boss.js. Unknown/missing → the
 * original attrition fight, so a boss stone can never end up with no fight.
 */
export function bossKitFor(puzzleId) {
  for (const c of CHAPTERS) {
    const node = c.nodes.find((n) => n.kind === 'boss' && n.puzzle === puzzleId);
    if (node) return node.kit ?? 'attrition';
  }
  return 'attrition';
}

/**
 * Whether a chapter is reachable. The first always is; a later one opens only
 * once the chapter before it is FINISHED — its last stone (the chapter boss)
 * done in the save. This is the gate the board's "begin the next chapter"
 * affordance and the chapter arrows read, so the saga advances one leg at a time.
 */
export function chapterUnlocked(id, save) {
  if (id === DEFAULT_CHAPTER) return true;
  const prev = BY_ID.get(id - 1);
  if (!prev) return false;
  const last = prev.nodes[prev.nodes.length - 1];
  return !!(last?.puzzle && save?.progress?.[last.puzzle]?.done);
}

/**
 * The ambient look a chapter wears right now. A chapter can change its skin at
 * an act break: once `actBreak`'s stone is done, `theme2` takes over from
 * `theme`, so the world visibly shifts when the first act is cleared. A chapter
 * with no `theme2`/`actBreak` wears its single `theme` throughout.
 */
export function chapterTheme(chapter, save) {
  if (chapter?.theme2 && chapter.actBreak) {
    const brk = chapter.nodes?.find((n) => n.id === chapter.actBreak);
    if (brk?.puzzle && save?.progress?.[brk.puzzle]?.done) return chapter.theme2;
  }
  return chapter?.theme;
}
