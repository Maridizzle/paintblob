// A tiny flat-colour software rasteriser.
//
// Used only by the demo-art generator. It exists so the repo ships playable
// puzzles without anyone needing an API key, and so the mapify pipeline has
// something to be exercised against in a test. Everything is hard-edged and
// fully opaque, which is exactly the kind of input the pipeline is tuned for.

/** `fill` may carry a fourth element to start the canvas transparent. */
export function createImage(w, h, fill = [255, 255, 255]) {
  const data = new Uint8ClampedArray(w * h * 4);
  const alpha = fill[3] ?? 255;
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = fill[0];
    data[i * 4 + 1] = fill[1];
    data[i * 4 + 2] = fill[2];
    data[i * 4 + 3] = alpha;
  }
  return { w, h, data };
}

/** Rounded rectangle as a polygon, for fillPoly. */
export function roundedRect(x, y, w, h, r, steps = 12) {
  const pts = [];
  const corner = (cx, cy, from) => {
    for (let i = 0; i <= steps; i++) {
      const a = from + (i / steps) * (Math.PI / 2);
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
  };
  corner(x + w - r, y + h - r, 0);
  corner(x + r, y + h - r, Math.PI / 2);
  corner(x + r, y + r, Math.PI);
  corner(x + w - r, y + r, -Math.PI / 2);
  return pts;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function span(img, y, xa, xb, colour) {
  if (y < 0 || y >= img.h) return;
  const x0 = Math.max(0, Math.round(xa));
  const x1 = Math.min(img.w - 1, Math.round(xb) - 1);
  for (let x = x0; x <= x1; x++) {
    const o = (y * img.w + x) * 4;
    img.data[o] = colour[0];
    img.data[o + 1] = colour[1];
    img.data[o + 2] = colour[2];
    img.data[o + 3] = 255;
  }
}

export function fillRect(img, x, y, w, h, colour) {
  for (let yy = Math.round(y); yy < Math.round(y + h); yy++) span(img, yy, x, x + w, colour);
}

export function fillPoly(img, pts, colour) {
  if (pts.length < 3) return;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [, py] of pts) {
    if (py < minY) minY = py;
    if (py > maxY) maxY = py;
  }
  minY = Math.max(0, Math.floor(minY));
  maxY = Math.min(img.h - 1, Math.ceil(maxY));

  const xs = [];
  for (let y = minY; y <= maxY; y++) {
    const yc = y + 0.5;
    xs.length = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      if ((a[1] <= yc) === (b[1] <= yc)) continue;
      xs.push(a[0] + ((yc - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
    }
    xs.sort((p, q) => p - q);
    for (let i = 0; i + 1 < xs.length; i += 2) span(img, y, xs[i], xs[i + 1], colour);
  }
}

export function fillEllipse(img, cx, cy, rx, ry, colour) {
  for (let y = Math.max(0, Math.floor(cy - ry)); y <= Math.min(img.h - 1, Math.ceil(cy + ry)); y++) {
    const dy = (y + 0.5 - cy) / ry;
    if (Math.abs(dy) > 1) continue;
    const half = rx * Math.sqrt(1 - dy * dy);
    span(img, y, cx - half, cx + half, colour);
  }
}

export const fillCircle = (img, cx, cy, r, colour) => fillEllipse(img, cx, cy, r, r, colour);

export function fillCapsule(img, x, y, w, h, colour) {
  const r = Math.min(w, h) / 2;
  fillRect(img, x, y + r, w, h - 2 * r, colour);
  fillEllipse(img, x + w / 2, y + r, w / 2, r, colour);
  fillEllipse(img, x + w / 2, y + h - r, w / 2, r, colour);
}

/** Wobbly closed blob — the organic counterpart to fillPoly. */
export function blob(cx, cy, radius, { wobble = 0.22, points = 22, seed = 1, squash = 1 } = {}) {
  const rand = mulberry32(seed);
  const offsets = Array.from({ length: points }, () => 1 + (rand() * 2 - 1) * wobble);
  // Smooth the radii so the outline undulates instead of spiking.
  const smooth = offsets.map((_, i) => {
    const a = offsets[(i - 1 + points) % points];
    const b = offsets[i];
    const c = offsets[(i + 1) % points];
    return (a + 2 * b + c) / 4;
  });
  return smooth.map((k, i) => {
    const t = (i / points) * Math.PI * 2;
    return [cx + Math.cos(t) * radius * k, cy + Math.sin(t) * radius * k * squash];
  });
}

export function toPNGBuffer(img, PNG) {
  const png = new PNG({ width: img.w, height: img.h });
  png.data = Buffer.from(img.data.buffer.slice(0));
  return PNG.sync.write(png);
}
