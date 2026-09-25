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
    address (no password, no third-party account). Sent through **Postmark**
    (**decided**), chosen for transactional-only deliverability and
    configurable message retention, which is set as short as Postmark allows
    so their logs hold magic links and player addresses for days, not months.
  - *Sign in with Google* sits beside it as the one-tap option. Requires the
    player to have a Google account; nearly universal on Android. The OAuth
    client (web application type, origin `https://paintblob.netlify.app`) is
    created; its client ID is a public value that goes into the Railway env
    (`GOOGLE_CLIENT_ID`) and into `src/cloud.js`.
- Magic-link codes: hashed at rest, single use, ~10 minute expiry, rate
  limited per email address and per IP; the message body carries the link
  and nothing personal.
- **Sessions last 90 days, refreshed on use** (**decided**). Bearer tokens
  held in the PWA's existing IndexedDB `kv` store, not cookies. Cross-origin
  cookies from an installed PWA are unreliable, especially on iOS.
- **A 13+ checkbox on sign-in** (**decided**): "I am 13 or older", required
  before either sign-in method proceeds. Recorded on the user row as
  `age_gate_at` so it is provable later.

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
POST   /redeem                  body { code } -> grants the code's pack to the caller

POST   /admin/grant             owner-only (ADMIN_KEY env var): give user X pack Y
POST   /admin/codes             owner-only: mint N redeem codes for pack Y
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
users         id, email, google_sub (nullable), display_name, age_gate_at, created_at
sessions      token_hash, user_id, expires_at
magic_codes   code_hash, email, expires_at, used_at
entitlements  user_id, pack_id, source, granted_at     source: 'grant' | 'code' | 'steam' | 'stripe'
packs         id, kind ('puzzle' | 'story' | 'cosmetic'), title, puzzle_ids
codes         code_hash, pack_id, created_at, redeemed_by (nullable), redeemed_at
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
`pg_dump` to **Backblaze B2** (**decided**), retained for ~30 days.

- The dump is **encrypted on the Railway side before upload** (`age`), with
  a key only the owner holds; B2 stores ciphertext only. The bucket is
  private.
- The Railway job uses a B2 application key restricted to that one bucket
  and to write capability only (no read, no delete), so a compromised server
  cannot read or destroy past backups. Object Lock on the bucket so a dump
  cannot be deleted before its retention window ends, not even by the owner
  key.
- Whether Railway's Postgres includes automatic backups on the chosen plan is
  to be verified against their current docs; it is a bonus, not the plan.

This is a launch requirement, not a nice-to-have: nobody is told "your
progress is safe in the cloud" until it exists.

Deliberately not added: Redis, a queue, or a second database. At this scale
they are complexity with no payoff.

## Client changes in this repository (phase 2, built)

The API is live at `https://paintblob-cloud-production.up.railway.app`.

| where | change |
|---|---|
| `src/index.html` CSP | `connect-src` gains the API origin. `script-src` stays `'self'`: Google sign-in is a top-level redirect, which CSP does not govern. |
| `src/cloud.js` (new) | Pure helpers (`syncPlan`, magic/Google URL parsing, gzip) and `createCloud()`: `auth.*`, `me`, `sessions`, `pull`, `push`, export, delete. Token in the IndexedDB `kv` store (`platform.js` `kvGet/kvSet/kvDel`, web only). `GOOGLE_CLIENT_ID` constant; empty hides the Google button. |
| `game.js` `persist()` | Every flush sets `save.cloud.dirty = true` in the same write, then (signed in) debounces an upload 10 s; `visibilitychange` → hidden flushes a pending one. Local write stays first and unconditional. |
| `game.js` `boot()` | `cloudBoot()` runs right after `readSave`, before anything reads the save: handles the Google return hash and `?magic=`, then `syncPlan`. `pull` replaces the save in place (no reload); `conflict` waits for `hideTitle()` and asks with **Keep this device** as OK and "use the cloud copy" only via Settings. |
| `DEFAULT_SAVE` x2 + boot `??=` | `cloud: { revision: 0, syncedAt: null, dirty: false }`; also in the `persist()` write-set. |
| Settings › Account | `renderAccount()`: 13+ switch gating both methods, Continue with Google (redirect), email → 6-digit code, signed-in status + Sync now, conflict buttons, devices list (revoke one / all others), Download my data, Sign out, Delete cloud account, Privacy link. |
| `src/privacy.html` | Plain-language privacy page, opened from the Account section; ships and is precached. Two publish-time placeholders: the date and the support address. |
| Pack unlock (phase 3) | Story and cosmetic packs: code and art ship in the build, gated on `entitlements`. Puzzle packs: fetched from `/content/puzzle/:id` and stored through the existing `savePuzzle` IndexedDB path so they play offline afterwards. |

**"Dirty" is derived, not just stored:** `cloudLocalDirty()` is the flag OR
(revision 0 AND the save has any painted picture). A player who updates into
this build and signs into an account that already has a cloud copy therefore
gets the conflict question, never a silent replacement of months of local
progress. Signing in from Settings runs the same plan: an empty device takes
the cloud copy, a device with progress and an empty account uploads, both
with progress asks.

