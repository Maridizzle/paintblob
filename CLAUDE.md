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
  the Hoarder) and `nightcut` (Ch2 Act II's strict black-and-white; unlocked by
  The Fade once it ships). `settings.themePinned` (set when the player picks any
  theme) makes their choice win in story too, instead of the chapter theme.
- **Wardrobe / avatar** — 62 garments across 9 slots (shirt, bottoms, dress,
  socks, shoes + outerwear, headwear, eyewear, neckwear); six render styles;
  fixed-accent multicolor. The Outfits shop groups by slot.
- **Dev mode** — `?dev` or type `devmode`; session-only (`S.dev`).

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
