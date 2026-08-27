// A little squirrel that scampers across the window and, stopping at each part
// of the screen in turn, says what it does — the first-run guided tour, and the
// same thing Settings can play back on demand.
//
// The module is only the *mechanism*: a spotlight that dims everything but one
// control, a flash card that speaks for the squirrel, and the squirrel itself.
// What to point at and what to say lives with the app (game.js hands in the
// steps), the same way the avatar and the house keep their data out of the
// pieces that draw them.
//
// Two things keep the maths simple. Coordinates are worked out against #app's
// own box rather than the viewport, so the 1px window border and any letterbox
// never creep in; and the squirrel and card are positioned by ordinary top/left
// with a CSS transition, so the browser tweens the scamper for free and the
// transform is left free for the hop, the tail sway and the left/right flip.

const SQUIRREL_W = 88;   // the squirrel's box, in px — its own coordinate frame
const SQUIRREL_H = 88;
const RING_PAD = 9;      // breathing room the spotlight leaves around a control
const GAP = 12;          // squirrel-to-ring and squirrel-to-card spacing

// The squirrel, drawn in avatar.js's idiom: smooth bezier outlines, overlapping
// flat fills whose joins vanish, and translucent washes carrying their own fill
// for every shadow and highlight — so nothing here does colour maths. Authored
// facing right (nose to +x); a parent <g class="sq-flip"> mirrors it about the
// centreline to face left, and the animated parts are grouped so CSS can move
// the tail, the pointing paw and the whole body without touching geometry.
function squirrelSVG() {
  return `<svg class="sq" viewBox="0 0 100 100" width="${SQUIRREL_W}" height="${SQUIRREL_H}" aria-hidden="true">
    <g class="sq-flip">
      <!-- the big bushy tail, curling up behind the back -->
      <g class="sq-tail">
        <path class="sq-fur" d="M34 84 C10 82 6 58 16 40 C22 29 36 24 44 30 C34 33 24 44 24 58 C24 72 34 78 44 78 Z"/>
        <path class="sq-fur" d="M20 44 C15 33 22 22 34 20 C44 18 52 26 50 34 C45 27 36 26 30 32 C24 38 22 44 26 52 Z"/>
        <path d="M18 42 C14 31 21 21 33 19 C40 18 45 21 47 25 C41 22 34 24 29 30 C23 37 21 45 24 54 Z" fill="rgba(255,255,255,0.14)"/>
        <path d="M34 84 C16 82 10 62 17 45 C13 60 18 76 36 79 Z" fill="rgba(0,0,0,0.12)"/>
      </g>

      <!-- haunch and body -->
      <path class="sq-fur" d="M40 88 C24 88 20 74 24 62 C28 50 40 44 52 46 C66 48 74 58 74 70 C74 82 62 88 52 88 Z"/>
      <!-- cream belly, a wash so it reads over any fur colour -->
      <path d="M46 86 C36 85 33 74 37 65 C41 57 50 55 57 59 C50 58 44 63 43 71 C42 79 47 84 54 85 Z" fill="rgba(255,244,224,0.55)"/>

      <!-- back foot -->
      <path class="sq-fur" d="M40 84 C36 88 34 92 40 93 C47 94 54 92 54 88 C54 84 48 83 40 84 Z"/>

      <!-- pointing front paw + arm, lifted toward the card -->
      <g class="sq-arm">
        <path class="sq-fur" d="M60 60 C70 54 80 52 84 56 C88 60 84 66 76 68 C68 70 62 68 60 64 Z"/>
        <path class="sq-fur" d="M82 54 C88 52 92 53 92 57 C92 61 87 62 82 60 Z"/>
      </g>

      <!-- head -->
      <path class="sq-fur" d="M56 40 C54 26 64 16 76 16 C88 16 94 26 92 38 C90 50 80 56 70 54 C62 52 57 47 56 40 Z"/>
      <!-- ear + tuft -->
      <path class="sq-fur" d="M64 20 C60 10 64 4 70 6 C76 8 76 16 72 22 Z"/>
      <path d="M66 18 C63 12 65 8 69 9 C72 10 72 15 70 19 Z" fill="rgba(0,0,0,0.14)"/>
      <!-- cheek highlight -->
      <path d="M60 42 C58 33 63 25 71 24 C64 28 61 35 63 44 Z" fill="rgba(255,255,255,0.12)"/>

      <!-- nose, eye, and its shine -->
      <path class="sq-nose" d="M90 36 C94 35 96 37 95 40 C94 43 90 43 88 41 Z"/>
      <circle class="sq-eye" cx="79" cy="33" r="4.4"/>
      <circle cx="80.6" cy="31.4" r="1.5" fill="rgba(255,255,255,0.9)"/>
    </g>
  </svg>`;
}