**Known small noise:** boot bookkeeping (day streak) persists once per open,
so a signed-in device uploads one small copy ~10 s after every launch. If the
app is killed inside that window, the next launch on that device may see a
low-stakes conflict (a streak counter). Acceptable; a later refinement can
hash `progress` alone.

## Hosting the game (decided)

The PWA lives at **https://paintblob.netlify.app/**. That origin goes in
three places: the game's CSP `connect-src` gains the API origin, the server's
CORS allow-list names `https://paintblob.netlify.app`, and the Google OAuth
client lists it as an authorised JavaScript origin.

## Delivering a pack to one player

Granting, from the owner's side, two ways:

1. **Direct grant.** `POST /admin/grant` with the admin key, naming the
   player's email and the pack. Writes an `entitlements` row.
2. **Redeem code.** `POST /admin/codes` mints codes tied to a pack. The owner
   hands a code to a player by any channel; the player types it into a
   **Redeem code** box in Settings; `POST /redeem` marks it used and writes the
   same `entitlements` row with `source: 'code'`. The owner never needs the
   player's account id or sign-in method. Codes are stored hashed, single-use.

Receiving, on the player's side: on sign-in and on each start while signed
in, the game calls `/content/manifest`. Then by pack kind:

- **Cosmetic and story packs** already shipped dormant inside the game build;
  the manifest flag switches them on (garments appear in the Outfits shop, a
  chapter door opens). No download.
- **Puzzle packs** are fetched one puzzle at a time from
  `/content/puzzle/:id` (entitlement checked per request) and stored through
  the existing `savePuzzle` path into the IndexedDB `puzzles` store, beside
  imported photos. After that they play offline and appear in the picker.

A second device signs in, reads the same manifest, and re-downloads. When
Steam arrives, Steam ownership is mirrored into `entitlements` with
`source: 'steam'` and this flow is unchanged; codes stay useful for gifts,
press keys and make-goods.

## Rollout with live players

The game has real players at paintblob.netlify.app, so adding cloud sync must
be unable to hurt anyone who ignores it:

- The local save stays the source of truth. Cloud is opt-in per player; a
  signed-out game behaves exactly as today.
- The "cloud copy is newer, apply it?" prompt defaults to **keep this
  device**. Applying the cloud copy goes through the existing
  `confirmModal` + `api.replaceSave` + reload path, never silently.
- A failed or unreachable API is silent to the player (a small status in
  Settings at most), never a blocking error over the board.
- The CSP `connect-src` change and the Account section are tested on a
  Netlify deploy preview before they reach the production URL.
- The Google consent screen stays in Testing (owner's accounts only) until
  the Account section ships, and is published the same day it does.
- The privacy page and the 13+ decision are done before phase 2 goes live,
  not after.

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

1. Railway: project + Postgres (done). Service deploys from
   `Maridizzle/paintblob-cloud`. Env vars: `DATABASE_URL` (injected),
   `ADMIN_KEY`, `SESSION_SECRET`, `GOOGLE_CLIENT_ID`, `POSTMARK_TOKEN`,
   `MAIL_FROM`, `B2_KEY_ID`, `B2_APP_KEY`, `B2_BUCKET`, `BACKUP_AGE_PUBKEY`.
2. Google Cloud: OAuth client ID (done).
3. **A domain**, registered as Maridizzle through a registrar with WHOIS
   privacy included. Needed by Postmark (sending from a shared domain is
   dev-only) and where the owner's anonymity lives.
4. Postmark: account, a verified sender domain (DKIM + return-path DNS
   records on the domain above), a server token, and message retention set
   to the minimum offered.
5. Backblaze B2: account, one private bucket with Object Lock, an
   application key restricted to that bucket with write-only capability. The
   `age` keypair for dump encryption: public key into Railway env, private
   key kept offline by the owner and never in any repo or service.

## Phasing

1. **Server skeleton + save sync.** Done: `Maridizzle/paintblob-cloud`,
   deployed on Railway.
2. **Client account UI + sync.** Built in this repo (see above). Before it
   goes live: paste the Google client ID into `GOOGLE_CLIENT_ID`, add
   `https://paintblob.netlify.app/` as an authorised redirect URI on the
   Google client, fill the two placeholders in `privacy.html`, replace the
   `POSTMARK_TOKEN` / `MAIL_FROM` placeholders on Railway once the domain
   exists, publish the Google consent screen the same day.
3. **DLC manifest.** `packs`, `entitlements`, `codes`, `/content/*`,
   `/redeem`, `/admin/grant`, `/admin/codes`, client gating, the Redeem code
   box, and puzzle-pack fetch.

Each phase is its own PR and is reviewed and approved before it is pushed.

## Open decisions

None. Remaining owner tasks are listed above; the domain is the one that
gates the others (Postmark needs it).
