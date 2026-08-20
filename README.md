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

To cut a new release, either push a tag, or run the **release** workflow from
the Actions tab — the manual run takes its version from `package.json`, so it
works where pushing tags is not permitted.

```bash
npm version patch && git push --follow-tags
```

## On Android (and any other phone)

The same `src/` also runs as an installable web app — no separate codebase.

```bash
npm run build:web    # -> dist-web/, a static site, ~200 kB
```

Put `dist-web/` on any HTTPS host and open it on the phone, then use the
browser's **Install app** / **Add to Home Screen**. You get a home-screen
icon, no browser chrome, and it works with no network at all — a service
worker precaches everything, and saves and imported pictures live in
IndexedDB. Dragging the folder onto [Netlify Drop](https://app.netlify.com/drop)
is the quickest way to get a URL.

Touch is handled properly rather than tolerated: bigger tubs, no stranded
hover outlines, pinch-to-zoom instead of the browser's own zoom fighting the
canvas, safe-area insets for the notch, and a lower default blob density
since phones have less GPU headroom. The window chrome disappears, having no
window to manage.

`npm run check:web` runs the whole thing on a Pixel-sized viewport, taps a
cell with a finger, then switches the network off and reloads to prove the
offline path.

For a Play Store APK rather than a home-screen install, wrap `dist-web/` in
[Capacitor](https://capacitorjs.com) or [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap) —
both take the built site as-is and need no changes here.

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
restarts. An achievement toast waits for a click to dismiss rather than fading
on a timer — there is always time to actually read what you just earned.

Painted the wrong cell, or changed your mind? **Ctrl/Cmd+Z** — or the ↶ pill
in the corner — takes it back, as far back as this sitting goes. It is free
and uncapped: a misclick is a misclick, and charging for one would be worse
than the mistake. Everything the fill granted comes back off with it, the
points included; achievements you already earned stay earned. Undo is offered
until the picture is finished, at which point there is nothing left to
correct — only a cell of the colour you are holding can be filled, so the last
one was never wrong. The history is per-sitting and is not saved.

Finishing a picture pauses on it rather than covering it immediately — the
outlines and numbers fade away, then there is a real, unhurried look at the
whole thing before the stats card appears, and that card has a close button
so you can back out of it and keep looking whenever you are done with it. A
pill in the corner (🖼 Photo / 🎨 Painting) shows up once a picture is
finished and swaps the canvas between what you painted and the real photo it
was mapped from — zoom and pan keep working on either.

The subject of a picture stands proud of it while you paint — the koi above
the pond, the whale in the water, the row of houses along the quay. It is a
parallax trick rather than any real geometry: the shadow stays on the surface
where the subject belongs while the subject itself slides against your
pointer, and that gap is what your eye reads as height. It belongs to painting
alone — flipping to the photo drops the lift and hands the picture over to its
animation instead.

Which cells make up the subject is its own tag, in `puzzles/lifts.json`. It
was briefly borrowed from the living-element tag, on the theory that a picture
has one thing worth singling out rather than two. That was wrong: the living
tag names what *moves* in the photograph, which is rarely the whole subject
and is sometimes a corner of it — the ripple on Humpback Whale sits on one
pectoral fin, so the whale lay flat while its fin floated. The subject need
not be a solid object: the aurora's lights, a nebula's clouds, a bed of
anemones each rise as one and read fine. What matters is tagging the whole of
it — an untagged picture simply stays flat.

The Pictures panel shows each one as the line drawing you are about to paint —
its own outlines, nothing filled in — so you can see what you are picking
rather than read its name. Hover it with a mouse or hold it with a finger for
a full-size look. A picture too detailed to fit in a thumbnail drops its
smallest cells rather than drawing all five hundred into a grey block, and a
blind pack shows nothing at all: its shapes give it away every bit as fast as
its title would.

A filter bar across the top of the panel searches by name and narrows the list
by progress (to do / started / done), by size, and — once you have imported any
of your own — by whether a picture is built-in or yours, with a sort that floats
your newest imports to the top. Searching only ever matches the titles you can
see, so a still-hidden mystery never surfaces by its real name.

Scroll wheel or two-finger pinch to zoom in on a picture, up to 6×; drag (or
one-finger pan on a touchscreen) to move around once zoomed. A pill in the
corner shows the current zoom level and doubles as the reset button. The same
gestures work identically with a mouse and a fingertip — there is no
touch-only mode to fall back to.

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
    ─► smooth each shared boundary once, welded to both its cells
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

That also makes every outline axis-aligned, which is why the stair steps cannot
be rounded off a cell at a time — smooth two neighbours independently and their
shared border stops matching, which opens a gap down the middle of the picture.
So a boundary is smoothed **once** and both sides are handed the same polyline.
Corners where three or more regions meet are found from the region map and the
rings are cut there into arcs; each arc belongs to exactly two cells, one
walking it forwards and the other backwards, so it is smoothed once and cached.
Sharing the arc *is* the weld — nothing is matched within a tolerance, the two
sides are the same numbers.

Two kinds of point then stay exactly where they are: anything on the image
frame, since moving it opens a gap at the edge of the picture, and any corner
where two long straight runs meet. That last one is what keeps a window square
while a one-pixel staircase rounds away. Corner cutting quadruples the vertex
count, so the smoothed arc is thinned again to a fifth of a pixel — invisible
under the outline stroke, and the difference between puzzle files growing by
two thirds and by nearly threefold. Smoothing costs about 10ms of a 400ms
build; `--no-soften` on the CLI leaves the raw lattice geometry, for when a
boundary looks wrong and the question is whether smoothing put it there.

## Adding pictures

Open the Pictures panel (`▦`) and hit **Add picture**, or just drag an image
onto the window, or press **Ctrl/Cmd+V** to paste one. It maps and opens
straight away. **Chunky / Normal / Detailed** controls how many cells you get,
and **Insane** goes further still — past the point where every cell fits a
number.

Drop a `.zip` of pictures instead of an image and each one comes in blind: no
preview, and its title stays "Mystery picture" in the list — right down to the
filename in the mapping progress — until you actually finish it, at which
point it is revealed like any other completed picture. Regular single-image
drops are never blind; a `.zip` is the deliberate way to ask for the
surprise. The unzipping is native to the app (`DecompressionStream`), so it
works offline, the same as everything else here.

On Windows the Add button never opens the OS file dialog: opening one loads
every installed shell extension into the process before the first click, and
that machinery was crashing the app outright — through the native dialog and
Chromium's own chooser alike. The button instead points you at drag-and-drop
and paste, which share the whole import pipeline and no native dialog. The
dialog-free path is forced on other platforms with `PAINTBLOB_NO_DIALOG=1`,
which is how CI keeps it tested.

Because the decoding is Chromium's, this path takes anything the browser can
display — PNG, JPEG, WebP, AVIF, GIF, BMP. Imported pictures are written to
your user data directory, not into the app, so they survive updates and can be
removed again with the `✕` on their row.

### From the command line

```bash
# generate and import in one step
OPENAI_API_KEY=sk-... npm run generate -- "a koi pond at dusk"

# import art you already have
npm run mapify -- ~/art/mountain.png --title "Mountain" --detail detailed
```

These write into the repo's `puzzles/` directory, so they ship with a build.
The CLI decodes with pngjs and jpeg-js, so it takes PNG and JPEG only —
anything else is rejected with a message telling you what to convert to.

Prefer PNG either way. JPEG ringing around hard edges shifts colours near
boundaries: the same koi pond artwork yields 18 cells as a PNG and 14 as a
quality-88 JPEG, because smeared edges let neighbouring regions merge.

### Photographs of real artwork

A phone photo of a drawing is a different problem from generated art, and the
pipeline detects and handles it rather than asking you to.

Paper texture and sensor noise mean neighbouring pixels differ by several
levels *everywhere*. Median cut splits boxes along whichever channel is
widest, so when grain is wider than the drawing's local colour change it
splits along noise — every palette entry lands near the image average, and a
vivid drawing comes back grey. The same noise makes quantisation boundaries
follow the grain rather than the picture, giving fractal tree-ring contours.

So grain is measured first and cleared with as many passes of a 3×3 median as
it needs. Flat art measures zero and is passed through untouched — the demo
puzzles are byte-identical with the step in place. A median rather than a
blur, because blurring across a real edge invents an intermediate colour that
then becomes its own sliver cell.

Photos also carry the desk, a shadow, or a sketchbook edge around the outside,
which otherwise become cells you have to paint. Those are cropped — but only
when the dark run *ends* before ~12% of the way in. Darkness alone cannot tell
a shadow from a night sky; a border is a thin band, artwork carries on into
the picture.

Useful knobs on the CLI (`--detail chunky|normal|detailed|insane` sets all of
them):

| flag | default | effect |
|---|---|---|
| `--cells` | 64 | upper bound on clickable regions |
| `--colours` | 14 | upper bound on paint tubs |
| `--min-area` | 0.0016 | smallest cell, as a fraction of the picture |
| `--size` | 768 | working resolution on the long side |

Bigger `--min-area` gives chunkier cells; smaller gives more of them. `chunky`
/ `normal` / `detailed` land around 30 / 70 / 130 cells on artwork with enough
in it — the demo `Harbour Row` is the one built to show the top end of that
range, and the ceiling there is legibility rather than the pipeline: much past
150 and you are hunting slivers rather than painting. `insane` throws that
ceiling out on purpose, up past 250 cells — see below for what keeps a cell
that small paintable.

Cells too small for a number are still paintable. Below a certain size the
number is dropped for a diagonal stripe in the cell's own colour instead —
brighter when it is the colour you are currently holding — so a picture can
go past the point of legible numbers without any cell becoming
unidentifiable. It is also what keeps `insane` playable past 250 cells. A tap
that misses looks just around itself for a cell of the colour you are
holding, with more slack for a fingertip than a mouse pointer. Zoom (above)
is the third tool for the same problem — push in until a stripe-filled sliver
is big enough to aim at properly.

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

Each frame draws to a private layer in three passes:

1. every blob's silhouette, in the paint colour
2. lighting with `source-atop`, so it lands only where paint already is
3. the layer composited up to full size

That middle step is the whole trick. Because lighting is clipped to the union
of the blobs rather than drawn per blob, highlights and shadows can overlap
freely and never leave a seam at a boundary — which a per-blob rim always
would. Each blob gets a soft dome and a drifting specular, the mass gets one
light across all of it so it reads as a single splat, and a band of shimmer
travels through during the burst.

The layer is smaller than the picture (0.6×). Upscaling a hard silhouette with
smoothing is where the soft edges come from, and it makes the lighting cheap
enough for a phone. Use bilinear, not `imageSmoothingQuality: 'high'` — the
expensive resample took 21ms of a 22ms frame and came out *sharper*.

A full-density burst costs ~9ms per frame in software rendering with no GPU;
`npm run check:web` asserts it stays inside a 60fps budget. Speed and density
are adjustable in Settings, and density starts lower on phones.

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
src/          the app — plain ESM, no build step, runs on desktop and mobile
  paint-fx.js the burst
  render.js   two-layer canvas: static picture + live effects
  platform.js Electron IPC or IndexedDB, behind one nine-method interface
  import.js   decode a dropped image and run it through the pipeline
  geometry.js path parsing and hit testing
  pipeline/   image -> puzzle, pure JS, no Node dependencies
tools/        CLI wrappers, generators, tests, preview harness
puzzles/      built puzzle JSON + manifest
```

`src/platform.js` is the only file that knows which host it is running on.
Everything else — the effect, the renderer, the pipeline, the achievements —
is identical on the desktop app and the phone.

`src/pipeline/` is shared by the app and the command line, so a picture you add
through the button is identical to one built by `npm run mapify`. Everything
Node-specific — file decoding, argument parsing, writing to disk — stays in
`tools/`.

There is no bundler and no framework. `src/` is loaded directly as ES modules.

## Known gaps

- The demo art is deliberately simple, so it yields 16–18 cells. Generated
  artwork gives considerably more.
- Window transparency on Linux needs a running compositor.
