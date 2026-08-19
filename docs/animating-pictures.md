# Animating a picture

**Read this whole file before running anything.** It is written to be
followed exactly. Where it says *do not*, that is because doing it breaks
something that will not fail loudly until much later.

---

## 0. What you are being asked to do

Each picture in this app can have **exactly one element that comes alive** —
one koi flicking, one aurora shimmering, one lantern glowing — for seven
seconds every time the player taps the 🖼 **Photo** pill on a finished
picture.

Your job is **one judgement call per picture**, wrapped in four commands:

1. Render a map of the picture.
2. **Look at it.** Decide which single element should move, and which of the
   five effects suits it.
3. Commit that choice with one command.
4. **Look at the rendered frames.** Confirm it looks right. Run the tests.
   Commit to git.

You are **not** writing renderer code. You are **not** adding effects. If you
believe you need to edit `src/render.js`, you have misread the task — stop and
say so instead.

### Non-negotiables

- **You must actually look at the images.** Every step below that says *look*
  means opening the PNG and viewing it. If you cannot view images, **stop and
  say so.** Do not guess cell ids from JSON coordinates. A tag placed without
  looking will be wrong, and nothing will catch it, because "wrong element
  moving" is not something a test can detect.
- **One element per picture.** Not two. Not "the sky and the water". The whole
  point is that a single thing moves while everything else stays still.
- **Never hand-edit `puzzles/<id>.json`.** Ever. Use the tool.
- **Never edit `src/render.js`, `src/game.js`, or `tools/mapify.mjs`** as part
  of this task.
- **Not every picture needs an animation.** If nothing in a picture obviously
  wants to move, tag nothing and say so. An untagged picture is a completely
  normal, fully supported outcome. A forced, arbitrary tag is worse than none.

---

## 1. Setup, once

```bash
npm ci
npx playwright-core install chromium
```

The tagging tool renders the real app in headless Chromium. If Chromium is
missing, the tool fails immediately with a clear error — install it rather
than working around it.

Everything below runs from the repo root.

---

## 1a. When this happens, and why the window is what it is

Three scheduled workflows, every Monday:

| UTC | workflow | what it does |
|---|---|---|
| 13:00 | `weekly-mystery.yml` | bakes 5 queued photos into puzzles, **commits, stops** |
| 14:00 | `weekly-animate.yml` | renders a map per untagged picture, files the handoff issue |
| 20:00 | `weekly-release.yml` | bumps the version and pushes the tag, which publishes |

**You cannot do this before the Monday bake.** A picture's cell ids do not
exist until it has been built, and the tag is a list of cell ids. There is
nothing to point at until 13:00.

**You should not do it after 20:00**, either — not because anything breaks,
but because that week's release is already out. A tag written on Tuesday
ships the following Monday, and the picture spends its first week lifeless.
The six-hour window between the bake and the release exists exactly for this.

If you miss the window, tag anyway. It ships a week later, which is fine.
Do **not** try to cut a release yourself to catch up.

Always **`git pull` first.** The bake commits directly to the branch, so a
stale checkout will not have the pictures you were asked to tag.

## 2. Find the pictures that need tagging

```bash
node tools/untagged-pictures.mjs
```

Anything showing `[ untagged ]` is a candidate.

---

## 3. Render the map

```bash
node tools/tag-animation.mjs <id>
```

This writes two PNGs to `puzzles/_raw/tag/<id>/`:

| file | what it is |
|---|---|
| `map-photo.png` | **the one you want** — the real photo, overlaid |
| `map-painting.png` | the same, over the paint-by-numbers version |

Both carry a **pink coordinate grid** in picture units, and cell outlines in
white. Cells you have selected show up **cyan and filled**.

**Now open `map-photo.png` and look at it.**

On a picture with 60 cells or fewer, every cell id is printed on the map, and
you can read the ids straight off. On a picture with more than 60 cells — and
**every weekly mystery picture is 500 cells** — printing 500 numbers would be
an unreadable wall of digits, so ids are hidden and you select by region
instead. That is what the grid is for. (`--ids` forces them all on. You will
regret it.)

