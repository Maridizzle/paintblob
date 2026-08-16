// Encodes a pipeline preview buffer (see buildPuzzle's `preview` field) down
// to a small data URI, so a puzzle file can carry what the source picture
// actually looked like alongside its cell map. Node-side counterpart to the
// canvas-based encoder in src/import.js — buildPuzzle stays free of both,
// since it runs in the browser too and has no encoder in common with either.

import jpeg from 'jpeg-js';

const QUALITY = 82;

/** @param {{data: Uint8ClampedArray, width: number, height: number}} preview */
export function encodeSourceImage(preview) {
  const { data } = jpeg.encode(preview, QUALITY);
  return `data:image/jpeg;base64,${data.toString('base64')}`;
}
