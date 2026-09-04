# paintblob — the story bible

What is true about the world, the shape of the whole saga, and who everyone is —
so a new chapter can be written that fits, and so the code (`src/story.js`,
`src/letters.js`, `src/boss.js`, `src/themes.js`) and the prose never drift
apart. **This file spoils everything, including things that are not built yet.**
If you are the player, close it.

The prose that has shipped lives in `src/story.js` and is the source of truth
for what a player has seen. Prose that is written but not yet wired (because
its stones or its boss do not exist yet) lives here, in full, ready to paste.

---

## 1. The premise (Chapter One established this — never contradict it)

- The colours went on strike. They did not leave — everything is still coloured,
  everything still shows up. They stopped **answering to their names**. Ask the
  sky for blue and blue stays exactly where it is.
- A paint-by-number is the last dictionary that works: every colour on it has a
  number, and the number still points straight at the colour. **Painting a cell
  re-attaches a name, for good.** That is the whole repair, and the whole game.
- The Sampler was the cloth where every colour and every letter was first shown
  its own name. The un-naming showed first and worst there. Chapter One cleared
  it — a local win — and revealed that while you did, the silence took the rest
  of the world.
- **Names are attention.** A thing keeps its name while somebody bothers to
  call it. The un-naming spreads wherever nobody is looking. Everything in the
  saga is a variation on that sentence.

## 2. The shape of the whole story

**Book One — *The Colours on Strike*.** A start, a middle, the hand, and a
cliffhanger *past* the hand, so the story can always go on.

1. **Start — The Sampler** (Chapter One, shipped). X is beaten and turns out to
   be only a hand: *"shown the stroke, out past the edge, by a patient hand that
   has never once worked in mornings."* One cloth saved. The world un-named.
2. **Middle — the road** (Chapter Two onward). Out past the frame, one place at
   a time, meeting the hand's lesser marks. Each one is a different way a name
   is lost, and each is beaten by a different kind of painting. Y grows from a
   nervous guide into the one who keeps looking. Ee stays short and carries the
   long game. Chapter Two *names* the hand; the later legs find out where it is,
   what it wants, and how you get to it.
3. **The hand — the Ellipsis.** *Dot, dot, dot.* The mark of trailing off. It
   never works in mornings because in the morning people **look**; it waits for
   evening, for you to stop mid-sentence and never come back. It taught X the
   stroke. It is why Ee is short (people started saying *"Ee-…"* and never
   finished). It is beaten by finishing: attention as the weapon — mechanically,
   a fight in which anything you look away from un-paints itself.
4. **The cliffhanger past the hand — the Full Stop.** Behind the Ellipsis there
   is one dot. The end of the sentence. Chapter One already drew it, sitting
   after the silent E. The Ellipsis was only ever keeping it *waiting*. Now
   nothing is. Ee: *"I go long when the last cloth does. That's the last cloth.
   And it ends in a dot."*
5. **Book Two's question:** you cannot delete an ending. Can you turn a full stop
   into a comma? (*"A comma is a full stop that changed its mind."*) That is where
   Ee finally goes long — and where more can always be added, because a comma
   means the sentence goes on.

## 3. The marks (the villains are punctuation)

Every "hand" of the silence is a mark that makes text **less**. That gives the
saga an endless bench and a rule for inventing a new one: pick a mark that
diminishes, give it **one fear, one gimmick, one glyph** in the X idiom
(`letters.js`: overlapping flat bars, one `--lt-body` token, no `<text>`).

| Mark | Name | What it does to a name | Its fear | The fight (`boss.js` kit) | Status |
|---|---|---|---|---|---|
| ✕ | **X** | crosses it out — the thing stays, the *ask* dies | being asked for | `attrition`: drains painted cells; freezes a colour or a share of the board | Ch1 boss — shipped |
| ( ) | **the Hoarder** | sets it aside and *keeps* it | losing things | `hoarder`: always grabs the colour in your hand, and its cells; never your last | Ch2 mid-boss — shipped |
| ___ | **The Fade** (the Blank) | leaves a blank where it was | being filled in | `fade`: fog of war — paint what you can see; what you stop looking at goes blank again | Ch2 chapter boss — next drop |
| … | **the Ellipsis** | trails it off | mornings | the climax: everything you look away from un-paints | the hand — far off |
| . | **the Full Stop** | ends it | continuation | Book Two | past the hand |
| bench | `?` the Doubt (which tub is which?) · `" "` the So-Called (paints the *wrong* colour now and then) · `*` the Footnote (the real thing hidden in a note) · `;` the Pause (a board that stalls) · `—` the Dash (cuts a picture off mid—) | | | | future mini-bosses |

The marks are **frightened, not wicked** — *"they're all frightened, the marks;
that's rather the point of them."* Beating one is a letting-go, never a kill.
A child gets a grabby shape, candles going out, dot-dot-dot. An adult gets
hoarding as fear of loss, trailing off as neglect, and a villain who is,
literally, procrastination (*"patient" is what lazy calls itself when it's
winning*).

