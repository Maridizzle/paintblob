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

async function toPixels(blob) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    throw new Error('could not read that file as an image');
  }

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