export class Tour {
  // `host` is the element the overlay is appended to and measured against
  // (#app). Everything the tour draws lives inside one root that is added on
  // start and removed on end, so a finished tour leaves the DOM exactly as it
  // found it.
  constructor(host) {
    this.host = host;
    this.root = null;
    this.steps = [];
    this.i = 0;
    this.onEnd = null;
    this.running = false;
    this._showTok = 0; // guards a before-hook step against a newer one landing first
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this._onKey = this._onKey.bind(this);
    this._onResize = this._onResize.bind(this);
  }

  // steps: [{ target, title, body, before }]. `target` is a CSS selector, an
  // Element, a () => Element, or null for a centred welcome/farewell card.
  // `before` is an optional async hook run just before the step is shown — it is
  // how a step sets the screen up for itself (open a panel, switch a tab) before
  // the squirrel points. Steps without a `before` are dropped up front when
  // their target is missing or hidden on this platform, so one list serves
  // desktop and phone; a step WITH a `before` is always kept, since its target
  // may not exist until that hook has run.
  // `suppressible` adds a "Don't show again" checkbox to the card. It rides
  // checked by default (the tour is one-and-done), and onEnd is handed its
  // state: false means the viewer un-ticked it and wants to be shown again.
  start(steps, { onEnd, suppressible = false, finishLabel = "Let's paint" } = {}) {
    if (this.running) return;
    this.steps = steps.filter((s) => s.before || !s.target || this._resolve(s.target));
    if (!this.steps.length) { onEnd?.(); return; }

    this.onEnd = onEnd;
    this.suppressible = suppressible;
    // The word on the last Next button. A cutscene ends on "To the path", the
    // guided tour on the default.
    this.finishLabel = finishLabel;
    this.running = true;
    this.i = 0;
    this._build();
    // Capture Escape/Enter/arrows before the app's own keydown chain, so the
    // tour swallows them rather than also closing a panel behind it.
    window.addEventListener('keydown', this._onKey, true);
    window.addEventListener('resize', this._onResize);
    this._show(0);
  }

  end() {
    if (!this.running) return;
    this.running = false;
    window.removeEventListener('keydown', this._onKey, true);
    window.removeEventListener('resize', this._onResize);
    // Read the checkbox before the root is torn down.
    const suppress = this._suppress();
    this.root?.classList.add('out');
    const root = this.root;
    setTimeout(() => root?.remove(), 260);
    this.root = null;
    const done = this.onEnd;
    this.onEnd = null;
    done?.(suppress);
  }

  // The "Don't show again" state, or undefined when the tour carries no
  // checkbox (a Settings replay) — the caller leaves the saved flag alone then.
  _suppress() {
    if (!this.suppressible) return undefined;
    return this.root?.querySelector('.tour-again-box')?.checked ?? true;
  }

  /* ---------------------------------------------------------------- internals */

  _resolve(target) {
    let el = null;
    if (typeof target === 'function') el = target();
    else if (typeof target === 'string') el = document.querySelector(target);
    else if (target instanceof Element) el = target;
    // offsetParent is null for anything display:none — which is exactly how the
    // desktop-only window buttons and web-only chrome hide themselves.
    if (!el || el.offsetParent === null) return null;
    const r = el.getBoundingClientRect();
    return r.width && r.height ? el : null;
  }

