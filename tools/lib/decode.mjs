// Image loading for the pipeline.
//
// Format is sniffed from the magic bytes rather than the extension, because
// art arrives with whatever name the browser gave it and a mislabelled file
// would otherwise fail deep inside a decoder with something unreadable like
// "unrecognised content at end of stream".

import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';

const ascii = (buf, from, to) => buf.subarray(from, to).toString('latin1');

function identify(buf) {
  if (buf.length < 12) return 'unknown';
  if (buf[0] === 0x89 && ascii(buf, 1, 4) === 'PNG') return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'jpeg';
  if (ascii(buf, 0, 4) === 'RIFF' && ascii(buf, 8, 12) === 'WEBP') return 'webp';
  if (ascii(buf, 0, 6) === 'GIF87a' || ascii(buf, 0, 6) === 'GIF89a') return 'gif';
  if (ascii(buf, 4, 8) === 'ftyp' && ascii(buf, 8, 12).startsWith('avi')) return 'avif';
  if (ascii(buf, 4, 12).includes('heic') || ascii(buf, 4, 12).includes('mif1')) return 'heic';
  if (ascii(buf, 0, 5) === '<?xml' || ascii(buf, 0, 4) === '<svg') return 'svg';
  return 'unknown';
}

const CONVERT_HINT = 'convert it to PNG or JPEG first — macOS Preview, ' +
  'or `magick in.webp out.png` if you have ImageMagick';

/**
 * @returns {{ data: Uint8ClampedArray, width: number, height: number }}
 *   RGBA, 8 bits per channel.
 */
export function decodeImage(file) {
  if (!fs.existsSync(file)) throw new Error(`no such file: ${file}`);
  const buf = fs.readFileSync(file);
  const kind = identify(buf);

  switch (kind) {
    case 'png': {
      const png = PNG.sync.read(buf);
      return { data: png.data, width: png.width, height: png.height };
    }
    case 'jpeg': {
      // formatAsRGBA keeps the buffer layout identical to pngjs's.
      const img = jpeg.decode(buf, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 512 });
      return { data: img.data, width: img.width, height: img.height };
    }
    case 'svg':
      throw new Error(`${path.basename(file)} is SVG — render it to a PNG at 1024px first`);
    case 'unknown':
      throw new Error(`${path.basename(file)} is not an image this tool recognises (PNG and JPEG are supported)`);
    default:
      throw new Error(`${path.basename(file)} is ${kind.toUpperCase()}, which is not supported — ${CONVERT_HINT}`);
  }
}

/** Same sniffing, for a buffer already in memory (e.g. an API response). */
export function decodeBuffer(buf) {
  const kind = identify(buf);
  if (kind === 'png') {
    const png = PNG.sync.read(buf);
    return { data: png.data, width: png.width, height: png.height };
  }
  if (kind === 'jpeg') {
    const img = jpeg.decode(buf, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 512 });
    return { data: img.data, width: img.width, height: img.height };
  }
  throw new Error(`image response was ${kind}, expected PNG or JPEG`);
}