## 4. The people

- **Y** — the guide; speaks in first person to you. Wry, brave-despite-nerves,
  loves a list. *Two things at once* (vowel and consonant — *"nobody can even
  agree how to spell my job"*). Looks at what a thing **is**, not what it is
  called. **Arc:** Chapter One — goes anyway while scared. Chapter Two — the
  wheel teaches Y that some things name themselves and were never Y's to carry
  (*"I'm allowed two feelings at once"*); the dark teaches Y that attention is
  the weapon; it ends the chapter knowing *"I'm the one who keeps looking. And
  the one who finishes."* The saga: the one who finishes the sentence. Running
  gag: the growing list of *things I'm frightened of that are technically just
  shapes.*
- **Ee** — the old vowel that went short (*"long as a summer afternoon; now I'm
  Eh"*). Dry, tired, kind, devastating in one line, never raises its voice.
  **Stays short until the last cloth.** Chapter Two reveals *why*: the Ellipsis
  — nobody finished saying it. **Arc:** resignation (*"you get used to it; you
  shouldn't"*) → carries the long game → goes long only in Book Two, when the
  full stop becomes a comma.
- **You** — the one who came. Ee, Chapter One: *"The last time, nobody came.
  That's why I'm short. This time somebody came."*
- **X** — beaten; worn to two grey strokes; *nearly smiled*. Could come back,
  thinner, as a reluctant informant who knows the road.
- **The Hoarder** — after its letting-go, two empty brackets. A possible ally in
  a later leg: something that has learned to hold a thing *open* instead of shut.

## 5. Chapter map

- **Ch1 — The Sampler.** Look: `fae`. Boss: X → earns `cobalt`. Shipped.
- **Ch2 — Into the Dusk.** Act I look `bloom` → Act II look `nightcut`, flipping
  at the act break (beating the Hoarder). Act I shipped with its prose. Act II
  below, staged.
- **Ch3 — a town that trades names** (sketch). A market where names are bartered,
  hoarded, counterfeited. Marks: the Doubt (`?` — you are never sure which tub is
  which) and the So-Called (`" "` — a mimic that lays the wrong colour now and
  then). We learn the Ellipsis has a *place*: the far side of evening.
- **Ch4 — the library at nightfall** (sketch). The Footnote (`*` — the real
  picture hidden in a note) and the Pause (`;` — a board that stalls). We learn
  what the Ellipsis *wants*: for everything to be "later".
- **Ch5 — the edge of morning.** The approach and the Ellipsis. Beating it: the
  world un-trails. Then the dot. → the cliffhanger.
- **Book Two — the Comma.**

## 6. Chapter Two, Act II — written, waiting for The Fade

**Stones to bake** (ids fixed here so the scenes can name them):
`signpost-that-points` — *The Signpost That Points*;
`last-lit-window` — *The Last Lit Window*;
`half-bridge` — *The Half-Bridge*;
`well-of-echoes` — *The Well of Echoes*;
`the-fade` — *The Fade* (boss, `kit: 'fade'`). Add five `spots` to Chapter
Two; `theme2: 'nightcut'` and `actBreak: 'the-hoarder'` are already set.
**The Fade needs a speaker glyph** in `letters.js`: a low flat bar — the blank
line in a form — `Fade: drawFade`, `.lt-fade { --lt-body: var(--muted); }`.
Its kit's `name` in `boss.js` is already `'The Fade'`.

### `deeper` — `afterDone: 'last-lit-window'`

- **Y — Somebody meant to come back.** The window. One square of light in a
  whole black street, and somebody lit it. Somebody put a lamp in a window and
  meant to come back, and hasn’t yet, and the lamp is still doing its job —
  which is more than the road managed. “I keep thinking about that,” Y says. “A
  light nobody’s looking at, still on. That’s the whole fight, isn’t it.
  Somewhere, somebody left a light on for us.”
- **Ee — Keep looking.** “Out here the rule is simple and it’s hard. You can
  only paint what you can see, and you can only see what you’re looking at, and
  the moment you look away it starts to go.” Ee is watching the dark, not you.
  “That’s Him. Not a monster. A habit. The world’s worst habit — starting a
  thing and drifting off. We don’t drift. Cell, cell, cell. Bridge next. Mind
  the gap. I mean that literally.”
- **Y — The bridge.** “There’s a bridge ahead that stops halfway across. Not
  broken — STOPPED. Like somebody was building it and went for a cup of tea in
  the middle of a plank.” A beat. “Everything out here is a sentence somebody
  didn’t finish. I’m starting to take it personally.”

### `the-blank` — `beforeStone: 'the-fade'`

- **Fade — Nothing to see.** There is nothing on the last stone. That is the
  first thing you notice: a blank where the thing should be, a low flat line
  like the space in a form where a name goes. Then the blank speaks, and it
  sounds tired. “Nothing to see here,” it says. “Genuinely. That’s the whole of
  me. I’m the line you leave for the word you’ll fill in later.”
- **Fade — Later.** “You know how many laters there are? The grabby one had a
  few. I’ve got ALL of them. Every sentence anyone ever stopped in the middle
  of — I’m where it stopped. Every picture somebody put down to finish
  tomorrow.” The line sags. “Tomorrow’s my busiest day. It never comes, and I’m
  always in.”
- **Ee — What you can see.** “Here it is, then. Its trick is simple.” Ee’s voice
  is close and low. “You’ll only see what’s near you. The rest is blank — not
  hidden, BLANK, like it was never coloured in. Paint a cell and the light
  spreads out from it, a little. Stop, and whatever you’ve stopped looking at
  fills back in with nothing. So you don’t go by number. You go by what’s lit.
  And you never, ever stop.”
- **Y — Fill in the blank.** “Fill in the blank,” Y says. “That’s all it is.
  It’s a form. It wants us to leave it empty, and it’ll wait forever for us to
  do that, and we’re not going to.” Y picks the brush up. “Every cell we paint
  is one word finished. We’re going to finish the whole page. In the dark. With
  it watching.” Quieter: “I’m allowed to be scared. I’m going anyway. Both.”
- **Fade — Take your time.** The blank settles, patient as a Monday. “Take your
  time,” it says. “No, really. Take all of it. I’ll be here.” And it is.

### `close` — `afterDone: 'the-fade'` (the chapter lands; the Full Stop is seeded; Chapter Three is hooked)

- **Y — The whole page.** You painted the whole page. In the dark, with it
  watching, one lit cell at a time, and when the last one went in the road came
  back — all of it, every name down the length of it, the window and the bridge
  and the well, up out of the black like a thing surfacing. “There,” Y says, and
  has to sit down. “There. Filled in. No blanks. Read it back to me, somebody. I
  want to hear it finished.”
- **Fade — One after.** The blank is nearly gone, a faint line on the stone,
  and it isn’t sorry, exactly. “You finished it,” it says. “Good for you.
  Doesn’t matter. He’s still out there, waiting for you to look away — and I’ll
  tell you something for free, since I’m nearly free myself.” The line thins.
  “There’s one after Him. Not a dot-dot-dot. ONE dot. The one that doesn’t trail
  off. It just … stops.” And it goes.
- **Ee — Still short.** Ee is still short. You knew it would be. “Not this cloth
  either,” it says, before you can ask. “A road’s not the last of anything. But
  you got the names back on it, out here where He’d already been, and that’s a
  thing nobody has done before.” A breath. “He’ll have noticed. Good.”
- **Y — What I am.** “I know what I am now,” Y says. It says it plainly, no joke
  ready, which for Y is the rarest thing there is. “Two things at once, like
  always. But I know which two. I’m the one who keeps looking. And I’m the one
  who finishes.” A beat. “I can live with that. I can probably even spell it.”
- **Ee — The road goes on.** “The road goes on,” Ee says. “It always did — that
  was its trouble. He’s somewhere down it, in the evening, waiting for the world
  to drift off. And past Him there’s the dot the blank was talking about, and
  I’ll be honest with you: I don’t like the sound of it. A full stop is a hard
  thing to argue with.” Ee draws itself up as tall as short will let it. “But
  we’ve got a brush. And you’ve got a habit now — a good one. Come on. Chapter
  Three is a town, and towns have a great many names to lose.”

## 7. Tone rules (what "not slop" means here)

- **Two audiences at once, every beat.** A child gets a picture — a grabby
  shape, candles going out, dot-dot-dot, a bridge that stopped for a cup of tea.
  An adult gets the wry line underneath — hoarding is fear; trailing off is
  neglect; tomorrow is the Fade's busiest day.
- **Short sentences and long ones.** Fragments. Let a character stop
  mid-sentence — it is on theme, and it is what people do.
- **Puns light-handed, in character, never explained.** *"Not on strike —
  never on the payroll."* *"Switch hands."* *"I'm now frightened of
  punctuation."* *"Mind the gap. I mean that literally."*
- **Concrete over abstract.** A bite of gold missing from a road like a bite
  from a biscuit — not "an absence".
- **Nothing is killed.** Marks let go, deflate, thin out. Nothing is scarier
  than gentle dark with Ee beside you.
- **Callbacks are load-bearing.** *One cloth at a time. Come back sharper. The
  wall. The last dictionary that works. Ee's summer afternoon. Brush up.*
- **Ee never raises its voice. Y always has a list.** The Hoarder says *mine*.
  The Fade says *later*. The Ellipsis, when it finally speaks, will not finish
  a single sentence.
- **Banned:** tapestry, testament, delve, journey-as-a-noun, "little did they
  know", "in a world where", symmetrical triads, explaining the joke, and any
  sentence that could go on a mug.
