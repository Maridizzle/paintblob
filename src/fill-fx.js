// Cell-local fill animations — the calmer, faster alternatives to the
// full-picture blob Burst (paint-fx.js). Each plays a short effect INSIDE the
// one cell you tapped and then hands the cell to the base layer.
//
// They deliberately match the Burst's duck-typed interface — `origin`, `sink`,
// `elapsed`, `speed`, `filled`, `done`, a `shake` getter, `update(dt)`,
// `drawFill(ctx)` and `drawBlobs(ctx)` — so game.js's frame loop and render.js's
// board drive them with no special-casing: they are pushed onto `S.bursts` and
// committed exactly like a Burst. `drawFill` runs in PICTURE space (the board
// clips it to the picture rect); `drawBlobs` is where the Burst draws its flying
// splat at a constant on-screen size, which these effects don't use, so it is a
// no-op here.
//
// The 'none' and 'blob' styles are handled in game.js (an instant commit, and
// the real Burst); this module owns the three in-cell animations.

const TAU = Math.PI * 2;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeOutQuint = (t) => 1 - (1 - t) ** 5;
const easeOutCubic = (t) => 1 - (1 - t) ** 3;

// The catalogue the Settings picker reads (mirrors THEMES). `blob` and `none`
// are real ids handled in game.js; the middle three are this module's.
export const DEFAULT_FILL = 'blob';
export const FILL_STYLES = [
  { id: 'blob', label: 'Blob', blurb: 'The classic: a blob explosion tears across the picture and sucks into the cell.' },
  { id: 'burst', label: 'Starburst', blurb: 'A quick star of light bursts out of the cell as it fills.' },
  { id: 'scribble', label: 'Scribble', blurb: 'The colour is scribbled in, back and forth, like a crayon.' },
  { id: 'rise', label: 'Rise', blurb: 'The colour floods up the cell from the bottom, like a filling glass.' },
  { id: 'none', label: 'None', blurb: 'No animation — the cell just fills the instant you tap it.' },
];

// Per-style timings (ms at speed 1): total duration, and the fraction at which
// the cell is considered painted (commit happens then; a short settle plays out
// the rest). Kept well under the blob's ~1.2s — these are the snappy options.
const SPEC = {
  burst: { dur: 500, fillAt: 0.72 },
  scribble: { dur: 560, fillAt: 0.86 },
  rise: { dur: 460, fillAt: 0.82 },
};

export class CellFill {
  /**
   * @param {'burst'|'scribble'|'rise'} kind
   * @param {object} o
   * @param {{x:number,y:number}} o.origin  click point (picture space)
   * @param {{x:number,y:number}} o.sink    cell anchor
   * @param {string} o.colour               the paint hex
   * @param {Path2D} o.cellPath             clip to the cell
   * @param {number} o.reach                anchor→furthest-corner distance
   * @param {{x0,y0,x1,y1}} o.bounds        cell bounding box
   * @param {number} [o.speed]              playback rate; 1 = normal
   */
  constructor(kind, o) {
    this.kind = kind;
    this.origin = o.origin;
    this.sink = o.sink;
    this.colour = o.colour;
    this.cellPath = o.cellPath;
    this.reach = o.reach;
    this.bounds = o.bounds;
    this.speed = o.speed ?? 1;
    this.spin = (o.seed ?? Math.random()) * TAU;

    this.elapsed = 0;
    this.filled = false;   // flips the moment the cell should count as painted
    this.done = false;
    const spec = SPEC[kind] ?? SPEC.rise;
    this.dur = spec.dur;
    this.fillAt = spec.dur * spec.fillAt;
  }

  /** These effects stay put — no screen shake. */
  get shake() { return 0; }

  /** 0..1 across the whole effect. */
  get progress() { return clamp01(this.elapsed / this.dur); }

  update(dt) {
    this.elapsed += dt * this.speed;
    if (!this.filled && this.elapsed >= this.fillAt) this.filled = true;
    if (this.elapsed >= this.dur) this.done = true;
    return !this.done;
  }

