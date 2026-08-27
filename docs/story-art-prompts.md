# Story-mode art: Flux prompts

Both chapter-one stones now ship **real art**, mapped from Flux renders — no
generator, so `npm run seed` leaves them alone. This file keeps the prompts that
made them (for a re-bake, and as the template for the next stones' art) and the
workflow that got them in.

The workflow: run a prompt, generate six on blur mode, upload the six blind, and
I pick the best one and keep the choice to myself. Each stone names a puzzle
**id**, not an image, so a re-bake touches no story-mode code:

```bash
npm run mapify -- ~/art/blue-reportedly.jpg --id blue-reportedly \
  --title "Blue, Reportedly" --detail normal --colours 28 --no-soften
npm run mapify -- ~/art/ees-doorway.jpg --id ees-doorway \
  --title "Ee’s Doorway" --detail detailed --colours 30 --no-soften
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

## 3 — cutscene backdrop · "The Sampler"

> The cloth the whole chapter is told in front of. Optional — the opening scene
> reads fine over a stone — but a proper backdrop would sit behind the cards.

**Scene brief (prepend to the effect block):**

A large embroidered sampler cloth hanging on a dim theatrical wall, seen flat and
straight-on, filling a square frame. Rows of cross-stitch in jewel-tone thread —
magenta, violet, cobalt, emerald, gold — that spell out nothing legible any
more: the letters and little worked motifs (a sun, a doorway, a rhyme) are all
there but seem to have slipped their meaning. A scalloped gold-stitched border
frames the whole cloth, which catches a soft raking light. A beloved, slightly
uncanny heirloom textile. Textile-flat, minimal depth, rich but readable.

---

## The effect block (append to every brief, verbatim)

```
photographify into a hyper-realistic, extreme detail high-resolution photo version of //David LaChapelle Dark Neon Pop//transform the scene into a theatrical, color-rich environment inspired by David LaChapelle’s dark pop baroque aesthetic;all peripheral elements appear as physical set constructions—polished resin ornaments, reflective acrylic shapes, hand-painted murals, soft-luster metallic props, jewel-tone fabrics, luminous plastic flora, and gently glowing neon accents placed with measured restraint; lighting is dramatic but controlled, using warm color washes, subtle chromatic reflections, soft rim glints, and diffused stained-glass hues that enrich the scene without overwhelming it; the palette features saturated magentas, cobalt blues, emerald greens, gentle gold highlights, and soft violet tones presented with a glossy but balanced finish; surrealism appears through quiet symbolic props, moderated scale shifts, reflective illusions, and sculptural elements arranged with spacious composition; optical behavior follows medium-format logic with sculpted depth and clean focal planes; atmosphere holds a gentle sheen, subtle color bloom, and evenly diffused glow; the overall mood is vibrant, theatrical, polished, and expressive while remaining clear, readable, and softly mythic in LaChapelle’s signature language
```
