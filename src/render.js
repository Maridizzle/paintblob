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

    this.dpr = 1;
    this.scale = 1;
    this.ox = 0;
    this.oy = 0;
  }

  setPuzzle(puzzle, cells, filled) {
    this.puzzle = puzzle;
    this.cells = cells;
    this.filled = filled;
    this.reveal = filled.size === cells.length ? 1 : 0;
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
    this.scale = Math.min(rect.width / this.puzzle.width, rect.height / this.puzzle.height);
    this.ox = (rect.width - this.puzzle.width * this.scale) / 2;
    this.oy = (rect.height - this.puzzle.height * this.scale) / 2;
  }

  /** Screen coordinates -> picture coordinates. */
  toPuzzle(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left - this.ox) / this.scale,
      y: (clientY - rect.top - this.oy) / this.scale,
    };
  }

  applyTransform(ctx, shakeX = 0, shakeY = 0) {
    const k = this.scale * this.dpr;
    ctx.setTransform(k, 0, 0, k, (this.ox + shakeX) * this.dpr, (this.oy + shakeY) * this.dpr);
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
