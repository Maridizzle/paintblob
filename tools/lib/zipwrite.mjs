// Minimal store-only (no compression) ZIP writer. Pure: an array of
// { name, data } in, one Uint8Array (a .zip) out. No dependencies, and it runs
// the same in Node and the browser, so the pack maker can bundle a pack's JSON
// files into a folder the owner unzips straight into paintblob-cloud/packs/.
//
// The companion reader (src/zip.js) handles the store method this writes, which
// keeps a round-trip test honest. Pack JSON already carries a JPEG-encoded
// source image, so there is nothing left worth compressing.

// 1980-01-01, the ZIP epoch — a real date so strict unzippers do not balk.
const DOS_DATE = 0x0021;

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const u16 = (n) => new Uint8Array([n & 0xff, (n >>> 8) & 0xff]);
const u32 = (n) => new Uint8Array([n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]);

function concat(arrays) {
  let len = 0;
  for (const a of arrays) len += a.length;
  const out = new Uint8Array(len);
  let at = 0;
  for (const a of arrays) { out.set(a, at); at += a.length; }
  return out;
}

/**
 * @param {{ name: string, data: Uint8Array }[]} files
 * @returns {Uint8Array} a complete store-only ZIP archive
 */
export function zipStore(files) {
  const enc = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const f of files) {
    const nameBytes = enc.encode(f.name);
    const data = f.data;
    const crc = crc32(data);

    // Local file header, then the (uncompressed) bytes.
    const local = concat([
      u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(DOS_DATE),
      u32(crc), u32(data.length), u32(data.length),
      u16(nameBytes.length), u16(0), nameBytes, data,
    ]);
    chunks.push(local);

    // Central-directory record pointing back at that header.
    central.push(concat([
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(DOS_DATE),
      u32(crc), u32(data.length), u32(data.length),
      u16(nameBytes.length), u16(0), u16(0), u16(0), u16(0), u32(0),
      u32(offset), nameBytes,
    ]));
    offset += local.length;
  }

  const centralStart = offset;
  let centralSize = 0;
  for (const c of central) { chunks.push(c); centralSize += c.length; }

  chunks.push(concat([
    u32(0x06054b50), u16(0), u16(0),
    u16(files.length), u16(files.length),
    u32(centralSize), u32(centralStart), u16(0),
  ]));

  return concat(chunks);
}
