# Weekly mystery picture queue

Drop source photos here ahead of time — PNG or JPEG only (the same formats
`tools/mapify.mjs` accepts; this queue is read by a Node script, not a
browser, so WebP/GIF/AVIF/HEIC aren't decodable here even though the app
itself can import them).

Every week, `.github/workflows/weekly-mystery.yml` runs
`tools/bake-weekly-mystery.mjs`, which:

- takes the next 5 images from this folder in filename order,
- builds each one into a real puzzle and bakes it straight into
  `puzzles/*.json` + `puzzles/manifest.json` with `blind: true` — the same
  way the app's 4 built-in demo pictures ship,
- removes those 5 files from this folder,
- and cuts a new app version so the pictures are just *there* — in the
  Pictures list, hidden as "Mystery picture" until solved — the moment
  someone is on that version. No download, no drag-and-drop.

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
