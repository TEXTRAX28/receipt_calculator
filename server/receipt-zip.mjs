import { deflateRawSync } from "node:zlib";

const table = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let value = i;
  for (let bit = 0; bit < 8; bit++)
    value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  table[i] = value >>> 0;
}
function crc32(data) {
  let crc = 0xffffffff;
  for (const value of data) crc = (crc >>> 8) ^ table[(crc ^ value) & 255];
  return (crc ^ 0xffffffff) >>> 0;
}

/** Ordered generic JPEG names. No original filename, EXIF or local path is added. */
export function zipReceiptSections(files) {
  if (
    !Array.isArray(files) ||
    files.length < 1 ||
    files.length > 15 ||
    files.some((file) => !Buffer.isBuffer(file))
  )
    throw new Error("Invalid receipt sections");
  if (files.reduce((n, file) => n + file.length, 0) > 16 * 1024 * 1024)
    throw new Error("Receipt archive is too large");
  const local = [],
    central = [];
  let offset = 0,
    centralBytes = 0;
  for (const [index, data] of files.entries()) {
    const name = Buffer.from(
      `section-${String(index + 1).padStart(4, "0")}.jpg`,
    );
    const compressed = deflateRawSync(data, { level: 1 });
    const crc = crc32(data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(8, 8);
    header.writeUInt16LE(0x21, 12);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(compressed.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(name.length, 26);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(8, 10);
    entry.writeUInt16LE(0x21, 14);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(compressed.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt32LE(offset, 42);
    local.push(header, name, compressed);
    central.push(entry, name);
    offset += header.length + name.length + compressed.length;
    centralBytes += entry.length + name.length;
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBytes, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, ...central, end]);
}

/** Prepared JPEG envelope/dimension guard, not a substitute for a full decoder.
 * UI inputs have already been decoded/re-encoded by the bounded browser path.
 */
export function validatePreparedJpeg(bytes) {
  if (
    !Buffer.isBuffer(bytes) ||
    bytes.length < 250 ||
    bytes.length > 5 * 1024 * 1024 ||
    bytes[0] !== 255 ||
    bytes[1] !== 216 ||
    bytes.at(-2) !== 255 ||
    bytes.at(-1) !== 217
  )
    throw new Error("Invalid prepared receipt JPEG");
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset++] !== 255)
      throw new Error("Invalid prepared receipt JPEG");
    while (bytes[offset] === 255) offset++;
    const marker = bytes[offset++];
    if (marker === 0xda || marker === 0xd9) break;
    const size = bytes.readUInt16BE(offset);
    if (size < 2 || offset + size > bytes.length)
      throw new Error("Invalid prepared receipt JPEG");
    if (
      [
        0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce,
        0xcf,
      ].includes(marker)
    ) {
      if (size < 8) throw new Error("Invalid prepared receipt JPEG");
      const height = bytes.readUInt16BE(offset + 3),
        width = bytes.readUInt16BE(offset + 5);
      if (
        width < 8 ||
        height < 8 ||
        width > 4000 ||
        height > 4000 ||
        width * height > 4_000_000
      )
        throw new Error(
          "Receipt JPEG dimensions exceed the prepared-section limit",
        );
      return;
    }
    offset += size;
  }
  throw new Error("Prepared receipt JPEG has no supported dimensions");
}