---

## 4. Choose the element and the effect

Look at the picture and name the one thing that should move. Then pick the
effect that matches **what that thing physically does in reality**:

| effect | for | examples |
|---|---|---|
| `ripple` | anything that undulates in place | water, a reflection, a flag, a fish, hair |
| `glow` | anything that emits light and pulses | a lantern, a lit window, embers, a candle |
| `shimmer` | anything that catches a moving highlight | an aurora, glass, metal, silk, wet stone |
| `breathe` | anything alive and at rest | a sleeping animal, a person, a flower |
| `twinkle` | many small points of light | stars, fairy lights, frost, dew, city lights |

**How to choose well:**

- Ask what the thing does in real life, and pick the effect that names it.
  Water ripples. Auroras shimmer. Lanterns glow. This is usually obvious, and
  when it is obvious you are right.
- Prefer the element a person's eye goes to first.
- Prefer something **away from the picture's edge**. An element that touches
  the border has less room to move and the effect reads weakly.
- `twinkle` needs *many small* things. Do not use it on one big region — you
  will get a few lonely sparks on a large flat area, which looks like a
  rendering bug.
- `breathe` is the subtlest of the five. On a small region it is nearly
  invisible. Use it on something substantial.
- If two effects both seem fine, pick the calmer one. This runs every single
  time the player looks at the photo; it must not become irritating.

---

## 5. Select the cells

Three selectors. **`--box` and `--colour` intersect**, and that combination is
what isolates one thing in a busy picture.

```bash
# What are the palette colours, and how many cells does each have?
node tools/tag-animation.mjs <id> --palette

# Everything inside a rectangle (read the corners off the pink grid)
node tools/tag-animation.mjs <id> --box 30,40,700,350

# Everything of certain palette colours, anywhere in the picture
node tools/tag-animation.mjs <id> --colour 2,8,9

# Both at once — "the greens, but only in this rectangle". Use this one.
node tools/tag-animation.mjs <id> --box 30,40,700,350 --colour 2,8,9,12,15,17

# Exact ids, when you can read them off a small picture. Overrides the above.
node tools/tag-animation.mjs <id> --cells 6,12,15
```

`--box` takes `x0,y0,x1,y1` in **picture units** — the numbers printed on the
pink grid. A cell is selected if its number-anchor falls inside the box, so a
box slightly smaller than the thing still catches it.

`--colour` takes **zero-based palette indices**, which are **one less than the
tub numbers the game shows**. Run `--palette` and copy the numbers it prints;
do not do the arithmetic in your head.

**Iterate.** Running any selector without `--set` selects but does not commit,
and re-renders the map with your selection highlighted cyan:

> **Look at `map-photo.png` again.** Is the cyan exactly the thing you meant?
> Nothing extra? Nothing missing? If not, adjust the box or the colour list and
> run again. Repeat until the cyan is right. **This loop is the actual work.**

Do not proceed to `--set` until the highlighted region is the element and only
the element.

---

## 6. Commit the choice

Add `--set <effect>` to the exact selector command that gave you the right
highlight:

```bash
node tools/tag-animation.mjs <id> --box 30,40,700,350 --colour 2,8,9,12,15,17 \
  --set shimmer --speed 0.6
```

Optional, both defaulting to `1`:

- `--speed` — time multiplier. Below 1 is slower and calmer; above 1 is
  faster. **Stay between 0.5 and 1.5.** Large auroras and water want ~0.6.
- `--amplitude` — how strongly it moves. **Stay between 0.8 and 1.5.** Higher
  is not better; it starts to look like a glitch.

This writes the tag to `puzzles/animations.json`, writes it into
`puzzles/<id>.json`, and renders 14 frames plus an `after.png` into
`puzzles/_raw/tag/<id>/frames/`.

To remove a tag: `node tools/tag-animation.mjs <id> --clear`.

---

## 7. Look at the frames — do not skip this

