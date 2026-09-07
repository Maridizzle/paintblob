# paintblob — guide for coding agents

A frameless **Electron 33 desktop app** and an **installable PWA** served from the
same `src/`. **Vanilla ESM — no framework, no bundler, no TypeScript.** It's a
paint-by-number toy: pick a paint tub, tap a cell, a blob explosion tears across
the picture and sucks into that cell to fill it. Progress lives in a save
(IndexedDB on web, a JSON file in Electron).

This file is the fast on-ramp. Read it, then read the specific source file for the
thing you're touching — the code is heavily commented and the comments are the
spec.

## Run / build / test

| command | what it does |
|---|---|
| `npm test` | Pure-logic unit tests (`node:test`), mostly `tools/game-logic.test.mjs`. ~209 tests, no DOM. |
| `npm run check:web` | Builds `dist-web/` then **drives the real app headlessly in Chromium** (`tools/check-web.mjs`) asserting layout + behaviour. The integration gate. |
| `npm run verify` | Puzzle geometry invariants: total tiling, no overlaps, anchor-inside-cell. |
| `npm run build:web` | Build the static `dist-web/` site. |
| `npm run seed` | Regenerate generated puzzles deterministically (CI does this). |

**Drive the app yourself** (how nearly every real defect was found): serve
`dist-web/` from a tiny Node http server, open it in the pre-installed Chromium at
`/opt/pw-browsers/chromium` with `playwright-core`, and poke it. `window.__paintblobTest = { board, state: S }`
exposes the live state. Useful URL flags: `?dev` (dev mode — opens all story
stones, unlocks all themes, adds an instant-complete pill), `?notour` (skip the
first-run tour). In a harness, set `S.save.settings.tourSeen = true` /
`avatarTourSeen = true` to stop tours covering the board. Then screenshot and
**look** — many things (does a hint read, does a garment look right) can only be
judged by eye. Scratchpad harnesses are throwaway; keep them out of the repo.

## Architecture / key files

- **`src/game.js`** (~4000 lines) — the orchestrator. Runtime state `S`; boot +
  save; the single **delegated click switch** (every button carries
  `data-act="…"`); puzzle load; the paint path (`tryPaint` → burst animation →
  `commitFill`); panels; and the wiring for story / boss / overtime / swap /
  abilities. Essentially all DOM lives here.
- **`src/render.js`** — the two-layer canvas **Board**: a base layer (painted
  cells) and a live layer (animations). One RAF loop via `ensureFrame()`, gated by
  a `busy` flag so it idles when nothing moves. Cells are `Path2D`; per-cell
  effects (hint flash, Beacon colour-flash, boss locks/pulse) draw on the live
  layer.
- **Pure logic modules** (no DOM → run in node tests): `points.js`, `hints.js`,
  `overtime.js`, `swap.js`, `boss.js`, `abilities.js`, `story.js`, `themes.js`,
  `geometry.js`, `playstats.js`.
- **`src/avatar.js`** (~1500 lines) + **`src/wardrobe.js`** — SVG-string avatar
  generation in the "squirrel idiom" (below). `buildAvatarSVG(customize)`,
  per-slot garment markup fns, and `part()` which applies the render style.
- **`src/house.js`** — the room/pet scene the avatar stands in.
- **`src/platform.js`** (web save/IndexedDB) and **`electron/main.cjs`** (Electron
  save/file + the window) — hold **two `DEFAULT_SAVE` literals that must stay in
  sync.**
- **`src/tour.js`** — the first-run guided-tour engine, reused for story cutscenes
  via a per-step `character` SVG. **`src/letters.js`** — the story characters
  Y / Ee / X drawn as SVG letters.
- **`src/pipeline/`** — the image → puzzle pipeline. **`tools/`** —
  `build-web`, `check-web` (the big integration harness), `make-*-puzzles`,
  `mapify` (photo → puzzle), `tag-animation`, and `game-logic.test.mjs`.

## Idioms that are load-bearing

