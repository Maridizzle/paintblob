# Story-mode art: Flux prompts

Chapter one has seven stones. **All seven now ship real art**, mapped from Flux
renders — stones one and two first, then three through seven (the old
flat-vector placeholders baked by `tools/make-story-puzzles.mjs` have been
replaced). This file keeps the prompt for every stone so any of them can be
re-baked. `tools/make-story-puzzles.mjs` is retained only as the placeholder
fallback / re-bake reference; it is not run in the normal flow.

The **"The Sampler" cutscene backdrop** below is now wired in as the **Story
board backdrop** — the chosen render lives at `src/story-sampler.jpg` and
`.story-board` (styles.css) lays it behind the chapter stepping-stones under a
theme-tinted wash. It is a UI asset, not a puzzle, so it has no `puzzles/*.json`
and is not baked.

None of the story puzzles are in the `seed` chain — every one is committed
static JSON — so `npm run seed` leaves all seven alone, and swapping real art in
never gets clobbered.

The workflow: run a prompt, generate six on blur mode, upload the six blind, and
I pick the best one and keep the choice to myself. Each stone names a puzzle
**id**, not an image, so a re-bake touches no story-mode code — it just
overwrites that one `puzzles/<id>.json`:

```bash
# the two already on real art
npm run mapify -- ~/art/blue-reportedly.jpg --id blue-reportedly \
  --title "Blue, Reportedly" --detail normal --colours 28 --no-soften
npm run mapify -- ~/art/ees-doorway.jpg --id ees-doorway \
  --title "Ee’s Doorway" --detail detailed --colours 30 --no-soften

# the five on placeholders, whenever their art is ready (--colours ~16–18 keeps
# them as chunky as the placeholders they replace)
npm run mapify -- ~/art/thread-cupboard.jpg --id thread-cupboard \
  --title "The Thread Cupboard" --detail normal --colours 18 --no-soften
npm run mapify -- ~/art/nobodys-red.jpg --id nobodys-red \
  --title "Nobody’s Red" --detail normal --colours 16 --no-soften
npm run mapify -- ~/art/rhyme-that-stopped.jpg --id rhyme-that-stopped \
  --title "The Rhyme That Stopped" --detail normal --colours 16 --no-soften
npm run mapify -- ~/art/silent-e.jpg --id silent-e \
  --title "Silent E Has The Last Word" --detail normal --colours 16 --no-soften
npm run mapify -- ~/art/wrong-colour-day.jpg --id wrong-colour-day \
  --title "The Wrong-Colour Day" --detail detailed --colours 20 --no-soften

npm run verify && npm test
```

`--no-soften` is load-bearing on the doorway: smoothing nudges the thin gold-
inlay boundaries past their own anchors and the verifier fails on stray anchors.
Off, anchors sit on the same hard geometry that's checked, and the in-app blob
fill hides the stair-steps anyway. The source render is embedded in the puzzle
JSON (the compare-to-photo image), so a re-map needs only the original file.

## For paint-by-number legibility

The pipeline turns the image into ~300–650 flat cells. It is happiest with
**bold, clean shapes and a limited but rich palette** — a clear focal subject,
large flat colour fields, and *little fine texture or noise* (busy grain either
merges into mush or explodes the cell count). Ask for a **square** frame. The
LaChapelle set-construction look is a gift here: it is built from placed solid
props, which is exactly what paints well.

---

## 1 — `blue-reportedly` · "Blue, Reportedly"

> The sky over the Sampler, which everyone agrees used to be blue.

**Scene brief (prepend to the effect block):**

A theatrical stage-set sky in a world where the sky is no longer blue, seen
straight-on and square. One monumental sun-ornament — a ringed disc of polished
gold and resin, like an enormous strung bead — hangs high and a little
off-centre over a low horizon. The sky is built in stacked horizontal bands of
deep violet, magenta and warm rose, each a smooth panel of coloured acrylic.
Three or four sculptural clouds float as rounded lozenges of frosted lilac and
pink resin. A row of small planet-beads crosses the upper sky on a fine gold
thread. Along the bottom edge runs a scalloped emerald hem stitched in gold —
the top border of the embroidered cloth this whole sky is worked on. Bold, few
large shapes, spacious, no fine texture. The joke and the crisis in one image:
plainly not blue, and everyone certain that it was.

## 2 — `ees-doorway` · "Ee’s Doorway"

> The arch the old letter came in by. Mind the step; it’s shorter than it was.

**Scene brief (prepend to the effect block):**

A grand baroque doorway standing alone on a theatrical set, centred and seen
straight-on, square frame. A tall rounded arch framed in gold inlay opens onto a
warm honeyed glow, as if a lamp burns just out of sight beyond it. The wall
around it is a deep magenta panel of pressed velvet and hand-painted moulding.
Two slender cobalt pilasters, draped in jewel-blue cloth, flank the opening; a
single carved keystone bead sits at the crown. In the lower corners stand two
luminous potted plants — acrylic emerald leaves and pink resin blossoms in gold
pots. At the foot of the door lies a low stone step that is quietly, visibly
wrong: one course short on the right, cut off early, a hand’s-width too low, as
though a letter of it went missing. Bold shapes, clean focal plane, spacious.

## Cutscene backdrop · "The Sampler"

> The cloth the whole chapter is told in front of. Optional — the scenes read
> fine over a stone — but a proper backdrop would sit behind the cards.

**Scene brief (prepend to the effect block):**