  _build() {
    const root = document.createElement('div');
    root.className = this.suppressible ? 'tour suppressible' : 'tour';
    // The character starts as whoever speaks the first beat — the squirrel for
    // the tour, a letter for a story scene — so there is no flash of the wrong
    // one before the first _show swaps it in.
    this._char = this.steps[0]?.character || squirrelSVG();
    root.innerHTML =
      '<div class="tour-spotlight"></div>' +
      `<div class="tour-squirrel">${this._char}</div>` +
      '<div class="tour-card">' +
        '<div class="tour-step"></div>' +
        '<div class="tour-title"></div>' +
        '<div class="tour-body"></div>' +
        '<div class="tour-foot">' +
          '<div class="tour-dots"></div>' +
          '<div class="tour-controls">' +
            '<label class="tour-again">' +
              '<input type="checkbox" class="tour-again-box" checked>' +
              "<span>Don't show again</span>" +
            '</label>' +
            '<div class="tour-btns">' +
              '<button class="tour-skip" type="button">Skip</button>' +
              '<button class="tour-next primary" type="button">Next</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
    this.host.append(root);
    this.root = root;

    this.spot = root.querySelector('.tour-spotlight');
    this.squirrel = root.querySelector('.tour-squirrel');
    this.card = root.querySelector('.tour-card');
    if (this.reduced) this.squirrel.classList.add('still');

    root.querySelector('.tour-skip').addEventListener('click', () => this.end());
    root.querySelector('.tour-next').addEventListener('click', () => this._advance());

    const dots = root.querySelector('.tour-dots');
    this.steps.forEach((_, i) => {
      const d = document.createElement('button');
      d.type = 'button';
      d.className = 'tour-dot';
      d.addEventListener('click', () => this._show(i));
      dots.append(d);
    });
  }

  _advance() {
    if (this.i >= this.steps.length - 1) this.end();
    else this._show(this.i + 1);
  }