  /** The board calls this in picture space, clipped to the picture rect. */
  drawFill(ctx) {
    if (!this.cellPath) return;
    if (this.kind === 'rise') this.drawRise(ctx);
    else if (this.kind === 'scribble') this.drawScribble(ctx);
    else this.drawStarburst(ctx);
  }

  /** No flying splat — see the module header. */
  drawBlobs() {}

  // Colour floods up from the bottom of the cell like a filling glass, with a
  // brief bright meniscus riding the wet edge.
  drawRise(ctx) {
    const { x0, y0, x1, y1 } = this.bounds;
    const p = easeOutCubic(clamp01(this.elapsed / this.fillAt));
    const y = y1 - p * (y1 - y0);
    ctx.save();
    ctx.clip(this.cellPath);
    ctx.fillStyle = this.colour;
    ctx.fillRect(x0, y, x1 - x0, y1 - y + 1);
    if (p < 1) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
      ctx.fillRect(x0, y, x1 - x0, Math.max(1, (y1 - y0) * 0.04));
    }
    ctx.restore();
  }

  // A crayon scribbled back and forth, revealed along its length; the thick
  // overlapping rows read as filling in. The base layer takes over on commit,
  // so small gaps in the last frames never show.
  drawScribble(ctx) {
    const { x0, y0, x1, y1 } = this.bounds;
    const w = x1 - x0;
    const h = y1 - y0;
    const rows = 6;
    const rowH = h / rows;
    const p = clamp01(this.elapsed / this.fillAt);

    ctx.save();
    ctx.clip(this.cellPath);
    ctx.strokeStyle = this.colour;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.lineWidth = rowH * 1.5; // overlap neighbouring rows so it fills

    const path = new Path2D();
    let first = true;
    for (let r = 0; r <= rows; r++) {
      const y = Math.min(y1, y0 + r * rowH + rowH * 0.5);
      const xs = r % 2 === 0 ? [x0, x1] : [x1, x0];
      for (const x of xs) {
        if (first) { path.moveTo(x, y); first = false; }
        else path.lineTo(x, y);
      }
    }
    // Reveal a growing fraction of the stroke via a single long dash.
    const total = (rows + 1) * w + rows * rowH;
    ctx.setLineDash([total, total]);
    ctx.lineDashOffset = total * (1 - p);
    ctx.stroke(path);
    ctx.restore();
  }

  // A star of light bursts out of the cell while the colour floods it from the
  // anchor. The rays overshoot the cell (a sparkle on the picture); the flood
  // is clipped to the cell.
  drawStarburst(ctx) {
    const p = this.progress;

    // The flood, anchored, growing to fill the cell.
    const fp = easeOutQuint(clamp01((p - 0.08) / 0.62));
    if (fp > 0) {
      ctx.save();
      ctx.clip(this.cellPath);
      ctx.fillStyle = this.colour;
      if (fp >= 1) {
        ctx.fill(this.cellPath);
      } else {
        const r = fp * this.reach * 1.25;
        ctx.beginPath();
        ctx.arc(this.sink.x, this.sink.y, r, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }

    // The rays: a spiky star that shoots out, then fades.
    const rayT = clamp01(p / 0.5);
    const len = easeOutQuint(rayT) * this.reach * 2.3;
    const fade = p < 0.5 ? 1 : clamp01(1 - (p - 0.5) / 0.5);
    if (fade > 0.02 && len > 1) {
      const spikes = 9;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = fade * 0.85;
      ctx.fillStyle = this.colour;
      ctx.beginPath();
      for (let i = 0; i < spikes * 2; i++) {
        const a = this.spin + (i / (spikes * 2)) * TAU;
        const rr = i % 2 === 0 ? len : len * 0.38;
        const x = this.sink.x + Math.cos(a) * rr;
        const y = this.sink.y + Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      // A hot white core.
      ctx.globalAlpha = fade * 0.5;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(this.sink.x, this.sink.y, Math.max(1.5, len * 0.12), 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }
}
