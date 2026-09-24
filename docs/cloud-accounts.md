# Cloud accounts, save sync and DLC delivery

Status: **design only, nothing built**. A plan for a small Railway-hosted
backend that gives PWA players an account, a cloud copy of their save, and a
way to receive puzzle / story / cosmetic packs. Written so the work can be
picked up in a later session without re-deriving it.

Decisions taken so far are marked **decided**; anything still open is marked
**open** and listed again at the end.

## Goals and non-goals

- Players on the PWA can sign in, and their save follows them across devices.
- The cloud copy is a real backup: several revisions are kept, and a bad
  upload never destroys the last good one.
- Packs (puzzle packs, story packs, cosmetic packs) can be granted to a
  specific account and only that account receives them.
- The game keeps working fully offline and fully signed-out. Cloud is opt-in
  and layered on top; a dead server costs nobody their progress.
- Not a goal yet: payments. Charging waits for the Steam migration. The data
  model is shaped so Steam ownership can be mirrored in later without a
  redesign.

## Shape

Two pieces:

1. **`paintblob-cloud`**, a separate repository (**decided**): Node + Express
   + PostgreSQL, deployed as one Railway service with the Railway Postgres
   plugin.
2. **Client changes in this repository**: a new `src/cloud.js`, an Account
   section in Settings, and a few hooks into the existing save path.

## Sign-in

- **Decided:** a separate repo; cost of Railway is not a constraint.
- **Decided:** both sign-in methods.
  - *Email magic link* is the baseline: works for anyone with an email
    address (no password, no third-party account). Needs an email-sending
    service account (**open:** which provider).
  - *Sign in with Google* sits beside it as the one-tap option. Requires the
    player to have a Google account; nearly universal on Android.
- Sessions are bearer tokens held in the PWA's existing IndexedDB `kv` store,
  not cookies. Cross-origin cookies from an installed PWA are unreliable,
  especially on iOS.

## API

```
POST   /auth/google             Google ID token -> paintblob session token
POST   /auth/magic/request      body { email }  -> sends a one-time link
POST   /auth/magic/verify       body { code }   -> session token
POST   /auth/logout

GET    /me                      { id, displayName, entitlements, saveRevision }
GET    /me/export               account row + latest save JSON (GDPR Art. 20)
DELETE /me                      erase account, sessions, saves, entitlements (GDPR Art. 17)

GET    /save                    latest save JSON + { revision, updatedAt }
PUT    /save                    body { baseRevision, save } -> { revision } | 409 conflict
GET    /save/history            last N revisions (revision + timestamp only)
POST   /save/restore/:rev       make an older revision the latest

GET    /content/manifest        packs this account is entitled to
GET    /content/puzzle/:id      puzzle JSON; 403 when not entitled

POST   /admin/grant             owner-only (ADMIN_KEY env var): give user X pack Y
```

### Why a revision number on saves

Players will have a phone and a laptop. Without a revision, the last device
to write silently wins and someone loses an afternoon. The client sends the
revision it last synced from; if the server has moved on it answers 409 and
the client asks the player which copy to keep, using the same in-page
`confirmModal` the backup restore already uses.

### Why save history

A cloud backup that holds one copy is not a backup. Keeping the last ~10
revisions per account (jsonb rows, a few hundred KB each) turns it into a
safety net and makes "roll back to yesterday" a one-line call.

## Storage

Three kinds of data, three homes. Postgres only where rows and transactions
are the point.

### PostgreSQL: account tables

```
users         id, email, google_sub (nullable), display_name, created_at
sessions      token_hash, user_id, expires_at
magic_codes   code_hash, email, expires_at, used_at
entitlements  user_id, pack_id, source, granted_at     source: 'grant' | 'steam' | 'stripe'
packs         id, kind ('puzzle' | 'story' | 'cosmetic'), title, puzzle_ids
saves         user_id, revision, body bytea, created_at  (prune to last N per user)
```

`entitlements.source` is the Steam hedge: when Steam becomes the store, its
ownership records are mirrored into this table with `source: 'steam'` and
nothing else on the server or client changes.

`packs` is a catalogue only. Pack content is not stored in the database.

### Save bodies: an opaque blob behind a seam

The save is never translated into rows. The client gzips the whole save JSON
and uploads it; the server stores the bytes as-is and hands them back as-is.
All reads and writes go through one module, `saveStore` (`put / get / list /
prune`), backed by the `saves` table on day one. Blob-in-database is the
first thing to outgrow, so when that day comes the bodies move to object
storage and the row keeps a pointer; the change touches one file.

### Pack content: static files

