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
- **Open:** which sign-in methods.
  - *Sign in with Google* requires the player to have a Google account.
    Nearly universal on Android, not universal on iPhone or desktop.
  - *Email magic link* works for anyone with an email address (no password,
    no third-party account) but needs an email-sending service account.
  - Recommendation: magic link as the baseline, Google as the one-tap option
    beside it. Either alone is also fine.
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

## Data model (PostgreSQL)

```
users         id, email, google_sub (nullable), display_name, created_at
sessions      token_hash, user_id, expires_at
magic_codes   code_hash, email, expires_at, used_at
saves         user_id, revision, body jsonb, created_at     (prune to last N per user)
entitlements  user_id, pack_id, source, granted_at          source: 'grant' | 'steam' | 'stripe'
packs         id, kind ('puzzle' | 'story' | 'cosmetic'), title, payload jsonb
```

`entitlements.source` is the Steam hedge: when Steam becomes the store, its
ownership records are mirrored into this table with `source: 'steam'` and
nothing else on the server or client changes.

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

## Hosting the game (open)

There is no fixed public URL for the PWA today; the README suggests dragging
`dist-web/` onto Netlify Drop. The API must know the game's origin (CORS, and
Google's allowed-origins list if Google sign-in is used), so the game needs a
permanent address. Options:

- (a) a proper Netlify (or similar) site with a stable URL; CSP gains the API
  origin, server CORS allows the game origin.
- (b) the Railway service also serves `dist-web/`, so game and API share one
  origin; no CSP change and no CORS at all. Couples the two deploys.

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
2. If Google sign-in: a Google Cloud OAuth client ID (web application type)
   listing the game's origin.
3. If magic links: an email-sending service account and its API key.
4. A permanent origin for the game (see Hosting).

## Phasing

1. **Server skeleton + save sync.** Auth, `/save*`, `/me`, `/me/export`,
   `DELETE /me`, tests. Roughly a full session.
2. **Client account UI + sync.** `cloud.js`, Settings section, `persist()` and
   `boot()` hooks, CSP, save-shape key, regression test for the write-set.
3. **DLC manifest.** `packs`, `entitlements`, `/content/*`, `/admin/grant`,
   client gating and puzzle-pack fetch.

Each phase is its own PR and is reviewed and approved before it is pushed.

## Open decisions

- Sign-in methods: Google, magic link, or both.
- Where the game is hosted (option a or b above).
- Email provider, if magic links are chosen.
