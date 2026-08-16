// Unit tests for the minimal ZIP reader that blind-pack drops go through.
//
// Fixtures are built in memory rather than checked in as binary files — the
// same "generate a deterministic input" preference pipeline.test.mjs uses for
// its synthetic images. CRC-32 is left as 0 throughout: readZip never checks
// it, so a real archive tool would reject these files but our own reader,
// which is all that ever sees them, does not need to.

import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';

import { readZip } from '../src/zip.js';

class Writer {
  constructor() { this.parts = []; }
  bytes(arr) { this.parts.push(Uint8Array.from(arr)); return this; }
  u16(n) { return this.bytes([n & 0xff, (n >> 8) & 0xff]); }
  u32(n) { return this.bytes([n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff]); }
  text(s) { this.parts.push(new TextEncoder().encode(s)); return this; }
  raw(bytes) { this.parts.push(bytes); return this; }
  get length() { return this.parts.reduce((n, p) => n + p.length, 0); }
  toBuffer() {
    const out = new Uint8Array(this.length);
    let at = 0;
    for (const p of this.parts) { out.set(p, at); at += p.length; }
    return out.buffer;
  }
}

/** @param {Array<{name: string, data: Uint8Array, method?: 0|8}>} files */
function buildZip(files) {
  const w = new Writer();
  const offsets = [];
  const compressed = files.map((f) => {
    const method = f.method ?? 8;
    return { ...f, method, payload: method === 8 ? zlib.deflateRawSync(f.data) : f.data };
  });

  for (const f of compressed) {
    offsets.push(w.length);
    w.u32(0x04034b50).u16(20).u16(0).u16(f.method).u16(0).u16(0)
      .u32(0) // crc-32, unchecked
      .u32(f.payload.length).u32(f.data.length)
      .u16(new TextEncoder().encode(f.name).length).u16(0)
      .text(f.name)
      .raw(f.payload);
  }

  const centralStart = w.length;
  compressed.forEach((f, i) => {
    const nameLen = new TextEncoder().encode(f.name).length;
    w.u32(0x02014b50).u16(20).u16(20).u16(0).u16(f.method).u16(0).u16(0)
      .u32(0) // crc-32, unchecked
      .u32(f.payload.length).u32(f.data.length)
      .u16(nameLen).u16(0).u16(0).u16(0).u16(0).u32(0)
      .u32(offsets[i])
      .text(f.name);
  });
  const centralSize = w.length - centralStart;

  w.u32(0x06054b50).u16(0).u16(0).u16(files.length).u16(files.length)
    .u32(centralSize).u32(centralStart).u16(0);

  return w.toBuffer();
}

const png = (byte) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, byte, byte, byte]);

test('readZip round-trips a stored (uncompressed) entry', async () => {
  const zip = buildZip([{ name: 'photo.png', data: png(1), method: 0 }]);
  const out = await readZip(zip);
  assert.equal(out.length, 1);
  assert.equal(out[0].name, 'photo.png');
  const bytes = new Uint8Array(await out[0].blob.arrayBuffer());
  assert.deepEqual([...bytes], [...png(1)]);
});

test('readZip round-trips a deflated entry', async () => {
  const data = new Uint8Array(4000).map((_, i) => (i * 37) & 0xff); // not trivially compressible
  const zip = buildZip([{ name: 'big.jpg', data, method: 8 }]);
  const out = await readZip(zip);
  assert.equal(out.length, 1);
  const bytes = new Uint8Array(await out[0].blob.arrayBuffer());
  assert.deepEqual([...bytes], [...data]);
});

test('readZip returns every entry, mixed compression, in a multi-file pack', async () => {
  const zip = buildZip([
    { name: 'a.png', data: png(1), method: 0 },
    { name: 'b.png', data: png(2), method: 8 },
    { name: 'c.png', data: png(3), method: 0 },
  ]);
  const out = await readZip(zip);
  assert.deepEqual(out.map((f) => f.name).sort(), ['a.png', 'b.png', 'c.png']);
});

test('readZip skips directory entries', async () => {
  const zip = buildZip([
    { name: 'photos/', data: new Uint8Array(0), method: 0 },
    { name: 'photos/one.png', data: png(1), method: 0 },
  ]);
  const out = await readZip(zip);
  assert.equal(out.length, 1);
  assert.equal(out[0].name, 'one.png');
});

test('readZip strips folder paths down to a bare filename', async () => {
  const zip = buildZip([{ name: 'mystery pack/holiday/beach.png', data: png(1), method: 0 }]);
  const out = await readZip(zip);
  assert.equal(out[0].name, 'beach.png');
});

test('readZip rejects a buffer with no end-of-central-directory record', async () => {
  await assert.rejects(() => readZip(new Uint8Array(64).buffer), /not a zip/);
});
