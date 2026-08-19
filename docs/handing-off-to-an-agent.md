# Handing the weekly animation off to an agent

Everything you need to give GPT/Codex (or any other coding agent) to do the
weekly picture-animation job without you.

There are three parts:

- **Part A** — one-time setup. Do this once.
- **Part B** — the prompt. Paste this every Monday, or wire it in once.
- **Part C** — how to tell whether it did the job properly.

The agent-facing instructions themselves live in
[`animating-pictures.md`](animating-pictures.md). **Do not paste that file's
contents into the prompt** — point the agent at the path and let it read the
version in the repo, so the instructions can never drift from the tools they
describe.

---

## Part A — one-time setup

### A1. What the agent needs access to

| | why |
|---|---|
| the repo, with push rights to `main` | it commits tags |
| Node 22 + `npm ci` | the tools |
| Chromium via `npx playwright-core install chromium` | the tagging tool renders the real app headlessly |
| **the ability to view PNG images** | non-negotiable — see below |

**The vision requirement is the one that actually matters.** Choosing which
element of a picture should move is a judgement made by *looking at the
picture*. An agent that cannot open a PNG cannot do this job at all — it will
either refuse (good) or invent cell ids from JSON coordinates (bad, and
nothing will catch it, because "the wrong thing is moving" is not something a
test can detect).

If you are using a text-only agent or runner, stop here and do the looking
yourself; the rest of the workflow still saves you the fiddly parts.

### A2. Two ways to run it

**Option 1 — automatic, inside GitHub Actions.** Set a repository variable
named `TAG_AGENT_COMMAND` (Settings → Secrets and variables → Actions →
Variables) to whatever command launches your agent non-interactively. The
`weekly-animate` workflow runs it at 14:00 UTC every Monday with the maps
already rendered under `puzzles/_raw/tag/<id>/`, then runs the full test suite
before committing anything.

Your command should pass the agent the prompt in Part B. It also gets
`$UNTAGGED_IDS` in the environment — the ids needing tags, one per line.

**Option 2 — by hand.** Every Monday between 13:00 and 20:00 UTC, open your
agent on a fresh clone and paste Part B. If you skip a week, nothing breaks —
the pictures animate in the following week's release.

Leave `TAG_AGENT_COMMAND` unset and the workflow files a tracking issue with
the maps attached instead, which you (or an agent) can pick up whenever.

### A3. Know the timing

| UTC Monday | what happens |
|---|---|
| 13:00 | 5 queued photos are baked into puzzles and committed |
| 14:00 | maps rendered, agent runs (or the issue is filed) |
| 20:00 | version bumped, tag pushed, installers published |

The agent **cannot** run before 13:00 — a picture's cell ids do not exist
until it has been baked, and a tag is a list of cell ids. It **should** run
before 20:00, or that week's pictures ship unanimated and only come alive the
following Monday.

---

## Part B — the prompt

Paste this verbatim. It is deliberately short: the detail lives in the repo,
where it stays in sync with the tools.

```
You are tagging this week's new pictures in the paintblob repo so that one
element of each comes alive when a player views the photo.

FIRST: read docs/animating-pictures.md in full. It is the authority on this
task. Follow it exactly. Everything below is a summary of it, not a
replacement for it.

Setup:
  git pull
  npm ci
  npx playwright-core install chromium

Then, for each picture listed by `node tools/untagged-pictures.mjs --ids`:

  1. Run `node tools/tag-animation.mjs <id>` and OPEN AND LOOK AT the
     resulting puzzles/_raw/tag/<id>/map-photo.png.
  2. Decide which SINGLE element of that picture should move, and which of
     the five effects (ripple, glow, shimmer, breathe, twinkle) matches what
     that thing does in real life. Water ripples. Auroras shimmer. Lanterns
     glow. Section 4 of the doc has the full guidance.
  3. Select it with --box and/or --colour (they intersect). Run without
     --set, LOOK at the map again, and check the cyan highlight is exactly
     that element and nothing else. Repeat until it is. This loop is the
     actual work.
  4. Commit it with --set <effect>, then OPEN AND LOOK AT the frames in
     puzzles/_raw/tag/<id>/frames/ and verify all four checks in section 7
     of the doc.
  5. `npm run seed && npm test && npm run verify` — all must pass.

Then commit puzzles/animations.json and the changed puzzles/*.json, and push.

HARD RULES:
- You must actually view the images. If you cannot view PNG files, STOP and
  say so. Do not infer cell ids from JSON coordinates.
- ONE element per picture. Not two.
- Never hand-edit puzzles/<id>.json. Use the tool.
- Never edit src/render.js, src/game.js, or tools/mapify.mjs. If you think
  you need to, you have misread the task — stop and say so.
- Tagging nothing is a valid, expected outcome. If a picture has nothing
  that obviously wants to move, leave it untagged and say which ones you
  skipped and why. A forced arbitrary tag is worse than none.
- If the tool prints "WARNING: the window did not close itself", or you see
  tearing or gaps at an element's edge in the frames, STOP and report it.
  Do not attempt to fix the renderer.
- Do not cut a release, bump the version, or push a tag. Ever.

Report back: which pictures you tagged, which element and effect you chose
for each and why, and which you deliberately left untagged.
```

---

## Part C — checking its work

You do not need to re-do the judgement, but these catch a lazy or confused
agent in about a minute.

**1. Did it actually look?** Its report should name a concrete thing per
picture — "the lantern above the door", "the surf along the left edge". Vague
answers ("the main subject", "the focal area") mean it guessed. Cross-check
one against the picture.

**2. Does the effect match the thing?** An aurora that `breathe`s or a
sleeping cat that `twinkle`s is a tell that it picked from the list at
random rather than from what the object does.

**3. Did it tag everything?** It should not have. Six pictures baked does not
mean six tags. If it tagged all of them and gave a thin reason for one or
two, it was filling in blanks. Ask it which it considered skipping.

**4. Look at one yourself.**

```bash
node tools/tag-animation.mjs <id>       # re-renders the frames from the tag
```

Open `puzzles/_raw/tag/<id>/frames/02000ms.png` and `after.png`. The motion
should be obvious, confined to the element, and `after.png` should look like
an ordinary still photograph.

**5. The tests would already have caught** a bad cell id, an unknown effect
name, an id that is not a real picture, or a puzzle file out of sync with the
sidecar. Those are the mechanical failures. What tests cannot catch is the
wrong element moving — which is why steps 1–4 are yours.

**To undo anything:**

```bash
node tools/tag-animation.mjs <id> --clear
```

---

## If you would rather do it yourself

The whole job is four commands and one judgement call, and takes a couple of
minutes per picture:

```bash
node tools/untagged-pictures.mjs                       # what needs doing
node tools/tag-animation.mjs <id> --palette            # map it, list the tubs
node tools/tag-animation.mjs <id> --box 30,40,700,350 --colour 2,8,9
node tools/tag-animation.mjs <id> --box ... --colour ... --set shimmer
```

Look at `map-photo.png` between steps two and three, and at `frames/` after
step four. That is the entire loop.
