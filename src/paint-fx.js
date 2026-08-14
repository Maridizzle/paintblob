// The whole reason this app exists.
//
// One click produces a four-act burst:
//
//   LAUNCH  blobs rocket out of the click point to targets spread across the
//           entire picture, near ones landing first so it reads as a shockwave
//   HANG    everything sits there wobbling like wet paint
//   SUCK    the entire mess accelerates back into the target cell, spiralling
//           slightly and smearing as it goes
//   FILL    the cell floods with colour from its anchor outwards, then pops
//
// Blobs are drawn as hard-edged wobbly bezier loops in a single flat colour,
// not blurred metaballs. Overlaps are invisible because everything is the same
// paint, so we get crisp edges for free and never touch a canvas filter.

const TAU = Math.PI * 2;

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, t) => a + (b - a) * t;

const easeOutCubic = (t) => 1 - (1 - t) ** 3;
const easeInCubic = (t) => t * t * t;
// Overshoot pair must satisfy c3 === c1 + 1, otherwise the curve does not
// start at zero and every blob pops in already part-grown.
const easeOutBack = (t) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2;
const easeOutQuint = (t) => 1 - (1 - t) ** 5;

/**
 * Nudges a hex colour's brightness. Blobs are drawn a few percent apart from
 * each other so overlapping paint reads as wet layers rather than one flat
 * silhouette — without needing rims, which would show seams at every overlap.
 */
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
  return `rgb(${clamp(((n >> 16) & 255) * k)},${clamp(((n >> 8) & 255) * k)},${clamp((n & 255) * k)})`;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Timings in milliseconds at speed 1. Overlapping FILL with the tail of SUCK
// is what makes the colour feel like it is *caused* by the blobs arriving
// rather than appearing afterwards.
const T = {
  launch: [0, 300],
  hang: [300, 420],
  suck: [420, 840],
  fill: [760, 1010],
  pop: [1010, 1180],
};
const DURATION = T.pop[1];

const at = (elapsed, [a, b]) => clamp01((elapsed - a) / (b - a));

/** Catmull-Rom through the ring, emitted as cubic beziers. */
function tracePath(ctx, pts) {
  const n = pts.length / 2;
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 0; i < n; i++) {
    const p0 = ((i - 1 + n) % n) * 2;
    const p1 = i * 2;
    const p2 = ((i + 1) % n) * 2;
    const p3 = ((i + 2) % n) * 2;
    ctx.bezierCurveTo(
      pts[p1] + (pts[p2] - pts[p0]) / 6,
      pts[p1 + 1] + (pts[p2 + 1] - pts[p0 + 1]) / 6,
      pts[p2] - (pts[p3] - pts[p1]) / 6,
      pts[p2 + 1] - (pts[p3 + 1] - pts[p1 + 1]) / 6,
      pts[p2],
      pts[p2 + 1],
    );
  }
  ctx.closePath();
}

class Splat {
  constructor(rand, origin, target, radius, delay, tier) {
    this.ox = origin.x;
    this.oy = origin.y;
    this.tx = target.x;
    this.ty = target.y;
    this.baseRadius = radius;
    this.delay = delay;
    this.tier = tier;

    const lobes = tier === 2 ? 6 : tier === 1 ? 9 : 12;
    this.phase = new Float32Array(lobes);
    this.amp = new Float32Array(lobes);
    for (let i = 0; i < lobes; i++) {
      this.phase[i] = rand() * TAU;
      this.amp[i] = 0.07 + rand() * (tier === 0 ? 0.16 : 0.13);
    }

    this.spin = rand() * TAU;
    this.spinRate = (rand() - 0.5) * 1.6;
    this.spiral = (rand() - 0.5) * (tier === 2 ? 90 : 55);
    this.squash = 0.86 + rand() * 0.28;

    this.x = this.ox;
    this.y = this.oy;
    this.px = this.ox;
    this.py = this.oy;
    this.radius = 0;
    this.prevRadius = 0;
    this.colour = null; // assigned by Burst so each blob sits a shade apart
  }

