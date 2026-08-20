// Two-layer canvas renderer.
//
// The base layer holds the picture as it currently stands — painted cells,
// blank cells, outlines, numbers — and is only redrawn when something actually
// changes. The live layer is cleared every frame and carries the pulsing
// highlight plus any in-flight bursts. Bursts run at 60fps over a picture that
// might be 60 filled Path2Ds; redrawing those every frame would be wasteful.

const PAPER = '#faf7f2';
const BLANK = '#edeae4';
const BLANK_EDGE = 'rgba(38, 34, 48, 0.34)';
const NUMBER = 'rgba(56, 50, 68, 0.66)';

// Below this on-screen radius a number would be unreadable. Such a cell gets
// a diagonal stripe of its own colour instead — still identifiable, never
// blank. Shared by the fill pass and the number pass so a cell never gets
// neither or both.
const NUMBER_MIN_PX = 5;

// A hint flash: a ring pings out from the cell's anchor for the first
// stretch, while the cell itself pulses at full visibility until fading out
// over the last stretch.
/* One element of a picture stands proud of the surface while you paint it —
   see drawLift(). A height in screen pixels rather than picture units,
   because that is what height above a surface actually is: zooming in moves
   you closer to the picture, not to a different picture. */
const LIFT_PX = 7;         // how far the parallax can carry it, at full swing
const LIFT_EASE = 0.14;    // per frame, toward wherever the pointer is asking
const LIFT_SHADOW = 'rgba(10, 8, 18, 0.42)';
/**
 * Past this share of the picture, nothing is raised at all.
 *
 * The tagged element is chosen for what it does in the PHOTO — water ripples,
 * an aurora shimmers — and those are sometimes most of the frame. Raising a
 * quarter of a picture does not read as an object standing off a surface, it
 * reads as the picture coming apart in layers, and it drags an edge of the
 * artwork away from the frame with it. An object it is, or nothing.
 */
const LIFT_MAX_AREA = 0.1;

const HINT_DURATION = 1600;
const HINT_PING = 500;
const HINT_FADE = 400;

// How far past fit-to-window the player can zoom. High enough that even the
// smallest Insane-detail sliver can be pushed back over the number threshold.
const MAX_ZOOM = 6;

// One element of a finished picture brought to life while the photo is on
// screen. The window is deliberately short and self-closing: it plays, it
// settles, the picture goes back to being a still photograph.
export const LIVING_EFFECTS = ['ripple', 'glow', 'shimmer', 'breathe', 'twinkle'];
const LIVING_DURATION = 7000; // inside the 5-10s the effect should play for
const LIVING_IN = 500;        // fade the motion in rather than snapping to it
const LIVING_OUT = 1200;      // ...and ease it back out so it settles

/** Fractional part — a cheap deterministic scatter for the twinkle sparks.
 *  Deterministic matters: the same picture should twinkle the same way every
 *  time you look at it, not re-roll its stars on each visit. */
const frac = (n) => n - Math.floor(n);

/** data:mime;base64,xxx -> Blob, without a network-facing fetch() — see the
 *  comment where this is called for why that distinction matters. */
