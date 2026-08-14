# paintblob

A frameless paint-by-number toy that floats on your desktop. Pick a tub of
paint, click a cell, and a blob explosion tears across the whole picture before
sucking itself into that one cell and filling it.

## Install

Grab an installer from [Releases](../../releases) — `.dmg` for macOS, `.exe`
for Windows, `.AppImage` or `.tar.gz` for Linux. Three demo pictures are built
in, so it plays straight away.

Builds are unsigned, so the first launch needs a nudge: on macOS right-click
the app and choose Open, on Windows pick "More info" then "Run anyway". On
Linux the AppImage wants libfuse2 on newer distributions — install it, or run
with `APPIMAGE_EXTRACT_AND_RUN=1`.

No release yet? Cut one by pushing a tag, and CI builds all three platforms:

```bash
npm version patch && git push --follow-tags
```

## Or run from source

```bash
git clone https://github.com/Maridizzle/paintblob
cd paintblob
npm install
npm run seed     # builds the three demo pictures, no API key needed
npm start
```

To build your own installer: `npm run dist` (or `dist:mac`, `dist:win`,
`dist:linux`). Output lands in `dist/`. Cross-compiling to macOS requires a
Mac; everything else builds anywhere.

## How it plays

Pick a tub, click any cell carrying that number. Wrong colour gets a soft
"nope" and nudges the tub you actually wanted. Number keys `1`–`9` switch tubs.
When a tub runs dry the next one is selected automatically. Progress, stats and
achievements are saved to the Electron `userData` directory and survive
restarts.

The window is frameless, transparent and floats above other windows. Drag the
title bar to move it, use the corner grip to resize, `◉` to unpin it from
always-on-top.

## The part that makes this tractable

The obvious approach is to ask an image model for both the picture *and* the
region map. That doesn't work well — models are bad at emitting consistent
polygon geometry, and any error shows up as a gap or an overlap in the finished
picture.

So the model never sees the map. It only paints something with big flat areas
of colour, and the cell map is derived from the pixels afterwards:

```
PNG ─► downscale ─► quantise (median cut + k-means, merge lookalike tubs)
    ─► mode filter (kill speckle)
    ─► connected components
    ─► absorb undersized regions into their longest-shared-border neighbour
    ─► trace boundaries along pixel cracks
    ─► distance transform for number placement
    ─► puzzle JSON
```

This is deterministic, runs offline in about a second, and cannot invent a
region that isn't in the artwork. It also means **any** image source works —
GPT, Flux, Midjourney, or a photo of your own gouache.

Contours are traced along the cracks *between* pixels rather than through pixel
centres, so two neighbouring cells trace the identical boundary from opposite
sides and the finished picture has no hairline seams. `npm run verify` proves
it: every pixel must belong to exactly one cell, and every number must land
inside the cell it labels.

## Making pictures

```bash
# generate and import in one step
OPENAI_API_KEY=sk-... npm run generate -- "a koi pond at dusk"

# import art you already have (PNG or JPEG)
npm run mapify -- ~/art/mountain.png --title "Mountain" --cells 70
```

Both write `puzzles/<id>.json` and add it to the manifest. The app re-reads the
manifest every time you open the Pictures panel, so a picture imported while
the app is running shows up without a restart.

Prefer PNG. JPEG works, but its ringing around hard edges shifts colours near
boundaries — the same koi pond artwork yields 18 cells as a PNG and 14 as a
quality-88 JPEG, because smeared edges let neighbouring regions merge. WebP,
AVIF and SVG are rejected with a message telling you to convert.

Useful knobs, on either command:

| flag | default | effect |
|---|---|---|
| `--cells` | 64 | upper bound on clickable regions |
| `--colours` | 14 | upper bound on paint tubs |
| `--min-area` | 0.0016 | smallest cell, as a fraction of the picture |
| `--size` | 768 | working resolution on the long side |

Bigger `--min-area` gives chunkier cells; smaller gives more of them. Aim for
25–70 cells — below that a picture is over in a few clicks, above it the
numbers get hard to read.

The generator wraps your subject in a style block asking for flat vector poster
art with no gradients or texture. That matters more than the subject does:
gradients and grain shatter into hundreds of slivers that then have to be
merged away, throwing out detail you paid for. Pass `--raw` to send your prompt
unadorned, `--keep` to hold on to the source image.

If you are prompting some other tool by hand, the words that earn their keep
are: *flat vector poster illustration, bold simple shapes, strictly flat areas
of solid colour, no gradients, no shading, no texture, no grain, limited
palette, no text*. Photographs and painterly rendering are the two things that
work worst — every soft edge becomes cells you did not want.

## The blob

`src/paint-fx.js`, four phases over ~1.2s:

| phase | ms | what happens |
|---|---|---|
| launch | 0–300 | blobs rocket from the click to targets on a jittered grid covering the whole picture; near ones land first, so it reads as a shockwave |
| hang | 300–420 | everything sits there wobbling |
| suck | 420–840 | the whole mess accelerates back into the target cell, spiralling slightly, smearing as it goes |
| fill | 760–1010 | the cell floods with colour from its anchor outward |
| pop | 1010–1180 | a brief white bloom along the wet edge |

Blobs are hard-edged wobbly bezier loops, not blurred metaballs — overlaps are
invisible because it's all the same paint, so the edges stay crisp and no
canvas filter is involved. Each blob is drawn a few percent lighter or darker
than its neighbours, which is what makes overlapping paint read as wet layers
instead of one flat silhouette.

Speed and density are adjustable in Settings.

## Sound

Everything is synthesised with WebAudio at runtime — there are no audio files.
Tub clicks walk up a minor pentatonic scale, so working through a palette
sounds like a phrase. Toggle in Settings, or turn it off and go for the
`Silent Treatment` achievement.

## Development

```bash
npm test              # pipeline unit tests + geometry verification
npm run verify        # coverage check across every built puzzle
npm run preview       # screenshot a burst, frame by frame, headless
npm run smoke         # boot the real Electron window and screenshot it
npm run dev           # Electron with devtools
npm run icon          # re-render build/icon.png
```

`npm run preview` is the useful one when tuning the effect. It runs the real UI
in headless Chromium on a virtual clock stepped from Node, so each frame lands
exactly on its intended phase, and it fails on any console error. Output goes
to `puzzles/_raw/preview/`.

The packaged app has **no runtime dependencies** — `electron/` uses only
Electron and Node builtins, and `src/` imports nothing outside itself. `pngjs`
and `jpeg-js` are build-time tools, so they stay out of the installer.

```
electron/     main + preload (CommonJS, sandboxed renderer)
src/          the app — renderer is plain ESM, no build step
  paint-fx.js the burst
  render.js   two-layer canvas: static picture + live effects
  geometry.js path parsing and hit testing, shared with the Node tools
tools/        the pipeline, generators, tests, preview harness
puzzles/      built puzzle JSON + manifest
```

There is no bundler and no framework. `src/` is loaded directly as ES modules.

## Known gaps

- Boundary simplification is lossless only (collinear points). Proper
  topology-preserving smoothing would need a shared-edge graph so neighbouring
  cells stay welded; until then diagonals are stair-stepped, which the outline
  stroke hides at display scale.
- No undo. The `undos` stat is reserved but unused.
- The demo art is deliberately simple, so it yields 16–18 cells. Generated
  artwork gives considerably more.
- Window transparency on Linux needs a running compositor.