1. **The squirrel idiom (avatars, house).** Draw with overlapping **flat fills**
   whose joins vanish; shading is translucent **rgba washes carrying their own
   fill** + `stroke="none"`; **one colour token per part** (recolour writes a
   single `fill` on the `<g data-slot>`); **no `<text>`** (CSP is
   `font-src 'self'`); **no colour maths.** A garment authored this way is
   *automatically* rendered in all six styles — classic / inked / soft / gouache /
   anime / neon are a post-process in `part()`, not per-garment code.
   - **Fixed accents = "multicolor":** a `<path>` with its own **solid** fill +
     `stroke="none"` reads as a baked contrast panel in every style while the body
     stays dyeable. Helpers `panel()` / `dot()` / `stripe()` in `avatar.js`.
     (True independently-dyeable panels are NOT built yet — see Pending.)
2. **A save-shape change touches ~4 places:** both `DEFAULT_SAVE` literals
   (`platform.js` + `electron/main.cjs`), a `??=` backfill in `game.js` `boot()`,
   and sometimes the `persist()` write-set. Miss one and returning players don't
   get the key.
3. **Keep logic in pure modules** so tests run in node without a DOM.
4. **Theme = a `data-theme` attribute on `<html>`**; every colour token in
   `styles.css` keys off `[data-theme="…"]`. `applyTheme()` (game.js) is the only
   place it is set.

## Systems (state as of v0.7.41)

- **Story mode** — `story.js` (pure catalogue + gating) + `game.js`. Title screen
  (Continue / Story / Free), a stepping-stone chapter path (`#storyBoard`),
  cutscenes on the tour engine. `S.inStory` is runtime; `S.save.story` persists.
  Chapter One is *The Sampler* / *The Wrong-Colour Day* — the colours went on
  strike (stopped answering to their names); painting re-attaches names. Seven
  stones, the last a boss. Cutscenes are `CHAPTERS[].scenes` (speakers Y/Ee/X via
  `letters.js`), triggered `onEnter` / `afterDone: <stone>` (via `pendingBoardScene`
  on the next board open) / `beforeStone: <stone>`. Beating the boss plays the
  **`epilogue`** scene (`afterDone: 'wrong-colour-day'`) — the chapter lands local
  (this cloth is saved, Ee still short) and the cliffhanger goes world-scale (X was
  one hand; the silence took the rest of the world). Adding a scene is data-only —
  it just adds a `story.seen` key, no save-shape change.
  **Chapter Two** (*Into the Dusk*) begins the ongoing saga. `story.js` is fully
  multi-chapter now: each chapter carries its own `label` / `place` / `spots`
  (board layout) / `theme` / `storyRound`, and `chapterUnlocked` / `chapterTheme`
  gate + skin it. The old `#chapterNext` dead-end is a real **advance door** — a
  "Begin Chapter N" button plus ‹ › chapter arrows in the story bar, both via
  `goToChapter` (which sets `story.chapter`). Act I ships four stones + the
  Hoarder mid-boss (placeholder art from `tools/make-ch2-puzzles.mjs`) under the
  `bloom` theme, **with its cutscenes fully written**; beating the Hoarder flips
  the world to `nightcut` (carved black-and-white) via `chapterTheme`'s act break
  (`theme2` + `actBreak`), and the act-break scene plays over the dark board.
  **The whole saga's shape is in `docs/story-bible.md`** — the marks are
  punctuation (X the cross-out, the Hoarder's parentheses, The Fade's blank, the
  Ellipsis as the patient hand, the Full Stop past it), the character arcs, and
  Act II's prose already written and staged for The Fade. **Keep the bible and
  `story.js` in step.** Speakers are `letters.js` glyphs: Y, Ee, X, and now the
  Hoarder (`( )`); The Fade will need one. The Fade + the *Last Light* story
  round land next.
  **Chapter Two is gated shut until its real art is baked** — the chapter
  carries `released: false`, `game.js` `canEnterChapter` refuses a non-dev player
  (arrows, the Begin-Chapter button, and `goToChapter` all route through it), and
  boot clamps a stray save off it. The board *teases* Chapter Two; the door stays
  closed. **Baking the real art is the release trigger:** that PR flips
  `released` and updates the "chapter two stays locked until its art ships"
  tripwire test in the same diff. Dev mode (`?dev`) ignores the gate so the art
  and Act II stay buildable.