function dataUriToBlob(uri) {
  const comma = uri.indexOf(',');
  const mime = uri.slice(5, uri.indexOf(';'));
  const binary = atob(uri.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export class Board {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.base = document.createElement('canvas');
    this.baseCtx = this.base.getContext('2d');

    this.puzzle = null;
    this.cells = [];
    this.filled = new Set();
    this.selected = -1;
    this.hover = -1;
    this.reveal = 0;      // 1 = finished picture, outlines faded away
    this.dirty = true;
    this.hintTarget = null; // { id, start } while a hint flash is showing
    this.colourFlash = null;    // { id, start, duration } — Colour Flash ability
    this.numberOverride = null; // { colour, end } — Number Recolor ability
    this.goldenCell = null;     // { id, end } — Golden Cell ability

    this.sourceBitmap = null; // the real photo, once decoded — see setPuzzle()
    this.showSource = false;  // true = showing it instead of the painted cells
    // One element of the picture brought to life while the photo is on
    // screen. { effect, cells:[id], start, end } — see drawLiving().
    this.living = null;

    // The same element again, standing proud of the surface while you PAINT.
    // Separate from `living` on purpose: that one is the photo's own content
    // moving, this one is a trick of depth on the painted picture, and the
    // two never show at once. See drawLift().
    this.liftCells = null;
    this.liftShape = null;
    this.lift = { x: 0, y: 0 };        // where the parallax is now
    this.liftTarget = { x: 0, y: 0 };  // where the pointer is asking it to be

    this.dpr = 1;
    this.fitScale = 1;  // fit-to-container scale, before zoom
    this.zoom = 1;      // user zoom multiplier, always >= 1
    this.panX = 0;      // user pan, CSS px, applied after zoom
    this.panY = 0;
    this.cssW = 0;
    this.cssH = 0;
  }

  /** fitScale * zoom. Everything below reads this, never fitScale directly,
   * so a stroke width or a stripe tile stays a constant screen size and a
   * click still lands on the right cell at any zoom level. */
  get scale() {
    return this.fitScale * this.zoom;
  }

  /** Picture's on-screen top-left corner, CSS px, incorporating pan.
   *  Safe with no puzzle loaded yet — toPuzzle() gets called on every
   *  pointerdown regardless of whether one has, same as the fields these
   *  getters replaced. */
  get offsetX() {
    if (!this.puzzle) return 0;
    return (this.cssW - this.puzzle.width * this.scale) / 2 + this.panX;
  }

  get offsetY() {
    if (!this.puzzle) return 0;
    return (this.cssH - this.puzzle.height * this.scale) / 2 + this.panY;
  }

  setPuzzle(puzzle, cells, filled) {
    this.puzzle = puzzle;
    this.cells = cells;
    this.filled = filled;
    this.reveal = filled.size === cells.length ? 1 : 0;
    this.resetZoom();

    // Colour Flash and Golden Cell both reference this picture's own cell
    // array/palette — carrying either into a different picture would flash
    // the wrong colour or, worse, hand a stray cell the 5x Golden Cell
    // award in commitFill(). Number Recolor has no such reference, but an
    // ability's effect outliving the puzzle it was cast in is surprising
    // either way, so it goes too.
    this.colourFlash = null;
    this.numberOverride = null;
    this.goldenCell = null;

    this.showSource = false;
    this.living = null;
    // The element that stands proud is the one already tagged as alive —
    // there is one thing in a picture worth singling out, not two — unless it
    // is too much of the picture to be an object at all.
    const tagged = puzzle.animation?.cells ?? [];
    const covered = tagged.reduce((sum, id) => sum + (cells[id]?.area ?? 0), 0);
    this.liftCells = tagged.length
      && covered <= puzzle.width * puzzle.height * LIFT_MAX_AREA ? tagged : null;
    this.liftShape = null;
    this.lift = { x: 0, y: 0 };
    this.liftTarget = { x: 0, y: 0 };
    this.sourceBitmap?.close();
    this.sourceBitmap = null;
    if (puzzle.sourceImage) {
      // Not fetch(puzzle.sourceImage) — the app's CSP has no `data:` in
      // connect-src (only in img-src), so fetching a data: URI is silently
      // blocked. Decoding it by hand is plain JS, not a request, so CSP has
      // no say in it.
      createImageBitmap(dataUriToBlob(puzzle.sourceImage))
        .then((bitmap) => {
          // A different picture loaded while this one was still decoding.
          if (this.puzzle !== puzzle) { bitmap.close(); return; }
          this.sourceBitmap = bitmap;
          this.dirty = true;
        })
        .catch(() => {}); // no compare view for this one; the toggle just won't appear
    }
  }

  /**
   * @param {boolean} show
   * @returns {boolean} the mode actually landed in — false if asked to show
   *   a photo that has not (or will never) finish decoding, so the caller
   *   can keep its own toggle control in sync rather than trusting the ask.
   */
  setShowSource(show) {
    const next = !!(show && this.sourceBitmap);
    if (this.showSource !== next) {
      this.showSource = next;
      this.dirty = true;
      // The effect only ever plays over the photo. Leaving photo view ends
      // it immediately rather than letting it run down invisibly and hold
      // the frame loop at full rate for nothing.
      if (!next) this.living = null;
    }
    return next;
  }

  /**
   * Starts (or restarts) the living-element window for this picture.
   *
   * @param {object|null} spec  the puzzle's `animation` field:
   *   { effect, cells: number[], speed?, amplitude? }. Anything missing,
   *   unknown or empty is simply no animation — an untagged picture is the
   *   overwhelmingly common case and must cost nothing.
   * @param {number} timeMs  the same clock draw() is given.
   */
  startLiving(spec, timeMs) {
    this.living = null;
    if (!spec || !this.showSource) return;
    if (!LIVING_EFFECTS.includes(spec.effect)) return;
    const cells = (spec.cells ?? []).filter((id) => this.cells[id]?.path);
    if (!cells.length) return;
    this.living = {
      effect: spec.effect,
      cells,
      speed: spec.speed > 0 ? spec.speed : 1,
      amplitude: spec.amplitude > 0 ? spec.amplitude : 1,
      start: timeMs,
      end: timeMs + LIVING_DURATION,
      clip: null,  // built lazily on the first frame, then reused
      box: null,
    };
  }

  /** Keeps panX/panY from letting the picture drift entirely off-screen. */
  clampPan() {
    if (!this.puzzle || !this.cssW) return;
    const maxPanX = Math.max(0, (this.puzzle.width * this.scale - this.cssW) / 2);
    const maxPanY = Math.max(0, (this.puzzle.height * this.scale - this.cssH) / 2);
    this.panX = Math.max(-maxPanX, Math.min(maxPanX, this.panX));
    this.panY = Math.max(-maxPanY, Math.min(maxPanY, this.panY));
  }

  /**
   * @param {number} zoom  target zoom, clamped to [1, MAX_ZOOM]
   * @param {number} anchorClientX  @param {number} anchorClientY
   *   viewport point to hold stationary through the change — the cursor for
   *   a wheel notch, the pinch midpoint for two fingers. Without this every
   *   zoom step also recentres the picture, which reads as the view
   *   lurching rather than the point under your fingers growing.
   */
  setZoom(zoom, anchorClientX, anchorClientY) {
    const clamped = Math.max(1, Math.min(MAX_ZOOM, zoom));
    if (clamped === this.zoom || !this.puzzle) return;
    const rect = this.canvas.getBoundingClientRect();
    const bx = anchorClientX - rect.left;
    const by = anchorClientY - rect.top;
    const px = (bx - this.offsetX) / this.scale;
    const py = (by - this.offsetY) / this.scale;

    this.zoom = clamped;
    const centredX = (this.cssW - this.puzzle.width * this.scale) / 2;
    const centredY = (this.cssH - this.puzzle.height * this.scale) / 2;
    this.panX = bx - px * this.scale - centredX;
    this.panY = by - py * this.scale - centredY;
    this.clampPan();
    this.dirty = true;
  }

  /** Drag-to-pan and two-finger pan both just nudge panX/panY, CSS px. */
  panBy(dx, dy) {
    this.panX += dx;
    this.panY += dy;
    this.clampPan();
    this.dirty = true;
  }

  resetZoom() {
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.dirty = true;
  }

  setSelected(colourIndex) {
    if (this.selected === colourIndex) return;
    this.selected = colourIndex;
    this.dirty = true;
  }

  setHover(id) {
    if (this.hover === id) return false;
    this.hover = id;
    return true;
  }

  markFilled(id) {
    this.filled.add(id);
    this.dirty = true;
  }

  /** Undo's counterpart. The Set is shared with game.js, so the delete is what
   *  the renderer sees; the flag is what makes it repaint. */
  markUnfilled(id) {
    this.filled.delete(id);
    this.dirty = true;
  }

  showHint(cellId, now) {
    this.hintTarget = { id: cellId, start: now };
  }

  /** Colour Flash: a dramatic, time-boxed amplification of the ordinary
   *  held-colour pulse below, over whichever colour is passed in — frozen at
   *  activation rather than tracking `this.selected` live, so switching tubs
   *  mid-flash does not retarget it. */
  flashColour(colourIndex, now, duration = 4000) {
    this.colourFlash = { id: colourIndex, start: now, duration };
    this.dirty = true;
  }

  /** Number Recolor: swaps every unfilled number's colour until `end` — or
   *  indefinitely, for `durationMs <= 0`, since the ability now cycles to a
   *  colour that's meant to stick until the player changes it again. */
  setNumberOverride(colour, durationMs, now) {
    this.numberOverride = { colour, end: durationMs > 0 ? now + durationMs : Infinity };
    this.dirty = true;
  }

  /** Golden Cell: rings one cell distinctly until it's filled or time runs out. */
  markGolden(cellId, durationMs, now) {
    this.goldenCell = { id: cellId, end: now + durationMs };
  }

  /** Fits the picture into the element box, preserving aspect. */
  layout() {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height || !this.puzzle) return;

    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.base.width = w;
      this.base.height = h;
      this.dirty = true;
    }

    this.dpr = dpr;
    this.cssW = rect.width;
    this.cssH = rect.height;
    this.fitScale = Math.min(rect.width / this.puzzle.width, rect.height / this.puzzle.height);
    this.clampPan();
  }

  /** Screen coordinates -> picture coordinates. */
  toPuzzle(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left - this.offsetX) / this.scale,
      y: (clientY - rect.top - this.offsetY) / this.scale,
    };
  }

  /**
   * Picture coordinates -> screen coordinates, the inverse of toPuzzle().
   * Nothing in the renderer needs this yet — it exists for the smoke test
   * (electron/main.cjs), which has to click an actual cell's anchor rather
   * than guessing blindly at screen coordinates and hoping one lands.
   */
  toScreen(x, y) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: rect.left + this.offsetX + x * this.scale,
      y: rect.top + this.offsetY + y * this.scale,
    };
  }

  applyTransform(ctx, shakeX = 0, shakeY = 0) {
    const k = this.scale * this.dpr;
    ctx.setTransform(k, 0, 0, k, (this.offsetX + shakeX) * this.dpr, (this.offsetY + shakeY) * this.dpr);
  }

  hexOf(colourIndex) {
    return this.puzzle.palette[colourIndex].hex;
  }

  /**
   * A small diagonal-stripe tile in the given colour, for cells too small to
   * carry a number. Sized in picture units, like every line width in this
   * file, so the stripe reads as a constant width on screen regardless of
   * zoom, rather than shrinking to nothing on the smallest cells.
   */
  stripePattern(ctx, hex, vivid) {
    const n = Math.max(2, Math.round(10 / this.scale));
    const tile = document.createElement('canvas');
    tile.width = n;
    tile.height = n;
    const tctx = tile.getContext('2d');
    tctx.fillStyle = BLANK;
    tctx.fillRect(0, 0, n, n);
    tctx.strokeStyle = hex;
    tctx.globalAlpha = vivid ? 0.8 : 0.36;
    tctx.lineWidth = n * 0.45;
    tctx.beginPath();
    // Three parallel copies, offset by a tile width, so the diagonal covers
    // the corners and tiles seamlessly when repeated.
    for (const o of [-n, 0, n]) {
      tctx.moveTo(o, n);
      tctx.lineTo(o + n, 0);
    }
    tctx.stroke();
    return ctx.createPattern(tile, 'repeat');
  }

  /* ------------------------------------------------------------- base layer */

  drawBase() {
    const ctx = this.baseCtx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.base.width, this.base.height);
    this.applyTransform(ctx);

    const { width, height } = this.puzzle;
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, width, height);

    if (this.showSource && this.sourceBitmap) {
      // The real photo, at the same scale and position painted cells would
      // be — so zooming and panning keep working exactly the same way.
      ctx.drawImage(this.sourceBitmap, 0, 0, width, height);
      this.dirty = false;
      return;
    }

    const stripes = new Map();
    const stripeFor = (colourIndex, vivid) => {
      const key = `${colourIndex}:${vivid}`;
      let pattern = stripes.get(key);
      if (!pattern) {
        pattern = this.stripePattern(ctx, this.hexOf(colourIndex), vivid);
        stripes.set(key, pattern);
      }
      return pattern;
    };

    for (const cell of this.cells) {
      if (this.filled.has(cell.id)) {
        ctx.fillStyle = this.hexOf(cell.colour);
      } else if (cell.inradius * this.scale < NUMBER_MIN_PX) {
        // Too small for a number — a stripe of the cell's own colour stands
        // in for it, brighter when it is the colour currently in hand.
        ctx.fillStyle = BLANK;
        ctx.fill(cell.path);
        ctx.fillStyle = stripeFor(cell.colour, cell.colour === this.selected);
        ctx.fill(cell.path);
        continue;
      } else if (cell.colour === this.selected) {
        // Faint wash of the actual paint so it is obvious where it goes.
        ctx.fillStyle = BLANK;
        ctx.fill(cell.path);
        ctx.save();
        ctx.globalAlpha = 0.16;
        ctx.fillStyle = this.hexOf(cell.colour);
        ctx.fill(cell.path);
        ctx.restore();
        continue;
      } else {
        ctx.fillStyle = BLANK;
      }
      ctx.fill(cell.path);
    }

    const edge = 1 - this.reveal;
    if (edge > 0.01) {
      ctx.save();
      ctx.globalAlpha = edge;
      ctx.strokeStyle = BLANK_EDGE;
      ctx.lineWidth = 1.15 / this.scale;
      ctx.lineJoin = 'round';
      for (const cell of this.cells) ctx.stroke(cell.path);

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const cell of this.cells) {
        if (this.filled.has(cell.id)) continue;
        const px = cell.inradius * this.scale;
        // Finer pictures make more small cells. A cell with no number still
        // carries its colour as a stripe (see the fill pass above), so the
        // bar for printing one only has to be "legible", not "roomy".
        if (px < NUMBER_MIN_PX) continue;
        const size = Math.min(30, Math.max(7.5, px * 0.9)) / this.scale;
        const active = cell.colour === this.selected;
        ctx.font = `${active ? 700 : 500} ${size}px ui-sans-serif, system-ui, sans-serif`;
        if (this.numberOverride) {
          // A thin dark outline keeps a bright number legible over a light
          // cell too, not just a dark one.
          ctx.lineWidth = Math.max(1, size * 0.12);
          ctx.strokeStyle = 'rgba(20, 16, 28, 0.85)';
          ctx.strokeText(String(cell.colour + 1), cell.anchor.x, cell.anchor.y);
          ctx.fillStyle = this.numberOverride.colour;
        } else {
          ctx.fillStyle = active ? 'rgba(30, 26, 40, 0.9)' : NUMBER;
        }
        ctx.fillText(String(cell.colour + 1), cell.anchor.x, cell.anchor.y);
      }
      ctx.restore();
    }

    this.dirty = false;
  }

  /* ------------------------------------------------------------- live layer */

  draw(bursts, timeMs) {
    if (!this.puzzle) return;
    // Numbers live on the base layer (redrawn only on change), so a timed
    // colour swap has to force that redraw itself when its window closes —
    // nothing else would ever notice the number needs to revert.
    if (this.numberOverride && timeMs >= this.numberOverride.end) {
      this.numberOverride = null;
      this.dirty = true;
    }
    if (this.dirty) this.drawBase();

    const ctx = this.ctx;
    let shake = 0;
    for (const b of bursts) shake = Math.max(shake, b.shake);
    const sx = shake ? (Math.random() - 0.5) * shake : 0;
    const sy = shake ? (Math.random() - 0.5) * shake : 0;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.base, sx * this.dpr, sy * this.dpr);

    // Just the photo — no pulses, hover outline, hints or bursts to paint
    // over it with. The one exception is the living element, which is the
    // photo's own content moving rather than an overlay about the puzzle.
    if (this.showSource) {
      if (this.living) this.drawLiving(timeMs, sx, sy);
      return;
    }

    // Straight after the base and before every overlay: the raised element is
    // part of the picture, not something drawn over it. showSource returned
    // above, so this never reaches the photo — the living element has that
    // view to itself.
    const lifted = this.liftCells ? this.drawLift(sx, sy) : null;

    this.applyTransform(ctx, sx, sy);

    // Pulsing wash over every cell that takes the selected paint.
    if (this.selected >= 0 && this.reveal < 1) {
      const pulse = 0.06 + 0.05 * (0.5 + 0.5 * Math.sin(timeMs / 380));
      ctx.save();
      ctx.globalAlpha = pulse;
      ctx.fillStyle = this.hexOf(this.selected);
      for (const cell of this.cells) {
        if (cell.colour !== this.selected || this.filled.has(cell.id)) continue;
        ctx.fill(cell.path);
      }
      ctx.restore();
    }

    if (this.colourFlash) {
      const elapsed = timeMs - this.colourFlash.start;
      if (elapsed > this.colourFlash.duration) {
        this.colourFlash = null;
      } else {
        const pulse = 0.4 + 0.35 * (0.5 + 0.5 * Math.sin(timeMs / 160));
        ctx.save();
        ctx.globalAlpha = pulse;
        ctx.fillStyle = this.hexOf(this.colourFlash.id);
        for (const cell of this.cells) {
          if (cell.colour !== this.colourFlash.id || this.filled.has(cell.id)) continue;
          ctx.fill(cell.path);
        }
        ctx.globalAlpha = 1;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.2 / this.scale;
        ctx.lineJoin = 'round';
        for (const cell of this.cells) {
          if (cell.colour !== this.colourFlash.id || this.filled.has(cell.id)) continue;
          ctx.stroke(cell.path);
        }
        ctx.restore();
      }
    }

    if (this.goldenCell) {
      const cell = this.cells[this.goldenCell.id];
      if (!cell || this.filled.has(cell.id) || timeMs >= this.goldenCell.end) {
        this.goldenCell = null;
      } else {
        const pulse = 0.5 + 0.5 * Math.sin(timeMs / 220);
        ctx.save();
        ctx.strokeStyle = `rgba(255, 214, 64, ${0.6 + 0.4 * pulse})`;
        ctx.lineWidth = (2 + 1.5 * pulse) / this.scale;
        ctx.lineJoin = 'round';
        ctx.stroke(cell.path);
        ctx.restore();
      }
    }

    if (this.hover >= 0 && this.reveal < 1) {
      const cell = this.cells[this.hover];
      if (cell && !this.filled.has(cell.id)) {
        ctx.save();
        // A cell that is part of the raised element is not where the picture
        // says it is. The wash above is 11% alpha and can live with the few
        // pixels; a crisp outline sitting beside its own cell cannot.
        if (lifted && this.liftCells.includes(cell.id)) {
          this.applyTransform(ctx, sx + lifted.dx, sy + lifted.dy);
        }
        ctx.strokeStyle = cell.colour === this.selected
          ? 'rgba(24, 20, 34, 0.85)'
          : 'rgba(24, 20, 34, 0.35)';
        ctx.lineWidth = 2.4 / this.scale;
        ctx.lineJoin = 'round';
        ctx.stroke(cell.path);
        ctx.restore();
      }
    }

    if (this.hintTarget) {
      const cell = this.cells[this.hintTarget.id];
      const elapsed = timeMs - this.hintTarget.start;
      if (!cell || this.filled.has(cell.id) || elapsed > HINT_DURATION) {
        this.hintTarget = null;
      } else {
        const tail = HINT_DURATION - HINT_FADE;
        const fade = elapsed > tail ? 1 - (elapsed - tail) / HINT_FADE : 1;
        const pulse = Math.abs(Math.sin(elapsed / 140));

        ctx.save();
        ctx.fillStyle = this.hexOf(cell.colour);
        ctx.globalAlpha = fade * (0.16 + 0.24 * pulse);
        ctx.fill(cell.path);
        ctx.globalAlpha = fade;
        ctx.strokeStyle = this.hexOf(cell.colour);
        ctx.lineWidth = (1.5 + 1.5 * pulse) / this.scale;
        ctx.lineJoin = 'round';
        ctx.stroke(cell.path);

        if (elapsed < HINT_PING) {
          const p = elapsed / HINT_PING;
          ctx.beginPath();
          ctx.arc(cell.anchor.x, cell.anchor.y, cell.inradius * (0.4 + 1.8 * p), 0, Math.PI * 2);
          ctx.globalAlpha = fade * (1 - p) * 0.8;
          ctx.lineWidth = 2.5 / this.scale;
          ctx.strokeStyle = '#fff';
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    if (bursts.length) {
      // Blobs are aimed across the whole picture and deliberately overshoot it.
      // Without this they spill into the letterbox around the picture, which
      // reads as paint floating on the window. Barely visible when the window
      // is near-square; glaring on a phone in portrait.
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, this.puzzle.width, this.puzzle.height);
      ctx.clip();
      for (const burst of bursts) {
        burst.drawFill(ctx);
        burst.drawBlobs(ctx);
      }
      ctx.restore();
    }
  }

  /* --------------------------------------------------- the living element */

  /**
   * The clip path — the union of the tagged cells, so the effect follows the
   * thing's real silhouette rather than a rectangle around it — plus its
   * bounding box in picture units. Built once per window, reused every frame.
   */
  livingShape() {
    const live = this.living;
    if (!live.clip) {
      const { path, box } = this.unionOf(live.cells);
      live.clip = path;
      live.box = box;
    }
    return live;
  }

  /**
   * A set of cells as one Path2D, plus its bounding box in picture units.
   *
   * One path rather than a fill per cell is what makes the silhouette clean:
   * the shared edges between neighbours disappear into the single fill instead
   * of each cell casting its own shadow onto the one beside it.
   */
  unionOf(ids) {
    const path = new Path2D();
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const id of ids) {
      const cell = this.cells[id];
      if (!cell) continue;
      path.addPath(cell.path);
      x0 = Math.min(x0, cell.bounds.x0);
      y0 = Math.min(y0, cell.bounds.y0);
      x1 = Math.max(x1, cell.bounds.x1);
      y1 = Math.max(y1, cell.bounds.y1);
    }
    return { path, box: { x0, y0, x1, y1 } };
  }

  /* ----------------------------------------------------------- the lift */

  /**
   * Aims the parallax. The pointer stands in for where you are looking from,
   * so it is normalised against the canvas rather than the picture — where
   * your eye is has nothing to do with how far the picture is zoomed.
   *
   * The element moves AGAINST the pointer, which is the way round real
   * parallax works: move your head left and the near thing slides right
   * across what is behind it. Following the cursor instead reads as a card
   * being tilted, which is a different and weaker illusion.
   */
  setLiftFrom(clientX, clientY) {
    if (!this.liftCells) return false;
    const r = this.canvas.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    const nx = ((clientX - r.left) / r.width) * 2 - 1;
    const ny = ((clientY - r.top) / r.height) * 2 - 1;
    this.liftTarget = {
      x: -Math.max(-1, Math.min(1, nx)),
      y: -Math.max(-1, Math.min(1, ny)),
    };
    return true;
  }

  /** Lets the element settle back to square when the pointer leaves. */
  releaseLift() {
    this.liftTarget = { x: 0, y: 0 };
  }

  /** True while the parallax is still easing, so the frame loop knows to keep
   *  drawing until it has settled rather than freezing it half-shifted. */
  liftMoving() {
    if (!this.liftCells) return false;
    return Math.abs(this.liftTarget.x - this.lift.x) > 0.004
      || Math.abs(this.liftTarget.y - this.lift.y) > 0.004;
  }

  /**
   * Draws the tagged element raised off the picture.
   *
   * The shadow sits on the surface at the element's OWN position and does not
   * travel with it. That gap is the height, and it is the whole reason this
   * reads as something raised rather than as a picture that has slipped.
   *
   * The element itself is a clipped blit of the base layer, offset — copying
   * the pixels means it lifts whatever state that region happens to be in,
   * painted or unpainted or striped or numbered, with none of drawBase's
   * logic repeated here to drift out of step with it.
   */
  drawLift(shakeX, shakeY) {
    this.liftShape ??= this.unionOf(this.liftCells);
    const { path } = this.liftShape;
    const ctx = this.ctx;

    // Eased rather than snapped: the pointer arrives in jumps, and the thing
    // is meant to have some mass behind it.
    this.lift.x += (this.liftTarget.x - this.lift.x) * LIFT_EASE;
    this.lift.y += (this.liftTarget.y - this.lift.y) * LIFT_EASE;
    const dx = this.lift.x * LIFT_PX;
    const dy = this.lift.y * LIFT_PX;

    // Nothing to do with the lift may stray off the artwork — the picture is
    // the surface, and paper does not have a shadow falling past its own edge.
    const { width, height } = this.puzzle;

    ctx.save();
    this.applyTransform(ctx, shakeX, shakeY);
    ctx.beginPath();
    ctx.rect(0, 0, width, height);
    ctx.clip();
    // Shadow geometry is in canvas pixels and ignores the transform, so it
    // stays a constant softness however far the picture is zoomed.
    ctx.shadowColor = LIFT_SHADOW;
    ctx.shadowBlur = 13 * this.dpr;
    ctx.shadowOffsetX = 2.5 * this.dpr;
    ctx.shadowOffsetY = 5 * this.dpr;
    // The silhouette is filled in the shadow's own colour, so wherever the
    // offset copy fails to cover it, what shows through is simply more
    // shadow — which is exactly what is under a lifted object anyway.
    ctx.fillStyle = LIFT_SHADOW;
    ctx.fill(path);
    ctx.restore();

    ctx.save();
    this.applyTransform(ctx, shakeX, shakeY);
    ctx.beginPath();
    ctx.rect(0, 0, width, height);
    ctx.clip();
    this.applyTransform(ctx, shakeX + dx, shakeY + dy);
    ctx.clip(path);
    // clip() is resolved into canvas space as it is called, so it survives
    // dropping back to identity to blit the base layer wholesale.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.base, (shakeX + dx) * this.dpr, (shakeY + dy) * this.dpr);
    ctx.restore();

    return { dx, dy };
  }

  /**
   * Draws the tagged element's motion over the photo.
   *
   * The base layer already holds the photograph and is never erased, so
   * every effect here composites on top of an intact picture. That is what
   * makes the re-sampling effects safe: cells tile the canvas with no gaps,
   * so *moving* a region would tear a hole in the image with nothing behind
   * it to show.
   */
  drawLiving(timeMs, shakeX = 0, shakeY = 0) {
    const live = this.living;
    if (timeMs >= live.end) {
      // Self-closing: game.js's busy flag watches board.living, so clearing
      // it here is what lets the frame loop drop back to its idle cadence.
      this.living = null;
      return;
    }
    // Wake into the motion and settle back out of it, rather than snapping
    // on and stopping dead mid-cycle.
    const strength = Math.min(1, (timeMs - live.start) / LIVING_IN)
      * Math.min(1, (live.end - timeMs) / LIVING_OUT);
    if (strength <= 0) return;

    const { box } = this.livingShape();
    const t = ((timeMs - live.start) / 1000) * live.speed;
    const ctx = this.ctx;

    ctx.save();
    // Clip in picture units. A clip is stored in device space, so it keeps
    // holding after the transform is reset for the device-space effects.
    this.applyTransform(ctx, shakeX, shakeY);
    ctx.clip(live.clip);
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // The region in device pixels, for the effects that re-sample the base.
    // Padded by a pixel or two so a band never falls short of its own
    // clipped edge and leaves a hairline of untouched photo.
    const k = this.scale * this.dpr;
    const ox = (this.offsetX + shakeX) * this.dpr;
    const oy = (this.offsetY + shakeY) * this.dpr;
    const x0 = Math.max(0, Math.floor(ox + box.x0 * k) - 2);
    const y0 = Math.max(0, Math.floor(oy + box.y0 * k) - 2);
    const x1 = Math.min(this.canvas.width, Math.ceil(ox + box.x1 * k) + 2);
    const y1 = Math.min(this.canvas.height, Math.ceil(oy + box.y1 * k) + 2);
    const rect = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    // The base was blitted at the shake offset; sampling it back has to undo
    // that to land on the same pixels again.
    const back = { x: shakeX * this.dpr, y: shakeY * this.dpr };

    if (rect.w > 0 && rect.h > 0) {
      switch (live.effect) {
        case 'ripple': this.livingRipple(ctx, rect, back, live, t, strength); break;
        case 'breathe': this.livingBreathe(ctx, rect, back, live, t, strength); break;
        case 'glow': this.livingGlow(ctx, rect, live, t, strength); break;
        case 'shimmer': this.livingShimmer(ctx, rect, live, t, strength); break;
        case 'twinkle': this.livingTwinkle(ctx, live, t, strength, shakeX, shakeY); break;
      }
    }
    ctx.restore();
  }

  /** Water, a flag, a reflection: a travelling sideways wave. */
  livingRipple(ctx, rect, back, live, t, strength) {
    const amp = 3 * this.dpr * live.amplitude * strength;
    // One blit per band, so the band height is capped from below by the
    // region's own size: a full-picture region on a 3x phone would otherwise
    // cost several hundred blits a frame for motion no one can see.
    const band = Math.max(2 * this.dpr, Math.ceil(rect.h / 120));
    const wavelength = 46 * this.dpr;
    // Sample-shifted, not draw-shifted. Every destination band is drawn at
    // its own place from a source band nudged sideways, so the destination
    // is always fully covered — draw-shifting would leave gaps between
    // bands that disagree about how far to move.
    const hi = rect.x + back.x;
    const lo = hi - (this.canvas.width - rect.w);
    for (let y = rect.y; y < rect.y + rect.h; y += band) {
      const h = Math.min(band, rect.y + rect.h - y);
      // Clamped so a band near the canvas edge never samples off it, which
      // would punch a transparent hole straight through the photo.
      const dx = Math.max(lo, Math.min(hi, amp * Math.sin(y / wavelength - t * 2.4)));
      const sy = Math.max(0, Math.min(this.canvas.height - h, y + back.y));
      ctx.drawImage(this.base, rect.x - dx + back.x, sy, rect.w, h, rect.x, y, rect.w, h);
    }
  }

  /** A slow swell — something alive and at rest. Outward only, so the region
   *  always covers at least its own footprint and never pulls back off the
   *  photo behind it. */
  livingBreathe(ctx, rect, back, live, t, strength) {
    const grow = 1 + 0.045 * live.amplitude * strength * (0.5 - 0.5 * Math.cos(t * 1.6));
    const w = rect.w / grow;
    const h = rect.h / grow;
    ctx.drawImage(
      this.base,
      rect.x + (rect.w - w) / 2 + back.x, rect.y + (rect.h - h) / 2 + back.y, w, h,
      rect.x, rect.y, rect.w, rect.h,
    );
  }

  /** A lantern, a window, embers: the whole silhouette breathing light. */
  livingGlow(ctx, rect, live, t, strength) {
    const pulse = 0.5 - 0.5 * Math.cos(t * 1.9);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.min(0.45, strength * live.amplitude * (0.05 + 0.2 * pulse));
    ctx.fillStyle = '#ffe6a8';
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  }

  /** Glass, metal, silk: a highlight band sweeping across the surface. */
  livingShimmer(ctx, rect, live, t, strength) {
    const band = Math.max(8 * this.dpr, rect.w * 0.18);
    const travel = rect.w + band * 4;
    const cx = rect.x - band * 2 + travel * ((t * 0.45) % 1);
    const grad = ctx.createLinearGradient(cx - band, rect.y, cx + band, rect.y + rect.h);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0)');
    grad.addColorStop(0.5, 'rgba(255, 255, 255, 1)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.min(0.5, 0.3 * live.amplitude * strength);
    ctx.fillStyle = grad;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  }

  /** Stars, fairy lights, frost: a scatter of sparks fading in and out.
   *  Drawn in picture units — a spark should grow with the picture when you
   *  zoom in, the way the thing it sits on does. */
  livingTwinkle(ctx, live, t, strength, shakeX, shakeY) {
    this.applyTransform(ctx, shakeX, shakeY);
    ctx.globalCompositeOperation = 'lighter';
    const { box } = live;
    const unit = Math.min(box.x1 - box.x0, box.y1 - box.y0) * 0.035;
    let seed = 0;
    for (const id of live.cells) {
      const cell = this.cells[id];
      // Anchors sit inside their own cell, so jittering within the inscribed
      // radius keeps a spark on the thing rather than on the clip's edge.
      const spread = cell.inradius * 0.8;
      for (let i = 0; i < 3; i++) {
        seed++;
        const jx = frac(seed * 0.7548776662) * 2 - 1;
        const jy = frac(seed * 0.5698402909) * 2 - 1;
        const phase = frac(seed * 0.3819660113) * Math.PI * 2;
        const a = Math.sin(t * 2.2 + phase);
        if (a <= 0.02) continue;
        const x = cell.anchor.x + jx * spread;
        const y = cell.anchor.y + jy * spread;
        const size = unit * (0.6 + 0.4 * a) * live.amplitude;
        ctx.globalAlpha = Math.min(1, a * strength * 0.9);

        const halo = ctx.createRadialGradient(x, y, 0, x, y, size * 1.6);
        halo.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
        halo.addColorStop(0.35, 'rgba(255, 246, 214, 0.45)');
        halo.addColorStop(1, 'rgba(255, 246, 214, 0)');
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(x, y, size * 1.6, 0, Math.PI * 2);
        ctx.fill();

        // Two crossed tapered spikes — what makes it read as a spark rather
        // than a smudge of light.
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.beginPath();
        ctx.moveTo(x - size * 2.4, y);
        ctx.lineTo(x, y - size * 0.32);
        ctx.lineTo(x + size * 2.4, y);
        ctx.lineTo(x, y + size * 0.32);
        ctx.closePath();
        ctx.moveTo(x, y - size * 2.4);
        ctx.lineTo(x + size * 0.32, y);
        ctx.lineTo(x, y + size * 2.4);
        ctx.lineTo(x - size * 0.32, y);
        ctx.closePath();
        ctx.fill();
      }
    }
  }
}
