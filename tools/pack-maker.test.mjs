// The pure pieces of the pack maker: the store-only zip writer and the pack-file
// assembler. The browser glue (drag-drop, the real image pipeline) is exercised
// by the throwaway Chromium smoke, not here.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { zipStore } from './lib/zipwrite.mjs';
import { packFiles, packMeta, PACK_ID } from './lib/packfiles.mjs';
import { readZip } from '../src/zip.js';

const enc = new TextEncoder();

test('zipStore writes an archive the reader round-trips', async () => {
  const files = [
    { name: 'demo/pack.json', data: enc.encode('{"title":"Demo"}') },
    { name: 'demo/demo-one.json', data: enc.encode('{"id":"demo-one"}') },
  ];
  const zip = zipStore(files);
  const out = await readZip(zip.buffer);
  const byName = new Map(out.map((e) => [e.name, e]));
  assert.deepEqual([...byName.keys()].sort(), ['demo-one.json', 'pack.json']);
  assert.equal(await byName.get('pack.json').blob.text(), '{"title":"Demo"}');
  assert.equal(await byName.get('demo-one.json').blob.text(), '{"id":"demo-one"}');
});

test('packMeta is always a puzzle pack and carries the adult flag', () => {
  assert.deepEqual(
    packMeta({ title: '  Dusk  ', adult: true }),
    { title: 'Dusk', blurb: '', kind: 'puzzle', adult: true, difficulty: 'normal' },
  );
  assert.equal(packMeta({ title: 'X' }).adult, false);
  assert.throws(() => packMeta({ title: '  ' }), /needs a title/);
});

test('packFiles lays out pack.json plus one JSON per picture, ids prefixed by pack', () => {
  const puzzles = [
    { id: 'cactus-mesa', title: 'Cactus Mesa', puzzle: { cells: [{}], palette: [{ hex: '#111' }], width: 8, height: 8 } },
    { id: 'dusk-harbour', title: 'Dusk Harbour', puzzle: { cells: [{}], palette: [{ hex: '#222' }], width: 8, height: 8 } },
  ];
  const files = packFiles('dusk-set', { title: 'Dusk Set', adult: true }, puzzles);
  const names = files.map((f) => f.name);
  assert.deepEqual(names, ['dusk-set/pack.json', 'dusk-set/dusk-set-cactus-mesa.json', 'dusk-set/dusk-set-dusk-harbour.json']);

  const meta = JSON.parse(new TextDecoder().decode(files[0].data));
  assert.equal(meta.adult, true);
  assert.equal(meta.kind, 'puzzle');

  const doc = JSON.parse(new TextDecoder().decode(files[1].data));
  assert.equal(doc.id, 'dusk-set-cactus-mesa');   // id is prefixed so it stays unique across packs
  assert.equal(doc.title, 'Cactus Mesa');
  assert.ok(PACK_ID.test(doc.id));
  assert.equal(doc.cells.length, 1);              // the built puzzle body is carried through
});

test('packFiles refuses a bad pack id and an empty pack', () => {
  const one = [{ id: 'a', title: 'A', puzzle: { cells: [{}], palette: [{ hex: '#111' }], width: 2, height: 2 } }];
  assert.throws(() => packFiles('Bad Id', { title: 'X' }, one), /lowercase/);
  assert.throws(() => packFiles('ok', { title: 'X' }, []), /at least one/);
});

test('packFiles keeps ids unique when two pictures collide', () => {
  const puzzles = [
    { id: 'twin', title: 'One', puzzle: { cells: [{}], palette: [{ hex: '#111' }], width: 2, height: 2 } },
    { id: 'twin', title: 'Two', puzzle: { cells: [{}], palette: [{ hex: '#222' }], width: 2, height: 2 } },
  ];
  const files = packFiles('set', { title: 'Set' }, puzzles);
  assert.deepEqual(files.map((f) => f.name), ['set/pack.json', 'set/set-twin.json', 'set/set-twin-2.json']);
});