- **Boss fight** — `boss.js` (pure math) + `game.js`. **The picture is the health
  bar** (health = unpainted / total); **no-lose** (drain fades to 0 as you near
  done). Now a **registry of kits** (`BOSS_KITS`): a boss node names a `kit`,
  `startBoss` resolves it via `bossKitFor`, sets the HUD name from it, and the
  tick loop dispatches on `kit.mode`. `attrition` is Chapter One's original fight,
  unchanged (drain + two spells: freeze held colour / freeze a board share; the
  *freeze* is what made it brutal). `hoarder` (Ch2 mid-boss) never drains — it
  always grabs the colour in your HAND (freezes that tub + its cells), interrupting
  rather than attriting, and never your last colour. `fade` (Ch2 chapter boss) is
  declared, wired next. Per-kit cadence/strength lives on the kit, not module
  constants.
- **Abilities** — `abilities.js`. Six: Beacon, Focus, Prism, Explode, Floodgate,
  and (restored) Steady Hand. Pure charge economy, charges refill on level-up.
  `triggerAbility()` (game.js) spends a charge then switches per effect; both
  ability UIs iterate `ABILITIES` generically, so a new entry renders itself.
- **Bonus rounds** — free mode weaves **five** optional rounds through a picture
  (Overtime, Shade Match, Colour Mixer, Drip Catch, Palette Memory); story mode has
  its own single round, The Swap. All are opt-in corner chips that never take the
  canvas unasked. Each is a pure module (`overtime.js` / `shade-match.js` /
  `mixer.js` / `drips.js` / `recall.js`) + Overtime-shaped game.js wiring
  (start→how-to→begin→tick→end→award→close). The free-mode rounds **recur at
  random**: `bonus.js` (pure) sets the rare, jittered cadence and picks the next
  round (never a repeat); game.js drives one shared `#bonusChip` from a `BONUS_ROUNDS`
  registry — add an entry and it schedules itself.
  Winning a round grants a **temporary per-fill perk** (`perks.js`, pure) + a few
  points: for its next N fills, every cell you paint lays down one more — a
  same-colour twin (Overtime), the cell below (Drips), an opposite colour (Shade
  Match), a neighbour (Mixer), or a random forgotten cell (Recall). Held on
  `S.perk = { kind, charges }` (session-only, generalised from the old `S.bogo`),
  spent in `commitFill`, shown in `#perkPill`. Same-colour takes ride the fill's
  undo step; different-colour takes carry their own colour in the step's `extra`
  so undo credits the right tub.
- **Themes** — `themes.js`: `void` (default), `fae`, `cobalt` (unlocked by beating
  the chapter-one boss), `bloom` (Ch2 Act I's bioluminescent jungle; unlocked by
  the Hoarder), `nightcut` (Ch2 Act II's strict black-and-white; unlocked by
  The Fade once it ships) and `patina` (a freely-chosen **dark mode**, no unlock —
  black velvet under hammered copper, rivet-and-seam surfaces, verdigris-green
  edge). `settings.themePinned` (set when the player picks any theme) makes their
  choice win in story too, instead of the chapter theme.
  - **Patina blacks the canvas.** The unpainted picture (paper, blank cells,
    outlines, numbers) is the ONE place CSS reaches the `<canvas>`: render.js
    holds light-mode fallback constants, exposes `--canvas-paper` /
    `--canvas-blank` / `--canvas-blank-edge` / `--canvas-number` /
    `--canvas-number-active` on `:root`, and `Board.syncTheme()` reads them (a 2D
    context can't resolve `var(--…)`). `applyTheme()` calls it and repaints, so
    Patina turns the unpainted space black with a copper wireframe while painted
    cells keep their true photo colour. Every other theme inherits the light
    defaults, so only Patina changes the picture.
- **Fill styles** — `fill-fx.js` + `settings.fill` (a picker in Settings, shown
  even in low-stim since it is a fill *control*). The tap→fill animation is the
  player's choice: `blob` (the classic full-picture explosion, `paint-fx.js`'s
  `Burst`), `burst`/`scribble`/`rise` (quick **in-cell** effects — a `CellFill`
  that duck-types the Burst so it rides the same `S.bursts` frame loop and
  `commitFill` with no special-casing), and `none` (instant, no animation).
  `launch()` (game.js) branches on the style; only the blob fires the suck/fill
  audio cues. Save-shape: `fill` in both `DEFAULT_SAVE` literals + a boot
  backfill. The "Blob speed/density/opacity" sliders tune the blob (speed also
  scales the in-cell fills).
