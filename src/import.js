// Turning a dropped or chosen image file into a playable picture, in the app.
//
// Decoding is done by Chromium rather than by the Node-side decoders, which
// means this path accepts everything the browser can display — WebP, AVIF,
// GIF, BMP — not just the PNG and JPEG the command line handles. From the
// pixels onward it is the exact same pipeline the CLI uses.

import { buildPuzzle, DETAIL_PRESETS, slugify } from './pipeline/build.js';

// Cap the decode before the pipeline's own downscale. A 6000px phone photo
// would otherwise cost a 36M-pixel box filter to reach the same 768px result.
const MAX_SIDE = 1400;

/**
 * Reads an image's dimensions out of its header, without decoding it.
 *
 * This matters for memory rather than speed. A 48-megapixel phone photo is
 * roughly 190MB once decoded, and decoding at full size purely to discover it
 * needs shrinking means holding that plus the shrunken copy — enough to have
 * the renderer killed outright. Knowing the size up front means one decode,
 * straight to the size actually wanted.
 *
 * @returns {Promise<{width:number, height:number}|null>} null if unrecognised,
 *   in which case the caller falls back to decoding and measuring.
 */
async function readDimensions(blob) {
  // Enough for a PNG header, a GIF header, and a JPEG's SOF past even a fat
  // EXIF block with an embedded thumbnail.
  const head = new DataView(await blob.slice(0, 256 * 1024).arrayBuffer());
  const ascii = (at, len) => String.fromCharCode(
    ...new Uint8Array(head.buffer, at, len),
  );

  try {
    if (head.byteLength > 24 && head.getUint32(0) === 0x89504e47) {
      return { width: head.getUint32(16), height: head.getUint32(20) }; // PNG IHDR
    }
    if (head.byteLength > 10 && ascii(0, 3) === 'GIF') {
      return { width: head.getUint16(6, true), height: head.getUint16(8, true) };
    }
    if (head.byteLength > 30 && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') {
      const kind = ascii(12, 4);
      if (kind === 'VP8 ') {
        return { width: head.getUint16(26, true) & 0x3fff, height: head.getUint16(28, true) & 0x3fff };
      }
      if (kind === 'VP8X') {
        const read24 = (at) => head.getUint8(at) | (head.getUint8(at + 1) << 8) | (head.getUint8(at + 2) << 16);
        return { width: read24(24) + 1, height: read24(27) + 1 };
      }
      return null; // VP8L packs its size in a bitfield; not worth unpacking
    }
    if (head.byteLength > 4 && head.getUint16(0) === 0xffd8) {
      // JPEG: walk the marker chain to a start-of-frame, which carries the size.
      let at = 2;
      while (at + 9 < head.byteLength) {
        if (head.getUint8(at) !== 0xff) { at++; continue; }
        const marker = head.getUint8(at + 1);
        if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
          at += 2;
          continue;
        }
        const length = head.getUint16(at + 2);
        // Any SOFn except the four that are not frame headers.
        if (marker >= 0xc0 && marker <= 0xcf
          && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { height: head.getUint16(at + 5), width: head.getUint16(at + 7) };
        }
        if (length < 2) break;
        at += 2 + length;
      }
    }
  } catch {
    // A truncated or malformed header is not worth distinguishing; fall back.
  }
  return null;
}

async function toPixels(blob) {
  let bitmap;
  const header = await readDimensions(blob);

  try {
    if (header && Math.max(header.width, header.height) > MAX_SIDE) {
      const scale = MAX_SIDE / Math.max(header.width, header.height);
      bitmap = await createImageBitmap(blob, {
        resizeWidth: Math.max(1, Math.round(header.width * scale)),
        resizeHeight: Math.max(1, Math.round(header.height * scale)),
        resizeQuality: 'high',
      });
    } else {
      bitmap = await createImageBitmap(blob);
    }
  } catch {
    throw new Error('this browser could not decode that image — HEIC and RAW are not supported');
  }

  // Only reachable when the header was unreadable and the image turned out to
  // be oversized after all.
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  if (scale < 1) {
    const resized = await createImageBitmap(blob, {
      resizeWidth: Math.round(bitmap.width * scale),
      resizeHeight: Math.round(bitmap.height * scale),
      resizeQuality: 'high',
    });
    bitmap.close();
    bitmap = resized;
  }

  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  // Flatten onto white. Transparent pixels are excluded from every cell, so a
  // logo on a transparent background would otherwise produce a picture with
  // unpaintable holes in it.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, bitmap.width, bitmap.height);
  ctx.drawImage(bitmap, 0, 0);

  const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  const result = { data, width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return result;
}

function uniqueId(base, taken) {
  const root = slugify(base);
  if (!taken.has(root)) return root;
  for (let n = 2; n < 999; n++) {
    if (!taken.has(`${root}-${n}`)) return `${root}-${n}`;
  }
  return `${root}-${Date.now().toString(36)}`;
}

function titleFrom(name) {
  return name
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase()) || 'Untitled';
}

/**
 * @param {Array<{name: string, blob: Blob}>} files
 * @param {object} o
 * @param {string} o.detail  key of DETAIL_PRESETS
 * @param {Set<string>} o.taken  ids already in use
 * @param {(name: string, index: number, total: number) => void} [o.onProgress]
 * @returns {Promise<{added: object[], failed: {name: string, reason: string}[]}>}
 */
export async function importImages(files, { detail = 'normal', taken = new Set(), onProgress, api }) {
  const preset = DETAIL_PRESETS[detail] ?? DETAIL_PRESETS.normal;
  const added = [];
  const failed = [];
  const claimed = new Set(taken);

  for (const [index, file] of files.entries()) {
    onProgress?.(file.name, index, files.length);
    try {
      // Yield first so the progress label actually paints before the pipeline
      // takes over the main thread for a few hundred milliseconds.
      await new Promise((resolve) => setTimeout(resolve, 0));

      const image = await toPixels(file.blob);
      const puzzle = buildPuzzle(image.data, image.width, image.height, preset);

      if (!puzzle.cells.length) {
        failed.push({ name: file.name, reason: 'no regions found in that image' });
        continue;
      }

      const id = uniqueId(file.name, claimed);
      claimed.add(id);
      const title = titleFrom(file.name);
      const entry = {
        cells: puzzle.cells.length,
        colours: puzzle.palette.length,
        thumb: puzzle.palette.slice(0, 5).map((p) => p.hex),
        photoLike: puzzle.photoLike,
      };

      await api.savePuzzle({ id, title, puzzle, entry });
      added.push({ id, title, ...entry });
    } catch (err) {
      failed.push({ name: file.name, reason: err.message });
    }
  }

  return { added, failed };
}

/** Pulls image files out of a drop event, ignoring anything else dragged in. */
export function imagesFromDrop(event) {
  const files = [...(event.dataTransfer?.files ?? [])];
  return files
    .filter((f) => f.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|avif|bmp)$/i.test(f.name))
    .map((f) => ({ name: f.name.replace(/\.[^.]+$/, ''), blob: f }));
}
