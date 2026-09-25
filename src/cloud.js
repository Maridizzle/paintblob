// The cloud account client (paintblob-cloud on Railway) and the pure helpers
// around it. Everything above createCloud() has no DOM and runs in the node
// tests; createCloud() only needs fetch and a place to keep the session token.
//
// Rules this file exists to keep:
//   - The local save is the source of truth. The cloud gets a copy; it never
//     silently replaces what is on the device.
//   - Cloud is opt-in. Signed out, nothing here is ever called.
//   - A failed or unreachable API is quiet: a status line in Settings, never a
//     modal over the board.

export const CLOUD_ORIGIN = 'https://paintblob-cloud-production.up.railway.app';
export const APP_ORIGIN = 'https://paintblob.netlify.app';
// The OAuth client ID (web application type) from Google Cloud. A public value.
// Empty hides the Google button, so the build never offers a door that 404s.
export const GOOGLE_CLIENT_ID = '874505740940-b48krg96v3gjbv5qg2dk0b1v8oltq8pp.apps.googleusercontent.com';
export const SYNC_DEBOUNCE_MS = 10_000;
export const TOKEN_KEY = 'cloudToken';

/* ------------------------------------------------------------ pure helpers */

/** A magic-link landing: `?magic=<token>` in the query string. */
export function parseMagicParam(search) {
  const m = /[?&]magic=([^&#]+)/.exec(search || '');
  if (!m) return null;
  try { return decodeURIComponent(m[1]); } catch { return null; }
}

/** The same URL with the named query params removed, hash untouched. */
export function stripParams(href, names) {
  const url = new URL(href);
  for (const n of names) url.searchParams.delete(n);
  return url.toString();
}

/**
 * Google's OpenID Connect sign-in via a plain redirect (no third-party script,
 * so the game's CSP stays `script-src 'self'`). Google sends the browser back
 * to redirectUri with `#id_token=…&state=…`.
 */
export function googleAuthUrl({ clientId, redirectUri, nonce, state }) {
  const p = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'id_token',
    scope: 'openid email profile',
    nonce,
    state,
    prompt: 'select_account',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

/** The return leg of googleAuthUrl: `#id_token=…&state=…` → parts, or null. */
export function parseGoogleReturn(hash) {
  if (!hash || !hash.includes('id_token=')) return null;
  const p = new URLSearchParams(hash.replace(/^#/, ''));
  const idToken = p.get('id_token');
  const state = p.get('state');
  if (!idToken || !state) return null;
  return { idToken, state };
}

/** The nonce claim out of a JWT, without verifying it (the server verifies). */
export function idTokenNonce(idToken) {
  try {
    const payload = idToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(payload)).nonce ?? null;
  } catch { return null; }
}

/**
 * What to do at boot given where the device and the cloud each are.
 *   in-sync   nothing to do
 *   push      the device has changes the cloud lacks (or the cloud lost state)
 *   pull      the cloud moved on and the device has nothing unsynced: safe to take it
 *   conflict  both moved: the player decides, never the code
 */
export function syncPlan({ localRevision, localDirty, cloudRevision }) {
  if (cloudRevision === localRevision) return localDirty ? 'push' : 'in-sync';
  if (cloudRevision > localRevision) return localDirty ? 'conflict' : 'pull';
  return 'push';
}

async function pump(stream) {
  const chunks = [];
  const reader = stream.getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}

/** JSON → gzip bytes, the wire format for PUT /save. */
export async function gzipJson(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
  return pump(stream);
}

/** gzip bytes → JSON, the wire format of GET /save. */
export async function gunzipJson(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(new TextDecoder().decode(await pump(stream)));
}

/** A short human label for the devices list, e.g. "Android · Chrome". */
export function deviceLabel(ua = '') {
  const os = /Android/i.test(ua) ? 'Android'
    : /iPhone|iPad|iPod/i.test(ua) ? 'iPhone/iPad'
    : /Windows/i.test(ua) ? 'Windows'
    : /Mac OS X|Macintosh/i.test(ua) ? 'Mac'
    : /CrOS/i.test(ua) ? 'Chromebook'
    : /Linux/i.test(ua) ? 'Linux' : 'Unknown device';
  const browser = /Edg\//i.test(ua) ? 'Edge'
    : /OPR\//i.test(ua) ? 'Opera'
    : /Firefox\//i.test(ua) ? 'Firefox'
    : /Chrome\//i.test(ua) ? 'Chrome'
    : /Safari\//i.test(ua) ? 'Safari' : 'browser';
  return `${os} · ${browser}`;
}

export function randomToken(bytes = 16) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** "just now" / "4 min ago" / "2 h ago" / "3 d ago" for the status line. */
export function agoLabel(iso, now = Date.now()) {
  if (!iso) return 'never';
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

/* -------------------------------------------------------------- the client */

export class CloudError extends Error {
  constructor(status, code, extra = {}) {
    super(code);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

/**
 * @param {object} o
 * @param {() => Promise<string|null>} o.getToken   read the stored session token
 * @param {(t: string|null) => Promise<void>} o.setToken  store or clear it
 */
export function createCloud({ origin = CLOUD_ORIGIN, fetchImpl = (...a) => globalThis.fetch(...a), getToken, setToken, device = '' }) {
  async function request(method, path, { json, body, headers = {}, auth = true } = {}) {
    const h = { ...headers };
    if (auth) {
      const token = await getToken();
      if (!token) throw new CloudError(401, 'signed_out');
      h.authorization = `Bearer ${token}`;
    }
    let payload = body;
    if (json !== undefined) { h['content-type'] = 'application/json'; payload = JSON.stringify(json); }
    let res;
    try {
      res = await fetchImpl(origin + path, { method, headers: h, body: payload });
    } catch {
      throw new CloudError(0, 'offline');
    }
    const ct = res.headers.get('content-type') || '';
    const data = ct.includes('application/json') ? await res.json()
      : ct.includes('application/gzip') ? new Uint8Array(await res.arrayBuffer())
      : await res.text();
    if (!res.ok) {
      // A dead session is cleared so the UI falls back to signed-out cleanly.
      if (res.status === 401 && auth) await setToken(null);
      throw new CloudError(res.status, data?.error || `http_${res.status}`, data && typeof data === 'object' ? data : {});
    }
    return { status: res.status, data, headers: res.headers };
  }

  const signedIn = async (r) => { await setToken(r.data.token); return r.data.user; };

  return {
    async isSignedIn() { return !!(await getToken()); },

    auth: {
      google: (idToken) => request('POST', '/auth/google', { json: { idToken, ageGate: true, device }, auth: false }).then(signedIn),
      magicRequest: (email) => request('POST', '/auth/magic/request', { json: { email, ageGate: true }, auth: false }).then((r) => r.data),
      magicVerify: (fields) => request('POST', '/auth/magic/verify', { json: { ...fields, ageGate: true, device }, auth: false }).then(signedIn),
      async logout() {
        try { await request('POST', '/auth/logout'); } catch { /* already gone is fine */ }
        await setToken(null);
      },
    },

    me: () => request('GET', '/me').then((r) => r.data),
    sessions: () => request('GET', '/me/sessions').then((r) => r.data),
    revokeSession: (id) => request('DELETE', `/me/sessions/${encodeURIComponent(id)}`),
    revokeOthers: () => request('DELETE', '/me/sessions').then((r) => r.data),
    exportAccount: () => request('GET', '/me/export').then((r) => JSON.stringify(r.data, null, 2)),
    async deleteAccount() {
      await request('DELETE', '/me');
      await setToken(null);
    },

    /** Latest cloud save, or null if the account has none yet. */
    async pull() {
      let r;
      try { r = await request('GET', '/save'); } catch (err) { if (err.code === 'no_save') return null; throw err; }
      return {
        revision: Number(r.headers.get('x-save-revision')),
        createdAt: r.headers.get('x-save-created'),
        save: await gunzipJson(r.data),
      };
    },

    /**
     * Upload the whole save. baseRevision is what this device last synced from.
     * Returns { revision } on success or { conflict: true, revision } when the
     * cloud has moved on; anything else throws.
     */
    async push(save, baseRevision) {
      const body = await gzipJson(save);
      try {
        const r = await request('PUT', '/save', {
          body, headers: { 'content-type': 'application/gzip', 'x-save-revision': String(baseRevision) },
        });
        return { revision: r.data.revision };
      } catch (err) {
        if (err.code === 'conflict') return { conflict: true, revision: err.extra.revision };
        throw err;
      }
    },
  };
}