Open several frames from `puzzles/_raw/tag/<id>/frames/` — at minimum
`02000ms.png`, `04000ms.png`, and `after.png` — and check all four:

1. **Something is visibly different** between the mid frames and `after.png`.
   If every frame looks identical, the effect is too weak: raise `--amplitude`
   toward 1.5, or the region is too small to carry the effect and you should
   pick a different element.
2. **The motion is confined to the thing.** Nothing outside the element
   changes.
3. **No tearing.** No transparent gaps, no torn or doubled edges along the
   element's outline. (This should not happen. If it does, do not try to fix
   it — report it.)
4. **`after.png` looks like an ordinary, still photograph.** No leftover
   brightness, no residue.

The tool also prints `window closed cleanly`. If it ever prints
`WARNING: the window did not close itself`, **stop and report it** — that
means the animation never ends and the app will burn battery forever.

---

## 8. Verify and commit

```bash
npm run seed          # rebuilds the demo pictures, then syncs the tags
npm test              # the whole suite, tags included
npm run verify        # puzzle geometry
```

All three must pass. Among them are tests written specifically for tags, which
catch:

- an id in `animations.json` that is not a real picture,
- a cell id out of range for its picture,
- an unknown effect name,
- **a puzzle file that has drifted from `animations.json`** — if this one
  fails, run `npm run animations` and commit the result.

Then:

```bash
git add puzzles/animations.json puzzles/<id>.json
git commit -m "Animate the <element> in <Title>"
```

Commit **both** files. `puzzles/_raw/` is gitignored, so the renders do not
get committed — that is correct, leave it alone.

---

## 9. If something goes wrong

| symptom | what to do |
|---|---|
| `npm test` fails on "the tags survive a re-bake" | `npm run animations`, then commit `puzzles/<id>.json` |
| `animations.json tags "x", which is not a puzzle` | you typo'd the id, or the picture isn't baked yet — `git pull` |
| the map is an unreadable wall of numbers | you passed `--ids` on a dense picture; drop it and use `--box`/`--colour` |
| Chromium fails to launch | `npx playwright-core install chromium` |
| the frames all look identical | region too small or amplitude too low — see §7 |
| tearing, gaps, or `did not close itself` | **stop. Report it. Do not edit the renderer.** |

---

## 10. Why the files are arranged this way

You do not need this to do the task, but it explains why the rules above are
rules.

**`puzzles/animations.json` is the source of truth.** The tags are not stored
in the puzzle files, because those files get rewritten:

- The four **demo** pictures are rebuilt from code on every `npm run seed`,
  which CI runs on every push. Anything hand-written into their JSON is
  destroyed.
- The **weekly mystery** pictures are the opposite problem. They are baked
  exactly once, by `.github/workflows/weekly-mystery.yml`, which then deletes
  the source photo from `puzzles/queue/`. Their cell ids do not exist until
  that bake has already happened, so a tag can only ever be written
  *afterwards* — and there is no second bake to inject it.

Two opposite failure modes, so there are two mechanisms:
`tools/mapify.mjs` injects the tag at bake time, and
`tools/apply-animations.mjs` syncs the sidecar into every puzzle file
afterwards. `npm run seed` runs the second one last, and `npm test` fails if
any puzzle file has drifted. Editing a puzzle file by hand defeats both.

**Why the effect can be drawn over a photograph at all.** The renderer keeps
two layers: an offscreen **base**, redrawn only when something changes, and a
**live** layer cleared every frame. In photo view the base *is* the
photograph. The effect draws on the live layer over the top, so the photo
underneath is never modified — which is why `after.png` comes back
pixel-identical. This matters because the puzzle's cells tile the canvas with
zero gaps: genuinely *moving* a region would tear a hole in the picture with
nothing behind it to show. `ripple` and `breathe` also sample-shift rather
than draw-shift, so every destination pixel is covered and the region can
never open up mid-frame.

That is the fragile part of the system, it is already built and tested, and it
is why §7's tearing check exists and why you must not edit the renderer.
