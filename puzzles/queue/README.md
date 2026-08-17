# Weekly mystery pack queue

Drop source photos here ahead of time — PNG or JPEG only (the same formats
`tools/mapify.mjs` accepts; this queue is read by a Node script, not a
browser, so WebP/GIF/AVIF/HEIC aren't decodable here even though the app
itself can import them).

Every week, `.github/workflows/weekly-mystery.yml` runs
`tools/pack-weekly-mystery.mjs`, which:

- takes the next 5 images from this folder in filename order,
- zips them into a "mystery pack" and publishes it as a GitHub Release asset,
- and removes those 5 files from this folder.

Name files so alphabetical order matches the order you want them released,
e.g. a date prefix:

```
puzzles/queue/2026-08-24-sunset-over-the-bay.jpg
puzzles/queue/2026-08-24-koi-in-the-rain.jpg
```

The filename (date prefix included) is never shown to players — the zip is
exactly what a player could otherwise build by hand and drag onto the app,
so every image inside it comes in as a **mystery picture**: hidden until
solved. Keep at least 5 usable images queued at all times so the weekly run
never comes up short.

This repo is public, so anything committed here is visible before release —
don't queue something you want to stay a surprise from anyone who might
browse the repo itself, only from players.