- **Special paints** — `paints.js` (pure catalogue + supply economy + `fxStops`
  animation maths) + `game.js` + `render.js`. Three purchasable, limited-supply
  **wildcards** — `rainbow` / `shimmer` / `multi` (oil-slick) — that OVERRIDE a
  cell's natural colour with an animation that never settles (the finished picture
  keeps moving; **Save image bakes whatever frame it's on**). `S.paint` is the one
  in hand (session-only); `save.paints` is the inventory (id → uses left, a 4th
  save-shape key: both `DEFAULT_SAVE` literals + a `??=` boot backfill); a
  picture's per-cell assignments persist on `progress[id].fx` (cellId → paintId,
  mirrored live in `board.fx`, a `Map`). `applyPaint(cell)` spends one from supply
  and either **fills** an unpainted cell (no points/streak — decoration must never
  become a coin loop) or **re-skins** a painted one; usable **on a finished
  picture** (the tap branch in `tryPaint` runs *before* the finished guard). Fully
  undoable — a paint step is `{ paint: {…} }`, and a finished-picture re-skin stays
  undoable so a stray tap never burns supply. The **paint tray** (`#paintTray`,
  `syncPaintTray`) is a chip row in the **footer, never over the canvas** (the same
  reason Undo/Path moved off the board); the shop is `openPanel('paints')` →
  `renderPaintsShop` (buy a pack via `spendPoints` → `grantPaint`). `render.js`
  draws `board.fx` each frame (`fxFillStyle`, a per-cell golden-ratio phase) and
  `snapshot()` bakes the same stops; the RAF `busy` flag includes `board.fx.size >
  0` so it animates for free.
- **Stickers** — `stickers.js` (pure catalogue + pack economy + `stickerTransform`
  motion maths) + `game.js` + `render.js`. Placeable **emoji** decorations you
  stamp onto a picture — hearts, stars, shapes, numbers, letters, animals, aliens
  — bought in **packs** (a limited supply, like the paints): `save.stickers` is the
  inventory (packId → placements left; a save-shape key in both `DEFAULT_SAVE`
  literals + a `??=` boot backfill + **the persist write-set** — see the persistence
  note below), and each placement spends one, removing a placed sticker refunds it.
  A picture's placed stickers persist on `progress[id].stickers` (array of
  `{k,g,x,y,size,rot,style,motion}`), mirrored live in `board.stickers`. **Decorate
  mode** (`S.stickerMode`, the `🏷` toolbar toggle `#stickerBtn`, gated on owning a
  pack) turns taps into place / select / drag-move (a `stickerDrag` pointer state)
  instead of painting, and a footer **#stickerBar** (`#stickerPalette` +
  `#stickerEditor`, never over the canvas) holds the glyph palette and the selected
  sticker's editor: **size, turn, style (flat / 3D pop), motion (still / bob / spin
  / pulse / 3D flip), remove**. Works on a finished picture (the `handleStickerTap`
  branch in `tryPaint` runs before the finished guard). `render.js` draws
  `board.stickers` each frame (`drawSticker`, emoji via canvas `fillText` — the
  "no `<text>`" rule is SVG-only; letters render as outlined text) and `snapshot()`
  bakes the current frame; `board.stickerAt` hit-tests, `board.stickersAnimate`
  keeps the loop alive. Shop is `openPanel('stickers')` → `renderStickerShop`.
  - **Persistence gotcha (fixed here):** `writeSave` only stores the sections the
    `persist()` write-set hands it, so a shop inventory (`paints`, `stickers`) MUST
    be listed there or a purchase never reaches disk. `save.paints` had been
    omitted (bought paints vanished on reload in v0.7.58); both are in the write-set
    now, with a regression test.
