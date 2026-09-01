# Weekly mystery picture queue

Drop source photos here ahead of time — PNG or JPEG only (the same formats
`tools/mapify.mjs` accepts; this queue is read by a Node script, not a
browser, so WebP/GIF/AVIF/HEIC aren't decodable here even though the app
itself can import them).

Every week, `.github/workflows/weekly-mystery.yml` runs
`tools/bake-weekly-mystery.mjs`, which:

- takes the next 5 **themed** images from this folder in filename order,
- builds each one into a real puzzle and bakes it straight into
  `puzzles/*.json` + `puzzles/manifest.json` with `blind: true` — the same
  way the app's 4 built-in demo pictures ship,
- removes those 5 files from this folder,
- and cuts a new app version so the pictures are just *there* — in the
  Pictures list, hidden as "Mystery picture" until solved — the moment
  someone is on that version. No download, no drag-and-drop.

## Give every image a theme (required)

The Pictures list filters by theme, and mysteries are filterable too (the
theme shows; the title and thumbnail stay hidden until solved). So the bake
**will not touch an image that has no theme** — it leaves it in the queue and,
if that leaves fewer than five usable, the weekly run fails loudly rather than
shipping a themeless mystery.

Add an entry for each image to `puzzles/queue/tags.json`, keyed by the
picture's id — the filename with its date prefix and extension stripped, then
slugified:

```json
{
  "koi-in-the-rain": { "themes": ["Animals", "Water"] },
  "sunset-over-the-bay": { "themes": ["Landscape", "Water"], "difficulty": "detailed" }
}
```

- `themes` — 1–3 labels. The common ones are **Abstract, Animals, Fantasy,
  Flowers, Food, Landscape, Space, Spooky, Water**, but any label works and
  grows its own filter category (e.g. `Trees`) with no code change. Spelling is
  normalised (trimmed, Title-Cased), so a stray `trees` can't make a second
  category next to `Trees`.
- `difficulty` — optional, one of `chunky | normal | detailed | insane`
  (defaults to `normal`).

On bake the entry is copied into `puzzles/tags.json` (the source of truth the
manifest is synced from) under the picture's final id and removed from here.
Preview what the next run will pick — and check nothing is being skipped for a
missing theme — with `node tools/bake-weekly-mystery.mjs --dry-run`.

Name files so alphabetical order matches the order you want them released,
e.g. a date prefix:

```
puzzles/queue/2026-08-24-sunset-over-the-bay.jpg
puzzles/queue/2026-08-24-koi-in-the-rain.jpg
```

The date prefix (and extension) is stripped before it becomes the picture's
id/title — `tools/bake-weekly-mystery.mjs` only uses it to pick release
order, never as part of what a player eventually sees. Keep at least 5
usable images queued at all times so the weekly run never comes up short.

This repo is public, so anything committed here is visible before release —
don't queue something you want to stay a surprise from anyone who might
browse the repo itself, only from players.

Note: because pictures ship baked into the app, a new build/reinstall (or,
for the web version, a Netlify redeploy) is still required for players to
actually get each week's additions — there's no live/instant delivery
without an app update.
