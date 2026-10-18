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
  // Act I's scenes are fully written below. Act II's — The Fade, and the
  // chapter's close — are written too, and wait in docs/story-bible.md until the
  // Fade's stones exist to hang them on. The shape of the WHOLE saga (where the
  // hand is, what is past it) lives in that bible; keep the two in step.
  {
    id: 2,
    // Chapter Two's real art is baked (the aqua "Elyria" renders; see
    // docs/story-art-prompts.md), so it ships like chapter one: with no
    // `released` flag it counts as released. It still only OPENS once chapter
    // one's boss is beaten (chapterUnlocked); dev mode aside.
    label: 'Two',
    title: 'Into the Dusk',
    place: 'the dusk road',
    // Act I wears cobalt: deep-space black lit by crystalline blue, matching the
    // aqua "Elyria" art the stones are painted in. (bloom, the old green look,
    // stays a wearable reward theme unlocked by the Hoarder; it is just no longer
    // the chapter's ambient.)
    theme: 'cobalt',
    // The act break. Beating the Hoarder is the moment the colour goes out of the
    // world, so the chapter's look flips to nightcut (carved black and white) the
    // next time the board opens (see chapterTheme), and the act-break scene then
    // plays over the already-dark board: first the shock, then Ee.
    actBreak: 'the-hoarder',
    theme2: 'nightcut',
    // Act I reuses The Swap for now; the dusk-flavoured "Last Light" round (and
    // the storyRound dispatch that reads this field) land in the next drop.
    storyRound: 'swap',
    blurb: 'Out past the frame, where the light is going and the wild keeps its own names.',
    // Ten stones climb the board in a zigzag: Act I up to the Hoarder in the
    // middle, Act II on into the dark above it.
    spots: [[26, 92], [60, 84], [34, 74], [66, 64], [48, 54], [24, 44], [62, 36], [36, 27], [68, 18], [48, 9]],

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

      // ---- Act II: the dark road. The colour has gone out of the world; what is
      // left is black, white, and the one light somebody left on. These five
      // wear PLACEHOLDER art (tools/make-ch2-act2-puzzles.mjs) and carry
      // `released: false`, so a plain player sees them teased-but-shut past the
      // Hoarder while dev mode plays the act. The PR that bakes their real art
      // drops the flags (see nodeReleased).
      { id: 'signpost-that-points', title: 'The Signpost That Points', kind: 'stone', puzzle: 'signpost-that-points', released: false,
        note: 'A fork in the black road. The arms still point. The boards have nothing left to say.' },
      { id: 'last-lit-window', title: 'The Last Lit Window', kind: 'stone', puzzle: 'last-lit-window', released: false,
        note: 'A whole street gone dark but for one square of light somebody meant to come back to.' },
      { id: 'half-bridge', title: 'The Half-Bridge', kind: 'stone', puzzle: 'half-bridge', released: false,
        note: 'A bridge that stops halfway across. Not broken. Stopped.' },
      { id: 'well-of-echoes', title: 'The Well of Echoes', kind: 'stone', puzzle: 'well-of-echoes', released: false,
        note: 'A well that still answers, if you call down it. It just answers with your own voice.' },
      { id: 'the-fade', title: 'The Fade', kind: 'boss', puzzle: 'the-fade', released: false,
        // The reveal fight: paint what you can see, and what you stop looking
        // at goes blank again. Its mode + tuning are the `fade` kit in boss.js.
        kit: 'fade',
        note: 'Nothing to see on the last stone. That is the whole of it.' },
    ],

    scenes: [
      {
        // Stepping off the edge of the picture. The scale of it; the light going;
        // and the first quiet seed of the thing behind everything — Y trails off.
        id: 'opening', trigger: { onEnter: true },
        beats: [
          { speaker: 'Y', title: 'Past the edge',
            body: '“Here’s the thing nobody tells you about walking off the edge of a picture: the picture was the SMALL part. The Sampler was one cloth on one wall. And this —” Y stops. Y does not, in fact, finish that sentence, because out past the frame there is a whole world, every inch of it coloured, the light going, and not one thing in it that will come when it’s called. “Wall,” Y says at last, and pats it. “That one I’m sure of. We’ll build from there.”' },
          { speaker: 'Ee', title: 'The road',
            body: 'Ee comes up out of the ground the way it used to come up out of a border — slowly, and shorter than you’d like. “That’s the road,” it says. “It went to everywhere, once, so it carried everywhere’s names, so it was the first thing out here to go quiet. The signposts still point. They just don’t say.”' },
          { speaker: 'Y', title: 'Dressed for it',
            body: 'And look at it all. The green out here isn’t green the way the Sampler’s green was green — it’s LOUD. Vines lit from the inside like somebody left them on. Leaves the colour of a lime that has just been told good news. Everything glowing as if it has been warned this is the last evening there will ever be, and it had better dress for it. “Which,” Y admits, “is roughly what I’m afraid of.”' },
          { speaker: 'Ee', title: 'What the wild kept',
            body: '“Don’t be fooled by the glow. Some of this never had a name we gave it — the vines named themselves, and a thing that names itself doesn’t need us. It’s the things WE named that are stood out here waiting. A gate. A road. A lantern somebody lit and meant to come back to.” Ee looks a long way down the road. “Those are ours to fetch.”' },
          { speaker: 'Y', title: 'Five stones',
            body: 'There’s a way through, same as before — stepping stones, five of them across this first stretch. A gate, a path, a clearing, a lantern. And the fifth has something sat on it. Ee says it doesn’t cross things out the way X did. Ee says it GRABS. “So we do the four,” Y says, “and we get good, and then we go and have a word with the grabby one. Brush up. Mind the vines — they’re not on strike, they’re just enthusiastic.”' },
          { speaker: 'Ee', title: 'Slowly',
            body: '“One cloth at a time,” Ee says, which it has said before, and means more now. Then, quieter: “Something taught X. Out here, past the end of this road, past all of them. It won’t come to us. It never comes to anyone — that’s its whole method. So we go to it. Slowly.” A stitch of a smile. “It has all the time in the world. We have a brush. Those are the sides.”' },
        ],
      },
      {
        // First stone down: it works out here too. And the first sign of what is
        // waiting at the end of the stretch — not un-naming. Taking.
        id: 'past-the-frame', trigger: { afterDone: 'dusk-gate' },
        beats: [
          { speaker: 'Y', title: 'It came',
            body: 'The gate knows its own colours. You asked it for gold and it went gold like it had been stood there a year with its hand out. It works out here too. It works EVERYWHERE, apparently, which is the best news anyone’s had since the colours went quiet — and let it be noted that I did not cry. I’m a letter. We haven’t the plumbing.' },
          { speaker: 'Ee', title: 'Something’s been keeping',
            body: '“Look at the path ahead before you get pleased with yourself.” Ee points with the whole of its short self. A vine with the green scooped off it. A flower with a hole where its middle should be. A bit of gold gone from the road like a bite from a biscuit. “Something’s been along here. Not un-naming — X un-named, and everything stayed put. This TAKES. It’s been collecting colours it can’t ask for and carrying them off, and I’d rather you learned that here than up close.”' },
          { speaker: 'Y', title: 'Noted',
            body: '“Grabby,” Y says. “Right. Going on the list — under ‘things I’m frightened of that are technically just shapes.’” It is a growing list. Onward.' },
        ],
      },
      {
        // The clearing. Y finds the one thing out here that was never on the
        // payroll, and puts down a weight it did not know it was carrying.
        id: 'the-wheel', trigger: { afterDone: 'mandala-clearing' },
        beats: [
          { speaker: 'Y', title: 'Nobody made this',
            body: 'Look at the clearing. Properly. The leaves grew in a wheel — spoke, spoke, spoke, all the way round, out from the bloom in the middle where it glows. Nobody planted it like that. Nobody stood here with a ruler and a plan. It just grew right. “I stood in the middle of it for a while,” Y says, “and I’ll tell you what got me.”' },
          { speaker: 'Y', title: 'Never on the payroll',
            body: '“It doesn’t answer to anything. It never did. It never NEEDED to — it isn’t on strike, it was never on the payroll. It’s just being what it is, in a circle, in the dark, and it’s fine.” Y goes quiet for a moment. “I’ve been walking about carrying the whole world like it’s mine to name. It isn’t. Some of it was always going to be all right without me. I’m allowed to find that a relief. I’m a Y. I’m allowed two feelings at once.”' },
          { speaker: 'Ee', title: 'The gifts',
            body: '“The wild kept its names because it never handed them to anyone,” Ee says. “We did. Every gate and road and lantern out here has a name somebody GAVE it — and a gift can be taken back. That’s what’s sat at the end of this stretch, on a pile of them.” Ee nods on up the path. “Past the lantern. The moths are still spelling its name in circles, over and over, which is either devotion or the only trick they’ve got. Probably both. Go and see.”' },
        ],
      },
      {
        // The mid-boss intro. The Hoarder gets its own voice and the last word,
        // the way X did — and Ee explains the fight in character.
        id: 'mid-boss', trigger: { beforeStone: 'the-hoarder' },
        beats: [
          { speaker: 'Hoarder', title: 'Mine',
            body: 'Something sits on the last stone, and it is all arms. Two long curved arms, bracketing a heap — a green it can’t call green, a red it has no word for, a whole clutched armful of gold. “Mine,” it says. It has a small, wet, hopeful voice. “Mine. And mine. And — that one. Whatever that one is. Mine.”' },
          { speaker: 'Hoarder', title: 'Set aside',
            body: '“You’re wondering what I am. I’m the bit of a sentence that gets put to one side. (Like this.) Things go in me, and they don’t come out. Not crossed out — X is so DRAMATIC — just kept. Set aside. For later.” It hugs the heap tighter. “I’ve got a great many laters.”' },
          { speaker: 'Ee', title: 'It takes what you’re holding',
            body: 'Ee sets itself beside you, low and square. “Listen. It can’t ask for anything, so it takes what you’ve already picked up. Whatever colour is in your hand — THAT’S the one it wants. It’ll grab it, and every cell that goes with it, and hold on. But it can only hold one at a time. So don’t settle. Keep changing hands. Paint on.”' },
          { speaker: 'Y', title: 'You can’t keep a name',
            body: '“And here’s the bit it hasn’t worked out,” Y says, not quite steady, going anyway. “You can’t hoard a colour that answers when it’s called. Name a thing and it isn’t yours to own any more — it’s a thing that comes when you ask and goes home when you’re done. Every one we name is one it can’t keep. So we don’t fight it for the pile. We paint until there’s no pile.” A breath. “Brush up. Switch hands. Don’t let it get comfortable.”' },
          { speaker: 'Hoarder', title: 'Go on',
            body: 'The Hoarder leans in over its heap, arms tight, eyes wide and wanting. “Go on, then,” it says. “Pick one up. I like it when you pick one up.” (It really does.)' },
        ],
      },
      {
        // Act I lands — and the light goes. Plays over a board that has already
        // flipped to nightcut (see theme2), so the player sees it before Y says it.
        // The hand gets its name here, and Ee's shortness gets its cause.
        id: 'act-break', trigger: { afterDone: 'the-hoarder' },
        beats: [
          { speaker: 'Y', title: 'It let go',
            body: 'It let go. Did you see? Every colour you named just walked out of its arms — it couldn’t hold them, there was nothing left to hold — until it was sat there with its arms round nothing, saying “mine” to a puddle of light. Then it sort of deflated. Folded up. Two brackets round an empty space, which is all it ever was. “I nearly felt sorry for it,” Y says. “Then I remembered it went for my gold.”' },
          { speaker: 'Ee', title: 'Frightened',
            body: '“Don’t be too hard on it. It wasn’t wicked. It was frightened. It couldn’t ask for anything, so it kept everything — and keeping everything is how you end up with nothing you can use.” Ee watches the empty brackets a moment longer. “Remember that when we meet the next one. They’re all frightened, the marks. That’s rather the point of them.”' },
          { speaker: 'Y', title: 'Ee. The light.',
            body: '“Ee.” Y has gone very still. “Ee — the light.” Out past the lantern, the evening gives up. It doesn’t go dark the way a night goes dark; that would be ordinary, that you could sleep through. The colour goes OUT of things. The green, the gold, the glow — out, like candles, one after another down the road, and everything left exactly where it was, in black and white. A picture somebody stopped colouring in. “That’s not un-named,” Y says. “That’s… gone.”' },
          { speaker: 'Ee', title: 'Dot, dot, dot',
            body: '“That’s its real work.” Ee doesn’t raise its voice. It never has. “X crossed names out. The grabby one kept them. This —” the road ahead, cut out of the black by one thin light “— this is what happens when nobody finishes looking. It fades. It trails off. It goes …” Ee lets the word die on purpose, and in the quiet you can hear the shape of the thing. “That’s its name, if you want it. Dot, dot, dot. The Ellipsis. It never works in mornings, because in the morning people LOOK. It waits for evening. It waits for you to stop mid-sentence and never come back.”' },
          { speaker: 'Ee', title: 'Why I’m short',
            body: '“It’s why I’m short, if you were wondering. Not X — X only did the tidying. Him.” Ee’s voice is very level. “People started saying me and not finishing. Ee-… eh. Trailing off in the middle of a letter. And a letter nobody finishes gets a little shorter every year, until one morning it’s this.” A pause the length of a short vowel. “I don’t tell you for pity. I tell you so you know what we’re painting against.”' },
          { speaker: 'Y', title: 'Then we finish',
            body: '“Then we finish.” Y says it before Y has decided to. “That’s the whole plan, isn’t it? It always was. We finish things. Every cell, every name, all the way to the end of the sentence — no dots.” Y looks down the black road at the one thin light on it. “We paint what we can see. And we keep looking.” Then, because it is still Y: “I’d also like it noted that I’m now frightened of punctuation. New low. Even for a letter. Come on.”' },
        ],
      },
      {
        // Act II, two stones in. The window: a light nobody is looking at, still
        // on. Ee names the rule of the dark road, and Y takes the half-bridge
        // personally.
        id: 'deeper', trigger: { afterDone: 'last-lit-window' },
        beats: [
          { speaker: 'Y', title: 'Somebody meant to come back',
            body: 'The window. One square of light in a whole black street, and somebody lit it. Somebody put a lamp in a window and meant to come back, and hasn’t yet, and the lamp is still doing its job — which is more than the road managed. “I keep thinking about that,” Y says. “A light nobody’s looking at, still on. That’s the whole fight, isn’t it. Somewhere, somebody left a light on for us.”' },
          { speaker: 'Ee', title: 'Keep looking',
            body: '“Out here the rule is simple and it’s hard. You can only paint what you can see, and you can only see what you’re looking at, and the moment you look away it starts to go.” Ee is watching the dark, not you. “That’s Him. Not a monster. A habit. The world’s worst habit — starting a thing and drifting off. We don’t drift. Cell, cell, cell. Bridge next. Mind the gap. I mean that literally.”' },
          { speaker: 'Y', title: 'The bridge',
            body: '“There’s a bridge ahead that stops halfway across. Not broken — STOPPED. Like somebody was building it and went for a cup of tea in the middle of a plank.” A beat. “Everything out here is a sentence somebody didn’t finish. I’m starting to take it personally.”' },
        ],
      },
      {
        // The chapter-boss intro. The Fade gets its own voice and the last word,
        // the way X and the Hoarder did — and Ee explains the fight in character.
        id: 'the-blank', trigger: { beforeStone: 'the-fade' },
        beats: [
          { speaker: 'Fade', title: 'Nothing to see',
            body: 'There is nothing on the last stone. That is the first thing you notice: a blank where the thing should be, a low flat line like the space in a form where a name goes. Then the blank speaks, and it sounds tired. “Nothing to see here,” it says. “Genuinely. That’s the whole of me. I’m the line you leave for the word you’ll fill in later.”' },
          { speaker: 'Fade', title: 'Later',
            body: '“You know how many laters there are? The grabby one had a few. I’ve got ALL of them. Every sentence anyone ever stopped in the middle of — I’m where it stopped. Every picture somebody put down to finish tomorrow.” The line sags. “Tomorrow’s my busiest day. It never comes, and I’m always in.”' },
          { speaker: 'Ee', title: 'What you can see',
            body: '“Here it is, then. Its trick is simple.” Ee’s voice is close and low. “You’ll only see what’s near you. The rest is blank — not hidden, BLANK, like it was never coloured in. Paint a cell and the light spreads out from it, a little. Stop, and whatever you’ve stopped looking at fills back in with nothing. So you don’t go by number. You go by what’s lit. And you never, ever stop.”' },
          { speaker: 'Y', title: 'Fill in the blank',
            body: '“Fill in the blank,” Y says. “That’s all it is. It’s a form. It wants us to leave it empty, and it’ll wait forever for us to do that, and we’re not going to.” Y picks the brush up. “Every cell we paint is one word finished. We’re going to finish the whole page. In the dark. With it watching.” Quieter: “I’m allowed to be scared. I’m going anyway. Both.”' },
          { speaker: 'Fade', title: 'Take your time',
            body: 'The blank settles, patient as a Monday. “Take your time,” it says. “No, really. Take all of it. I’ll be here.” And it is.' },
        ],
      },
      {
        // The chapter lands. The Full Stop is seeded, Y knows what it is, and
        // Chapter Three is hooked. Sits LAST so pendingBoardScene finds the
        // earlier interstitials first.
        id: 'close', trigger: { afterDone: 'the-fade' },
        beats: [
          { speaker: 'Y', title: 'The whole page',
            body: 'You painted the whole page. In the dark, with it watching, one lit cell at a time, and when the last one went in the road came back — all of it, every name down the length of it, the window and the bridge and the well, up out of the black like a thing surfacing. “There,” Y says, and has to sit down. “There. Filled in. No blanks. Read it back to me, somebody. I want to hear it finished.”' },
          { speaker: 'Fade', title: 'One after',
            body: 'The blank is nearly gone, a faint line on the stone, and it isn’t sorry, exactly. “You finished it,” it says. “Good for you. Doesn’t matter. He’s still out there, waiting for you to look away — and I’ll tell you something for free, since I’m nearly free myself.” The line thins. “There’s one after Him. Not a dot-dot-dot. ONE dot. The one that doesn’t trail off. It just … stops.” And it goes.' },
          { speaker: 'Ee', title: 'Still short',
            body: 'Ee is still short. You knew it would be. “Not this cloth either,” it says, before you can ask. “A road’s not the last of anything. But you got the names back on it, out here where He’d already been, and that’s a thing nobody has done before.” A breath. “He’ll have noticed. Good.”' },
          { speaker: 'Y', title: 'What I am',
            body: '“I know what I am now,” Y says. It says it plainly, no joke ready, which for Y is the rarest thing there is. “Two things at once, like always. But I know which two. I’m the one who keeps looking. And I’m the one who finishes.” A beat. “I can live with that. I can probably even spell it.”' },
          { speaker: 'Ee', title: 'The road goes on',
            body: '“The road goes on,” Ee says. “It always did — that was its trouble. He’s somewhere down it, in the evening, waiting for the world to drift off. And past Him there’s the dot the blank was talking about, and I’ll be honest with you: I don’t like the sound of it. A full stop is a hard thing to argue with.” Ee draws itself up as tall as short will let it. “But we’ve got a brush. And you’ve got a habit now — a good one. Come on. Chapter Three is a town, and towns have a great many names to lose.”' },
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
 * Whether a chapter's CONTENT is shipped — its stones wear their real art, not
 * placeholders. Separate from `chapterUnlocked` (which is about earning it):
 * a chapter can be earned but held back until its pictures are painted. A
 * chapter with no `released` flag is released; one carrying `released: false`
 * stays teased-but-shut until that flag is flipped (in the PR that bakes its
 * art). Dev mode ignores this — see game.js `canEnterChapter`.
 */
export function chapterReleased(chapter) {
  return chapter?.released !== false;
}

/**
 * The same gate one stone at a time: a chapter can ship its first act while a
 * later act still wears placeholder art. A node with no `released` flag is
 * released; one carrying `released: false` is shown on the board but stays
 * shut for a plain player (dev mode ignores it — see game.js renderStoryBoard)
 * until the PR that bakes its art drops the flag.
 */
export function nodeReleased(node) {
  return node?.released !== false;
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