A bundled puzzle is about 900 KB of JSON (up to 2 MB), which is a file, not
a row. Puzzle packs live as files in the `paintblob-cloud` repo
(`packs/<pack-id>/<puzzle-id>.json`), baked by the same `mapify` tooling as
the bundled pictures and version-controlled with the server. The API serves a
file only after checking the caller's entitlement. If packs ever become
numerous they move to object storage; the route does not change. Story and
cosmetic packs ship inside the game build and are only flagged on the server.

### Backing up the database

The database *is* the players' backup, so it needs one of its own. A second
live database that mirrors the first (a replica) only covers the server
dying; a bug that deletes rows is copied to the replica within a second. A
real backup is a snapshot frozen in time and kept somewhere else: a nightly
`pg_dump` to S3-compatible object storage (Backblaze B2 or Cloudflare R2,
both cheap), retained for ~30 days. Whether Railway's Postgres includes
automatic backups on the chosen plan is to be verified against their current
docs before relying on it. This is a launch requirement, not a nice-to-have:
nobody is told "your progress is safe in the cloud" until it exists.

Deliberately not added: Redis, a queue, or a second database. At this scale
they are complexity with no payoff.

## Client changes in this repository

| where | change |
|---|---|
| `src/index.html` CSP | `connect-src 'self'` blocks every call to the API. Add the API origin (or host the game on the same origin, see Hosting). First wall that will be hit. |
| `src/cloud.js` (new) | `login*()`, `pushSave(save, rev)`, `pullSave()`, `manifest()`, `fetchPack(id)`. Token in IndexedDB `kv`. |
| `game.js` `persist()` | After the local `writeSave`, if signed in, debounce a `pushSave` (about 10 s after the last paint, plus on `visibilitychange` to hidden). Local write stays first and unconditional. |
| `game.js` `boot()` | If signed in, `pullSave()`; if the cloud revision is newer, offer to apply it through the existing `api.replaceSave` + reload path. |
| `DEFAULT_SAVE` x2 + boot `??=` | One new key: `cloud: { revision: 0 }`. The usual save-shape rule: both `platform.js` and `electron/main.cjs` literals, plus the boot backfill. |
| Settings panel | Account section: sign in / signed in as X / sync now / download my data / sign out / delete account. |
| Pack unlock | Story and cosmetic packs: code and art ship in the build, gated on `entitlements`. Puzzle packs: fetched from `/content/puzzle/:id` and stored through the existing `savePuzzle` IndexedDB path so they play offline afterwards. |

## Hosting the game (decided)

The PWA lives at **https://paintblob.netlify.app/**. That origin goes in
three places: the game's CSP `connect-src` gains the API origin, the server's
CORS allow-list names `https://paintblob.netlify.app`, and the Google OAuth
client lists it as an authorised JavaScript origin.

## Legal and privacy (do before real accounts exist)

- Holding emails means holding personal data. A plain-language privacy policy
  page is needed.
- **Children.** paintblob reads as kid-friendly. In the US, COPPA applies to
  accounts for children under 13. FTC business guidance:
  https://www.ftc.gov/business-guidance/privacy-security/childrens-privacy
  The common small-developer approach is a 13+ gate on sign-in.
- **EU players (GDPR).** Regulation (EU) 2016/679, official text:
  https://eur-lex.europa.eu/eli/reg/2016/679/oj
  - Article 17, erasure: `DELETE /me`.
  - Article 20, portability: `GET /me/export`. The existing "Download backup"
    JSON is already the right shape for this.
- None of the above is legal advice. Before charging money, a short review by
  someone who does privacy law for small games is worth it, with the under-13
  question the sharpest edge.

## Accounts and services to set up (owner tasks)

1. Railway: project, service, Postgres plugin, `DATABASE_URL`, `ADMIN_KEY`,
   `SESSION_SECRET` env vars.
2. Google Cloud: an OAuth client ID (web application type) with
   `https://paintblob.netlify.app` as an authorised JavaScript origin.
3. An email-sending service account and its API key, for magic links.
4. An S3-compatible object-storage bucket for nightly database dumps.

## Phasing

1. **Server skeleton + save sync.** Auth, `/save*`, `/me`, `/me/export`,
   `DELETE /me`, tests. Roughly a full session.
2. **Client account UI + sync.** `cloud.js`, Settings section, `persist()` and
   `boot()` hooks, CSP, save-shape key, regression test for the write-set.
3. **DLC manifest.** `packs`, `entitlements`, `/content/*`, `/admin/grant`,
   client gating and puzzle-pack fetch.

Each phase is its own PR and is reviewed and approved before it is pushed.

## Open decisions

- Email provider for magic links.
- Object-storage provider for database dumps.
- Session length (proposed: 90 days, refreshed on use).
- A 13+ checkbox on sign-in (recommended as the simplest COPPA posture).
