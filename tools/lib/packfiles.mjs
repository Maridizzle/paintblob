// Pure assembly of a pack's files, ready to zip. No DOM and no pipeline: given
// the puzzles the browser already built, it returns the exact files that live in
// a server packs/<id>/ folder — a pack.json plus one JSON per picture — matching
// what src/packs/catalog.js (paintblob-cloud) reads at boot.

import { zipStore } from './zipwrite.mjs';

const enc = new TextEncoder();
// Same shape the server enforces on pack and puzzle ids.
export const PACK_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** The pack.json body. kind is always 'puzzle' here (picture packs). */
export function packMeta({ title, blurb = '', adult = false, difficulty = 'normal' }) {
  if (typeof title !== 'string' || !title.trim()) throw new Error('a pack needs a title');
  return { title: title.trim(), blurb: String(blurb || '').trim(), kind: 'puzzle', adult: !!adult, difficulty };
}

/**
 * @param {string} packId
 * @param {object} meta  passed to packMeta
 * @param {{ id: string, title: string, puzzle: object }[]} puzzles  built pictures
 * @returns {{ name: string, data: Uint8Array }[]} files under `<packId>/`
 */
export function packFiles(packId, meta, puzzles) {
  if (!PACK_ID.test(packId)) throw new Error('pack id must be lowercase letters, digits and dashes');
  if (!puzzles.length) throw new Error('a pack needs at least one picture');

  const files = [{
    name: `${packId}/pack.json`,
    data: enc.encode(`${JSON.stringify(packMeta(meta), null, 2)}\n`),
  }];

  // Prefix each picture id with the pack id so ids stay unique across every pack
  // the server loads (it refuses two packs that share a puzzle id).
  const seen = new Set();
  for (const p of puzzles) {
    let id = `${packId}-${p.id}`.replace(/-+/g, '-').replace(/-$/, '');
    if (!PACK_ID.test(id)) throw new Error(`could not form a valid id from "${p.id}"`);
    if (seen.has(id)) { let n = 2; while (seen.has(`${id}-${n}`)) n++; id = `${id}-${n}`; }
    seen.add(id);
    const doc = { id, title: p.title, ...p.puzzle };
    files.push({ name: `${packId}/${id}.json`, data: enc.encode(JSON.stringify(doc)) });
  }
  return files;
}

/** The whole pack as one .zip the owner unzips into paintblob-cloud/packs/. */
export function packZip(packId, meta, puzzles) {
  return zipStore(packFiles(packId, meta, puzzles));
}