  _onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.end(); }
    else if (e.key === 'Enter' || e.key === 'ArrowRight' || e.key === ' ') {
      e.preventDefault(); e.stopPropagation(); this._advance();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault(); e.stopPropagation();
      if (this.i > 0) this._show(this.i - 1);
    }
  }

  _onResize() { this._show(this.i); }

  async _show(i) {
    this.i = i;
    const step = this.steps[i];
    const last = i === this.steps.length - 1;

    this.card.querySelector('.tour-step').textContent = `${i + 1} of ${this.steps.length}`;
    this.card.querySelector('.tour-title').textContent = step.title || '';
    this.card.querySelector('.tour-body').textContent = step.body || '';
    this.card.querySelector('.tour-next').textContent = last ? this.finishLabel : 'Next';
    this.root.querySelectorAll('.tour-dot')
      .forEach((d, k) => d.classList.toggle('on', k === i));

    // Swap the speaker only when it actually changes, so a run of beats by the
    // same character doesn't restart its idle animation on every Next.
    const char = step.character || squirrelSVG();
    if (char !== this._char) {
      this.squirrel.innerHTML = char;
      this._char = char;
    }

    // The before-hook may open a panel or switch a tab and needs a beat to
    // settle before we measure. A token guards against a fast Next landing us on
    // a later step while this one is still waiting — the stale call bows out.
    if (step.before) {
      const tok = ++this._showTok;
      await step.before();
      if (!this.running || tok !== this._showTok) return;
    } else {
      this._showTok = (this._showTok || 0) + 1;
    }

    this._layout(step);
  }

  // Places the spotlight, the squirrel and the card for one step. All three are
  // positioned in #app's coordinate space; the box-shadow on the spotlight is
  // what actually dims the rest of the window, so there is no separate scrim to
  // keep in sync.
  _layout(step) {
    const app = this.host.getBoundingClientRect();
    const el = step.target && this._resolve(step.target);

    if (el) {
      // The spotlight's own box-shadow is what dims the window (a 9999px spread
      // of dark all around a bright hole), so the ring is the scrim — no second
      // element to keep in step.
      this.spot.classList.remove('no-hole');
      const r = el.getBoundingClientRect();
      const x = r.left - app.left - RING_PAD;
      const y = r.top - app.top - RING_PAD;
      const w = r.width + RING_PAD * 2;
      const h = r.height + RING_PAD * 2;
      Object.assign(this.spot.style, {
        left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px`,
      });
      this._placeNear(x, y, w, h, app);
    } else {
      // A centred welcome/farewell: the same box-shadow, but the hole shrunk to
      // a point and its ring hidden, so the window dims evenly with nothing
      // singled out. The card sits mid-window with the squirrel just under it.
      this.spot.classList.add('no-hole');
      Object.assign(this.spot.style, {
        left: `${app.width / 2}px`, top: `${app.height / 2}px`, width: '0px', height: '0px',
      });
      const cardH = this._sizeCard(app);
      const cardX = (app.width - this._cardW) / 2;
      const cardY = app.height / 2 - (cardH + GAP + SQUIRREL_H) / 2;
      this._card(cardX, cardY, app, true);
      const sx = app.width / 2 - SQUIRREL_W / 2;
      this._place(this.squirrel, sx, cardY + cardH + GAP, app);
      this._faceToward(sx, app.width / 2);
    }
  }

  // Sets the card's width and returns the height it takes at that width, so the
  // squirrel can be laid clear of it rather than guessing.
  _sizeCard(app) {
    this._cardW = Math.min(320, app.width - 24);
    this.card.style.width = `${this._cardW}px`;
    return this.card.offsetHeight; // forces the reflow that measures it
  }

  // Lay the card and the squirrel as a pair just outside the spotlit control,
  // never overlapping each other. Prefer below the control, then above, then to
  // a side — whichever keeps the whole pair on screen. The squirrel always sits
  // between the card and the ring, so it reads as presenting the control.
  _placeNear(x, y, w, h, app) {
    const cardH = this._sizeCard(app);
    const cw = this._cardW;
    const stack = SQUIRREL_H + GAP + cardH + GAP; // squirrel + card, stacked
    const cardX = x + w / 2 - cw / 2;              // centred on the control
    const targetCx = x + w / 2;

    let sx, sy, cardTop;
    if (y + h + GAP + stack <= app.height) {
      // Below: squirrel just under the ring, card under the squirrel.
      sy = y + h + GAP;
      cardTop = sy + SQUIRREL_H + GAP;
      sx = targetCx - SQUIRREL_W / 2;
      this._card(cardX, cardTop, app, false);
      this._place(this.squirrel, sx, sy, app);
    } else if (y - GAP - stack >= 0) {
      // Above: card up top, squirrel below it, still above the ring.
      cardTop = y - GAP - SQUIRREL_H - GAP - cardH;
      sy = y - GAP - SQUIRREL_H;
      sx = targetCx - SQUIRREL_W / 2;
      this._card(cardX, cardTop, app, false);
      this._place(this.squirrel, sx, sy, app);
    } else {
      // Short window, tall control: go beside it, squirrel then card, on the
      // side with room.
      const right = app.width - (x + w) >= SQUIRREL_W + GAP + cw + GAP;
      sy = y + h / 2 - SQUIRREL_H / 2;
      if (right) {
        sx = x + w + GAP;
        this._card(sx + SQUIRREL_W + GAP, y + h / 2 - cardH / 2, app, false);
      } else {
        sx = x - GAP - SQUIRREL_W;
        this._card(x - GAP - SQUIRREL_W - GAP - cw, y + h / 2 - cardH / 2, app, false);
      }
      this._place(this.squirrel, sx, sy, app);
    }
    this._faceToward(sx, targetCx);
  }

  _place(node, left, top, app) {
    left = Math.max(4, Math.min(app.width - SQUIRREL_W - 4, left));
    top = Math.max(4, Math.min(app.height - SQUIRREL_H - 4, top));
    // The scamper: while it moves, run; the CSS transition on top/left carries
    // it there. reduced-motion drops the transition (see .still) and it just
    // appears in place.
    node.classList.add('running');
    node.style.left = `${left}px`;
    node.style.top = `${top}px`;
    clearTimeout(this._runTimer);
    this._runTimer = setTimeout(() => node.classList.remove('running'),
      this.reduced ? 0 : 640);
  }

  _faceToward(squirrelLeft, targetCx) {
    // Face the thing it is pointing at: flip only when the target is to its left.
    const face = targetCx < squirrelLeft + SQUIRREL_W / 2 ? -1 : 1;
    this.squirrel.dataset.face = String(face);
  }

  // Width was set (and its height measured) by _sizeCard; here we only clamp the
  // position so the card stays fully on screen.
  _card(left, top, app, centred) {
    const w = this._cardW;
    const h = this.card.offsetHeight;
    left = Math.max(8, Math.min(app.width - w - 8, left));
    top = Math.max(8, Math.min(app.height - h - 8, top));
    Object.assign(this.card.style, { left: `${left}px`, top: `${top}px` });
    this.card.classList.toggle('centred', !!centred);
  }
}