  update(elapsed, sink) {
    this.px = this.x;
    this.py = this.y;
    this.prevRadius = this.radius;

    const launch = clamp01((at(elapsed, T.launch) - this.delay) / (1 - this.delay));
    const suck = at(elapsed, T.suck);

    if (suck <= 0) {
      const e = easeOutCubic(launch);
      this.x = lerp(this.ox, this.tx, e);
      this.y = lerp(this.oy, this.ty, e);
      // easeOutBack on the radius gives the little overshoot-and-settle that
      // sells the impact.
      this.radius = this.baseRadius * clamp01(easeOutBack(clamp01(launch * 1.9)));
      if (elapsed > T.hang[0]) {
        const wob = (elapsed - T.hang[0]) / 90;
        this.x += Math.sin(wob + this.spin) * 1.6;
        this.y += Math.cos(wob * 1.3 + this.spin) * 1.6;
      }
    } else {
      // easeInCubic, not quart: quart crams the entire journey into the last
      // ~100ms, which reads as the paint vanishing rather than being pulled.
      const e = easeInCubic(suck);
      this.x = lerp(this.tx, sink.x, e);
      this.y = lerp(this.ty, sink.y, e);

      // A tangential bulge that vanishes at both ends: the paint curves in
      // rather than travelling on a dead-straight line.
      const dx = sink.x - this.tx;
      const dy = sink.y - this.ty;
      const len = Math.hypot(dx, dy) || 1;
      const swirl = Math.sin(suck * Math.PI) * this.spiral;
      this.x += (-dy / len) * swirl;
      this.y += (dx / len) * swirl;

      // Shallow exponent: blobs stay fat almost the whole way in and only
      // collapse at the very end, which is what makes it read as being sucked
      // rather than fading out.
      this.radius = this.baseRadius * (1 - e) ** 0.55;
    }

    this.spin += this.spinRate * 0.016;
    return this.radius > 0.4;
  }

  draw(ctx, elapsed) {
    const r = this.radius;
    if (r <= 0.4) return;
    ctx.fillStyle = this.colour;

    // Motion smear: a cone from where the blob was (wide) to where it is
    // (narrow). A constant-width stroke would degenerate into a thin stick
    // during the suck, when the step is long and the radius is collapsing.
    const dx = this.x - this.px;
    const dy = this.y - this.py;
    const len = Math.hypot(dx, dy);
    const pr = Math.max(this.prevRadius, r);
    if (len > r * 0.5 && pr > 0.6) {
      const nx = -dy / len;
      const ny = dx / len;
      ctx.beginPath();
      ctx.moveTo(this.px + nx * pr, this.py + ny * pr);
      ctx.lineTo(this.px - nx * pr, this.py - ny * pr);
      ctx.lineTo(this.x - nx * r, this.y - ny * r);
      ctx.lineTo(this.x + nx * r, this.y + ny * r);
      ctx.closePath();
      ctx.fill();
    }

    const n = this.phase.length;
    const pts = new Float32Array(n * 2);
    const t = elapsed / 260;
    for (let i = 0; i < n; i++) {
      const a = this.spin + (i / n) * TAU;
      const rr = r * (1 + Math.sin(this.phase[i] + t * 2.1) * this.amp[i]);
      pts[i * 2] = this.x + Math.cos(a) * rr;
      pts[i * 2 + 1] = this.y + Math.sin(a) * rr * this.squash;
    }
    ctx.beginPath();
    tracePath(ctx, pts);
    ctx.fill();
  }
}

export class Burst {
  /**
   * @param {object} o
   * @param {{x:number,y:number}} o.origin   click point, canvas space
   * @param {{x:number,y:number}} o.sink     cell anchor the paint collapses into
   * @param {string} o.colour
   * @param {number} o.width  @param {number} o.height  canvas size
   * @param {number} o.reach  cell's furthest corner from the anchor
   * @param {number} [o.speed]  playback rate; 1 = normal, 2 = twice as fast
   * @param {number} [o.density] 0.4..1.6 blob count multiplier
   */
  constructor(o) {
    this.origin = o.origin;
    this.sink = o.sink;
    this.colour = o.colour;
    this.reach = o.reach;
    this.speed = o.speed ?? 1;
    this.cellPath = o.cellPath;
    this.elapsed = 0;
    this.done = false;
    this.filled = false;   // flips the moment the cell should count as painted

    const rand = mulberry32((o.seed ?? 1) * 2654435761);
    const size = Math.min(o.width, o.height);
    const density = o.density ?? 1;

    this.splats = [];

    // Core blob, right where the click landed.
    this.splats.push(new Splat(rand, o.origin, o.origin, size * 0.155, 0, 0));

    // Majors on a jittered grid over the *entire* canvas, so the explosion
    // covers the picture no matter where in it you clicked. A 5x5 grid with a
    // high keep rate leaves far fewer bald quadrants than 4x4 did.
    const gx = 5;
    const gy = 5;
    const diag = Math.hypot(o.width, o.height);
    for (let iy = 0; iy < gy; iy++) {
      for (let ix = 0; ix < gx; ix++) {
        if (rand() > 0.9 * density) continue;
        const target = {
          x: ((ix + 0.15 + rand() * 0.7) / gx) * o.width,
          y: ((iy + 0.15 + rand() * 0.7) / gy) * o.height,
        };
        const d = Math.hypot(target.x - o.origin.x, target.y - o.origin.y) / diag;
        this.splats.push(new Splat(
          rand,
          o.origin,
          target,
          size * (0.11 - d * 0.045) * (0.75 + rand() * 0.6),
          d * 0.42,                       // near blobs land first: shockwave
          1,
        ));
      }
    }

    // Droplets. Cheap, and they do most of the work of making it feel wet.
    const drops = Math.round(20 * density);
    for (let i = 0; i < drops; i++) {
      const a = rand() * TAU;
      const d = (0.25 + rand() * 0.75) * diag * 0.5;
      this.splats.push(new Splat(
        rand,
        o.origin,
        { x: o.origin.x + Math.cos(a) * d, y: o.origin.y + Math.sin(a) * d },
        size * (0.008 + rand() * 0.026),
        rand() * 0.5,
        2,
      ));
    }

    for (const splat of this.splats) splat.colour = shade(o.colour, 0.95 + rand() * 0.1);

    this.fillWobble = Array.from({ length: 14 }, () => ({
      phase: rand() * TAU,
      amp: 0.04 + rand() * 0.09,
    }));
  }

