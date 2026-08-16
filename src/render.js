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
const HINT_DURATION = 1600;
const HINT_PING = 500;
const HINT_FADE = 400;

// How far past fit-to-window the player can zoom. High enough that even the
// smallest Insane-detail sliver can be pushed back over the number threshold.
const MAX_ZOOM = 6;

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

    this.sourceBitmap = null; // the real photo, once decoded — see setPuzzle()
    this.showSource = false;  // true = showing it instead of the painted cells

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

    this.showSource = false;
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
    }
    return next;
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

  showHint(cellId, now) {
    this.hintTarget = { id: cellId, start: now };
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
        ctx.fillStyle = active ? 'rgba(30, 26, 40, 0.9)' : NUMBER;
        ctx.fillText(String(cell.colour + 1), cell.anchor.x, cell.anchor.y);
      }
      ctx.restore();
    }

    this.dirty = false;
  }

  /* ------------------------------------------------------------- live layer */

  draw(bursts, timeMs) {
    if (!this.puzzle) return;
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
    // over it with.
    if (this.showSource) return;

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

    if (this.hover >= 0 && this.reveal < 1) {
      const cell = this.cells[this.hover];
      if (cell && !this.filled.has(cell.id)) {
        ctx.save();
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
}