A large embroidered sampler cloth hanging on a dim theatrical wall, seen flat and
straight-on, filling a square frame. Rows of cross-stitch in jewel-tone thread —
magenta, violet, cobalt, emerald, gold — that spell out nothing legible any
more: the letters and little worked motifs (a sun, a doorway, a rhyme) are all
there but seem to have slipped their meaning. A scalloped gold-stitched border
frames the whole cloth, which catches a soft raking light. A beloved, slightly
uncanny heirloom textile. Textile-flat, minimal depth, rich but readable.

---

## 3 — `thread-cupboard` · "The Thread Cupboard"

> Where every colour was wound onto its own spool and labelled. Tidy once.

**Scene brief (prepend to the effect block):**

A tall open display cabinet of thread spools, seen straight-on and square, the
place colours were once kept most carefully. Three or four shelves of a deep
violet velvet-lined case framed in gold. On each shelf stands a row of large
spools — each a polished resin cylinder wound with one jewel-tone thread: rich
magenta, cobalt, emerald, gold, violet, rose — capped top and bottom in gold.
Beneath every spool a small enamelled name-label that has gone conspicuously
blank. One spool has come loose, a single bright thread trailing down across the
shelf below. Bold, few large shapes, orderly but for the one unravelling. The
tidiest place in the Sampler, and so the first to come undone.

## 4 — `nobodys-red` · "Nobody’s Red"

> A red that answers to no one. A colour with no name will take any you give it.

**Scene brief (prepend to the effect block):**

A single monumental red rose on a pedestal, spotlit alone at the centre of a
dark theatrical stage, seen straight-on and square. The rose is impossibly
saturated glossy red resin — the one warm, present, undeniable thing in the
frame. Everything around it is deep cobalt and violet shadow: a chequered stage
floor fading into the dark, a plain dark plinth, a soft pool of pale violet
light falling from above. Two emerald resin leaves at the stem. No other bright
colour anywhere — the red has to be the whole event. Bold, spacious, one focal
subject. A red so vividly there and so completely nameless.

## 5 — `rhyme-that-stopped` · "The Rhyme That Stopped"

> A nursery rhyme that still scans on the page and no longer sings.

**Scene brief (prepend to the effect block):**

An enormous open songbook on a stand, centred and seen straight-on, square
frame. Gold-edged cream-resin pages, a magenta ribbon marker, faint worked lines
of a rhyme across both pages. Above the page, a few musical notes lift off as
little gold resin ornaments — but hang frozen and still in the air, caught
mid-rise, silent. A small emerald resin songbird perches on the top edge of the
book, gold beak open, plainly making no sound. Deep cobalt backdrop, one soft
warm light on the pages. Bold shapes, spacious, quietly melancholy. Everything
you need to sing it, and not a note.

## 6 — `silent-e` · "Silent E Has The Last Word"

> An E gone quiet, holding the last word of a sentence nobody can finish.

**Scene brief (prepend to the effect block):**

A giant sculptural capital letter **E** in polished gold standing upright on a
writing desk, seen straight-on and square, with a single large full-stop bead
just after it. On the desk: a stoppered cobalt-glass inkwell, a fallen cream
quill with an emerald-tipped feather, and a scatter of loose metal type-letters
lying about — each little letter-block drained pale, the colour it should print
gone grey on its face. A shelf of jewel-spined books runs along the top. Deep
violet backdrop, one warm desk-lamp glow. Bold, few large shapes, spacious. The
last letter of the alphabet’s quietest, holding a sentence open that no one can
close.

## 7 — `wrong-colour-day` · "The Wrong-Colour Day" — the boss

> The bottom of the Sampler, where the un-naming happened and still lives.

**Scene brief (prepend to the effect block):**

The embroidered Sampler cloth itself, close and unravelling, filling a square
frame — the climactic set, colder and darker than the others. A woven field of
jewel-tone thread — magenta, cobalt, emerald, gold, violet, rose — in a grid of
worked squares, several of them struck through with great drained-grey **X**
marks, as though crossed out; the crossed patches keep their colour but have
plainly lost their name. Threads come loose at a torn lower hem, trailing off
the cloth. A scalloped gold border still frames it, fraying at one corner. The
light is thinner and greyer here, a chill under the gloss. Bold, readable, busy
but not noisy — the day it all happened, still happening.

---

## The effect block (append to every brief, verbatim)

```
photographify into a hyper-realistic, extreme detail high-resolution photo version of //David LaChapelle Dark Neon Pop//transform the scene into a theatrical, color-rich environment inspired by David LaChapelle’s dark pop baroque aesthetic;all peripheral elements appear as physical set constructions—polished resin ornaments, reflective acrylic shapes, hand-painted murals, soft-luster metallic props, jewel-tone fabrics, luminous plastic flora, and gently glowing neon accents placed with measured restraint; lighting is dramatic but controlled, using warm color washes, subtle chromatic reflections, soft rim glints, and diffused stained-glass hues that enrich the scene without overwhelming it; the palette features saturated magentas, cobalt blues, emerald greens, gentle gold highlights, and soft violet tones presented with a glossy but balanced finish; surrealism appears through quiet symbolic props, moderated scale shifts, reflective illusions, and sculptural elements arranged with spacious composition; optical behavior follows medium-format logic with sculpted depth and clean focal planes; atmosphere holds a gentle sheen, subtle color bloom, and evenly diffused glow; the overall mood is vibrant, theatrical, polished, and expressive while remaining clear, readable, and softly mythic in LaChapelle’s signature language
```