  /** 0..1 across the whole burst. Used for screen shake and audio cues. */
  get progress() {
    return clamp01(this.elapsed / DURATION);
  }

  /** Peaks on impact and decays. The caller nudges the canvas by this. */
  get shake() {
    const t = at(this.elapsed, T.launch);
    const impact = t > 0 && t < 1 ? (1 - t) ** 2 : 0;
    const arrive = at(this.elapsed, [T.suck[1] - 60, T.suck[1] + 90]);
    const land = arrive > 0 && arrive < 1 ? Math.sin(arrive * Math.PI) : 0;
    return impact * 5.5 + land * 4;
  }

  update(dt) {
    // Playback rate: >1 runs the burst faster, <1 is slow motion.
    this.elapsed += dt * this.speed;
    for (const s of this.splats) s.update(this.elapsed, this.sink);

    if (!this.filled && this.elapsed >= T.fill[0]) this.filled = true;
    if (this.elapsed >= DURATION) this.done = true;
    return !this.done;
  }

  /** Expanding wobbly flood, clipped to the cell. Draw before the blobs. */
  drawFill(ctx) {
    const p = at(this.elapsed, T.fill);
    if (p <= 0 || !this.cellPath) return;

    ctx.save();
    ctx.clip(this.cellPath);
    ctx.fillStyle = this.colour;

    if (p >= 1) {
      ctx.fill(this.cellPath);
    } else {
      const r = easeOutQuint(p) * this.reach * 1.15;
      const n = this.fillWobble.length;
      const pts = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) {
        const w = this.fillWobble[i];
        const a = (i / n) * TAU;
        const rr = r * (1 + Math.sin(w.phase + p * 5) * w.amp * (1 - p));
        pts[i * 2] = this.sink.x + Math.cos(a) * rr;
        pts[i * 2 + 1] = this.sink.y + Math.sin(a) * rr;
      }
      ctx.beginPath();
      tracePath(ctx, pts);
      ctx.fill();
    }

    // A brief bloom of white along the wet edge as it settles.
    const pop = at(this.elapsed, T.pop);
    if (pop > 0 && pop < 1) {
      ctx.globalAlpha = (1 - pop) * 0.4;
      ctx.globalCompositeOperation = 'lighter';
      ctx.fill(this.cellPath);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  drawBlobs(ctx) {
    ctx.save();
    ctx.lineJoin = 'round';
    for (const s of this.splats) s.draw(ctx, this.elapsed);
    ctx.restore();
  }
}

/**
 * Which audio cue should fire, given the elapsed time either side of a frame.
 * The impact sound is not here: it plays on pointerdown so it lands exactly on
 * the input rather than one frame later, which is audible.
 */
export function audioCue(before, after) {
  if (before < T.suck[0] && after >= T.suck[0]) return 'suck';
  if (before < T.fill[0] && after >= T.fill[0]) return 'fill';
  return null;
}

export const BURST_DURATION = DURATION;

/** Phase boundaries in ms. Exported so tooling can label frames correctly. */
export const PHASES = T;