- **Companion (Pip)** — `companion.js` (pure) + `game.js`. An optional
  paint-aproned squirrel who lives on the picture's **border** and chats. He is a
  `#companion` DOM element positioned along the `#stage` frame (NOT zoomed board
  content), `pointer-events:none` so he can **never** block a paint tap. He
  **roams**: sits a spot for `dwellTime()` (~30 min ± jitter), then scampers
  (`.running` hop) to a new border side (`nextSpot` never repeats a side, faces
  center). **Non-canned speech** — bubbles are built from data: `colorName(hex)`
  turns the tapped tub's real hex into a name via **HSL buckets** (near-neutrals →
  earthy browns → `mod + hueWord`, e.g. "dusty rose", "rich teal"), and
  `colorComment` / `playtimeComment` / `ambientComment` / `finishComment` vary the
  wrapper (playtime milestones `PLAY_MILESTONES` fire lines like the 3-hour
  "I feel SO loved… also, water?"). Rate-limited by `COMMENT_GAP_MS`; colour
  compliments are a *chance* per user-picked tub, not every tap. `pipSay` pops
  `#companionBubble` (edge-anchored `bubble-below`/`-right`/`-left` so it never
  clips off-screen). The **apron** is shared: `apronMarkup()` is injected into both
  `companionSVG()` and the intro/tour `squirrelSVG` (`tour.js`). Save-shape:
  `settings.companion` (both `DEFAULT_SAVE` literals + a `??=` boot backfill; it's
  a *setting*, so it rides the settings deep-merge — no write-set entry). Toggle is
  the **"Painting buddy" 🐿️** row in Settings. **Gated OFF** in low-stim and under
  the headless harness (`?notour`/`?nopip`), so `check:web` never sees him.
  **CSS-token gotcha:** `--sq-fur`/`--sq-nose`/`--sq-eye` are declared on `.tour`;
  Pip lives outside `.tour`, so `.companion` **redeclares** them (a warm chestnut)
  or `var()` falls back to black. Test hook: `window.__paintblobTest.pip =
  { roam, say, color }`.
- **Wardrobe / avatar** — 62 garments across 9 slots (shirt, bottoms, dress,
  socks, shoes + outerwear, headwear, eyewear, neckwear); six render styles;
  fixed-accent multicolor. The Outfits shop groups by slot.
- **Dev mode** — `?dev` or type `devmode`; session-only (`S.dev`). A dev-only 🛠
  toolbar button (`#devMenuBtn`, gated in `syncDevPill`) opens the **Developer
  menu** (`renderDevPanel` via `openPanel('dev')`): launch any minigame on demand
  for testing — built straight off the `BONUS_ROUNDS` registry (+ The Swap), so a
  new round appears there for free — plus the instant-complete.
