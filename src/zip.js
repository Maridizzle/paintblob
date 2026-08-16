// Just enough of the ZIP format to pull files out of a dropped .zip.
//
// Reads the end-of-central-directory record, walks the central directory for
// names and sizes, then reads each entry's local file header to find where
// its bytes actually start. Zip64 and data descriptors are not handled — a
// pack of a few dozen photos never needs either, and skipping them keeps
// this to a page. Decompression is DecompressionStream('deflate-raw'), a
// native platform API, so this adds no dependency and runs identically in
// the browser and in Node's test runner.

const EOCD_SIG = 0x06054b50;
const CENTRAL_SIG = 0x02014b50;

/** Scans backward for the EOCD signature — a trailing comment can push it
 *  up to 65557 bytes from the end, so it is not safely the last 22 bytes. */
function findEOCD(view) {
  const min = Math.max(0, view.byteLength - 65557);
  for (let i = view.byteLength - 22; i >= min; i--) {
    if (view.getUint32(i, true) === EOCD_SIG) return i;
  }
  return -1;
}

async function inflate(compressed) {
  const stream = new DecompressionStream('deflate-raw');
  const writer = stream.writable.getWriter();
  writer.write(compressed);
  writer.close();
  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
}

/**
 * @param {ArrayBuffer} buffer
 * @returns {Promise<{name: string, blob: Blob}[]>} every file the archive
 *   holds — callers filter to what they actually want (paintblob only cares
 *   about images). Entries whose compression method is not store or deflate
 *   are silently skipped rather than failing the whole archive.
 */
export async function readZip(buffer) {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const eocd = findEOCD(view);
  if (eocd < 0) throw new Error('not a zip file');

  const count = view.getUint16(eocd + 10, true);
  let at = view.getUint32(eocd + 16, true);

  const decoder = new TextDecoder();
  const entries = [];
  for (let i = 0; i < count; i++) {
    if (at + 46 > view.byteLength || view.getUint32(at, true) !== CENTRAL_SIG) break;
    const method = view.getUint16(at + 10, true);
    const compressedSize = view.getUint32(at + 20, true);
    const nameLen = view.getUint16(at + 28, true);
    const extraLen = view.getUint16(at + 30, true);
    const commentLen = view.getUint16(at + 32, true);
    const localOffset = view.getUint32(at + 42, true);
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLen));

    entries.push({ name, method, compressedSize, localOffset });
    at += 46 + nameLen + extraLen + commentLen;
  }

  const out = [];
  for (const entry of entries) {
    if (entry.name.endsWith('/') || !entry.name.split('/').pop()) continue; // a directory
    const localNameLen = view.getUint16(entry.localOffset + 26, true);
    const localExtraLen = view.getUint16(entry.localOffset + 28, true);
    const dataStart = entry.localOffset + 30 + localNameLen + localExtraLen;
    const compressed = bytes.subarray(dataStart, dataStart + entry.compressedSize);

    let data;
    if (entry.method === 0) data = compressed;
    else if (entry.method === 8) data = await inflate(compressed);
    else continue; // an exotic compression method — skip, do not fail the pack

    out.push({ name: entry.name.split('/').pop(), blob: new Blob([data]) });
  }
  return out;
}