- **Save & backup** — every finished picture has a **Save image** button (on the
  finish card, and a bottom-right save pill so re-opened finished pictures get it
  too) that exports the flat painted mosaic as a PNG via `Board.snapshot()`.
  Settings has **Download backup** (the whole `S.save` as JSON) and **Restore
  from backup**; restore REPLACES the save wholesale (`api.replaceSave`, a true
  overwrite that bypasses `writeSave`'s per-section merge) then reloads.
  Cross-platform through the `api`: web downloads in-page (blob) and picks a file
  with an `<input>`; the **desktop build owns no file dialogs** (they crash a
  transparent window on Windows — see `DIALOG_FREE`), so saves go to the
  Downloads folder via the `file:save-download` IPC and **restore is by dropping
  the `.json` on the window** (the drop handler routes a backup to
  `restoreFromFile` before the image-import path). The destructive restore
  confirms with an in-page modal (`#confirm` / `confirmModal`), never a native
  dialog.
- **What's New splash** — `news.js` (pure catalogue + seen-gating) + `game.js`.
  A digestible list of updates **starting with low-stim mode**; each `NEWS` entry
  is `{ rev, icon, title, blurb }` in display order. `settings.newsSeen` holds the
  highest `rev` read (a save-shape key: both `DEFAULT_SAVE` literals + a `??=`
  boot backfill), so **adding a higher-rev entry is all it takes to resurface the
  splash** — no other bookkeeping. The `#news` overlay is a **top-level sibling of
  the title** (z-index 47, above the title's 46) so it shows over the launch
  screen; `renderNews`/`openNews`/`closeNews` + `maybeShowNews` drive it.
  `maybeShowNews` (end of `boot()`) auto-shows it once for a **returning** player
  with unread news — gated off for the headless harnesses (`?notour`, plus an
  explicit `?nonews`), silenced in low-stim (the title link still offers it), and
  it **catches a brand-new player up silently** (no splash for a game they just
  met). Reachable any time from a badged title-screen link and a Settings row
  (both `data-act="news"` / `openNews`). Adding an entry is data-only.

## Release & branch workflow — READ THIS

- Development branch: **`claude/avatar-rpg-story-mode-0biusc`**. **Once its PR is
  merged to `main`, that PR is finished.** For the next change, reset the branch
  onto the released main and start clean:
  `git fetch origin main && git checkout -B claude/avatar-rpg-story-mode-0biusc origin/main`,
  commit, push, open a **new** PR. Never stack new commits on already-merged
  history.
- **Cut a release** by dispatching `.github/workflows/weekly-release.yml`
  (`workflow_dispatch`, `ref: main`). It runs `npm version patch` (bumps + tags
  `vX.Y.Z`), pushes, then dispatches `release.yml` to build & publish the
  installers for that tag — macOS `.dmg`/`.zip`, Windows `.exe`, Linux
  `.AppImage`/`.tar.gz`, plus a `paintblob-web-*.zip`. ~5 minutes. **A release
  only ships what is on `main`, so land the branch first.**
- Weekly automation: `weekly-mystery.yml` bakes new pictures, `weekly-animate.yml`
  tags one animated element per picture (see `docs/handing-off-to-an-agent.md` +
  `docs/animating-pictures.md`), `weekly-release.yml` cuts the week's version.
- This session (branch `avatar-rpg-story-mode`) shipped, in order: story mode +
  boss + abilities overhaul + themes (through v0.7.37), the **wardrobe drop +
  dev mode** (v0.7.38), two rounds of **boss balancing** (v0.7.39, v0.7.40), and
  **theme-in-story + a 60s flash-and-grow hint + Steady Hand + a Story⇄Free swap
  button** (v0.7.41).

## Pending / good-to-know

- **Animated export (later drop)** — Save image currently bakes a **static** PNG
  of the current animation frame (special paints + animated stickers). A GIF /
  short-video export that captures the motion is a deliberate later drop.
- **Sticker follow-ups (good-to-know)** — v1 ships emoji stickers with move /
  resize / rotate / style / motion + delete. Undo (Ctrl+Z) does not remove the
  last-placed sticker yet — removal is the editor's Remove button (which refunds
  the placement). Rotation is ignored by the hit-test (an axis-aligned box), and
  true independently-coloured/custom-art stickers are not built. All easy adds.
- **True two-tone dyeable garments** (independently recolourable panels) is the
  planned fast-follow to fixed accents: port the Room's per-part colour model
  (`house.colours` + a sub-part selection) onto the avatar — save shape, `part()`,
  and the recolor UI.
- **Pants reskins** (cargos / leggings / slacks / sweatpants) read subtly at
  avatar scale; easy to punch up.
- The boss-freeze ✕ marks can *look* like they sit on painted cells — that's the
  big ✕ arms bleeding into neighbours; the freeze only ever locks *unfilled*
  cells (verified).
- Story art: all seven stones now ship **real** LaChapelle-style art, mapped from
  Flux renders via `npm run mapify --id <id>` (prompts + bake commands in
  `docs/story-art-prompts.md`). A story node names an id, not an image, so a
  re-bake (same id) touches no story code. The Story board sits over the Sampler
  cloth backdrop (`src/story-sampler.jpg`, laid in by `.story-board`).
  `tools/make-story-puzzles.mjs` is kept only as the placeholder/re-bake fallback.
- Verify anything visual by driving Chromium and screenshotting — the unit tests
  cannot see "the wrong thing rendered".
